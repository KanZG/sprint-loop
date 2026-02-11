---
name: sprint-cancel
description: Safely stop sprint-loop execution
disable-model-invocation: true
---

# /sprint-cancel — 実行停止

Sprint-Loop の実行を安全に停止します。

## 手順

1. `.sprint-loop/state/sprint-loop-state.json` を読み込む

2. 状態ファイルが存在しない、または `active` が `false` の場合:
   ```
   Sprint-Loop: アクティブな実行はありません。
   ```

3. アクティブな実行がある場合、状態を更新:
   ```json
   {
     "active": false,
     "phase": "failed",
     "failure_reason": "User cancelled",
     "completed_at": "{ISO timestamp}"
   }
   ```

4. 確認メッセージを表示:
   ```
   Sprint-Loop を停止しました。

   停止時点:
     Sprint: {current_sprint}/{total_sprints}
     Sub-phase: {current_subphase}
     Iteration: {total_iterations}

   計画ファイルは保持されています。
   再開するには状態をリセットして `/sprint-start` を実行してください。
   ```

## 注意事項

- 実行中のAgentTeamは自動的には停止しません。Stop hookが次にブロックしなくなるため、セッション終了時に停止します。
- 計画ファイル（spec.md, design.md, dod.md）は削除しません。
- 再開する場合は、状態ファイルを手動でリセットするか、`/sprint-plan` で再計画してください。
