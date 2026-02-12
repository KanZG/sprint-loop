'use strict';

const { readStdinJson } = require('./lib/stdin.cjs');
const { readState, updateState, readConfig } = require('./lib/state.cjs');
const { runSafetyChecks } = require('./lib/safety.cjs');

/**
 * Build the continuation message that gets injected as a "user message"
 * when the stop hook blocks. References persistent files so the orchestrator
 * can recover even after compaction.
 */
/**
 * Build the reviewing sub-phase instructions with dynamic review axes from config.
 */
function buildReviewingInstructions(sprint, config, sprintNum) {
  const axes = (config && config.review_axes) || [
    { id: 'test', name: 'Test' },
    { id: 'spec', name: 'Spec Compliance' },
    { id: 'quality', name: 'Code Quality' },
  ];

  // Apply per-sprint overrides
  const overrides = (config && config.sprint_overrides && config.sprint_overrides[String(sprintNum)]) || {};
  const skipAxes = overrides.skip_axes || [];
  const effectiveAxes = axes.filter(a => !skipAxes.includes(a.id));

  const axisLines = effectiveAxes.map(a => `   - ${a.id}-reviewer: ${a.name}`).join('\n');

  return `**reviewing（DoD評価中）**:
1. config.json の review_axes を読み込み、各軸のレビューエージェントを並列起動:
${axisLines}
2. 結果を .sprint-loop/sprints/sprint-${sprint}/reviews/{axis_id}-attempt-{M}.json に出力
3. 各レビューア完了時に state の completed_review_axes に軸IDを追加
4. **全レビューア完了後、即座に aggregator を起動**（判断不要の固定ステップ）:
   - aggregator が個別レビューを集約 → summary-attempt-{M}.json を出力
5. 指揮者は summary-attempt-{M}.json **のみ**読み取る（個別レビューは読まない）
6. 全PASS → サブフェーズを "completed" に → 状態更新
7. いずれかFAIL → フィードバック付きで "implementing" に戻す`;
}

function buildContinuationMessage(state, config) {
  const sprint = String(state.current_sprint || 1).padStart(3, '0');
  const iteration = (state.total_iterations || 0) + 1;
  const max = state.max_total_iterations || 100;
  const subphase = state.current_subphase || 'implementing';
  const dodRetries = state.dod_retry_count || 0;
  const maxDodRetries = state.max_dod_retries || 5;

  const sprintNum = state.current_sprint || 1;
  const reviewingSection = buildReviewingInstructions(sprint, config, sprintNum);

  return `[SPRINT-LOOP Iteration ${iteration}/${max} | Sub-phase: ${subphase} | DoD retries: ${dodRetries}/${maxDodRetries}]

あなたはsprint-loopの**指揮者**です。自分でコードを書かず、全てAgentTeamに委譲してください。

## 現在の状態
現在の状態ファイルを読み取り、次のアクションを決定してください:
  Read: .sprint-loop/state/sprint-loop-state.json

## 現在のスプリント情報
  Read: .sprint-loop/sprints/sprint-${sprint}/spec.md
  Read: .sprint-loop/sprints/sprint-${sprint}/design.md
  Read: .sprint-loop/sprints/sprint-${sprint}/dod.md

## 実行ログ
  Read: .sprint-loop/sprints/sprint-${sprint}/execution-log.md

## 現在のサブフェーズ: ${subphase}

### サブフェーズ別アクション:

**implementing（実装中）**:
1. TeamCreate で実装チームを作成（まだなければ）
2. implementor エージェントに spec.md + design.md を渡して実装を委譲
3. 完了待ち → サブフェーズを "reviewing" に更新

${reviewingSection}

**planning（計画生成中 — rolling モードのみ）**:
1. planner エージェントをスプリントチーム内に起動
2. 次バッチのスプリント詳細計画（spec.md / design.md / dod.md）を生成
3. 完了後、planning-result.md を読み取り、state.planned_through_sprint を更新
4. implementing サブフェーズに遷移

**completed（スプリント完了）**:
1. result.md にスプリント完了サマリーを書き込み
2. 次のスプリントへ遷移（current_sprint++）
3. 全スプリント完了なら phase を "all_complete" に設定

## 重要ルール
- 永続ファイルを必ず読み込んでから判断すること
- 実行結果は必ず永続ファイルに書き込むこと
- 状態ファイル（sprint-loop-state.json）を各ステップで更新すること
- チームは作業完了後にシャットダウンすること`;
}

/**
 * Determine the phase-based decision.
 * Only "executing" phase blocks the stop.
 */
function getPhaseDecision(state) {
  const phase = state.phase || '';

  switch (phase) {
    case 'planning':
    case 'planned':
      // Interactive phases — user controls flow
      return { allow: true, reason: 'interactive_phase' };

    case 'executing':
      // Active execution — block and continue
      return { allow: false };

    case 'all_complete':
    case 'failed':
      // Terminal states — allow stop
      return { allow: true, reason: 'terminal_phase' };

    default:
      // Unknown phase — fail safe
      return { allow: true, reason: 'unknown_phase' };
  }
}

async function main() {
  try {
    const data = await readStdinJson();
    const projectDir = data.cwd || data.directory || process.cwd();
    const sessionId = data.session_id || data.sessionId || '';
    const stopReason = data.stop_hook_reason || data.reason || '';

    const state = readState(projectDir);

    // Run safety checks first (highest priority)
    const safetyResult = runSafetyChecks({ state, sessionId, stopReason });

    if (safetyResult.allow) {
      // If safety check says to mark as failed, update state
      if (safetyResult.failState && state && state.active) {
        updateState(projectDir, {
          active: false,
          phase: 'failed',
          failure_reason: `Safety limit: ${safetyResult.reason}`,
          completed_at: new Date().toISOString(),
        });
      }
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Phase-based decision
    const phaseResult = getPhaseDecision(state);

    if (phaseResult.allow) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Block the stop — increment iteration and continue loop
    const newIterations = (state.total_iterations || 0) + 1;
    updateState(projectDir, {
      total_iterations: newIterations,
    });

    const config = readConfig(projectDir);
    const message = buildContinuationMessage({
      ...state,
      total_iterations: newIterations,
    }, config);

    console.log(JSON.stringify({
      decision: 'block',
      reason: message,
    }));

  } catch (err) {
    // On any error, fail safe — allow stop
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
