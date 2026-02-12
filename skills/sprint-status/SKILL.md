---
name: sprint-status
description: Show current sprint-loop execution status and progress
disable-model-invocation: true
---

# /sprint-status — 進捗確認

永続ファイルから現在の状態を読み取り、進捗を表示します。

## 手順

1. `.sprint-loop/state/sprint-loop-state.json` を読み込む
2. 状態ファイルが存在しない場合:
   ```
   Sprint-Loop: 計画がありません。
   `/sprint-plan` で計画を策定してください。
   ```

3. 状態に応じて以下を表示:

### planned 状態
```
Sprint-Loop Status: 計画済み（未実行）

スプリント数: {total_sprints}
{各スプリントのタイトル一覧}

`/sprint-start` で実行を開始できます。
```

### executing 状態
```
Sprint-Loop Status: 実行中

Current Sprint: {current_sprint}/{total_sprints} — {タイトル}
Sub-phase: {current_subphase}
Iteration: {total_iterations}/{max_total_iterations}
DoD Retries: {dod_retry_count}/{max_dod_retries}
Started: {started_at}
Last Activity: {last_checked_at}

Sprint Progress:
  [x] Sprint 1: {タイトル} — completed
  [>] Sprint 2: {タイトル} — in_progress ({current_subphase})
  [ ] Sprint 3: {タイトル} — pending
```

最新のレビュー結果がある場合はそれも表示:
```
Latest Review (attempt {N}):
  Test:    {verdict} — {details}
  Spec:    {verdict} — {details}
  Quality: {verdict} — {details}
```

### all_complete 状態
```
Sprint-Loop Status: 全スプリント完了

Total Sprints: {total_sprints}
Total Iterations: {total_iterations}
Duration: {started_at} — {completed_at}
```

### failed 状態
```
Sprint-Loop Status: 失敗

Reason: {failure_reason}
Failed at Sprint: {current_sprint}/{total_sprints}
Total Iterations: {total_iterations}

`/sprint-resume` で最新状態から再開できます。
```

### fixing 状態
```
Sprint-Loop Status: Fix モード（一時停止中）

Current Sprint: {current_sprint}/{total_sprints} — {タイトル}
修正前の Sub-phase: {previous_subphase}
DoD Retries: {dod_retry_count}

修正作業中です。修正完了後に自動的に実行が再開されます。
修正が中断された場合は `/sprint-resume` で再開できます。
```

### replanning 状態
```
Sprint-Loop Status: Replan モード（再計画中）

Current Sprint: {current_sprint}/{total_sprints}
Total Iterations: {total_iterations}

再計画作業中です。`/sprint-replan` で再計画を完了してください。
```

### replanned 状態
```
Sprint-Loop Status: 再計画完了（未再開）

Total Sprints: {total_sprints}
Resume Mode: DoD-first（各スプリントは DoD 評価から開始）

Sprint Progress:
  [ ] Sprint 1: {タイトル} — pending
  [ ] Sprint 2: {タイトル} — pending
  ...

`/sprint-resume` で再実行を開始してください。
DoD-first モードにより、変更のないスプリントは DoD 評価のみで高速通過します。
```

## 追加情報

- `.sprint-loop/plan.md` の内容も簡潔に要約して表示
- 現在のスプリントの `execution-log.md` があればその要約も表示
