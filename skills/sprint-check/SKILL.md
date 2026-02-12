---
name: sprint-check
description: Health check and auto-fix for sprint-loop plan files (state.json, config.json, sprint files)
disable-model-invocation: true
---

# /sprint-check — スプリント計画ヘルスチェック

sprint-loop の計画ファイル（state.json, config.json, スプリントファイル）がスキーマに準拠しているか、
実行データに不整合がないかを検出・修正するヘルスチェックスキルです。

## 重要: ExitPlanMode 後の動作

`/sprint-check` は問題の検出と修正計画を提示するため、**Plan Mode を強制**します。

### ExitPlanMode のタイミングと計画ファイルの書き方

1. Plan Mode でなければ **EnterPlanMode を呼び出す**
2. 全チェックを実行し、結果を計画ファイルに書き出す
3. **ExitPlanMode を呼ぶ前に**、計画ファイルの末尾に以下のセクションを必ず追記すること:

**問題がある場合:**

~~~markdown
## 承認後のアクション（ExitPlanMode 後に実行）

**注意: 以下はプロジェクトコードの実装ではありません。`.sprint-loop/` 配下のファイル修正です。**

1. `.sprint-loop/config.json` — {修正内容}
2. `.sprint-loop/state/sprint-loop-state.json` — {修正内容}
3. 完了報告の表示
~~~

**問題がない場合:**

~~~markdown
## 承認後のアクション（ExitPlanMode 後に実行）

問題は検出されませんでした。修正は不要です。
~~~

4. ExitPlanMode 承認後、**計画ファイルの「承認後のアクション」セクションに従って**修正を実行する
5. **プロジェクトのソースコードには一切触れないこと** — 修正するのは `.sprint-loop/` 配下のファイルのみ

## 前提条件チェック

1. `.sprint-loop/` ディレクトリの存在を確認
   - 存在しない → エラー: "`.sprint-loop/` が見つかりません。`/sprint-plan` で計画を策定してください"
2. `.sprint-loop/state/sprint-loop-state.json` を読み込む
   - 存在しない → エラー: "状態ファイルが見つかりません。`/sprint-plan` で計画を策定してください"
3. `.sprint-loop/config.json` を読み込む
   - 存在しない → エラー: "設定ファイルが見つかりません。`/sprint-plan` で計画を策定してください"
4. Plan Mode でなければ → EnterPlanMode を呼び出す

## 手順

### Step 1: 状態分類

state.json の `phase` フィールドを読み取り、3パターンに分類する:

| 状態 | 判定条件 | 動作 |
|------|---------|------|
| 全完了 | `phase: "all_complete"` | 「全スプリント完了済み。チェック不要です。」と報告して ExitPlanMode で終了 |
| 実行途中 | `phase` が `"executing"` / `"failed"` / `"fixing"` / `"replanned"` のいずれか | Step 2 → カテゴリ A + B + C + D を実行 |
| 全未実行 | `phase: "planned"` | Step 2 → カテゴリ A + B + C を実行（D はスキップ） |

`phase: "replanning"` の場合: 「再計画中です。`/sprint-replan` を完了してからチェックしてください。」と報告して終了。

### Step 2: 全関連ファイルの読み込み

以下のファイルを全て読み込む:

1. `.sprint-loop/config.json`
2. `.sprint-loop/state/sprint-loop-state.json`
3. `.sprint-loop/plan.md`
4. 全スプリントディレクトリ配下の `spec.md`, `design.md`, `dod.md`
5. 完了済みスプリントの `result.md`, `reviews/summary-attempt-*.json`（実行途中の場合のみ）

### Step 3: チェック実行

以下の 4 カテゴリのチェックを実行する。各チェック項目について、PASS / FAIL / WARN を判定する。

---

#### カテゴリ A: config.json チェック

| # | チェック項目 | 修正可否 |
|---|------------|---------|
| A-1 | `schema_version: 1` が存在するか | 自動修正: `schema_version: 1` を追加 |
| A-2 | `planning_strategy` が存在するか（`planStrategy` ❌, `strategy` ❌） | 自動修正: camelCase/別名から変換、またはデフォルト `"full"` を追加 |
| A-3 | `max_total_iterations` が存在するか（`max_iterations` ❌, `maxIterations` ❌） | 自動修正: 別名から変換、またはデフォルト `100` を追加 |
| A-4 | `max_dod_retries` が存在するか（`maxDodRetries` ❌） | 自動修正: camelCase から変換、またはデフォルト `5` を追加 |
| A-5 | `review_axes` が配列で、各要素に `{id, name, builtin}` があるか | 自動修正: 欠落フィールドにデフォルト値を補完 |
| A-6 | `project` オブジェクトが存在するか | 自動修正: `{"name": "unknown", "tech_stack": "unknown"}` を追加 |
| A-7 | `sprint_overrides` が存在するか | 自動修正: 空オブジェクト `{}` を追加 |
| A-8 | 全フィールド名が `snake_case` か（camelCase 検出） | 自動修正: camelCase → snake_case に変換 |

---

#### カテゴリ B: state.json チェック

| # | チェック項目 | 修正可否 |
|---|------------|---------|
| B-1 | `schema_version: 1` が存在するか | 自動修正: `schema_version: 1` を追加 |
| B-2 | `phase` フィールドが存在し、許容値（`"planned"`, `"executing"`, `"fixing"`, `"replanning"`, `"replanned"`, `"all_complete"`, `"failed"`）のいずれかであるか。`status` ❌, `state` ❌ も検出。許容値以外（`"ready"` ❌, `"initialized"` ❌, `"running"` ❌）も検出 | 自動修正: `status`/`state` → `phase` にリネーム。不正値はコンテキストから推定（不能なら `"planned"` にフォールバック） |
| B-3 | `current_sprint` が数値型か（文字列 `"sprint-001"` ❌, `"1"` ❌） | 自動修正: 文字列から数値を抽出して変換 |
| B-4 | `sprints` が配列 `[{number, title, status}]` か。オブジェクト形式 ❌, `completed_sprints`/`failed_sprints` 分離 ❌ | 自動修正: オブジェクト形式 → 配列に変換。分離された配列をマージして統合 |
| B-5 | `sprints[].status` が `"pending"` / `"in_progress"` / `"completed"` のいずれかか | 自動修正: 不正値を推定（`"done"` → `"completed"`, `"active"` → `"in_progress"` 等） |
| B-6 | `current_subphase` が許容値（`"implementing"`, `"reviewing"`, `"planning"`, `"completed"`, `null`）か。`"done"` ❌ | 自動修正: `"done"` → `"completed"` に変換 |
| B-7 | `last_checked_at` が存在するか（`last_updated` ❌, `lastCheckedAt` ❌） | 自動修正: 別名から変換、または現在時刻を設定 |
| B-8 | `total_sprints` が `sprints` 配列の長さと一致するか | 自動修正: `sprints` 配列の長さに合わせて更新 |
| B-9 | 全フィールド名が `snake_case` か（camelCase 検出） | 自動修正: camelCase → snake_case に変換 |
| B-10 | 非スキーマフィールドの検出（`current_sprint_index`, `completed_sprints`, `failed_sprints` 等） | 自動修正: 非スキーマフィールドを除去（値は統合先に移行） |

**state.json の許容フィールド一覧**（これ以外は非スキーマフィールド）:
`schema_version`, `active`, `session_id`, `phase`, `current_sprint`, `total_sprints`, `current_phase`, `current_subphase`, `total_iterations`, `dod_retry_count`, `completed_review_axes`, `planning_strategy`, `planned_through_sprint`, `resume_mode`, `previous_subphase`, `sprints`, `started_at`, `completed_at`, `last_checked_at`, `max_total_iterations`, `max_dod_retries`

---

#### カテゴリ C: スプリントファイルチェック（全未実行・実行途中 共通）

| # | チェック項目 | 修正可否 |
|---|------------|---------|
| C-1 | `spec.md` が存在するか（`planning_strategy: "rolling"` の場合は `planned_through_sprint` まで） | 報告のみ: ファイル再生成は `/sprint-plan` または `/sprint-replan` の責務 |
| C-2 | `design.md` が存在するか（同上） | 報告のみ |
| C-3 | `dod.md` が存在するか（同上） | 報告のみ |
| C-4 | `dod.md` のセクション見出し（`## {axis_id}:` 形式）が `config.review_axes` と整合するか | 報告のみ: 内容修正は `/sprint-fix` または `/sprint-replan` の責務 |
| C-5 | ディレクトリ名が `sprint-NNN`（3桁ゼロパディング）形式か | 報告のみ |
| C-6 | `state.sprints` 配列の各エントリに対応するディレクトリ `sprints/sprint-{NNN}/` が存在するか | 報告のみ |

---

#### カテゴリ D: 実行データ整合性チェック（実行途中のみ）

| # | チェック項目 | 修正可否 |
|---|------------|---------|
| D-1 | `current_sprint` に対応するスプリントの `sprints[].status` が `"in_progress"` か | 自動修正: 該当スプリントの status を `"in_progress"` に更新 |
| D-2 | 完了済みスプリント（`sprints[].status === "completed"`）に `result.md` が存在するか | 報告のみ |
| D-3 | 完了済みスプリントに `reviews/summary-attempt-*.json` が存在するか | 報告のみ |
| D-4 | `state.total_sprints` とディスク上のスプリントディレクトリ数が一致するか | 報告のみ（ディレクトリ数の方が正しいとは限らないため） |
| D-5 | `state.planning_strategy` と `config.planning_strategy` が一致するか | 自動修正: `config.planning_strategy` の値を `state.planning_strategy` に反映 |
| D-6 | `max_total_iterations` / `max_dod_retries` が state と config で一致するか（state に存在する場合） | 自動修正: `config` の値を state に反映 |

### Step 4: チェック結果の整理

全チェック結果を以下のフォーマットで計画ファイルに書き出す:

~~~markdown
# Sprint-Check 結果

## サマリー

| カテゴリ | PASS | FAIL | WARN |
|---------|------|------|------|
| A: config.json | {N} | {N} | {N} |
| B: state.json | {N} | {N} | {N} |
| C: スプリントファイル | {N} | {N} | {N} |
| D: 実行データ整合性 | {N} | {N} | {N} |
| **合計** | **{N}** | **{N}** | **{N}** |

## 検出された問題

### 自動修正可能（承認後に適用）

1. [A-8] config.json: `planningStrategy` → `planning_strategy` にリネーム
2. [B-3] state.json: `current_sprint` が文字列 `"3"` → 数値 `3` に変換
3. ...

### 報告のみ（手動対応が必要）

1. [C-1] `sprints/sprint-003/spec.md` が存在しません → `/sprint-replan` で再生成してください
2. [C-4] `sprints/sprint-002/dod.md` に `visual` 軸のセクションがありません → `/sprint-fix` で修正してください
3. ...

## 承認後のアクション（ExitPlanMode 後に実行）

**注意: 以下はプロジェクトコードの実装ではありません。`.sprint-loop/` 配下のファイル修正です。**

1. `.sprint-loop/config.json` — {具体的な修正内容}
2. `.sprint-loop/state/sprint-loop-state.json` — {具体的な修正内容}
3. 完了報告の表示
~~~

**FAIL が 0 件の場合**は「承認後のアクション」セクションに「問題は検出されませんでした。修正は不要です。」と記載する。

### Step 5: ExitPlanMode

計画ファイルへの書き出しが完了したら、ExitPlanMode を呼び出してユーザーの承認を求める。

--- ExitPlanMode 承認後 ---

### Step 6: 修正の適用

承認された修正計画に従って、自動修正可能な問題のみを修正する:

1. `config.json` の修正（該当する場合）
2. `state/sprint-loop-state.json` の修正（該当する場合）
3. 修正適用後、修正したファイルを再読み込みして正しく修正されたことを確認する

#### 修正ルール

- **自動修正可能**: スキーマフィールド名の修正（camelCase → snake_case）、型変換（文字列 → 数値）、欠落フィールドの補完（デフォルト値）、非スキーマフィールドの除去、sprints 配列形式への変換、config と state の値の同期
- **修正不可（報告のみ）**: ファイル内容の不整合（dod.md と review_axes のミスマッチ）、スプリントファイル自体の欠落（再生成は `/sprint-plan` / `/sprint-replan` の責務）
- **プロジェクトのソースコードには一切触れないこと** — 修正するのは `.sprint-loop/` 配下のファイルのみ
- **ループの起動や再開は行わないこと** — 修正後の実行は `/sprint-start` や `/sprint-resume` の責務

### Step 7: 完了報告

修正の有無に応じてフォーマットを切り替える:

**修正を適用した場合:**

```
Sprint-Check 完了

検出された問題: {FAIL件数}
自動修正済み: {修正件数}
要手動対応: {報告のみ件数}

修正内容:
  - config.json: {修正サマリー}
  - state.json: {修正サマリー}

{誘導メッセージ（下記参照）}
```

**問題がなかった場合:**

```
Sprint-Check 完了

全チェック項目 PASS — 問題は検出されませんでした。

{誘導メッセージ（下記参照）}
```

#### 誘導メッセージ

修正前の `phase` に応じて適切なコマンドを案内する:

| 修正前の phase | 誘導メッセージ |
|---------------|--------------|
| `planned` | `/sprint-start` で実行を開始できます。 |
| `executing` / `failed` / `fixing` | `/sprint-resume` で再開できます。 |
| `replanned` | `/sprint-resume` で再開できます。 |

**報告のみの問題が残っている場合**は、誘導メッセージの前に以下を追加:

```
注意: 手動対応が必要な問題が {N} 件あります。
上記の「報告のみ」の項目を確認し、必要に応じて `/sprint-fix` または `/sprint-replan` で対応してください。
```

## 重要ルール

- Plan Mode を必ず使用すること
- 自動修正の適用前に必ずユーザーの承認を得ること（ExitPlanMode で承認）
- 報告のみの問題を自動修正しようとしないこと
- ループの起動・再開を行わないこと（修正のみで終了）
- プロジェクトのソースコードに触れないこと（`.sprint-loop/` 配下のみ）
- 全ての修正は CLAUDE.md の Schema Conformance Rules に準拠すること
