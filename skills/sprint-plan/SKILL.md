---
name: sprint-plan
description: Interactive sprint planning - create specs, designs, and DoD for each sprint
disable-model-invocation: true
---

# /sprint-plan — スプリント計画策定

あなたはスプリント計画のファシリテーターです。ユーザーと対話的にスプリント計画を策定し、永続ファイルに出力します。

## 重要: Claude Code Plan Mode との関係

このスキルの主要出力はスプリントファイル（spec.md, design.md, dod.md, config.json, state.json）です。
これらのファイル生成は「実装」ではなく、スキルの本来の成果物です。

- Step 2 でユーザーがスプリント構造を承認した後、**必ず Steps 3-6 に進んでファイルを書き出すこと**
- Claude Code の Plan Mode を使用している場合、ExitPlanMode は **Step 2 の承認後** に呼び出す
- ExitPlanMode 後、Steps 3-6 のファイル書き出しを実行すること（これは「計画の実装」ではなく「スキルの出力生成」）

## フロー

### Step 0: 既存計画の確認

ヒアリングを開始する前に、既存の `.sprint-loop/` ディレクトリの有無を確認します。

存在する場合、AskUserQuestion で以下を確認:

「前回のスプリント計画（.sprint-loop/）が残っています。どうしますか？」

| 選択肢 | 説明 |
|--------|------|
| 全て削除して新規作成 | .sprint-loop/ を丸ごと削除し、新しい計画を開始 |
| 計画のみ残して実行結果を削除 | plan.md と config.json は保持し、state/, sprints/*/reviews/, sprints/*/execution-log.md, sprints/*/result.md, logs/ を削除 |
| そのまま上書き | 既存ファイルを保持し、同名ファイルのみ上書き |

「全て削除して新規作成」が選ばれた場合、`.sprint-loop/` ディレクトリ全体を削除してから Step 1 に進みます。
「計画のみ残す」が選ばれた場合、実行結果ファイルのみ削除してから Step 1 に進みます。

### Step 0.5: 既存計画ドキュメントのインポート（オプション）

AskUserQuestion で以下を確認:

「既に作成済みの計画ドキュメント（PRD、設計書、タスクリスト等）はありますか？」

| 選択肢 | 説明 |
|--------|------|
| なし（デフォルト） | Step 1 のヒアリングから新規に計画を策定 |
| あり | 既存ドキュメントを読み込み、計画の土台にする |

**「あり」の場合:**
1. ユーザーにドキュメントのパスを入力してもらう
2. ドキュメントを読み込み、以下を抽出:
   - プロジェクト概要、ゴール
   - 技術スタック
   - スプリント分割案（あれば）
   - DoD要件（あれば）
   - 制約事項
3. 抽出結果をユーザーに提示し、確認を得る
4. 不足情報がある場合のみ Step 1 の該当質問を行う（全質問をスキップ可能）
5. Step 1.5 に進む（DoD軸の確認は必ず行う）

**「なし」の場合:** Step 1 に進む（現行フローと同一）

### Step 1: ヒアリング

ユーザーに以下を質問してください（AskUserQuestion ツールを使用）:

1. **何を作るか**: プロジェクトの概要、ゴール
2. **技術スタック**: 言語、フレームワーク、ツール
3. **制約**: 時間、既存コード、互換性要件
4. **スコープ**: 最小限の機能（MVP）か、フル機能か

### Step 1.5: DoD評価軸のカスタマイズ

スプリント分割の前に、DoD（Definition of Done）の評価軸をユーザーと決定します。

**デフォルト3軸:**
- `test` — テスト実行＆合格判定
- `spec` — 仕様準拠チェック
- `quality` — ビルド・lint・型チェック

**プロジェクト種別に応じた追加軸の提案（AskUserQuestion で確認）:**

| プロジェクト種別 | 推奨追加軸 |
|-----------------|-----------|
| ゲーム開発 | `visual`（スクリーンショット検証）, `perf`（FPS/メモリ）, `gameplay-log`（ランタイムログ解析） |
| Web フロントエンド | `visual`（UI スクリーンショット比較）, `a11y`（アクセシビリティ）, `responsive`（レスポンシブ対応） |
| API / バックエンド | `api-contract`（OpenAPI/スキーマ準拠）, `perf`（レスポンスタイム）, `security`（脆弱性チェック） |
| データパイプライン | `data-accuracy`（出力精度）, `perf`（処理時間）, `idempotency`（冪等性） |
| CLI ツール | `ux`（ヘルプ表示・エラーメッセージ）, `perf`（起動時間） |

ユーザーには以下を質問:

1. 「デフォルト3軸（test/spec/quality）以外に追加したい評価軸はありますか？」
   - プロジェクト種別に応じた候補を提示
   - 自由記述も受け付ける
2. 各カスタム軸について:
   - **評価方法**: どのように合否判定するか（コマンド実行、ファイル検証、スクリーンショット比較、ログ解析等）
   - **合格基準**: 具体的な閾値や条件
   - **必要なツール/コマンド**: 評価に必要な外部ツール
   - **エージェント能力**: レビューエージェントにどの能力を許可するか
     - `read_only` — ファイル読み取りのみ（静的解析、コードレビュー）
     - `bash` — Bash コマンド実行可（ビルド、テスト、CLI実行）
     - `browser` — ブラウザ操作可（スクリーンショット、UI検証）

カスタム軸ごとに以下を `config.json` に記録:
```json
{
  "id": "visual",
  "name": "Visual Validation",
  "description": "Screenshot comparison against reference images",
  "evaluation_method": "Take screenshot after build, compare with reference in docs/references/",
  "pass_criteria": "No visible regressions in UI layout and colors",
  "tools": ["screenshot tool", "image diff"],
  "agent_capabilities": "browser",
  "agent_prompt_hint": "Take a screenshot of the running application and compare it against reference images in docs/references/. Report any visual differences."
}
```

### Step 1.7: ループ設定のカスタマイズ

スプリント分割の前に、ループの安全制限をユーザーと決定します（AskUserQuestion を使用）。

**質問1: スプリントあたりのDoD最大リトライ回数**

「1スプリントでDoD評価が不合格だった場合、最大何回まで再実装を試みますか？」

| 選択肢 | 説明 |
|--------|------|
| 3回 | 小規模・シンプルなタスク向け。早めに失敗を検知 |
| 5回（デフォルト） | 標準的なプロジェクト向け |
| 10回 | 複雑なタスクで多くの修正サイクルが必要な場合 |

**質問2: 全体の最大ループ回数**

「Stop hookの最大ブロック回数（安全上限）をいくつに設定しますか？この値に達するとループは強制停止します。」

| 選択肢 | 説明 |
|--------|------|
| 50回 | 小規模プロジェクト（3スプリント以下）向け |
| 100回（デフォルト） | 標準的なプロジェクト向け |
| 200回 | 大規模プロジェクト（7スプリント以上）向け |
| 500回 | 超大規模プロジェクト（20スプリント以上）向け |
| 1000回 | 最大規模プロジェクト（50スプリント以上）向け |

ユーザーの回答を config.json の `max_total_iterations` と `max_dod_retries` に反映します。

**質問3: 計画戦略**

**重要: プロジェクト規模に関わらず、必ず以下の3つ全てを選択肢として提示すること。** 説明文の「〜向け」は参考情報であり、選択肢のフィルタリング基準ではない。

「計画戦略を選択してください」

| 選択肢 | 説明 |
|--------|------|
| full（デフォルト） | 全スプリントを一度に詳細化。小〜中規模向け |
| full-adaptive | 全スプリントを詳細化し、実行中に各スプリント開始前に計画を自律検証・修正 |
| rolling | 最初の N スプリントのみ詳細化、残りはタイトル+ゴールのみ。大規模・高不確実性向け |

`rolling` 選択時の追加質問:
- **rolling_horizon**: 「何スプリント先まで詳細化しますか？」（デフォルト: 5）

ユーザーの回答を config.json の `planning_strategy`, `rolling_horizon` に反映します。

### Step 2: スプリント分割の提案

ヒアリング結果をもとに、適切な数のスプリントに分割した計画を提案します。
目安: 小規模 3-7、中規模 8-15、大規模 16-50。プロジェクトの複雑さに応じて調整してください。
各スプリントは以下を含みます:

- タイトルと1文のゴール
- 主要タスク一覧
- 依存関係（前のスプリントへの依存）

#### Phase グルーピング（8スプリント以上の場合）

8スプリント以上のプロジェクトでは、スプリントを論理的な Phase にグルーピングします。
Phase は plan.md のセクション構成と state.json の `current_phase` メタデータで表現します。
ディレクトリ構造は変更しません（`sprints/sprint-NNN/` のフラット構造を維持）。

plan.md の Phase セクション例:
~~~
## Phase 1: Foundation (Sprint 1-3)
- Sprint 1: プロジェクト初期化
- Sprint 2: コアデータモデル
- Sprint 3: 基本UI

## Phase 2: Core Features (Sprint 4-8)
- Sprint 4: ユーザー認証
...
~~~

各 spec.md の冒頭に所属 Phase を記載:
~~~
> Phase 2: Core Features (Sprint 4-8)
# Sprint 5: ...
~~~

ユーザーの承認を得てから次に進みます。

### Step 3: 各スプリントの詳細化

承認されたスプリントごとに以下のファイルを作成します。

**planning_strategy による分岐:**
- `full` / `full-adaptive`: 全スプリントの spec.md, design.md, dod.md を作成
- `rolling`: 最初の `rolling_horizon` スプリントのみ spec.md, design.md, dod.md を作成。残りのスプリントは plan.md にタイトル+ゴールのみ記載

#### spec.md（仕様）
```markdown
# Sprint {N}: {タイトル}

## ゴール
{このスプリントで達成すること（1文）}

## 前提条件
- {前スプリントへの依存等}

## ユーザーストーリー
1. {ユーザーとして、...したい。なぜなら...}

## 技術タスク
1. {具体的な実装タスク}

## 変更予定ファイル
- `path/to/file` — {変更内容}
```

#### design.md（詳細設計）
```markdown
# Sprint {N}: 詳細設計

## アーキテクチャ
{コンポーネント構成、データフロー}

## インターフェース
{関数シグネチャ、APIエンドポイント、型定義}

## データモデル
{スキーマ、構造体}

## 実装方針
{アルゴリズム、パターン、ライブラリ選択の理由}
```

#### design.md サイズ目安

- 標準的なスプリント: 50-150行
- 複雑なスプリント（新アーキテクチャ、複数サブシステム統合）: 150-300行
- 特殊ドメイン（シェーダーコード、プロトコル定義等を含む場合）: 300-500行
- 500行を超える場合はスプリント分割を検討すること

#### Per-Sprint DoD 軸オーバーライド

特定のスプリントで不要な DoD 軸がある場合、`config.json` の `sprint_overrides` に記録します。
例: Sprint 1（基盤構築）では `visual` 軸をスキップ、Sprint 9 でベースライン記録のみ等。

スプリントごとにオーバーライドが必要か検討し、必要な場合は Step 4 の `sprint_overrides` に反映してください。

#### dod.md（受け入れ基準）

`config.json` の `review_axes` に基づいて動的に構成します。
各セクション見出しは `## {axis_id}: {表示名}` の形式にすること。

```markdown
# Sprint {N} - Definition of Done

## test: テスト項目
- [ ] {具体的なテスト要件}

## spec: 仕様準拠項目
- [ ] {具体的な仕様要件}

## quality: 品質項目
- [ ] ビルドが成功すること

## {custom_axis_id}: {カスタム軸名}
- [ ] {Step 1.5 で定義した合格基準}
```

### Step 4: 設定ファイルの出力

#### config.json
```json
{
  "schema_version": 1,
  "project": {
    "name": "{プロジェクト名}",
    "tech_stack": "{技術スタック}"
  },
  "planning_strategy": "full",
  "rolling_horizon": null,
  "planned_through_sprint": null,
  "max_total_iterations": "Step 1.7 で決定した値（デフォルト: 100）",
  "max_dod_retries": "Step 1.7 で決定した値（デフォルト: 5）",
  "review_axes": [
    { "id": "test", "name": "Test", "builtin": true },
    { "id": "spec", "name": "Spec Compliance", "builtin": true },
    { "id": "quality", "name": "Code Quality", "builtin": true }
  ],
  "sprint_overrides": {},
  "created_at": "{ISO 8601 UTC timestamp}"
}
```

カスタム軸の場合、各エントリに追加フィールドを含めます:
```json
{
  "id": "visual",
  "name": "Visual Validation",
  "builtin": false,
  "evaluation_method": "Screenshot comparison against references",
  "pass_criteria": "No visible regressions",
  "agent_prompt_hint": "Take screenshots and compare with docs/references/"
}
```
`agent_prompt_hint` はレビューエージェント起動時にプロンプトに注入されます。

#### sprint_overrides の構成

`sprint_overrides` はスプリント番号（文字列キー）ごとの DoD 軸オーバーライドを定義します:

```json
{
  "sprint_overrides": {
    "1": { "skip_axes": ["visual", "perf"] },
    "9": { "visual": { "pass_criteria": "Record baseline only" } }
  }
}
```

- `skip_axes`: そのスプリントでスキップする軸IDの配列
- `{axis_id}`: { ... }: 軸固有の設定オーバーライド（`pass_criteria` 等）

### Step 5: 状態の初期化

以下のファイル構造を作成します:

```
{project}/.sprint-loop/
  plan.md
  config.json
  state/
    sprint-loop-state.json    ← phase: "planned"
  sprints/
    sprint-001/
      spec.md
      design.md
      dod.md
    sprint-002/
      ...
```

状態ファイルの初期値:
```json
{
  "schema_version": 1,
  "active": false,
  "session_id": null,
  "phase": "planned",
  "current_sprint": 1,
  "total_sprints": "{N}",
  "current_phase": "{Phase名 or null（8スプリント未満の場合はnull）}",
  "current_subphase": null,
  "total_iterations": 0,
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "max_total_iterations": "Step 1.7 で決定した値（デフォルト: 100）",
  "max_dod_retries": "Step 1.7 で決定した値（デフォルト: 5）",
  "planning_strategy": "config.json から複製",
  "planned_through_sprint": "rolling の場合: rolling_horizon の値、それ以外: null",
  "sprints": [
    { "number": 1, "title": "{タイトル}", "status": "pending" },
    { "number": 2, "title": "{タイトル}", "status": "pending" }
  ],
  "started_at": null,
  "completed_at": null,
  "last_checked_at": "{ISO 8601 UTC timestamp}"
}
```

### Step 6: 完了報告

全ファイルの作成が完了したら、サマリーを表示します:

```
Sprint計画が完了しました。

計画: {スプリント数} スプリント
  Sprint 1: {タイトル}
  Sprint 2: {タイトル}
  ...

`/sprint-start` で自動実行を開始できます。
`/sprint-status` で計画内容を確認できます。
```

## 重要ルール

- 全てのファイルパスは `.sprint-loop/` 配下に配置すること
- spec.md の技術タスクは具体的で実装可能なレベルまで詳細化すること
- dod.md の各項目はレビューエージェントが機械的に判定可能な粒度にすること
- design.md にはインターフェースの型定義やシグネチャを含めること
- **spec.md は「What」（何を作るか）** — ユーザーストーリー、受け入れ条件、変更対象ファイル。関数シグネチャや型定義は含めない
- **design.md は「How」（どう作るか）** — アーキテクチャ、関数シグネチャ、型定義、アルゴリズム選択理由。spec.md の各タスクに対する具体的な実装方針を記述する
- ユーザーの承認なしに計画を確定しないこと
