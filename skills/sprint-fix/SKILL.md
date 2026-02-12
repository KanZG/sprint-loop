---
name: sprint-fix
description: Apply small fixes to current sprint specs while execution is paused
disable-model-invocation: true
---

# /sprint-fix — 現スプリントの小規模修正

実行中のスプリントの仕様を微修正し、自動的に実行を再開します。

## 前提条件チェック

1. `.sprint-loop/state/sprint-loop-state.json` を読み込む
2. 以下を検証:
   - ファイルが存在しない → エラー: "`/sprint-plan` で計画を策定してください"
   - `active` が `false` または `phase` が `"executing"` でない → エラー: "アクティブな実行がありません。`/sprint-resume` で再開してください"
3. Plan Mode が有効な場合 → 以下の手順で Plan Mode を解除する:
   1. Plan ファイルを**空（0バイト）**で上書きする（`Write(plan_file_path, "")`）
      - **重要**: 何も書き込まない。内容があると Session Clear 選択肢が表示され、コンテキスト消失の危険がある
   2. ExitPlanMode を呼び出す（ユーザーには Yes/No の2択のみ表示される）
   3. 承認されたら、次のステップに進む

## 手順

### Step 1: 実行一時停止

> **スキーマ準拠**: フィールド名は `snake_case`。`phase`（`status` ではない）, `previous_subphase`（`previousSubphase` ではない）。

状態ファイルを更新:
```json
{
  "phase": "fixing",
  "previous_subphase": "{current_subphase の現在値}"
}
```

### Step 2: 現状表示

以下のファイルを読み込み、現在のスプリント情報を表示:
- `.sprint-loop/state/sprint-loop-state.json`（進捗概要）
- `.sprint-loop/sprints/sprint-{NNN}/spec.md`
- `.sprint-loop/sprints/sprint-{NNN}/design.md`
- `.sprint-loop/sprints/sprint-{NNN}/dod.md`

表示フォーマット:
```
Sprint-Loop Fix モード

Current Sprint: {current_sprint}/{total_sprints} — {タイトル}
Sub-phase（修正前）: {previous_subphase}
DoD Retries: {dod_retry_count}
```

### Step 3: ヒアリング

AskUserQuestion で以下を質問:

「何を修正しますか？ 現在のスプリント情報を上に表示しています。」

ユーザーの回答を受け取る。

### Step 4: スコープガード判定

ユーザーの修正要求を分析し、スコープ内かどうかを判定:

**許可される修正（sprint-fix のスコープ内）:**
- 現スプリントの spec.md / design.md / dod.md の修正
- 次 1-2 スプリントの spec.md / design.md / dod.md の軽微な調整
- config.json の `sprint_overrides`（DoD軸）の変更

**拒否される修正（sprint-replan が必要）:**
- 完了済みスプリントの修正
- スプリント総数の変更
- Phase 構造の変更
- アーキテクチャレベルの変更

スコープ外の場合:
```
この修正は /sprint-fix のスコープを超えています。
`/sprint-replan` を使用して再計画してください。

理由: {拒否理由}
```
状態を元に戻す:
```json
{
  "phase": "executing",
  "previous_subphase": null
}
```

### Step 5: 修正案の提示と承認

AskUserQuestion で修正案を提示:

「以下の修正を適用します。よろしいですか？」

| 選択肢 | 説明 |
|--------|------|
| 承認 | 修正を適用して実行を再開 |
| 修正 | 修正案を調整してから適用 |
| キャンセル | 修正せずに実行を再開 |

**キャンセルの場合:**
状態を元に戻す:
```json
{
  "phase": "executing",
  "current_subphase": "{previous_subphase}",
  "previous_subphase": null
}
```
「修正をキャンセルしました。実行を再開します。」と表示して終了。

**修正の場合:**
ユーザーの追加フィードバックを受け取り、修正案を調整してから承認フローに戻る。

### Step 6: ファイル書き出し

承認された修正を適用:

1. 対象スプリントの spec.md / design.md / dod.md を更新
2. 後続スプリントのファイルを更新（影響がある場合）
3. config.json の `sprint_overrides` を更新（変更がある場合）
4. execution-log.md に修正記録を追記

#### 修正ログフォーマット（execution-log.md 追記）

```markdown
## Fix Applied — {ISO timestamp}

### 修正内容
- {修正概要}

### 変更ファイル
- spec.md: {変更箇所}
- design.md: {変更箇所}

### 影響範囲
- Sprint {N}: 直接修正
- Sprint {N+1}: {軽微な調整}（あれば）
```

### Step 7: 状態リセット

> **スキーマ準拠**: `completed_review_axes` は配列 `[]`、`phase` は `"executing"`、`current_subphase` は `"implementing"`。全て `snake_case`。

状態ファイルを更新:
```json
{
  "phase": "executing",
  "current_subphase": "implementing",
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "previous_subphase": null
}
```

sprints 配列の現在のスプリントの status を `"in_progress"` に設定。

### Step 8: 完了報告

```
Sprint-Loop Fix 完了

修正内容:
  {修正サマリー}

変更ファイル:
  {変更ファイル一覧}

実行を再開します。Sprint {N} を implementing から再実行します。
```

### Step 9: 自動再開

セッションが自然終了すると、stop hook が `phase: "executing"` を検知してブロックし、
continuation message で orchestrator を再接地します。

## 重要ルール

- スコープ外の修正を絶対に受け入れないこと
- 修正前に必ずユーザーの承認を得ること
- 修正適用後は必ず dod_retry_count を 0 にリセットすること（仕様が変わったため）
- execution-log.md に修正記録を必ず残すこと
