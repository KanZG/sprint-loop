---
name: sprint-resume
description: Resume sprint-loop execution from current state with automatic mode detection
disable-model-invocation: true
---

# /sprint-resume — 状況に応じた再開

現在の状態を読み取り、最適な再開方法を自動判定して実行を再開します。

## 前提条件チェック

1. `.sprint-loop/state/sprint-loop-state.json` を読み込む
2. 以下を検証:
   - ファイルが存在しない → エラー: "`/sprint-plan` で計画を策定してください"
   - `phase: "planned"` → エラー: "`/sprint-start` で実行を開始してください"
   - `phase: "replanning"` → エラー: "`/sprint-replan` で再計画を完了してください"
   - `phase: "all_complete"` → エラー: "全スプリントは完了済みです"
3. Plan Mode が有効な場合 → ExitPlanMode を呼び出す

## 状態別の挙動

| 現在の Phase | 挙動 | 詳細 |
|-------------|------|------|
| `planned` | エラー | "`/sprint-start` で実行を開始してください" |
| `executing` (active) | 最新状態から再開 | current_sprint / current_subphase をそのまま継続 |
| `failed` | 最新状態から再開 | active: true に復帰、current_sprint / current_subphase から継続 |
| `fixing` | 最新状態から再開 | implementing に戻して再開 |
| `replanning` | エラー | "`/sprint-replan` で再計画を完了してください" |
| `replanned` | DoD-first で Sprint 1 から | resume_mode: true、全スプリントを DoD 評価から開始 |
| `all_complete` | エラー | "全スプリントは完了済みです" |
| state なし | エラー | "`/sprint-plan` で計画を策定してください" |

## 手順

### Step 1: 再開モード判定

状態ファイルの `phase` に基づいて再開モードを判定:

- **[A] DoD-first モード**: `phase: "replanned"` の場合
- **[B] 最新状態継続モード**: `phase: "executing"` | `"failed"` | `"fixing"` の場合

---

### Mode A: DoD-first モード（replanned からの再開）

replan 後は既存実装が仕様変更の影響を受けていない可能性がある。
全スプリントを Sprint 1 から再評価するが、DoD が通れば実装をスキップする。

#### 状態更新

```json
{
  "active": true,
  "session_id": "{新規UUID — crypto.randomUUID() で生成}",
  "phase": "executing",
  "current_sprint": 1,
  "current_subphase": "reviewing",
  "resume_mode": true,
  "started_at": "{ISO timestamp}",
  "total_iterations": 0,
  "dod_retry_count": 0,
  "completed_review_axes": []
}
```

sprints 配列の Sprint 1 の status を `"in_progress"` に設定。

#### 通知

```
Sprint-Loop Resume（DoD-first モード）で再実行を開始します。

各スプリントは DoD 評価から開始し、PASS すれば実装スキップ、FAIL なら再実装します。

Total sprints: {total_sprints}
Planning strategy: {planning_strategy}

Sprint 1: {タイトル} から DoD 評価を開始します。
停止するには `/sprint-cancel` を使用してください。
```

#### DoD-first 実行ロジック（orchestrator が従うルール）

通常の Phase B（reviewing）と同じ DoD 評価を実行する。

**全 approved の場合:**
1. スプリント完了 → sprints 配列の status を `"completed"` に
2. 次スプリントへ遷移
3. **次スプリントの `current_subphase` を `"reviewing"` に設定**（implementing ではなく）
4. 次スプリントも DoD-first で開始

**いずれか rejected の場合:**
1. `resume_mode` は維持したまま `current_subphase: "implementing"` に切り替え
2. 通常の実装サイクル（Phase A → Phase B）を実行
3. DoD 通過後、次スプリントは再び `"reviewing"` から開始

**全スプリント完了:**
1. `resume_mode: false`
2. `phase: "all_complete"`
3. `active: false`

---

### Mode B: 最新状態継続モード（executing / failed / fixing からの再開）

現在のスプリントと状態からそのまま再開する。

#### 状態更新

```json
{
  "active": true,
  "session_id": "{新規UUID — crypto.randomUUID() で生成}",
  "phase": "executing",
  "current_subphase": "{fixing の場合 'implementing'、それ以外は現在値を維持}",
  "resume_mode": false,
  "previous_subphase": null,
  "dod_retry_count": 0,
  "completed_review_axes": []
}
```

**注意:** `current_sprint`, `total_iterations`, `started_at` は既存値を維持する。

#### 通知

```
Sprint-Loop を再開します。

Current Sprint: {current_sprint}/{total_sprints} — {タイトル}
Sub-phase: {current_subphase}
Total iterations so far: {total_iterations}

Sprint {current_sprint} の {current_subphase} から再開します。
停止するには `/sprint-cancel` を使用してください。
```

---

### Step 2: 自動再開

両モードとも、状態更新後にセッションが自然終了すると、
stop hook が `phase: "executing"` を検知してブロックし、
continuation message で orchestrator を再接地します。

## 重要ルール

- 状態ファイルを必ず読み込んでから判定すること
- エラーケースでは適切なガイダンスメッセージを表示すること
- DoD-first モードでは resume_mode フラグを必ず true に設定すること
- 最新状態継続モードでは既存の current_sprint と total_iterations を維持すること
- 新しい session_id を必ず生成すること（クロスセッション保護のため）
