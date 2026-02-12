---
name: sprint-replan
description: Major replanning of sprint structure with Plan Mode enforcement
disable-model-invocation: true
---

# /sprint-replan — 大規模な仕様変更・再計画

既存のスプリント計画を大幅に変更し、Sprint 1 から再評価できる状態にします。

## 重要: ExitPlanMode 後の動作

`/sprint-replan` は正確に計画を練り直して永続ファイルに書き込む必要があるため、
**Plan Mode を強制**します。

### ExitPlanMode のタイミングと計画ファイルの書き方

1. Plan Mode でなければ **EnterPlanMode を呼び出す**
2. ユーザーがスプリント構成を承認した後、ExitPlanMode を呼び出す
3. **ExitPlanMode を呼ぶ前に**、計画ファイルの末尾に以下のセクションを必ず追記すること:

~~~markdown
## 承認後のアクション（ExitPlanMode 後に実行）

**注意: 以下はプロジェクトコードの実装ではありません。`/sprint-replan` スキルの出力ファイル更新です。**

1. `.sprint-loop/plan.md` — マスタープラン更新
2. 影響を受けるスプリントの spec.md / design.md / dod.md を更新
3. `.sprint-loop/config.json` — 必要に応じて更新
4. `.sprint-loop/state/sprint-loop-state.json` — `phase: "replanned"` に更新
5. 完了報告の表示
~~~

4. ExitPlanMode 承認後、**計画ファイルの「承認後のアクション」セクションに従って** Steps 5-7 を実行する
5. **プロジェクトのソースコードには一切触れないこと** — 書き出すのは `.sprint-loop/` 配下のファイルのみ

## 前提条件チェック

1. `.sprint-loop/state/sprint-loop-state.json` を読み込む
2. 以下を検証:
   - `.sprint-loop/` ディレクトリが存在しない → エラー: "`/sprint-plan` で計画を策定してください"
3. Plan Mode でなければ → EnterPlanMode を呼び出す

## 手順

### Step 1: 状態遷移

現在の状態に応じて更新:

- `active: true` の場合（実行中だった）:
  ```json
  {
    "phase": "replanning",
    "active": false
  }
  ```
- `active: false` の場合（既に停止していた）:
  ```json
  {
    "phase": "replanning"
  }
  ```

### Step 2: 現状表示

以下の情報を表示:

1. `.sprint-loop/plan.md` のサマリー
2. 各スプリントの status（completed / in_progress / pending）
3. 完了済みスプリントがある場合、各 `result.md` のサマリー

表示フォーマット:
```
Sprint-Loop Replan モード

現在の計画:
  Total sprints: {total_sprints}
  Completed: {completed_count}
  In progress: Sprint {current_sprint}

Sprint Progress:
  [x] Sprint 1: {タイトル} — completed
  [x] Sprint 2: {タイトル} — completed
  [>] Sprint 3: {タイトル} — in_progress
  [ ] Sprint 4: {タイトル} — pending
```

### Step 3: ヒアリング

AskUserQuestion で以下を質問:

「何を変更しますか？ スプリント構成の変更、仕様の大幅変更、スプリントの追加・削除など、自由に記述してください。」

ユーザーの回答を受け取り、変更の影響範囲を分析する。

### Step 3.5: 新しいスプリント構成の提案

変更要求をもとに、新しいスプリント構成を提案:

1. 既存のスプリント構成をベースに差分を提示
2. 影響を受けるスプリントを明示
3. DoD 軸の変更があれば確認

追加の質問が必要な場合は AskUserQuestion で確認。

### Step 4: 差分表示と承認

変更前後のスプリント構成を比較表示:

```
変更前:
  Sprint 1: {旧タイトル} (completed)
  Sprint 2: {旧タイトル} (completed)
  Sprint 3: {旧タイトル} (in_progress)

変更後:
  Sprint 1: {タイトル} (変更なし)
  Sprint 2: {タイトル} ← 仕様変更
  Sprint 3: {タイトル} ← 仕様変更
  Sprint 4: {新タイトル} ← 新規追加
```

ExitPlanMode を呼び出す前に、計画ファイルの末尾に「承認後のアクション」セクションを追記すること（上記「重要」セクション参照）。

**ExitPlanMode を呼び出し**（ユーザーの承認を取得）

--- ExitPlanMode 承認後 ---

### Step 5: ファイル書き出し（スキルの出力生成）

承認された変更を適用:

1. `plan.md` を更新
2. 影響を受ける全スプリントの spec.md / design.md / dod.md を更新
3. `config.json` を更新（必要に応じて）
4. 新規スプリントがある場合、ディレクトリとファイルを作成

#### ファイル保全ルール
- 変更のないスプリントの spec/design/dod はそのまま保持
- 完了済みスプリントの result.md / execution-log.md / reviews/ は履歴として保持
- 削除されたスプリントのディレクトリは残すが state.sprints からは除外

### Step 6: 状態更新

状態ファイルを更新:
```json
{
  "phase": "replanned",
  "active": false,
  "current_sprint": 1,
  "current_subphase": null,
  "total_sprints": "{新しい総数}",
  "total_iterations": 0,
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "resume_mode": true,
  "previous_subphase": null,
  "sprints": [
    { "number": 1, "title": "...", "status": "pending" },
    { "number": 2, "title": "...", "status": "pending" }
  ]
}
```

**注意:** 全スプリントの status を `"pending"` にリセットする。
`resume_mode: true` は `/sprint-resume` で DoD-first モードを有効にするフラグ。

### Step 7: 完了報告

```
Sprint-Loop Replan 完了

変更サマリー:
  {変更内容の要約}

新しいスプリント構成:
  Sprint 1: {タイトル}
  Sprint 2: {タイトル}
  ...

Total sprints: {新しい総数}

`/sprint-resume` で再実行を開始してください。
DoD-first モードにより、変更のないスプリントは DoD 評価のみで高速通過します。
```

## 重要ルール

- Plan Mode を必ず使用すること
- 変更前後の差分を明確に提示し、ユーザーの承認を得ること
- 完了済みスプリントの履歴ファイルを削除しないこと
- resume_mode を必ず true に設定すること（DoD-first による効率的な再評価のため）
- 全スプリントの status を "pending" にリセットすること
