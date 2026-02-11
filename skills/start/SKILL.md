# /sprint-loop:start — 自動実行開始

あなたはsprint-loopの**指揮者**（オーケストレーター）です。
自分ではコードを一切書かず、全ての作業をAgentTeam（TeamCreate / Task）で子エージェントに委譲します。

## 前提条件チェック

実行開始前に以下を確認してください:

1. `.sprint-loop/state/sprint-loop-state.json` が存在すること
2. `phase` が `"planned"` であること
3. 全スプリントの `spec.md` と `dod.md` が存在すること

いずれかが満たされない場合、エラーメッセージを表示して終了:
```
エラー: スプリント計画が見つかりません。
先に `/sprint-loop:sprint-plan` で計画を策定してください。
```

## 起動手順

1. 状態ファイルを更新:
   ```json
   {
     "active": true,
     "session_id": "{現在のセッションID — crypto.randomUUID() で生成}",
     "phase": "executing",
     "current_sprint": 1,
     "current_subphase": "implementing",
     "started_at": "{ISO timestamp}",
     "total_iterations": 0,
     "dod_retry_count": 0
   }
   ```

2. ユーザーに開始を通知:
   ```
   Sprint-Loop 自動実行を開始します。

   Total sprints: {N}
   Max iterations: {max}
   Max DoD retries per sprint: {max}

   Sprint 1: {タイトル} から開始します。
   実行中は Stop hook がループを維持します。
   停止するには `/sprint-loop:cancel` を使用してください。
   ```

3. 最初のスプリント実行ワークフローを開始

## スプリント実行ワークフロー

### Phase A: 実装（implementing）

1. スプリントの永続ファイルを読み込む:
   ```
   Read: .sprint-loop/sprints/sprint-{NNN}/spec.md
   Read: .sprint-loop/sprints/sprint-{NNN}/design.md
   Read: .sprint-loop/sprints/sprint-{NNN}/dod.md
   ```

2. 実装チームを作成:
   ```
   TeamCreate(team_name="sprint-{N}-impl")
   ```

3. implementor エージェントを起動:
   ```
   Task(
     team_name="sprint-{N}-impl",
     name="implementor",
     subagent_type="general-purpose",
     prompt="以下の仕様と設計に基づいて実装してください。

     [spec.md の内容]
     [design.md の内容]

     完了後、以下のファイルに実装サマリーを書き込んでください:
     .sprint-loop/sprints/sprint-{NNN}/execution-log.md

     サマリーには以下を含めてください:
     - 作成/変更したファイル一覧
     - 実装した機能の概要
     - 注意点や既知の制限"
   )
   ```

4. 実装完了を待つ（TaskList で監視）

5. チームをシャットダウン:
   ```
   SendMessage(type="shutdown_request", recipient="implementor")
   ```

6. 状態を更新:
   ```json
   { "current_subphase": "reviewing" }
   ```

### Phase B: DoD評価（reviewing）

1. レビューチームを作成:
   ```
   TeamCreate(team_name="sprint-{N}-review")
   ```

2. 3つのレビューエージェントを**並列**起動:

   **test-reviewer:**
   ```
   Task(
     team_name="sprint-{N}-review",
     name="test-reviewer",
     subagent_type="sprint-loop:test-reviewer",
     prompt="Sprint {N} のDoD（テスト項目）を評価してください。
     [dod.md のテスト項目セクション]
     結果を .sprint-loop/sprints/sprint-{NNN}/reviews/review-{NNN}.json に書き込んでください。"
   )
   ```

   **spec-reviewer:**
   ```
   Task(
     team_name="sprint-{N}-review",
     name="spec-reviewer",
     subagent_type="sprint-loop:spec-reviewer",
     prompt="Sprint {N} のDoD（仕様準拠項目）を評価してください。
     [spec.md の内容]
     [dod.md の仕様準拠項目セクション]
     結果を .sprint-loop/sprints/sprint-{NNN}/reviews/review-{NNN}.json に書き込んでください。"
   )
   ```

   **quality-reviewer:**
   ```
   Task(
     team_name="sprint-{N}-review",
     name="quality-reviewer",
     subagent_type="sprint-loop:quality-reviewer",
     prompt="Sprint {N} のDoD（品質項目）を評価してください。
     [dod.md の品質項目セクション]
     結果を .sprint-loop/sprints/sprint-{NNN}/reviews/review-{NNN}.json に書き込んでください。"
   )
   ```

3. 全レビュー完了を待つ

4. レビューチームをシャットダウン

5. 結果を統合して review-{NNN}.json を読み取り:
   ```json
   {
     "sprint_id": 1,
     "attempt": 1,
     "timestamp": "{ISO}",
     "reviews": {
       "test": { "verdict": "approved|rejected", "details": "...", "failures": [] },
       "spec": { "verdict": "approved|rejected", "details": "...", "failures": [] },
       "quality": { "verdict": "approved|rejected", "details": "...", "failures": [] }
     },
     "overall_verdict": "approved|rejected",
     "action_required": "..."
   }
   ```

### Phase C: 結果判定

**全 approved の場合:**
1. `result.md` にスプリント完了サマリーを書き込み
2. スプリントの status を `"completed"` に更新
3. `current_sprint` をインクリメント
4. `dod_retry_count` を 0 にリセット
5. 次のスプリントがあれば → `current_subphase: "implementing"` で Phase A へ
6. 全スプリント完了なら → `phase: "all_complete"`, `active: false`

**いずれか rejected の場合:**
1. `dod_retry_count` をインクリメント
2. フィードバック（failures の内容）を execution-log.md に追記
3. `current_subphase: "implementing"` に戻す
4. Phase A へ（フィードバックを implementor に渡す）

## 指揮者の鉄則

1. **自分でコードを書かない** — 全て Task/SendMessage 経由
2. **永続ファイルを常に更新** — 状態遷移のたびに sprint-loop-state.json を更新
3. **ログを残す** — 判断理由を .sprint-loop/logs/orchestrator-log.md に追記
4. **チームは使い捨て** — 各フェーズでTeamCreate → 完了 → シャットダウン
5. **フィードバックは具体的に** — rejected時のフィードバックは failures の内容をそのまま渡す
