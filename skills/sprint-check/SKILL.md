---
name: sprint-check
description: Health check and auto-fix for sprint-loop plan files (state.json, config.json, sprint files)
disable-model-invocation: true
---

# /sprint-check — Sprint Plan Health Check

Health check skill that detects and fixes schema non-compliance in sprint-loop plan files (state.json, config.json, sprint files) and inconsistencies in execution data.

## Important: Behavior After ExitPlanMode

`/sprint-check` detects issues and presents a correction plan, so it **enforces Plan Mode**.

### ExitPlanMode Timing and Writing Plan Files

1. If not in Plan Mode, **call EnterPlanMode**
2. Run all checks and write results to the plan file
3. **Before calling ExitPlanMode**, always append the following section to the end of the plan file:

**When issues exist:**

~~~markdown
## Post-Approval Actions (Execute after ExitPlanMode)

**Note: The following is NOT project code implementation. It is `.sprint-loop/` file corrections.**

1. `.sprint-loop/config.json` — {correction details}
2. `.sprint-loop/state/sprint-loop-state.json` — {correction details}
3. Display completion report
~~~

**When no issues exist:**

~~~markdown
## Post-Approval Actions (Execute after ExitPlanMode)

No issues detected. No corrections needed.
~~~

4. After ExitPlanMode approval, execute corrections **following the "Post-Approval Actions" section in the plan file**
5. **Do not touch project source code** — only modify files under `.sprint-loop/`

## Precondition Checks

1. Verify `.sprint-loop/` directory exists
   - Not found -> Error: "`.sprint-loop/` not found. Run `/sprint-plan` to create a plan."
2. Read `.sprint-loop/state/sprint-loop-state.json`
   - Not found -> Error: "State file not found. Run `/sprint-plan` to create a plan."
3. Read `.sprint-loop/config.json`
   - Not found -> Error: "Config file not found. Run `/sprint-plan` to create a plan."
4. If not in Plan Mode -> call EnterPlanMode

## Procedure

### Step 1: State Classification

Read the `phase` field from state.json and classify into 3 patterns:

| State | Condition | Action |
|-------|----------|--------|
| All complete | `phase: "all_complete"` | Report "All sprints complete. No check needed." and exit via ExitPlanMode |
| Mid-execution | `phase` is one of `"executing"` / `"failed"` / `"fixing"` / `"replanned"` | Step 2 -> run Categories A + B + C + D |
| All unexecuted | `phase: "planned"` | Step 2 -> run Categories A + B + C (skip D) |

If `phase: "replanning"`: Report "Replanning in progress. Complete `/sprint-replan` before running checks." and exit.

### Step 2: Read All Related Files

Read all of the following files:

1. `.sprint-loop/config.json`
2. `.sprint-loop/state/sprint-loop-state.json`
3. `.sprint-loop/plan.md`
4. `spec.md`, `design.md`, `dod.md` under all sprint directories
5. `result.md`, `reviews/summary-attempt-*.json` for completed sprints (mid-execution only)

### Step 3: Run Checks

Run the following 4 categories of checks. For each check item, determine PASS / FAIL / WARN.

---

#### Category A: config.json Checks

| # | Check Item | Fix |
|---|-----------|-----|
| A-1 | `schema_version: 1` exists | Auto-fix: add `schema_version: 1` |
| A-2 | `planning_strategy` exists (`planStrategy` ❌, `strategy` ❌) | Auto-fix: convert from camelCase/alias, or add default `"full"` |
| A-3 | `max_total_iterations` exists (`max_iterations` ❌, `maxIterations` ❌) | Auto-fix: convert from alias, or add default `100` |
| A-4 | `max_dod_retries` exists (`maxDodRetries` ❌) | Auto-fix: convert from camelCase, or add default `5` |
| A-5 | `review_axes` is an array with `{id, name, builtin}` in each element | Auto-fix: add default values for missing fields |
| A-6 | `project` object exists | Auto-fix: add `{"name": "unknown", "tech_stack": "unknown"}` |
| A-7 | `sprint_overrides` exists | Auto-fix: add empty object `{}` |
| A-8 | All field names are `snake_case` (detect camelCase) | Auto-fix: convert camelCase -> snake_case |

---

#### Category B: state.json Checks

| # | Check Item | Fix |
|---|-----------|-----|
| B-1 | `schema_version: 1` exists | Auto-fix: add `schema_version: 1` |
| B-2 | `phase` field exists with an allowed value (`"planned"`, `"executing"`, `"fixing"`, `"replanning"`, `"replanned"`, `"all_complete"`, `"failed"`). Detect `status` ❌, `state` ❌. Detect disallowed values (`"ready"` ❌, `"initialized"` ❌, `"running"` ❌) | Auto-fix: rename `status`/`state` -> `phase`. Infer invalid values from context (fall back to `"planned"` if unable) |
| B-3 | `current_sprint` is a number type (string `"sprint-001"` ❌, `"1"` ❌) | Auto-fix: extract number from string and convert |
| B-4 | `sprints` is an array `[{number, title, status}]`. Object format ❌, `completed_sprints`/`failed_sprints` separation ❌ | Auto-fix: convert object format -> array. Merge separated arrays into unified array |
| B-5 | `sprints[].status` is one of `"pending"` / `"in_progress"` / `"completed"` | Auto-fix: infer invalid values (`"done"` -> `"completed"`, `"active"` -> `"in_progress"`, etc.) |
| B-6 | `current_subphase` is an allowed value (`"implementing"`, `"reviewing"`, `"planning"`, `"completed"`, `null`). `"done"` ❌ | Auto-fix: convert `"done"` -> `"completed"` |
| B-7 | `last_checked_at` exists (`last_updated` ❌, `lastCheckedAt` ❌) | Auto-fix: convert from alias, or set to current time |
| B-8 | `total_sprints` matches the length of the `sprints` array | Auto-fix: update to match `sprints` array length |
| B-9 | All field names are `snake_case` (detect camelCase) | Auto-fix: convert camelCase -> snake_case |
| B-10 | Detect non-schema fields (`current_sprint_index`, `completed_sprints`, `failed_sprints`, etc.) | Auto-fix: remove non-schema fields (migrate values to proper fields) |

**Allowed state.json fields** (anything else is a non-schema field):
`schema_version`, `active`, `session_id`, `phase`, `current_sprint`, `total_sprints`, `current_phase`, `current_subphase`, `total_iterations`, `dod_retry_count`, `completed_review_axes`, `planning_strategy`, `planned_through_sprint`, `resume_mode`, `previous_subphase`, `sprints`, `started_at`, `completed_at`, `last_checked_at`, `max_total_iterations`, `max_dod_retries`

---

#### Category C: Sprint File Checks (common to all-unexecuted and mid-execution)

| # | Check Item | Fix |
|---|-----------|-----|
| C-1 | `spec.md` exists (for `planning_strategy: "rolling"`, only up to `planned_through_sprint`) | Report only: file regeneration is the responsibility of `/sprint-plan` or `/sprint-replan` |
| C-2 | `design.md` exists (same as above) | Report only |
| C-3 | `dod.md` exists (same as above) | Report only |
| C-4 | `dod.md` section headings (`## {axis_id}:` format) are consistent with `config.review_axes` | Report only: content fixes are the responsibility of `/sprint-fix` or `/sprint-replan` |
| C-5 | Directory names follow `sprint-NNN` (3-digit zero-padded) format | Report only |
| C-6 | A directory `sprints/sprint-{NNN}/` exists for each entry in `state.sprints` array | Report only |

---

#### Category D: Execution Data Consistency Checks (mid-execution only)

| # | Check Item | Fix |
|---|-----------|-----|
| D-1 | The sprint corresponding to `current_sprint` has `sprints[].status` of `"in_progress"` | Auto-fix: update the sprint's status to `"in_progress"` |
| D-2 | Completed sprints (`sprints[].status === "completed"`) have `result.md` | Report only |
| D-3 | Completed sprints have `reviews/summary-attempt-*.json` | Report only |
| D-4 | `state.total_sprints` matches the number of sprint directories on disk | Report only (disk count is not necessarily correct) |
| D-5 | `state.planning_strategy` matches `config.planning_strategy` | Auto-fix: apply `config.planning_strategy` value to `state.planning_strategy` |
| D-6 | `max_total_iterations` / `max_dod_retries` match between state and config (when present in state) | Auto-fix: apply `config` values to state |

### Step 4: Organize Check Results

Write all check results to the plan file in the following format:

~~~markdown
# Sprint-Check Results

## Summary

| Category | PASS | FAIL | WARN |
|----------|------|------|------|
| A: config.json | {N} | {N} | {N} |
| B: state.json | {N} | {N} | {N} |
| C: Sprint files | {N} | {N} | {N} |
| D: Execution data consistency | {N} | {N} | {N} |
| **Total** | **{N}** | **{N}** | **{N}** |

## Detected Issues

### Auto-fixable (applied after approval)

1. [A-8] config.json: Rename `planningStrategy` -> `planning_strategy`
2. [B-3] state.json: Convert `current_sprint` from string `"3"` -> number `3`
3. ...

### Report Only (manual action required)

1. [C-1] `sprints/sprint-003/spec.md` not found -> Regenerate with `/sprint-replan`
2. [C-4] `sprints/sprint-002/dod.md` missing `visual` axis section -> Fix with `/sprint-fix`
3. ...

## Post-Approval Actions (Execute after ExitPlanMode)

**Note: The following is NOT project code implementation. It is `.sprint-loop/` file corrections.**

1. `.sprint-loop/config.json` — {specific correction details}
2. `.sprint-loop/state/sprint-loop-state.json` — {specific correction details}
3. Display completion report
~~~

**If FAIL count is 0**, write "No issues detected. No corrections needed." in the "Post-Approval Actions" section.

### Step 5: ExitPlanMode

After writing to the plan file, call ExitPlanMode to request user approval.

--- After ExitPlanMode approval ---

### Step 6: Apply Corrections

Apply only auto-fixable issues according to the approved plan:

1. Fix `config.json` (if applicable)
2. Fix `state/sprint-loop-state.json` (if applicable)
3. After applying corrections, re-read the modified files to verify they were corrected properly

#### Correction Rules

- **Auto-fixable**: Schema field name fixes (camelCase -> snake_case), type conversions (string -> number), missing field defaults, non-schema field removal, sprints array format conversion, config-to-state value sync
- **Not fixable (report only)**: Content inconsistencies (dod.md vs review_axes mismatch), missing sprint files (regeneration is the responsibility of `/sprint-plan` / `/sprint-replan`)
- **Do not touch project source code** — only modify files under `.sprint-loop/`
- **Do not start or resume the loop** — post-fix execution is the responsibility of `/sprint-start` or `/sprint-resume`

### Step 7: Completion Report

Switch format based on whether corrections were applied:

**When corrections were applied:**

```
Sprint-Check complete

Issues detected: {FAIL count}
Auto-fixed: {fix count}
Manual action required: {report-only count}

Corrections applied:
  - config.json: {fix summary}
  - state.json: {fix summary}

{guidance message (see below)}
```

**When no issues found:**

```
Sprint-Check complete

All check items PASS — no issues detected.

{guidance message (see below)}
```

#### Guidance Messages

Provide appropriate command guidance based on the pre-fix `phase`:

| Pre-fix phase | Guidance Message |
|--------------|-----------------|
| `planned` | Run `/sprint-start` to begin execution. |
| `executing` / `failed` / `fixing` | Run `/sprint-resume` to resume. |
| `replanned` | Run `/sprint-resume` to resume. |

**When report-only issues remain**, prepend the following before the guidance message:

```
Note: {N} issues require manual action.
Review the "Report Only" items above and address them with `/sprint-fix` or `/sprint-replan` as needed.
```

## Important Rules

- Always use Plan Mode
- Always obtain user approval before applying auto-fixes (via ExitPlanMode)
- Do not attempt to auto-fix report-only issues
- Do not start or resume the loop (corrections only, then exit)
- Do not touch project source code (only `.sprint-loop/` files)
- All corrections must comply with the Schema Conformance Rules in CLAUDE.md
