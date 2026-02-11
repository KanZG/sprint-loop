# /sprint-loop:status — 進捗確認

永続ファイルから現在の状態を読み取り、進捗を表示します。

## 手順

1. `.sprint-loop/state/sprint-loop-state.json` を読み込む
2. 状態ファイルが存在しない場合:
   ```
   Sprint-Loop: 計画がありません。
   `/sprint-loop:sprint-plan` で計画を策定してください。
   ```

3. 状態に応じて以下を表示:

### planned 状態
```
Sprint-Loop Status: 計画済み（未実行）

スプリント数: {total_sprints}
{各スプリントのタイトル一覧}

`/sprint-loop:start` で実行を開始できます。
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
```

## 追加情報

- `.sprint-loop/plan.md` の内容も簡潔に要約して表示
- 現在のスプリントの `execution-log.md` があればその要約も表示
