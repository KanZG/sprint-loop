# Sprint-Loop Plugin

Sprint-based autonomous development loop for Claude Code.

## Overview

Sprint-Loop は大規模な開発タスクをスプリント単位で自動実行するプラグインです。
計画 → 実装 → DoD評価 → 次スプリントへの自動遷移を繰り返し、全スプリント完了まで自動ループします。

## Commands

| Command | Description |
|---------|-------------|
| `/sprint-plan` | 対話的にスプリント計画を策定 |
| `/sprint-loop` | 自動実行を開始 |
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
  plan.md                              # マスタープラン
  config.json                          # 実行設定
  state/
    sprint-loop-state.json             # メイン状態ファイル
  sprints/
    sprint-001/
      spec.md                          # スプリント仕様
      design.md                        # 詳細設計
      dod.md                           # 受け入れ基準
      execution-log.md                 # 実行ログ
      reviews/
        {axis_id}-attempt-{N}.json     # 個別DoD評価結果（例: test-attempt-1.json）
        summary-attempt-{N}.json       # 集約サマリー
      result.md                        # 完了サマリー
  logs/
    orchestrator-log.md                # 指揮者の判断ログ
```

## Sprint Execution Workflow

```
Sprint N 開始
  │
  ├─ 1. spec.md, design.md, dod.md 読み込み
  ├─ 2. TeamCreate で実装チーム構成
  ├─ 3. implementor に実装委譲
  ├─ 4. 実装完了待ち
  ├─ 5. DoD評価（3 reviewers 並列）
  ├─ 6. 結果判定
  │     ├─ 全PASS → Sprint完了 → 次へ
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
| Max iterations | 100回到達 | allow + failed |
| Max DoD retries | 1スプリントで5回失敗 | allow + failed |

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

## Rules for the Orchestrator

When `/sprint-loop` is active and you are the orchestrator:

1. **NEVER write code directly** — delegate all implementation to AgentTeam
2. **ALWAYS read persistent files** before making decisions
3. **ALWAYS update state file** after each phase transition
4. **ALWAYS log decisions** to orchestrator-log.md
5. **1 sprint = 1 team** — `TeamCreate(team_name="sprint-{N}")`, `TeamDelete` on sprint completion
6. **Pass feedback verbatim** — when DoD fails, pass the exact failure messages to the implementor
7. **Use bare names for subagent_type** — `"test-reviewer"` not `"sprint-loop:test-reviewer"`
