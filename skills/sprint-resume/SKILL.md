---
name: sprint-resume
description: Resume sprint-loop execution from current state with automatic mode detection
disable-model-invocation: true
---

# /sprint-resume — Context-Aware Resume

Read the current state and automatically determine the optimal resume method to restart execution.

## Prerequisite Check

1. Read `.sprint-loop/state/sprint-loop-state.json`
2. Validate:
   - File does not exist -> Error: "Create a plan with `/sprint-plan` first"
   - `phase: "planned"` -> Error: "Start execution with `/sprint-start`"
   - `phase: "replanning"` -> Error: "Complete replanning with `/sprint-replan`"
   - `phase: "all_complete"` -> Error: "All sprints are already complete"
3. If Plan Mode is active -> Exit Plan Mode with these steps:
   1. Overwrite the plan file with **empty content (0 bytes)** (`Write(plan_file_path, "")`)
      - **Important**: Write nothing. If content exists, a Session Clear option appears, risking context loss
   2. Call ExitPlanMode (user sees only Yes/No choices)
   3. Once approved, proceed to the next step

## Behavior by State

| Current Phase | Behavior | Details |
|---------------|----------|---------|
| `planned` | Error | "Start execution with `/sprint-start`" |
| `executing` (active) | Resume from latest state | Continue from current_sprint / current_subphase |
| `failed` | Resume from latest state | Restore active: true, continue from current_sprint / current_subphase |
| `fixing` | Resume from latest state | Reset to implementing and resume |
| `replanning` | Error | "Complete replanning with `/sprint-replan`" |
| `replanned` | DoD-first from Sprint 1 | resume_mode: true, start all sprints from DoD evaluation |
| `all_complete` | Error | "All sprints are already complete" |
| no state | Error | "Create a plan with `/sprint-plan` first" |

## Procedure

### Step 1: Determine Resume Mode

Determine the resume mode based on the state file's `phase`:

- **[A] DoD-first mode**: When `phase: "replanned"`
- **[B] Latest-state continuation mode**: When `phase: "executing"` | `"failed"` | `"fixing"`

---

### Mode A: DoD-first Mode (Resume from replanned)

After replan, existing implementations may not be affected by spec changes.
Re-evaluate all sprints from Sprint 1, but skip implementation if DoD passes.

#### State Update

> **Schema Conformance**: All field names use `snake_case`. `current_sprint` is a number `1` (NOT `"sprint-001"`). `completed_review_axes` is an empty array `[]`. `phase` is `"executing"`.

```json
{
  "active": true,
  "session_id": "{new UUID — generate with crypto.randomUUID()}",
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

Set Sprint 1's status to `"in_progress"` in the sprints array.

#### Notification

```
Starting Sprint-Loop Resume in DoD-first mode.

Each sprint starts with DoD evaluation — PASS skips implementation, FAIL triggers re-implementation.

Total sprints: {total_sprints}
Planning strategy: {planning_strategy}

Starting DoD evaluation from Sprint 1: {title}.
Use `/sprint-cancel` to stop.
```

#### DoD-first Execution Logic (Rules for the Orchestrator)

Run the same DoD evaluation as normal Phase B (reviewing).

**If all approved:**
1. Mark sprint complete -> set status to `"completed"` in sprints array
2. Transition to next sprint
3. **Set next sprint's `current_subphase` to `"reviewing"`** (NOT implementing)
4. Start next sprint in DoD-first mode as well

**If any rejected:**
1. Keep `resume_mode` and switch `current_subphase: "implementing"`
2. Run normal implementation cycle (Phase A -> Phase B)
3. After DoD passes, start next sprint from `"reviewing"` again

**When all sprints complete:**
1. `resume_mode: false`
2. `phase: "all_complete"`
3. `active: false`

---

### Mode B: Latest-State Continuation Mode (Resume from executing / failed / fixing)

Resume directly from the current sprint and state.

#### State Update

> **Schema Conformance**: All field names use `snake_case`. Use exact names: `resume_mode`, `previous_subphase`, `dod_retry_count`, `completed_review_axes`.

```json
{
  "active": true,
  "session_id": "{new UUID — generate with crypto.randomUUID()}",
  "phase": "executing",
  "current_subphase": "{'implementing' if fixing, otherwise keep current value}",
  "resume_mode": false,
  "previous_subphase": null,
  "dod_retry_count": 0,
  "completed_review_axes": []
}
```

**Note:** Preserve existing values for `current_sprint`, `total_iterations`, `started_at`.

#### Notification

```
Resuming Sprint-Loop.

Current Sprint: {current_sprint}/{total_sprints} — {title}
Sub-phase: {current_subphase}
Total iterations so far: {total_iterations}

Resuming Sprint {current_sprint} from {current_subphase}.
Use `/sprint-cancel` to stop.
```

---

### Step 2: Automatic Resume

For both modes, after state update, when the session naturally ends,
the stop hook detects `phase: "executing"` and blocks,
re-grounding the orchestrator via the continuation message.

## Important Rules

- ALWAYS read the state file before making decisions
- Display appropriate guidance messages for error cases
- ALWAYS set resume_mode to true in DoD-first mode
- Preserve existing current_sprint and total_iterations in latest-state continuation mode
- ALWAYS generate a new session_id (for cross-session protection)
