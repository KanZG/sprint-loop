'use strict';

const { readStdinJson } = require('./lib/stdin.cjs');
const { readState, readConfig } = require('./lib/state.cjs');

/**
 * Build context message for active sprint-loop sessions.
 * Injected at session start so Claude understands the current state.
 */
function buildRestorationContext(state, config) {
  const sprint = String(state.current_sprint || 1).padStart(3, '0');
  const phase = state.phase || 'unknown';
  const subphase = state.current_subphase || 'unknown';
  const iteration = state.total_iterations || 0;
  const max = state.max_total_iterations || 100;
  const dodRetries = state.dod_retry_count || 0;

  const lines = [];

  lines.push('<session-restore>');
  lines.push('[SPRINT-LOOP ACTIVE]');
  lines.push('');
  lines.push(`Phase: ${phase} | Sub-phase: ${subphase}`);
  lines.push(`Sprint: ${state.current_sprint}/${state.total_sprints}`);
  if (state.current_phase) {
    lines.push(`Phase: ${state.current_phase}`);
  }
  lines.push(`Strategy: ${(config && config.planning_strategy) || 'full'}`);
  lines.push(`Iteration: ${iteration}/${max} | DoD retries: ${dodRetries}/${state.max_dod_retries || 5}`);
  lines.push(`Started: ${state.started_at || 'unknown'}`);
  lines.push('');

  if (phase === 'executing') {
    lines.push('あなたはsprint-loopの**指揮者**です。自分でコードを書かないでください。');
    lines.push('以下の永続ファイルを読み込んで、現在の状態から作業を再開してください:');
    lines.push('');
    lines.push(`  Read: .sprint-loop/state/sprint-loop-state.json`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/spec.md`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/design.md`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/dod.md`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/execution-log.md`);
    lines.push('');

    if (subphase === 'reviewing') {
      const completedAxes = state.completed_review_axes || [];
      const allAxes = (config && config.review_axes) || [];

      // Apply per-sprint overrides
      const overrides = (config && config.sprint_overrides && config.sprint_overrides[String(state.current_sprint)]) || {};
      const skipAxes = overrides.skip_axes || [];
      const effectiveAxes = allAxes.filter(a => !skipAxes.includes(a.id));

      const allAxisIds = effectiveAxes.map(a => a.id);
      const remainingAxes = allAxisIds.filter(id => !completedAxes.includes(id));

      lines.push(`### Reviewing 状態:`);
      lines.push(`完了済み軸: [${completedAxes.join(', ')}]`);
      if (remainingAxes.length > 0) {
        lines.push(`未完了軸: [${remainingAxes.join(', ')}]`);
        lines.push('残りの軸のみレビューエージェントを起動してください。完了済み軸は再起動不要です。');
      } else {
        lines.push('全レビュー軸が完了しています。aggregator を起動して summary を生成してください。');
      }
      lines.push('');
    }

    if (subphase === 'planning') {
      lines.push('### Planning 状態:');
      lines.push('rolling モードでインライン計画生成中です。');
      lines.push(`計画済み: Sprint ${state.planned_through_sprint || '?'} まで`);
      lines.push('planner エージェントをスプリントチーム内に起動して次バッチの計画を生成してください。');
      lines.push('');
    }

    lines.push('AgentTeam（TeamCreate / Task）で全ての作業を子エージェントに委譲してください。');
  } else if (phase === 'planned') {
    lines.push('スプリント計画が完了しています。`/sprint-start` で実行を開始できます。');
  } else if (phase === 'all_complete') {
    lines.push('全スプリントが正常に完了しています。');
  } else if (phase === 'failed') {
    lines.push(`実行が失敗しました: ${state.failure_reason || 'unknown reason'}`);
  }

  lines.push('</session-restore>');

  return lines.join('\n');
}

/**
 * Build context for planned (but not yet started) state.
 */
function buildPlannedContext(state) {
  const lines = [];
  lines.push('<session-restore>');
  lines.push('[SPRINT-LOOP PLAN READY]');
  lines.push('');
  lines.push(`計画済みスプリント数: ${state.total_sprints || 0}`);
  lines.push('`/sprint-start` で自動実行を開始できます。');
  lines.push('`/sprint-status` で計画内容を確認できます。');
  lines.push('</session-restore>');
  return lines.join('\n');
}

async function main() {
  try {
    const data = await readStdinJson();
    const projectDir = data.cwd || data.directory || process.cwd();

    const state = readState(projectDir);

    // No state file — nothing to restore
    if (!state) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const config = readConfig(projectDir);
    let context = '';

    if (state.active && state.phase === 'executing') {
      context = buildRestorationContext(state, config);
    } else if (state.phase === 'planned') {
      context = buildPlannedContext(state);
    } else if (state.phase === 'all_complete') {
      context = buildRestorationContext(state, config);
    } else if (state.phase === 'failed') {
      context = buildRestorationContext(state, config);
    }

    if (context) {
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
        },
      }));
    } else {
      console.log(JSON.stringify({ continue: true }));
    }

  } catch (err) {
    // Fail safe — don't block session start
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
