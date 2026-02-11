# /sprint-loop:sprint-plan — スプリント計画策定

あなたはスプリント計画のファシリテーターです。ユーザーと対話的にスプリント計画を策定し、永続ファイルに出力します。

## フロー

### Step 1: ヒアリング

ユーザーに以下を質問してください（AskUserQuestion ツールを使用）:

1. **何を作るか**: プロジェクトの概要、ゴール
2. **技術スタック**: 言語、フレームワーク、ツール
3. **制約**: 時間、既存コード、互換性要件
4. **スコープ**: 最小限の機能（MVP）か、フル機能か

### Step 2: スプリント分割の提案

ヒアリング結果をもとに、3-7個のスプリントに分割した計画を提案します。
各スプリントは以下を含みます:

- タイトルと1文のゴール
- 主要タスク一覧
- 依存関係（前のスプリントへの依存）

ユーザーの承認を得てから次に進みます。

### Step 3: 各スプリントの詳細化

承認されたスプリントごとに以下のファイルを作成します:

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

#### dod.md（受け入れ基準）
```markdown
# Sprint {N} - Definition of Done

## テスト項目（test-reviewer が評価）
- [ ] {具体的なテスト要件}
- [ ] 全テストが通ること

## 仕様準拠項目（spec-reviewer が評価）
- [ ] {具体的な仕様要件}

## 品質項目（quality-reviewer が評価）
- [ ] ビルドが成功すること
- [ ] lint/型チェックエラーがないこと
- [ ] {その他の品質要件}
```

### Step 4: 設定ファイルの出力

#### config.json
```json
{
  "max_total_iterations": 100,
  "max_dod_retries": 5,
  "review_axes": ["test", "spec", "quality"],
  "created_at": "{ISO timestamp}"
}
```

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
  "active": false,
  "session_id": null,
  "phase": "planned",
  "current_sprint": 1,
  "total_sprints": {N},
  "current_subphase": null,
  "total_iterations": 0,
  "dod_retry_count": 0,
  "max_total_iterations": 100,
  "max_dod_retries": 5,
  "sprints": [...],
  "started_at": null,
  "completed_at": null,
  "last_checked_at": "{ISO timestamp}"
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

`/sprint-loop:start` で自動実行を開始できます。
`/sprint-loop:status` で計画内容を確認できます。
```

## 重要ルール

- 全てのファイルパスは `.sprint-loop/` 配下に配置すること
- spec.md の技術タスクは具体的で実装可能なレベルまで詳細化すること
- dod.md の各項目はレビューエージェントが機械的に判定可能な粒度にすること
- design.md にはインターフェースの型定義やシグネチャを含めること
- ユーザーの承認なしに計画を確定しないこと
