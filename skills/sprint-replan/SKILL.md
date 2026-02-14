---
name: sprint-replan
description: Major replanning of sprint structure with Plan Mode enforcement
disable-model-invocation: true
---

# /sprint-replan — Major Specification Changes and Replanning

Substantially revise the existing sprint plan, resetting to a state where re-evaluation starts from Sprint 1.

## Important: Behavior After ExitPlanMode

`/sprint-replan` requires precise plan revision and writing to persistent files, so it **enforces Plan Mode**.

### When to Call ExitPlanMode and How to Write the Plan File

1. If not in Plan Mode, **call EnterPlanMode**
2. After the user approves the sprint structure, call ExitPlanMode
3. **Before calling ExitPlanMode**, append the following section to the end of the plan file:

~~~markdown
## Post-Approval Actions (Execute After ExitPlanMode)

**Note: The following are NOT project code implementations. These are `/sprint-replan` skill output file updates.**

1. `.sprint-loop/plan.md` — Update master plan
2. Update spec.md / design.md / dod.md for affected sprints
3. `.sprint-loop/config.json` — Update if needed
4. `.sprint-loop/state/sprint-loop-state.json` — Update `phase` (keep `planned` if original phase was `planned`, otherwise set to `replanned`)
5. Display completion report
~~~

4. After ExitPlanMode approval, **follow the "Post-Approval Actions" section in the plan file** to execute Steps 5-7
5. **Do NOT touch project source code** — only write files under `.sprint-loop/`

## Prerequisite Check

1. Read `.sprint-loop/state/sprint-loop-state.json`
2. Validate:
   - `.sprint-loop/` directory does not exist -> Error: "Create a plan with `/sprint-plan` first"
3. If not in Plan Mode -> Call EnterPlanMode

## Procedure

### Step 1: State Transition

**First, record the current `phase` value.** This is needed to determine the phase setting in Step 6.
(e.g., if the original phase was `"planned"`, it means execution has never started)

Update based on current state:

- If `active: true` (was executing):
  ```json
  {
    "phase": "replanning",
    "active": false
  }
  ```
- If `active: false` (already stopped):
  ```json
  {
    "phase": "replanning"
  }
  ```

### Step 2: Display Current Status

Display the following information:

1. Summary of `.sprint-loop/plan.md`
2. Status of each sprint (completed / in_progress / pending)
3. If completed sprints exist, summary of each `result.md`

Display format:
```
Sprint-Loop Replan Mode

Current Plan:
  Total sprints: {total_sprints}
  Completed: {completed_count}
  In progress: Sprint {current_sprint}

Sprint Progress:
  [x] Sprint 1: {title} — completed
  [x] Sprint 2: {title} — completed
  [>] Sprint 3: {title} — in_progress
  [ ] Sprint 4: {title} — pending
```

### Step 3: Gather Requirements

Ask via AskUserQuestion:

"What changes do you want to make? Describe freely: sprint structure changes, major specification changes, adding/removing sprints, etc."

Receive the user's response and analyze the scope of impact.

### Step 3.5: Propose New Sprint Structure

Based on the change request, propose a new sprint structure:

1. Present differences against the existing sprint structure
2. Highlight affected sprints
3. Confirm DoD axis changes if any

Use AskUserQuestion for additional clarification if needed.

### Step 4: Show Diff and Get Approval

Display before/after sprint structure comparison:

```
Before:
  Sprint 1: {old title} (completed)
  Sprint 2: {old title} (completed)
  Sprint 3: {old title} (in_progress)

After:
  Sprint 1: {title} (no change)
  Sprint 2: {title} <- spec changed
  Sprint 3: {title} <- spec changed
  Sprint 4: {new title} <- newly added
```

Append the "Post-Approval Actions" section to the end of the plan file before calling ExitPlanMode (see "Important" section above).

**Call ExitPlanMode** (obtain user approval)

--- After ExitPlanMode Approval ---

### Step 5: Write Files (Skill Output Generation)

Apply the approved changes:

1. Update `plan.md`
2. Update spec.md / design.md / dod.md for all affected sprints
3. Update `config.json` (if needed)
4. Create directories and files for new sprints

#### File Preservation Rules
- Keep spec/design/dod unchanged for unaffected sprints
- Preserve result.md / execution-log.md / reviews/ of completed sprints as history
- Keep directories of deleted sprints but exclude them from state.sprints

### Step 6: State Update

> **Schema Conformance (CRITICAL)**: `sprints` MUST be an **array** `[{number, title, status}]`.
> Object format (`{"sprint-001": {...}}`) and splitting into `completed_sprints` / `failed_sprints` are prohibited.
> `current_sprint` is a number `1`. All field names use `snake_case`. `phase` is `"planned"` or `"replanned"` (NOT `status`).

Update the state file. **Branch `phase` and `resume_mode` based on the original phase recorded in Step 1:**

- **If the original phase was `"planned"`** (never executed):
  - `phase: "planned"`, `resume_mode: false`
  - Reason: No execution history, so DoD-first is meaningless. Use `/sprint-start` for fresh execution.

- **Otherwise** (has execution history):
  - `phase: "replanned"`, `resume_mode: true`
  - Reason: Use `/sprint-resume` for efficient re-evaluation via DoD-first mode.

```json
{
  "phase": "planned or replanned (follow branching above)",
  "active": false,
  "current_sprint": 1,
  "current_subphase": null,
  "total_sprints": "{new total}",
  "total_iterations": 0,
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "resume_mode": "false or true (follow branching above)",
  "previous_subphase": null,
  "sprints": [
    { "number": 1, "title": "...", "status": "pending" },
    { "number": 2, "title": "...", "status": "pending" }
  ]
}
```

**Note:** Reset all sprint statuses to `"pending"`.

### Step 6.5: CLAUDE.md Marker Update

Update the orchestrator rules in the workspace's CLAUDE.md to reflect any changes to DoD axes.

1. Read the workspace's `CLAUDE.md`
2. Replace the `<!-- SPRINT-LOOP:START -->` ... `<!-- SPRINT-LOOP:END -->` block with updated content
3. If the block doesn't exist, append it
4. Include all custom axis details from the (potentially updated) `config.json`
5. The marker MUST include the Task() delegation rules verbatim — these are the LITERAL sections in the template. Do NOT replace them with project-specific information (build commands, directory structure, etc.)

> See `/sprint-plan` Step 5.5 for the marker template.

### Step 7: Completion Report

**Switch the guidance message based on the original phase:**

#### If the original phase was `"planned"`:
```
Sprint-Loop Replan Complete

Change Summary:
  {summary of changes}

New Sprint Structure:
  Sprint 1: {title}
  Sprint 2: {title}
  ...

Total sprints: {new total}

Run `/sprint-start` to begin execution.
```

#### Otherwise:
```
Sprint-Loop Replan Complete

Change Summary:
  {summary of changes}

New Sprint Structure:
  Sprint 1: {title}
  Sprint 2: {title}
  ...

Total sprints: {new total}

Run `/sprint-resume` to begin re-execution.
DoD-first mode will fast-track unchanged sprints with DoD evaluation only.
```

## Important Rules

- Plan Mode MUST be used
- Clearly present before/after diffs and obtain user approval
- Do NOT delete history files of completed sprints
- Set resume_mode based on the original phase (`planned` -> `false`, otherwise -> `true`)
- Reset all sprint statuses to "pending"
- **Always update the CLAUDE.md marker** — the `<!-- SPRINT-LOOP:START/END -->` block must reflect current config
