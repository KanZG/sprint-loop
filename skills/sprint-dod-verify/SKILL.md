---
name: sprint-dod-verify
description: Verify DoD items don't assume future sprint features and check completeness
disable-model-invocation: true
---

# /sprint-dod-verify — DoD 前方依存検証・完全性チェック

未実行スプリントの DoD（Definition of Done）が、未来のスプリントで導入される機能を前提としていないか、
DoD の内容が適切かを検証し、対話的に修正するスキルです。

## 重要: ExitPlanMode 後の動作

`/sprint-dod-verify` は問題の検出と修正計画を提示するため、**Plan Mode を強制**します。

### ExitPlanMode のタイミングと計画ファイルの書き方

1. Plan Mode でなければ **EnterPlanMode を呼び出す**
2. 全検出・精査を完了し、修正計画を計画ファイルに書き出す
3. **ExitPlanMode を呼ぶ前に**、計画ファイルの末尾に以下のセクションを必ず追記すること:

**問題がある場合:**

~~~markdown
## 承認後のアクション（ExitPlanMode 後に実行）

**注意: 以下はプロジェクトコードの実装ではありません。`.sprint-loop/` 配下の DoD ファイル修正です。**

1. `.sprint-loop/sprints/sprint-{NNN}/dod.md` — {修正内容}
2. `.sprint-loop/sprints/sprint-{NNN}/spec.md` — {軽微な整合修正}（必要な場合のみ）
3. ...
4. 修正後の検証パス実行
5. 完了報告の表示
~~~

**問題がない場合:**

~~~markdown
## 承認後のアクション（ExitPlanMode 後に実行）

問題は検出されませんでした。修正は不要です。
~~~

4. ExitPlanMode 承認後、**計画ファイルの「承認後のアクション」セクションに従って**修正を実行する
5. **プロジェクトのソースコードには一切触れないこと** — 修正するのは `.sprint-loop/` 配下のファイルのみ

## 検出の3次元

| 次元 | ID | 深刻度 | 説明 |
|------|-----|--------|------|
| 前方依存 | `forward-dep` | CRITICAL | Sprint N の DoD が Sprint N+1 以降で初めて導入される機能を前提としている |
| 完全性 | `completeness` | WARNING | spec.md の機能要件に対応する DoD 項目が欠落 |
| 整合性 | `consistency` | INFO | 異なるスプリントの DoD 間の矛盾・重複 |

### 前方依存の定義（PRIMARY チェック）

「累積機能マップ」を構築して判定する:

- Sprint K の累積機能マップ = Union(spec.md[1], spec.md[2], ..., spec.md[K])
- Sprint K の DoD 内の全参照がこのマップに含まれていれば OK
- マップに含まれない参照があれば **CRITICAL**

前方依存の検出がこのスキルの最大の価値であり、最優先で検出する。

## 前提条件チェック

1. `.sprint-loop/` ディレクトリの存在を確認
   - 存在しない → エラー: "`.sprint-loop/` が見つかりません。`/sprint-plan` で計画を策定してください"
2. `.sprint-loop/state/sprint-loop-state.json` を読み込む
   - 存在しない → エラー: "状態ファイルが見つかりません。`/sprint-plan` で計画を策定してください"
3. `.sprint-loop/config.json` を読み込む
   - 存在しない → エラー: "設定ファイルが見つかりません。`/sprint-plan` で計画を策定してください"
4. `state.sprints` 配列に `status` が `"pending"` または `"in_progress"` のスプリントがあるか確認
   - 0 件 → エラー: "検証対象の未実行スプリントがありません。全スプリントが完了済みです。"
5. `state.phase` が `"replanning"` → エラー: "再計画中です。`/sprint-replan` を完了してから検証してください。"
6. Plan Mode でなければ → EnterPlanMode を呼び出す

## 手順

### Step 1: パラメータ確認

AskUserQuestion で以下を確認:

**質問1: 検出パス数**

「DoD 検証の検出パス数を選択してください。パス数が多いほど検出精度が上がりますが、実行時間が長くなります。」

| 選択肢 | 説明 |
|--------|------|
| 3パス（推奨） | バランスの取れた精度と速度 |
| 1パス | 高速だが検出漏れの可能性 |
| 5パス | 最高精度、大規模プロジェクト向け |

**質問2: 対象スプリント**

「検証対象のスプリントを選択してください。」

| 選択肢 | 説明 |
|--------|------|
| 全未実行スプリント（推奨） | pending / in_progress の全スプリントを検証 |
| 現在のスプリントのみ | current_sprint のみ検証 |
| 範囲指定 | スプリント番号の範囲を指定 |

### Step 2: データ収集

以下のファイルを全て読み込む:

1. **全スプリントの `spec.md`** — 累積機能マップの構築に必要（完了済み含む全スプリント）
2. **全スプリントの `design.md`** — 補足情報として利用
3. **対象スプリントの `dod.md`** — 検証対象
4. **`.sprint-loop/plan.md`** — Phase 構成の把握
5. **`.sprint-loop/config.json`** — `review_axes` の確認

ファイルが見つからない場合の対処:
- `spec.md` 不在 → 該当スプリントをスキップし WARNING を報告
- `dod.md` 不在 → 該当スプリントをスキップし CRITICAL を報告（DoD 自体の欠落）
- `design.md` 不在 → スキップ（任意情報のため）

### Step 3: 検出プロンプト構築

全データを含む分析プロンプトを構築する。各検出エージェントに以下を指示:

```
あなたは sprint-loop プロジェクトの DoD（Definition of Done）検証エージェントです。

## タスク

以下のスプリント計画データを分析し、3つの次元で問題を検出してください。

## 検出次元

### 1. 前方依存検出（CRITICAL）
累積機能マップを構築して判定します:
- Sprint K の累積機能マップ = Sprint 1 から Sprint K までの全 spec.md で定義された機能の和集合
- Sprint K の dod.md 内の各項目が、累積機能マップに含まれる機能のみを参照しているか検証
- マップに含まれない機能（Sprint K+1 以降で初めて導入される機能）への参照は CRITICAL

### 2. 完全性検出（WARNING）
- 各スプリントの spec.md に記載された機能要件に対応する DoD 項目が dod.md に存在するか検証
- 機能要件はあるが DoD で検証されない項目を WARNING として報告

### 3. 整合性検出（INFO）
- 異なるスプリントの DoD 間で矛盾する記述がないか検証
- 同一の検証項目が複数スプリントで重複していないか検証

## 出力フォーマット

検出結果を以下のフォーマットで出力してください:

### CRITICAL: 前方依存

- **Sprint {N}, セクション "{section}", 項目 "{item}"**
  - 参照先: {参照している機能}
  - 導入スプリント: Sprint {M}（Sprint {N} より後）
  - 推奨: {削除 / Sprint {M} 以降に移動 / 書き換え}

### WARNING: 完全性欠落

- **Sprint {N}, spec.md の要件 "{requirement}"**
  - dod.md に対応する検証項目なし
  - 推奨: DoD 項目を追加

### INFO: 整合性

- **Sprint {N} と Sprint {M}**
  - 問題: {矛盾 / 重複の内容}
  - 推奨: {解決策}

問題がない次元は「検出なし」と明記してください。

## 分析対象データ

{ここに収集した全データを挿入}
```

### Step 4: 検出フェーズ（N パス並列実行）

Step 1 で確認したパス数（N）に応じて、`general-purpose` エージェントを並列起動する。

**重要:**
- Task ツールを使用する（TeamCreate は使用しない）
- 各エージェントは独立分析（他パスの結果を参照させない）
- 出力先: `.sprint-loop/state/dod-verify-pass-{K}.md`（K = 1, 2, ..., N）
- 全エージェントの完了を待つ

```
// N=3 の場合の例:
Task(subagent_type="general-purpose", prompt="{検出プロンプト}", description="DoD検証パス1")
  → 出力: .sprint-loop/state/dod-verify-pass-1.md
Task(subagent_type="general-purpose", prompt="{検出プロンプト}", description="DoD検証パス2")
  → 出力: .sprint-loop/state/dod-verify-pass-2.md
Task(subagent_type="general-purpose", prompt="{検出プロンプト}", description="DoD検証パス3")
  → 出力: .sprint-loop/state/dod-verify-pass-3.md
```

エージェント失敗時の対処:
- 全エージェント失敗 → エラー: "全ての検出エージェントが失敗しました。再実行してください。" → 終了
- 一部エージェント失敗 → 成功分で集約を続行し、失敗パスを WARNING として報告

### Step 5: 結果集約

全パスの結果ファイルを読み込み、以下の手順で集約する:

1. **同一問題の統合**: 同一スプリント・同一セクション・同一項目を指す検出を1件にまとめる
2. **信頼度スコアの算出**: 各検出について `信頼度 = 検出パス数 / 総パス数`
   - `>= 0.67` → 高信頼（複数パスが独立に検出）
   - `< 0.67` → 低信頼（要手動確認）
3. **深刻度で分類**: CRITICAL → WARNING → INFO の順にソート

集約結果を計画ファイルに以下のフォーマットで書き出す:

```markdown
# DoD 検証結果

## サマリー

| 深刻度 | 検出数 | 高信頼 | 低信頼 |
|--------|--------|--------|--------|
| CRITICAL | {N} | {N} | {N} |
| WARNING | {N} | {N} | {N} |
| INFO | {N} | {N} | {N} |

検出パス数: {N} / 成功: {N} / 失敗: {N}

## CRITICAL: 前方依存

### [{信頼度}] Sprint {N}, "{セクション}" — "{項目}"
- 参照先: {参照している機能}
- 導入スプリント: Sprint {M}
- 検出パス: {K}/{N}
- 推奨アクション: {削除 / 移動 / 書き換え}

...

## WARNING: 完全性欠落

### [{信頼度}] Sprint {N} — "{spec要件}"
- 対応する DoD 項目なし
- 検出パス: {K}/{N}
- 推奨アクション: DoD 項目追加

...

## INFO: 整合性

### [{信頼度}] Sprint {N} / Sprint {M} — "{問題概要}"
- 詳細: {矛盾 / 重複の説明}
- 検出パス: {K}/{N}

...
```

### Step 6: インタラクティブ精査

検出された問題をユーザーと対話的に精査する。深刻度に応じて対話方式を変える。

#### CRITICAL（前方依存）— 個別精査

各 CRITICAL 検出について **個別に** AskUserQuestion で確認する:

「Sprint {N} の DoD 項目 "{item}" が Sprint {M} で導入される機能 "{feature}" を前提としています（信頼度: {score}）。どう対処しますか？」

| 選択肢 | 説明 |
|--------|------|
| 削除 | この DoD 項目を削除する |
| Sprint {M} に移動 | 該当機能が利用可能な Sprint {M} の DoD に移動 |
| 書き換え | Sprint {N} 時点で検証可能な内容に書き換え |
| 意図的に許容 | 前方依存を認識した上で変更しない |

「書き換え」選択時は AskUserQuestion で具体的な書き換え内容を確認する。

#### WARNING（完全性欠落）— まとめて提示

全 WARNING をまとめて表示し、AskUserQuestion で対処方針を確認する:

「以下の WARNING が検出されました。どう対処しますか？」

| 選択肢 | 説明 |
|--------|------|
| 一括適用 | 全ての推奨アクションを適用 |
| 個別確認 | 各 WARNING を個別に確認 |
| 全件スキップ | 全ての WARNING を無視 |

「個別確認」選択時は、各 WARNING について AskUserQuestion で対処を確認する。

#### INFO（整合性）— 表示のみ

INFO は計画ファイルに記載するのみ。ユーザーが希望すれば個別確認に切り替える。

「INFO レベルの検出が {N} 件あります。個別に確認しますか？」

| 選択肢 | 説明 |
|--------|------|
| スキップ（推奨） | 表示のみで修正しない |
| 個別確認 | 各 INFO を個別に確認 |

### Step 7: 修正計画の確定と ExitPlanMode

Step 6 の精査結果をもとに、計画ファイルに修正計画を書き出す。

**ExitPlanMode を呼ぶ前に**、計画ファイルの末尾に「承認後のアクション」セクションを追記すること:

修正がある場合:

```markdown
## 承認後のアクション（ExitPlanMode 後に実行）

**注意: 以下はプロジェクトコードの実装ではありません。`.sprint-loop/` 配下の DoD ファイル修正です。**

1. `.sprint-loop/sprints/sprint-{NNN}/dod.md` — {修正内容}
2. `.sprint-loop/sprints/sprint-{NNN}/dod.md` — {修正内容}
3. `.sprint-loop/sprints/sprint-{NNN}/spec.md` — {軽微な整合修正}（必要な場合のみ）
4. 修正後の検証パス実行
5. 完了報告の表示
```

修正がない場合（全件スキップ / 意図的許容 / 検出ゼロ）:

```markdown
## 承認後のアクション（ExitPlanMode 後に実行）

問題は検出されませんでした。修正は不要です。
```

**ExitPlanMode を呼び出し**（ユーザーの承認を取得）

--- ExitPlanMode 承認後 ---

### Step 8: 修正の適用

承認された修正計画に従って、ファイルを修正する:

1. `dod.md` の項目削除・追加・移動・書き換え
2. 必要に応じて `spec.md` の軽微な整合修正
3. 他スプリントの `dod.md` への項目移動（移動アクションがある場合）

#### 修正ルール

- **修正対象**: `.sprint-loop/` 配下のファイルのみ（`dod.md`, `spec.md`）
- **修正不可**: `state.json`, `config.json`, プロジェクトのソースコード
- **移動時の注意**: 移動先スプリントの `dod.md` の既存構成（セクション見出し等）を維持すること

### Step 9: 修正後検証パス

修正適用後、検証のために検出エージェントを **1回のみ** 起動する。

- 出力先: `.sprint-loop/state/dod-verify-verification.md`
- Step 3 と同じプロンプトを使用（修正後のデータで再構築）

結果の判定:
- **残存 CRITICAL なし** → Step 10 へ（完了）
- **残存 CRITICAL あり** → ユーザーに報告し、追加修正の要否を確認

残存 CRITICAL がある場合の AskUserQuestion:

「修正後の検証で残存する CRITICAL が {N} 件あります。」

| 選択肢 | 説明 |
|--------|------|
| 追加修正 | Step 6-8 のサイクルを再実行 |
| 許容して完了 | 残存を認識した上で完了 |

「追加修正」選択時は Step 6 に戻り、残存 CRITICAL のみを対象に精査を行う。

### Step 10: 完了報告

```
Sprint-DoD-Verify 完了

検出結果:
  CRITICAL: {初回検出数} → {修正後残存数}
  WARNING:  {初回検出数} → {修正後残存数}
  INFO:     {検出数}

修正ファイル:
  - {修正ファイル一覧}

検証パス結果ファイル:
  - .sprint-loop/state/dod-verify-pass-*.md（検出パス）
  - .sprint-loop/state/dod-verify-verification.md（修正後検証）

{誘導メッセージ（下記参照）}
```

#### 誘導メッセージ

`state.phase` に応じて適切なコマンドを案内する:

| phase | 誘導メッセージ |
|-------|--------------|
| `planned` | `/sprint-start` で実行を開始できます。 |
| `executing` / `failed` / `fixing` | `/sprint-resume` で再開できます。 |
| `replanned` | `/sprint-resume` で再開できます。 |

## エラーハンドリング

| エラー条件 | 対処 |
|-----------|------|
| `.sprint-loop/` 不在 | エラー表示して終了 |
| `state.json` 不在 | エラー表示して終了 |
| `config.json` 不在 | エラー表示して終了 |
| pending スプリント 0 件 | エラー表示して終了 |
| `phase: "replanning"` | `/sprint-replan` 完了を案内して終了 |
| 対象の `spec.md` 不在 | 該当スプリントをスキップ + WARNING |
| 対象の `dod.md` 不在 | 該当スプリントをスキップ + CRITICAL 報告（DoD 欠落） |
| 全検出エージェント失敗 | エラー表示して終了 |
| 一部エージェント失敗 | 成功分で集約を続行、失敗パスを WARNING として報告 |

## 重要ルール

- **Plan Mode を必ず使用すること**
- **前方依存検出が PRIMARY** — このスキルの最大の価値は前方依存の検出にある
- **検出エージェントは `general-purpose` で起動する**（TeamCreate は使用しない）
- **`.sprint-loop/` 配下のみ修正** — プロジェクトのソースコードには一切触れない
- **state.json, config.json は変更しない**
- **修正後の検証パスを必ず実行すること**（Step 9）
- **ループの起動・再開を行わないこと** — 実行は `/sprint-start` や `/sprint-resume` の責務
- **中間ファイル（`.sprint-loop/state/dod-verify-pass-*.md`）は削除しない** — 監査証跡として保持
