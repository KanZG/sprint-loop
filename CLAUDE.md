# Sprint-Loop Plugin

Sprint-based autonomous development loop for Claude Code.

## Overview

Sprint-Loop は大規模な開発タスクをスプリント単位で自動実行するプラグインです。
計画 → 実装 → DoD評価 → 次スプリントへの自動遷移を繰り返し、全スプリント完了まで自動ループします。

## Commands

| Command | Description |
|---------|-------------|
| `/sprint-loop:sprint-plan` | 対話的にスプリント計画を策定 |
| `/sprint-loop:start` | 自動実行を開始 |
| `/sprint-loop:status` | 進捗を確認 |
| `/sprint-loop:cancel` | 実行を停止 |

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

子エージェント（実行者）
  ├── implementor: コード実装（general-purpose）
  ├── test-reviewer: テスト検証（sprint-loop:test-reviewer）
  ├── spec-reviewer: 仕様準拠検証（sprint-loop:spec-reviewer）
  └── quality-reviewer: 品質検証（sprint-loop:quality-reviewer）
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
        review-001.json                # DoD評価結果
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

## Rules for the Orchestrator

When `/sprint-loop:start` is active and you are the orchestrator:

1. **NEVER write code directly** — delegate all implementation to AgentTeam
2. **ALWAYS read persistent files** before making decisions
3. **ALWAYS update state file** after each phase transition
4. **ALWAYS log decisions** to orchestrator-log.md
5. **ALWAYS shutdown teams** after each phase completes
6. **Pass feedback verbatim** — when DoD fails, pass the exact failure messages to the implementor
