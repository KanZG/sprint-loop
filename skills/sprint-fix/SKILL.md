---
name: sprint-fix
description: Apply small fixes to current sprint specs while execution is paused
disable-model-invocation: true
---

# /sprint-fix — Small Fixes to Current Sprint

Apply minor specification changes to the running sprint and automatically resume execution.

## Prerequisite Check

1. Read `.sprint-loop/state/sprint-loop-state.json`
2. Validate:
   - File does not exist -> Error: "Create a plan with `/sprint-plan` first"
   - `active` is `false` or `phase` is not `"executing"` -> Error: "No active execution. Resume with `/sprint-resume`"
3. If Plan Mode is active -> Exit Plan Mode with these steps:
   1. Overwrite the plan file with **empty content (0 bytes)** (`Write(plan_file_path, "")`)
      - **Important**: Write nothing. If content exists, a Session Clear option appears, risking context loss
   2. Call ExitPlanMode (user sees only Yes/No choices)
   3. Once approved, proceed to the next step

## Procedure

### Step 1: Pause Execution

> **Schema Conformance**: Field names use `snake_case`. `phase` (NOT `status`), `previous_subphase` (NOT `previousSubphase`).

Update the state file:
```json
{
  "phase": "fixing",
  "previous_subphase": "{current value of current_subphase}"
}
```

### Step 2: Display Current Status

Read and display current sprint information from:
- `.sprint-loop/state/sprint-loop-state.json` (progress summary)
- `.sprint-loop/sprints/sprint-{NNN}/spec.md`
- `.sprint-loop/sprints/sprint-{NNN}/design.md`
- `.sprint-loop/sprints/sprint-{NNN}/dod.md`

Display format:
```
Sprint-Loop Fix Mode

Current Sprint: {current_sprint}/{total_sprints} — {title}
Sub-phase (before fix): {previous_subphase}
DoD Retries: {dod_retry_count}
```

### Step 3: Gather Requirements

Ask via AskUserQuestion:

"What do you want to fix? Current sprint information is displayed above."

Receive the user's response.

### Step 4: Scope Guard Check

Analyze the fix request and determine if it is in scope:

**Allowed fixes (within sprint-fix scope):**
- Modifications to current sprint's spec.md / design.md / dod.md
- Minor adjustments to the next 1-2 sprints' spec.md / design.md / dod.md
- Changes to config.json `sprint_overrides` (DoD axes)

**Rejected fixes (require sprint-replan):**
- Modifications to completed sprints
- Changes to total sprint count
- Changes to Phase structure
- Architecture-level changes

If out of scope:
```
This fix exceeds the scope of /sprint-fix.
Use `/sprint-replan` for replanning.

Reason: {rejection reason}
```
Restore state:
```json
{
  "phase": "executing",
  "previous_subphase": null
}
```

### Step 5: Present Fix Proposal and Get Approval

Present the fix proposal via AskUserQuestion:

"The following fixes will be applied. Do you approve?"

| Option | Description |
|--------|-------------|
| Approve | Apply fixes and resume execution |
| Revise | Adjust the fix proposal before applying |
| Cancel | Resume execution without fixes |

**If cancelled:**
Restore state:
```json
{
  "phase": "executing",
  "current_subphase": "{previous_subphase}",
  "previous_subphase": null
}
```
Display "Fix cancelled. Resuming execution." and exit.

**If revision requested:**
Receive additional feedback from the user, adjust the proposal, and return to the approval flow.

### Step 6: Write Files

Apply the approved fixes:

1. Update target sprint's spec.md / design.md / dod.md
2. Update subsequent sprint files (if affected)
3. Update config.json `sprint_overrides` (if changed)
4. Append fix record to execution-log.md

#### Fix Log Format (appended to execution-log.md)

```markdown
## Fix Applied — {ISO timestamp}

### Changes
- {fix summary}

### Modified Files
- spec.md: {change description}
- design.md: {change description}

### Impact Scope
- Sprint {N}: Direct fix
- Sprint {N+1}: {minor adjustment} (if any)
```

### Step 7: State Reset

> **Schema Conformance**: `completed_review_axes` is an array `[]`, `phase` is `"executing"`, `current_subphase` is `"implementing"`. All `snake_case`.

Update the state file:
```json
{
  "phase": "executing",
  "current_subphase": "implementing",
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "previous_subphase": null
}
```

Set the current sprint's status to `"in_progress"` in the sprints array.

### Step 8: Completion Report

```
Sprint-Loop Fix Complete

Changes Applied:
  {fix summary}

Modified Files:
  {list of modified files}

Resuming execution. Re-running Sprint {N} from implementing.
```

### Step 9: Automatic Resume

When the session naturally ends, the stop hook detects `phase: "executing"` and blocks,
re-grounding the orchestrator via the continuation message.

## Important Rules

- NEVER accept out-of-scope fixes
- ALWAYS obtain user approval before applying fixes
- ALWAYS reset dod_retry_count to 0 after applying fixes (specs have changed)
- ALWAYS record fix history in execution-log.md
