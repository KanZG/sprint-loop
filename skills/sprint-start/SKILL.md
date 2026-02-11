---
name: sprint-start
description: Start autonomous sprint-loop execution - orchestrates implementation and DoD review cycles
disable-model-invocation: true
---

# /sprint-start — 自動実行開始

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
先に `/sprint-plan` で計画を策定してください。
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
   停止するには `/sprint-cancel` を使用してください。
   ```

3. 最初のスプリント実行ワークフローを開始

## カウンタ定義

| カウンタ | 定義 | インクリメント契機 |
|---------|------|-------------------|
| `total_iterations` | Stop hookのブロック回数（内部メカニズム用） | Stop hook が block を返すたび |
| `dod_retry_count` | 現スプリントの impl→review サイクル数（品質ゲート用） | DoD rejected で再実装に戻るたび |

`total_iterations` はループ安全機構用（上限到達で強制停止）。
`dod_retry_count` は品質ゲート用（1スプリントあたりの再試行上限）。
スプリント完了時に `dod_retry_count` は 0 にリセットされるが、`total_iterations` はリセットしない。

## スプリント実行ワークフロー

### チーム設計: 1スプリント = 1チーム

各スプリントで **1つのチーム** を作成し、implementor と reviewer を同一チーム内で管理する。
フェーズ間（impl → review）でチームを作り直す必要はない。

```
TeamCreate(team_name="sprint-{N}")
  ├── implementor（Phase A で起動、完了後 shutdown）
  ├── {axis_id}-reviewer × N（Phase B で起動、完了後 shutdown）
  └── aggregator（Phase B で起動、完了後 shutdown）
Sprint完了時: TeamDelete で一括解放
```

### Phase A: 実装（implementing）

1. スプリントの永続ファイルを読み込む:
   ```
   Read: .sprint-loop/sprints/sprint-{NNN}/spec.md
   Read: .sprint-loop/sprints/sprint-{NNN}/design.md
   Read: .sprint-loop/sprints/sprint-{NNN}/dod.md
   ```

2. スプリントチームを作成（初回実装時のみ）:
   ```
   TeamCreate(team_name="sprint-{N}")
   ```

3. implementor エージェントを起動:
   ```
   Task(
     team_name="sprint-{N}",
     name="implementor",
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="以下の仕様と設計に基づいて実装してください。

     [spec.md の内容]
     [design.md の内容]

     ## 実装ルール
     - design.md を忠実に実装すること。dod.md との不整合があっても、design.md を優先する。
     - dod.md との不整合は DoD評価で検出され、フィードバックとして修正指示が渡される。
     - 指揮者は DoD を先読みして実装を変えてはならない。

     完了後、以下のファイルに実装サマリーを書き込んでください:
     .sprint-loop/sprints/sprint-{NNN}/execution-log.md

     ## execution-log.md フォーマット（Attempt 1の場合）:
     ```markdown
     ## Attempt 1 — {ISO timestamp}

     ### Implementation
     - 変更ファイル一覧
     - 実装内容の概要
     - 注意点や既知の制限
     ```
     "
   )
   ```

   **リトライ時（Attempt 2以降）** は、前回の DoD フィードバックを含めて起動:
   ```
   Task(
     team_name="sprint-{N}",
     name="implementor",
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="以下の仕様と設計に基づいて実装を修正してください。

     [spec.md の内容]
     [design.md の内容]

     ## 前回のDoD評価フィードバック:
     [summary.json の action_required をそのまま貼り付け]

     ## 実装ルール
     - design.md を忠実に実装すること。
     - 上記フィードバックの指摘事項を全て修正すること。

     完了後、以下のファイルに実装サマリーを**追記**してください:
     .sprint-loop/sprints/sprint-{NNN}/execution-log.md

     ## execution-log.md 追記フォーマット:
     ```markdown
     ## Attempt {N} — {ISO timestamp}

     ### Feedback from previous attempt
     - 前回のDoD失敗理由（action_required の内容）

     ### Implementation
     - 変更ファイル一覧
     - 実装内容の概要
     - 修正した指摘事項
     ```
     "
   )
   ```

4. 実装完了を待つ（TaskList で監視）

5. implementor をシャットダウン（チームは維持）:
   ```
   SendMessage(type="shutdown_request", recipient="implementor")
   ```

6. 状態を更新:
   ```json
   { "current_subphase": "reviewing" }
   ```

### Phase B: DoD評価（reviewing）

1. `config.json` の `review_axes` を読み込む

2. state の `completed_review_axes` を `[]` にリセットする

3. `review_axes` の各軸に対応するレビューエージェントを同一チーム内で**並列**起動:

   **builtin 軸** (`builtin: true`): 対応するベア名エージェントを使用
   ```
   Task(
     team_name="sprint-{N}",
     name="{axis.id}-reviewer",
     subagent_type="{axis.id}-reviewer",
     mode="acceptEdits",
     prompt="Sprint {N} の「{axis.name}」を評価してください。
     [dod.md の該当セクション]
     結果を .sprint-loop/sprints/sprint-{NNN}/reviews/{axis.id}-attempt-{M}.json に書き込んでください。

     出力JSON形式:
     {
       \"sprint_id\": {N},
       \"attempt\": {M},
       \"timestamp\": \"{ISO}\",
       \"reviews\": {
         \"{axis.id}\": {
           \"verdict\": \"approved|rejected\",
           \"details\": \"...\",
           \"failures\": []
         }
       }
     }"
   )
   ```

   **custom 軸** (`builtin: false`): `general-purpose` エージェント + `agent_prompt_hint` を使用
   ```
   Task(
     team_name="sprint-{N}",
     name="{axis.id}-reviewer",
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="Sprint {N} の「{axis.name}」を評価してください。
     評価方法: {axis.evaluation_method}
     合格基準: {axis.pass_criteria}
     {axis.agent_prompt_hint}

     [dod.md の該当セクション]

     結果を以下のJSON形式で .sprint-loop/sprints/sprint-{NNN}/reviews/{axis.id}-attempt-{M}.json に書き込んでください:
     {
       \"sprint_id\": {N},
       \"attempt\": {M},
       \"timestamp\": \"{ISO}\",
       \"reviews\": {
         \"{axis.id}\": {
           \"verdict\": \"approved|rejected\",
           \"details\": \"...\",
           \"failures\": []
         }
       }
     }"
   )
   ```

   > **subagent_type 命名規則**: プロジェクトローカル `.claude/agents/` のエージェントは**ベア名**（プレフィックスなし）で参照する。
   > 例: `"test-reviewer"` ○ / `"sprint-loop:test-reviewer"` ✗

4. 各レビューア完了を検知するたびに state を更新:
   ```
   // レビューア完了検知時（TaskList で status 変化を確認）
   state.completed_review_axes に完了した軸の axis.id を追加
   → sprint-loop-state.json を更新
   ```

5. **全レビュー完了後、即座に集約エージェントを起動**（判断不要の固定ステップ）:
   ```
   Task(
     team_name="sprint-{N}",
     name="aggregator",
     subagent_type="review-aggregator",
     mode="acceptEdits",
     prompt="以下のレビュー結果ファイルを全て読み込み、集約サマリーを作成してください。
     ファイルパターン: .sprint-loop/sprints/sprint-{NNN}/reviews/*-attempt-{M}.json
     （summary-*.json は除外すること）

     以下の形式で .sprint-loop/sprints/sprint-{NNN}/reviews/summary-attempt-{M}.json に出力:
     {
       \"sprint_id\": {N},
       \"attempt\": {M},
       \"timestamp\": \"{ISO}\",
       \"overall_verdict\": \"approved|rejected\",
       \"axis_verdicts\": { \"{axis_id}\": \"approved|rejected\", ... },
       \"action_required\": \"rejected軸のfailuresを箇条書きで列挙。全approved時はnull\"
     }"
   )
   ```

   > **注**: aggregator は「全レビューア完了 → 必ず起動」の固定パターン。
   > 指揮者が個別レビュー JSON を直接読むと Context を大量消費するため、
   > aggregator に集約させて summary 1ファイルのみ読む設計。

6. 全レビューエージェントと aggregator をシャットダウン:
   ```
   // 全員に連続で shutdown_request を送信（応答を1つずつ待たず、全員に送ってからまとめて待つ）
   SendMessage(type="shutdown_request", recipient="{axis.id}-reviewer")  // 各レビューア
   SendMessage(type="shutdown_request", recipient="aggregator")
   ```

   > **API制約**: `shutdown_request` は個別送信のみ（broadcast 不可）。
   > `TeamDelete` は active メンバーがいると失敗するため、全員のシャットダウン完了後に実行する。

7. **指揮者は `summary-attempt-{M}.json` のみ読み取る**（個別レビューは読まない）

### レビュー結果ファイル命名規則

| ファイル種別 | パス | 例 |
|-------------|------|-----|
| 個別レビュー | `reviews/{axis_id}-attempt-{N}.json` | `reviews/test-attempt-1.json` |
| 集約サマリー | `reviews/summary-attempt-{N}.json` | `reviews/summary-attempt-1.json` |

`{N}` は `dod_retry_count + 1`（1始まり）。

### Phase C: 結果判定

**全 approved の場合:**
1. `result.md` にスプリント完了サマリーを書き込み
2. スプリントの status を `"completed"` に更新
3. `current_sprint` をインクリメント
4. `dod_retry_count` を 0 にリセット
5. チームをシャットダウン・削除:
   ```
   TeamDelete  // sprint-{N} チーム全体を解放
   ```
6. 次のスプリントがあれば → `current_subphase: "implementing"` で Phase A へ（新チーム作成）
7. 全スプリント完了なら → `phase: "all_complete"`, `active: false`

**いずれか rejected の場合:**
1. `dod_retry_count` をインクリメント
2. `summary-attempt-{M}.json` の `action_required` を execution-log.md に追記
3. `current_subphase: "implementing"` に戻す
4. Phase A へ（フィードバックを implementor に渡す。**チームは維持したまま**新しい implementor を起動）

## 指揮者の鉄則

1. **自分でコードを書かない** — 全て Task/SendMessage 経由
2. **永続ファイルを常に更新** — 状態遷移のたびに sprint-loop-state.json を更新
3. **ログを残す** — 判断理由を .sprint-loop/logs/orchestrator-log.md に追記
4. **1スプリント1チーム** — `TeamCreate(team_name="sprint-{N}")` でチーム作成、スプリント完了時に `TeamDelete` で一括解放
5. **フィードバックは具体的に** — rejected時は `action_required` の内容をそのまま implementor に渡す
6. **subagent_type はベア名** — `"test-reviewer"` であって `"sprint-loop:test-reviewer"` ではない
