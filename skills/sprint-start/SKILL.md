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
3. 計画戦略に応じたスプリントファイルの存在確認:
   - `full` / `full-adaptive`: 全スプリントの `spec.md` と `dod.md` が存在すること
   - `rolling`: `planned_through_sprint` までのスプリントの `spec.md` と `dod.md` が存在すること

いずれかが満たされない場合、エラーメッセージを表示して終了:
```
エラー: スプリント計画が見つかりません。
先に `/sprint-plan` で計画を策定してください。
```

4. Plan Mode が有効な場合 → 以下の手順で Plan Mode を解除する:
   1. Plan ファイルを**空（0バイト）**で上書きする（`Write(plan_file_path, "")`）
      - **重要**: 何も書き込まない。内容があると Session Clear 選択肢が表示され、コンテキスト消失の危険がある
   2. ExitPlanMode を呼び出す（ユーザーには Yes/No の2択のみ表示される）
   3. 承認されたら、次のステップに進む

## 起動手順

1. 状態ファイルを更新:
   > **スキーマ準拠**: 全フィールド名は `snake_case`。`phase`（`status` ではない）、`current_sprint` は数値、`session_id`（`sessionId` ではない）。
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
   Planning strategy: {planning_strategy}
   Current phase: {current_phase or "なし"}
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

**planning_strategy による追加メンバー:**

full-adaptive の場合:
```
TeamCreate(team_name="sprint-{N}")
  ├── plan-validator（検証 → shutdown）      ← Pre-Phase
  ├── implementor（Phase A で起動、完了後 shutdown）
  ├── {axis_id}-reviewer × N（Phase B で起動、完了後 shutdown）
  └── aggregator（Phase B で起動、完了後 shutdown）
```

rolling の場合（計画生成が必要な時）:
```
TeamCreate(team_name="sprint-{N}")
  ├── planner（計画生成 → shutdown）          ← Pre-Phase
  ├── implementor（Phase A で起動、完了後 shutdown）
  ├── {axis_id}-reviewer × N（Phase B で起動、完了後 shutdown）
  └── aggregator（Phase B で起動、完了後 shutdown）
```

### Pre-Phase: 計画検証 / インライン計画（planning_strategy に応じて）

各スプリントの実装開始前に、`config.json` の `planning_strategy` に応じて追加ステップを実行します。

#### full の場合

追加ステップなし。直接 Phase A に進む。

#### full-adaptive の場合

各スプリント開始前に、計画の整合性を検証します:

1. スプリントチーム内に "plan-validator" を起動:
   ```
   Task(
     team_name="sprint-{N}",
     name="plan-validator",
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="以下を読み込み、計画の整合性を検証してください:
       - .sprint-loop/sprints/sprint-{NNN}/spec.md
       - .sprint-loop/sprints/sprint-{NNN}/design.md
       - .sprint-loop/sprints/sprint-{NNN}/dod.md
       - 直前 1-2 スプリントの result.md

       検証項目:
       - design.md が参照する API/関数が実際のコードに存在するか
       - 前提とする前スプリントの成果物が想定通りか
       - 技術的アプローチに変更が必要か

       乖離がある場合: spec.md / design.md / dod.md を修正し、
       修正サマリーを .sprint-loop/sprints/sprint-{NNN}/plan-revision.md に出力。
       乖離がない場合: plan-revision.md に 'No revision needed' と書く。"
   )
   ```
2. plan-validator の完了を待つ:
   - idle 通知受信後、TaskList で完了を確認
   - `plan-revision.md` のみ読み取り（1行チェック）
3. plan-validator をシャットダウン
4. Phase A（implementing）に進む

#### rolling の場合

現在のスプリントが計画済み範囲の末端に近い場合、次バッチを計画します:

条件: `config.planning_strategy == "rolling" AND current_sprint > state.planned_through_sprint - 1`

1. `current_subphase` を `"planning"` に設定、状態ファイルを更新
2. スプリントチーム内に "planner" を起動:
   ```
   Task(
     team_name="sprint-{N}",
     name="planner",
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="以下を読み込み、次 {rolling_horizon} スプリントの詳細計画を生成:
       - .sprint-loop/plan.md（タイトル+ゴール一覧）
       - 直前スプリントの result.md（実績）
       - .sprint-loop/config.json（DoD軸設定）

       各スプリントについて以下を生成:
       - spec.md（仕様）
       - design.md（詳細設計）
       - dod.md（受け入れ基準、config の review_axes に基づく）

       完了後、生成したスプリント番号一覧を
       .sprint-loop/state/planning-result.md に出力。"
   )
   ```
3. planner の完了を待つ:
   - idle 通知受信後、TaskList で完了を確認
   - `planning-result.md` のみ読み取り
4. planner をシャットダウン
5. `state.planned_through_sprint` を更新
6. `current_subphase` を `"implementing"` に戻す
7. Phase A に進む

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

4. 実装完了を待つ:
   - チームメイト（implementor）からの idle 通知を待つ
   - 通知受信後、TaskList で implementor のタスクが完了していることを確認
   - `sleep` や `ls` によるポーリングは禁止

5. implementor をシャットダウン（チームは維持）:
   ```
   SendMessage(type="shutdown_request", recipient="implementor")
   ```

6. 状態を更新:
   ```json
   { "current_subphase": "reviewing" }
   ```

### Phase B: DoD評価（reviewing）

1. `config.json` の `review_axes` と `sprint_overrides` を読み込む

2. 現在のスプリント番号に対応する `sprint_overrides` がある場合、有効な軸をフィルタリング:
   ```
   const overrides = config.sprint_overrides?.[String(current_sprint)] || {};
   const skipAxes = overrides.skip_axes || [];
   const effectiveAxes = config.review_axes.filter(a => !skipAxes.includes(a.id));
   ```
   スキップされた軸はログに記録する。

3. state の `completed_review_axes` を `[]` にリセットする

4. `effectiveAxes` の各軸に対応するレビューエージェントを同一チーム内で**並列**起動:

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

     > **Review JSON スキーマ**: フィールド名は必ず `snake_case`（`sprint_id`, `axis_verdicts`）。
     > `verdict` は `"approved"` か `"rejected"` のみ（`"pass"` ❌, `"fail"` ❌, `"PASS"` ❌）。

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

5. 各レビューアの完了を検知し state を更新:
   - 各レビューアの idle 通知を待ち、TaskList で完了を確認
   - 完了した軸の axis.id を `state.completed_review_axes` に追加し sprint-loop-state.json を更新
   - `completed_review_axes.length === effectiveAxes.length` になるまで繰り返す
   - `sleep` や `ls` によるポーリングは禁止

6. **全レビュー完了後、即座に集約エージェントを起動**（判断不要の固定ステップ）:
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

6b. aggregator の完了を待つ:
    - idle 通知受信後、TaskList で完了を確認

7. 全レビューエージェントと aggregator をシャットダウン:
   ```
   // 全員に連続で shutdown_request を送信（応答を1つずつ待たず、全員に送ってからまとめて待つ）
   SendMessage(type="shutdown_request", recipient="{axis.id}-reviewer")  // 各レビューア
   SendMessage(type="shutdown_request", recipient="aggregator")
   ```

   > **API制約**: `shutdown_request` は個別送信のみ（broadcast 不可）。
   > `TeamDelete` は active メンバーがいると失敗するため、全員のシャットダウン完了後に実行する。

8. **指揮者は `summary-attempt-{M}.json` のみ読み取る**（個別レビューは読まない）

### レビュー結果ファイル命名規則

| ファイル種別 | パス | 例 |
|-------------|------|-----|
| 個別レビュー | `reviews/{axis_id}-attempt-{N}.json` | `reviews/test-attempt-1.json` |
| 集約サマリー | `reviews/summary-attempt-{N}.json` | `reviews/summary-attempt-1.json` |

`{N}` は `dod_retry_count + 1`（1始まり）。

### Phase C: 結果判定

**全 approved の場合:**
> **スキーマ準拠**: `sprints` 配列の更新時、各要素は `{number, title, status}` 構造を維持すること。
> `status` は `"completed"` / `"in_progress"` / `"pending"` のいずれか。

1. `result.md` にスプリント完了サマリーを書き込み
2. スプリントの status を `"completed"` に更新
3. state の `sprints` 配列で該当スプリントの status を `"completed"` に更新
4. `current_sprint` をインクリメント
5. 次スプリントが新しい Phase に属する場合、`current_phase` を更新（plan.md の Phase セクションを参照）
6. state の `sprints` 配列で次スプリントの status を `"in_progress"` に更新
7. `dod_retry_count` を 0 にリセット
8. チームをシャットダウン・削除:
   ```
   TeamDelete  // sprint-{N} チーム全体を解放
   ```
9. 次のスプリントがあれば → `current_subphase: "implementing"` で Phase A へ（新チーム作成）
10. 全スプリント完了なら → `phase: "all_complete"`, `active: false`

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
7. **待機は TaskList で行う** — `sleep` や `ls` によるポーリング禁止。チームメイトの idle 通知受信後に TaskList で完了を確認して次へ進む
