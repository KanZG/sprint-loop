# Sprint-Loop Plugin

Sprint-based autonomous development loop for Claude Code.

## Overview

Sprint-Loop は大規模な開発タスクをスプリント単位で自動実行するプラグインです。
計画 → 実装 → DoD評価 → 次スプリントへの自動遷移を繰り返し、全スプリント完了まで自動ループします。

## Commands

| Command | Description |
|---------|-------------|
| `/sprint-plan` | 対話的にスプリント計画を策定 |
| `/sprint-start` | 自動実行を開始 |
| `/sprint-status` | 進捗を確認 |
| `/sprint-cancel` | 実行を停止 |

## Architecture

### Orchestrator Pattern（指揮者パターン）

メインセッションは**指揮者**として動作し、自分ではコードを書きません。
全ての実装・テスト・レビューはAgentTeam（`TeamCreate` / `Task`）で子エージェントに委譲します。

```
メインセッション（指揮者）
  ├── 永続ファイルの読み書き（状態管理）
  ├── TeamCreate で実行チームを構成
  ├── Task / SendMessage で作業指示
  ├── TaskList / TaskGet で進捗監視
  └── DoD結果を読み取り、次スプリントへの遷移判断

子エージェント（実行者） ※全て同一チーム "sprint-{N}" 内
  ├── plan-validator: 計画整合性検証（full-adaptive時のみ）
  ├── planner: インライン計画生成（rolling時のみ）
  ├── implementor: コード実装（general-purpose）
  ├── test-reviewer: テスト検証（test-reviewer）
  ├── spec-reviewer: 仕様準拠検証（spec-reviewer）
  ├── quality-reviewer: 品質検証（quality-reviewer）
  └── aggregator: レビュー集約（review-aggregator）
```

### Loop Mechanism（Stop hook）

Stop hook がセッション終了をブロックしてループを実現します。
`phase: "executing"` の間のみブロックし、完了・失敗時は解放します。

### Persistence（Compaction耐性）

全ての重要情報は `.sprint-loop/` 配下に永続ファイルとして保存されます。
Stop hook の続行メッセージが永続ファイルのパスを指示するため、
Compaction で文脈が失われても正しい状態から再開できます。

## File Structure

```
{project}/.sprint-loop/
  plan.md                              # マスタープラン（Phase セクション含む）
  config.json                          # 実行設定（schema_version: 1）
  state/
    sprint-loop-state.json             # メイン状態ファイル（schema_version: 1）
    planning-result.md                 # rolling モード: planner の出力
  sprints/
    sprint-001/
      spec.md                          # スプリント仕様
      design.md                        # 詳細設計（目安: 50-500行）
      dod.md                           # 受け入れ基準
      execution-log.md                 # 実行ログ
      plan-revision.md                 # full-adaptive: 計画検証結果
      reviews/
        {axis_id}-attempt-{N}.json     # 個別DoD評価結果（例: test-attempt-1.json）
        summary-attempt-{N}.json       # 集約サマリー
      result.md                        # 完了サマリー
  logs/
    orchestrator-log.md                # 指揮者の判断ログ
```

## Planning Strategies

| 戦略 | 概要 | 適したプロジェクト |
|------|------|-------------------|
| `full`（デフォルト） | 全スプリントを一度に詳細化 | 小〜中規模、仕様が安定 |
| `full-adaptive` | 全スプリントを詳細化 + 各スプリント開始前に計画検証・自律修正 | 中〜大規模、詳細に不確実性がある |
| `rolling` | 最初の N スプリントのみ詳細化、残りはタイトル+ゴール。実行中に次バッチを自律生成 | 大規模、不確実性が高い、探索的 |

## Phase Grouping

8スプリント以上のプロジェクトでは、スプリントを論理的な Phase にグルーピングする。
Phase は `plan.md` のセクション構成と `state.json` の `current_phase` メタデータで表現。
ディレクトリ構造は変更しない（`sprints/sprint-NNN/` のフラット構造を維持）。

## Per-Sprint DoD Overrides

`config.json` の `sprint_overrides` でスプリントごとに DoD 軸をスキップ or オーバーライド可能。

```json
{
  "sprint_overrides": {
    "1": { "skip_axes": ["visual", "perf"] },
    "9": { "visual": { "pass_criteria": "Record baseline only" } }
  }
}
```

## Sprint Execution Workflow

```
Sprint N 開始
  │
  ├─ 0. Pre-Phase: 計画検証/インライン計画（planning_strategy に応じて）
  │     ├─ full: スキップ
  │     ├─ full-adaptive: plan-validator で計画整合性検証
  │     └─ rolling: planner で次バッチの計画生成（必要時のみ）
  ├─ 1. spec.md, design.md, dod.md 読み込み
  ├─ 2. TeamCreate で実装チーム構成
  ├─ 3. implementor に実装委譲
  ├─ 4. 実装完了待ち
  ├─ 5. DoD評価（sprint_overrides 適用後の有効軸で並列評価）
  ├─ 6. 結果判定
  │     ├─ 全PASS → Sprint完了 → sprints配列更新 → Phase遷移判定 → 次へ
  │     └─ FAIL → フィードバック → 再実装
  └─ 7. チームシャットダウン
```

## Safety Mechanisms

| Check | Condition | Action |
|-------|-----------|--------|
| Context limit | stop_reason に "context" 含む | allow（デッドロック防止） |
| User abort | stop_reason に "user" 含む | allow（Ctrl+C 尊重） |
| Session mismatch | session_id 不一致 | allow（クロスセッション防止） |
| Staleness | 最終更新から2時間超 | allow（スタックロック防止） |
| Max iterations | 設定値到達（デフォルト100、最大1000） | allow + failed |
| Max DoD retries | 設定値到達（デフォルト5、最大10） | allow + failed |

## Review Result File Naming Convention

| ファイル種別 | パス | 例 |
|-------------|------|-----|
| 個別レビュー | `reviews/{axis_id}-attempt-{N}.json` | `reviews/test-attempt-1.json` |
| 集約サマリー | `reviews/summary-attempt-{N}.json` | `reviews/summary-attempt-1.json` |

`{N}` は `dod_retry_count + 1`（1始まり）。
古い `review-001.json` 形式は使用しない。

## Iteration Counter Definitions

| カウンタ | 定義 | インクリメント契機 |
|---------|------|-------------------|
| `total_iterations` | Stop hookのブロック回数（内部メカニズム用） | Stop hook が block を返すたび |
| `dod_retry_count` | 現スプリントの impl→review サイクル数（品質ゲート用） | DoD rejected で再実装に戻るたび |

- `total_iterations` はループ安全機構用（上限到達で強制停止）。リセットされない。
- `dod_retry_count` は品質ゲート用（1スプリントあたりの再試行上限）。スプリント完了時に 0 にリセット。

## Config Schema (v1)

```json
{
  "schema_version": 1,
  "project": { "name": "...", "tech_stack": "..." },
  "planning_strategy": "full | full-adaptive | rolling",
  "rolling_horizon": "null | number (rolling時のみ)",
  "planned_through_sprint": "null | number (rolling時のみ)",
  "max_total_iterations": 100,
  "max_dod_retries": 5,
  "review_axes": [{ "id": "...", "name": "...", "builtin": true }],
  "sprint_overrides": { "1": { "skip_axes": ["..."] } },
  "created_at": "ISO 8601 UTC timestamp"
}
```

## State Schema (v1)

```json
{
  "schema_version": 1,
  "active": false,
  "session_id": null,
  "phase": "planned | executing | all_complete | failed",
  "current_sprint": 1,
  "total_sprints": "N",
  "current_phase": "Phase名 or null",
  "current_subphase": "implementing | reviewing | planning | completed | null",
  "total_iterations": 0,
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "planning_strategy": "full | full-adaptive | rolling",
  "planned_through_sprint": "null | number",
  "sprints": [{ "number": 1, "title": "...", "status": "pending | in_progress | completed" }],
  "started_at": null,
  "completed_at": null,
  "last_checked_at": "ISO 8601 UTC timestamp"
}
```

## Rules for the Orchestrator

When `/sprint-start` is active and you are the orchestrator:

1. **NEVER write code directly** — delegate all implementation to AgentTeam
2. **ALWAYS read persistent files** before making decisions
3. **ALWAYS update state file** after each phase transition
4. **ALWAYS log decisions** to orchestrator-log.md
5. **1 sprint = 1 team** — `TeamCreate(team_name="sprint-{N}")`, `TeamDelete` on sprint completion
6. **Pass feedback verbatim** — when DoD fails, pass the exact failure messages to the implementor
7. **Use bare names for subagent_type** — `"test-reviewer"` not `"sprint-loop:test-reviewer"`
