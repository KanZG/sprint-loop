# Sprint-Loop Plugin

Sprint-based autonomous development loop for Claude Code.

## Overview

Sprint-Loop is a plugin that automatically executes large-scale development tasks in sprint units.
It loops through Plan -> Implement -> DoD Evaluation -> Auto-transition to next sprint, repeating until all sprints are complete.

## Commands

| Command | Description |
|---------|-------------|
| `/sprint-plan` | Interactively create a sprint plan |
| `/sprint-start` | Start automatic execution |
| `/sprint-status` | Check progress |
| `/sprint-cancel` | Stop execution |
| `/sprint-fix` | Small fixes to current sprint (auto-resume) |
| `/sprint-replan` | Major specification changes and replanning |
| `/sprint-resume` | Context-aware optimal resume |

## Architecture

### Orchestrator Pattern

The main session acts as the **orchestrator** and never writes code directly.
All implementation, testing, and review are delegated to child agents via AgentTeam (`TeamCreate` / `Task`).

```
Main Session (Orchestrator)
  |-- Read/write persistent files (state management)
  |-- Compose execution team via TeamCreate
  |-- Issue work instructions via Task / SendMessage
  |-- Monitor progress via TaskList / TaskGet
  +-- Read DoD results and decide transition to next sprint

Child Agents (Executors) — all within the same team "sprint-{N}"
  |-- plan-validator: Plan consistency verification (full-adaptive only)
  |-- planner: Inline plan generation (rolling only)
  |-- implementor: Code implementation (general-purpose)
  |-- test-reviewer: Test validation (test-reviewer)
  |-- spec-reviewer: Specification compliance validation (spec-reviewer)
  |-- quality-reviewer: Quality validation (quality-reviewer)
  +-- aggregator: Review aggregation (review-aggregator)
```

### Loop Mechanism (Stop hook)

The stop hook blocks session termination to sustain the loop.
It blocks only while `phase: "executing"`, and releases on completion or failure.

### Persistence (Compaction Resilience)

All critical information is persisted as files under `.sprint-loop/`.
The stop hook's continuation message points to persistent file paths, so
correct state recovery is possible even if context is lost through compaction.

## File Structure

```
{project}/.sprint-loop/
  plan.md                              # Master plan (includes Phase sections)
  config.json                          # Execution config (schema_version: 1)
  state/
    sprint-loop-state.json             # Main state file (schema_version: 1)
    planning-result.md                 # rolling mode: planner output
  sprints/
    sprint-001/
      spec.md                          # Sprint specification
      design.md                        # Detailed design (guideline: 50-500 lines)
      dod.md                           # Acceptance criteria
      execution-log.md                 # Execution log
      plan-revision.md                 # full-adaptive: plan verification result
      reviews/
        {axis_id}-attempt-{N}.json     # Individual DoD evaluation results (e.g., test-attempt-1.json)
        summary-attempt-{N}.json       # Aggregated summary
      result.md                        # Completion summary
  logs/
    orchestrator-log.md                # Orchestrator decision log
```

## Planning Strategies

| Strategy | Summary | Suitable Projects |
|----------|---------|-------------------|
| `full` (default) | Detail all sprints at once | Small to medium, stable specs |
| `full-adaptive` | Detail all sprints + verify/self-correct plan before each sprint | Medium to large, some uncertainty in details |
| `rolling` | Detail only the first N sprints, remaining are title+goal only. Auto-generate next batch during execution | Large, high uncertainty, exploratory |

## Phase Grouping

For projects with 8+ sprints, group sprints into logical Phases.
Phases are expressed via section structure in `plan.md` and `current_phase` metadata in `state.json`.
Directory structure remains unchanged (flat `sprints/sprint-NNN/` structure).

## Per-Sprint DoD Overrides

Use `sprint_overrides` in `config.json` to skip or override DoD axes per sprint.

```json
{
  "sprint_overrides": {
    "1": { "skip_axes": ["visual", "perf"] },
    "9": { "visual": { "pass_criteria": "Record baseline only" } }
  }
}
```

## Sprint Execution Workflow

```
Sprint N Start
  |
  |-- 0. Pre-Phase: Plan verification / inline planning (based on planning_strategy)
  |     |-- full: Skip
  |     |-- full-adaptive: Verify plan consistency via plan-validator
  |     +-- rolling: Generate next batch plan via planner (only when needed)
  |-- 1. Read spec.md, design.md, dod.md
  |-- 2. Compose implementation team via TeamCreate
  |-- 3. Delegate implementation to implementor
  |-- 4. Wait for implementation completion
  |-- 5. DoD evaluation (parallel evaluation on active axes after sprint_overrides applied)
  |-- 6. Verdict
  |     |-- All PASS -> Sprint complete -> Update sprints array -> Phase transition check -> Next
  |     +-- FAIL -> Feedback -> Re-implement
  +-- 7. Team shutdown
```

## Safety Mechanisms

| Check | Condition | Action |
|-------|-----------|--------|
| Context limit | stop_reason contains "context" | allow (prevent deadlock) |
| User abort | stop_reason contains "user" | allow (respect Ctrl+C) |
| Session mismatch | session_id mismatch | allow (prevent cross-session) |
| Staleness | Last update > 2 hours ago | allow (prevent stuck lock) |
| Max iterations | Reached configured limit (default 100, max 1000) | allow + failed |
| Max DoD retries | Reached configured limit (default 5, max 10) | allow + failed |

## Review Result File Naming Convention

| File Type | Path | Example |
|-----------|------|---------|
| Individual review | `reviews/{axis_id}-attempt-{N}.json` | `reviews/test-attempt-1.json` |
| Aggregated summary | `reviews/summary-attempt-{N}.json` | `reviews/summary-attempt-1.json` |

`{N}` is `dod_retry_count + 1` (1-based).
Do NOT use the old `review-001.json` format.

## Iteration Counter Definitions

| Counter | Definition | Increment Trigger |
|---------|------------|-------------------|
| `total_iterations` | Number of stop hook blocks (internal mechanism) | Each time the stop hook returns block |
| `dod_retry_count` | Number of impl->review cycles for current sprint (quality gate) | Each time DoD is rejected and re-implementation starts |

- `total_iterations` is for the loop safety mechanism (force stop at limit). Never reset.
- `dod_retry_count` is for the quality gate (per-sprint retry limit). Reset to 0 on sprint completion.

## Config Schema (v1)

```json
{
  "schema_version": 1,
  "project": { "name": "...", "tech_stack": "..." },
  "planning_strategy": "full | full-adaptive | rolling",
  "rolling_horizon": "null | number (rolling only)",
  "planned_through_sprint": "null | number (rolling only)",
  "max_total_iterations": 100,
  "max_dod_retries": 5,
  "review_axes": [{ "id": "...", "name": "...", "builtin": true }],
  "sprint_overrides": { "1": { "skip_axes": ["..."] } },
  "created_at": "ISO 8601 UTC timestamp"
}
```

## State Schema (v1)

```json
{
  "schema_version": 1,
  "active": false,
  "session_id": null,
  "phase": "planned | executing | fixing | replanning | replanned | all_complete | failed",
  "current_sprint": 1,
  "total_sprints": "N",
  "current_phase": "Phase name or null",
  "current_subphase": "implementing | reviewing | planning | completed | null",
  "total_iterations": 0,
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "planning_strategy": "full | full-adaptive | rolling",
  "planned_through_sprint": "null | number",
  "resume_mode": false,
  "previous_subphase": null,
  "sprints": [{ "number": 1, "title": "...", "status": "pending | in_progress | completed" }],
  "started_at": null,
  "completed_at": null,
  "last_checked_at": "ISO 8601 UTC timestamp"
}
```

## Schema Conformance Rules (All Skills)

state.json and config.json are parsed directly by program code (stop-hook.cjs, session-start.cjs, safety.cjs).
**Violating the following rules will prevent the loop from starting or continuing.**

### Field Naming Convention
- **All fields MUST use `snake_case`**
- `camelCase` is prohibited: `currentSprint` -> `current_sprint`, `totalSprints` -> `total_sprints`, `dodRetryCount` -> `dod_retry_count`, `planStrategy` -> `planning_strategy`, `maxIterations` -> `max_total_iterations`

### state.json Structure Rules
- Lifecycle state uses the **`phase`** field: `status` is WRONG, `state` is WRONG
- Allowed `phase` values: `"planned"`, `"executing"`, `"fixing"`, `"replanning"`, `"replanned"`, `"all_complete"`, `"failed"` — other values (`"ready"`, `"initialized"`, `"running"`) are prohibited
- `current_sprint` is a **number** (e.g., `1`): `"sprint-001"` is WRONG, `"1"` is WRONG
- `sprints` is an **array**: `[{"number": 1, "title": "...", "status": "pending"}]`
  - Object format `{"sprint-001": {...}}` is WRONG
  - Splitting into `completed_sprints` / `failed_sprints` is WRONG
- Allowed `sprints[].status` values: `"pending"`, `"in_progress"`, `"completed"` only
- MUST include `schema_version: 1`

### config.json Structure Rules
- Iteration limit is `max_total_iterations`: `max_iterations` is WRONG
- Planning strategy is `planning_strategy`: `planStrategy` is WRONG, `strategy` is WRONG
- Review axes is the `review_axes` array: each element MUST include `{id, name, builtin}`
- MUST include `schema_version: 1`

### Review JSON Structure Rules (sub-agent output)
- Individual review: `{sprint_id, attempt, timestamp, reviews: {axis_id: {verdict, details, failures}}}`
  - Allowed `verdict` values: `"approved"`, `"rejected"` only
- Aggregated summary: `{sprint_id, attempt, timestamp, overall_verdict, axis_verdicts, action_required}`
  - Allowed `overall_verdict` values: `"approved"`, `"rejected"` only

## Rules for the Orchestrator

When `/sprint-start` is active and you are the orchestrator:

1. **NEVER write code directly** — delegate all implementation to AgentTeam
2. **ALWAYS read persistent files** before making decisions
3. **ALWAYS update state file** after each phase transition
4. **ALWAYS log decisions** to orchestrator-log.md
5. **1 sprint = 1 team** — `TeamCreate(team_name="sprint-{N}")`, `TeamDelete` on sprint completion
6. **Pass feedback verbatim** — when DoD fails, pass the exact failure messages to the implementor
7. **Use bare names for subagent_type** — `"test-reviewer"` not `"sprint-loop:test-reviewer"`
