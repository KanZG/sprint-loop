---
name: sprint-dod-verify
description: Verify DoD items don't assume future sprint features and check completeness
disable-model-invocation: true
---

# /sprint-dod-verify — DoD Forward-Dependency and Completeness Check

Verify that DoD (Definition of Done) items for unexecuted sprints do not assume features introduced in future sprints, and that DoD content is appropriate. Interactively correct any issues found.

## Important: Behavior After ExitPlanMode

`/sprint-dod-verify` detects issues and presents a correction plan, so it **enforces Plan Mode**.

### ExitPlanMode Timing and Writing Plan Files

1. If not in Plan Mode, **call EnterPlanMode**
2. Complete all detection and refinement, then write the correction plan to the plan file
3. **Before calling ExitPlanMode**, always append the following section to the end of the plan file:

**When issues exist:**

~~~markdown
## Post-Approval Actions (Execute after ExitPlanMode)

**Note: The following is NOT project code implementation. It is `.sprint-loop/` DoD file corrections.**

1. `.sprint-loop/sprints/sprint-{NNN}/dod.md` — {correction details}
2. `.sprint-loop/sprints/sprint-{NNN}/spec.md` — {minor consistency fix} (only if needed)
3. ...
4. Run post-correction verification pass
5. Display completion report
~~~

**When no issues exist:**

~~~markdown
## Post-Approval Actions (Execute after ExitPlanMode)

No issues detected. No corrections needed.
~~~

4. After ExitPlanMode approval, execute corrections **following the "Post-Approval Actions" section in the plan file**
5. **Do not touch project source code** — only modify files under `.sprint-loop/`

## Detection Dimensions

| Dimension | ID | Severity | Description |
|-----------|-----|----------|-------------|
| Forward dependency | `forward-dep` | CRITICAL | Sprint N's DoD assumes features first introduced in Sprint N+1 or later |
| Completeness | `completeness` | WARNING | DoD items missing for functional requirements in spec.md |
| Consistency | `consistency` | INFO | Contradictions or duplications between DoD items across sprints |

### Forward Dependency Definition (PRIMARY check)

Determine by building a "cumulative feature map":

- Sprint K's cumulative feature map = Union(spec.md[1], spec.md[2], ..., spec.md[K])
- If all references in Sprint K's DoD are contained in this map -> OK
- If a reference is not in the map -> **CRITICAL**

Forward dependency detection is the primary value of this skill and takes highest priority.

## Precondition Checks

1. Verify `.sprint-loop/` directory exists
   - Not found -> Error: "`.sprint-loop/` not found. Run `/sprint-plan` to create a plan."
2. Read `.sprint-loop/state/sprint-loop-state.json`
   - Not found -> Error: "State file not found. Run `/sprint-plan` to create a plan."
3. Read `.sprint-loop/config.json`
   - Not found -> Error: "Config file not found. Run `/sprint-plan` to create a plan."
4. Check if `state.sprints` array contains sprints with `status` of `"pending"` or `"in_progress"`
   - 0 found -> Error: "No unexecuted sprints to verify. All sprints are complete."
5. If `state.phase` is `"replanning"` -> Error: "Replanning in progress. Complete `/sprint-replan` before running verification."
6. If not in Plan Mode -> call EnterPlanMode

## Procedure

### Step 1: Parameter Confirmation

Confirm with AskUserQuestion:

**Question 1: Number of detection passes**

"Select the number of detection passes for DoD verification. More passes increase detection accuracy but take longer."

| Option | Description |
|--------|-------------|
| 3 passes (recommended) | Balanced accuracy and speed |
| 1 pass | Fast but may miss issues |
| 5 passes | Highest accuracy, for large projects |

**Question 2: Target sprints**

"Select the sprints to verify."

| Option | Description |
|--------|-------------|
| All unexecuted sprints (recommended) | Verify all pending / in_progress sprints |
| Current sprint only | Verify only current_sprint |
| Range | Specify a sprint number range |

### Step 2: Data Collection

Read all of the following files:

1. **All sprints' `spec.md`** — needed to build the cumulative feature map (including completed sprints)
2. **All sprints' `design.md`** — used as supplementary information
3. **Target sprints' `dod.md`** — verification targets
4. **`.sprint-loop/plan.md`** — to understand Phase structure
5. **`.sprint-loop/config.json`** — to check `review_axes`

Handling missing files:
- `spec.md` missing -> Skip the sprint and report WARNING
- `dod.md` missing -> Skip the sprint and report CRITICAL (DoD itself is missing)
- `design.md` missing -> Skip (optional information)

### Step 3: Detection Prompt Construction

Build an analysis prompt containing all data. Instruct each detection agent as follows:

```
You are a DoD (Definition of Done) verification agent for a sprint-loop project.

## Task

Analyze the following sprint plan data and detect issues across 3 dimensions.

## Detection Dimensions

### 1. Forward Dependency Detection (CRITICAL)
Build a cumulative feature map to determine:
- Sprint K's cumulative feature map = union of all features defined in spec.md from Sprint 1 through Sprint K
- Verify that each item in Sprint K's dod.md references only features contained in the cumulative feature map
- References to features first introduced in Sprint K+1 or later are CRITICAL

### 2. Completeness Detection (WARNING)
- Verify that DoD items exist in dod.md for each functional requirement described in spec.md
- Report as WARNING when a functional requirement exists but is not verified by DoD

### 3. Consistency Detection (INFO)
- Verify no contradictory descriptions exist between DoD items across different sprints
- Verify no identical verification items are duplicated across multiple sprints

## Output Format

Output detection results in the following format:

### CRITICAL: Forward Dependencies

- **Sprint {N}, section "{section}", item "{item}"**
  - References: {referenced feature}
  - Introduced in: Sprint {M} (after Sprint {N})
  - Recommendation: {remove / move to Sprint {M} or later / rewrite}

### WARNING: Completeness Gaps

- **Sprint {N}, spec.md requirement "{requirement}"**
  - No corresponding verification item in dod.md
  - Recommendation: Add DoD item

### INFO: Consistency

- **Sprint {N} and Sprint {M}**
  - Issue: {contradiction / duplication details}
  - Recommendation: {resolution}

State "None detected" for dimensions with no issues.

## Data to Analyze

{Insert all collected data here}
```

### Step 4: Detection Phase (N parallel passes)

Launch `general-purpose` agents in parallel according to the pass count (N) confirmed in Step 1.

**Important:**
- Use the Task tool (do not use TeamCreate)
- Each agent analyzes independently (do not reference other passes' results)
- Output to: `.sprint-loop/state/dod-verify-pass-{K}.md` (K = 1, 2, ..., N)
- Wait for all agents to complete

```
// Example for N=3:
Task(subagent_type="general-purpose", prompt="{detection prompt}", description="DoD verification pass 1")
  -> output: .sprint-loop/state/dod-verify-pass-1.md
Task(subagent_type="general-purpose", prompt="{detection prompt}", description="DoD verification pass 2")
  -> output: .sprint-loop/state/dod-verify-pass-2.md
Task(subagent_type="general-purpose", prompt="{detection prompt}", description="DoD verification pass 3")
  -> output: .sprint-loop/state/dod-verify-pass-3.md
```

Handling agent failures:
- All agents fail -> Error: "All detection agents failed. Please re-run." -> exit
- Some agents fail -> Continue aggregation with successful passes, report failed passes as WARNING

### Step 5: Result Aggregation

Read all pass result files and aggregate using the following procedure:

1. **Merge identical issues**: Consolidate detections pointing to the same sprint, section, and item into one entry
2. **Calculate confidence score**: For each detection, `confidence = detecting passes / total passes`
   - `>= 0.67` -> high confidence (multiple passes independently detected)
   - `< 0.67` -> low confidence (requires manual verification)
3. **Sort by severity**: CRITICAL -> WARNING -> INFO

Write the aggregated results to the plan file in the following format:

```markdown
# DoD Verification Results

## Summary

| Severity | Detected | High Confidence | Low Confidence |
|----------|----------|-----------------|----------------|
| CRITICAL | {N} | {N} | {N} |
| WARNING | {N} | {N} | {N} |
| INFO | {N} | {N} | {N} |

Detection passes: {N} / Succeeded: {N} / Failed: {N}

## CRITICAL: Forward Dependencies

### [{confidence}] Sprint {N}, "{section}" — "{item}"
- References: {referenced feature}
- Introduced in: Sprint {M}
- Detection passes: {K}/{N}
- Recommended action: {remove / move / rewrite}

...

## WARNING: Completeness Gaps

### [{confidence}] Sprint {N} — "{spec requirement}"
- No corresponding DoD item
- Detection passes: {K}/{N}
- Recommended action: Add DoD item

...

## INFO: Consistency

### [{confidence}] Sprint {N} / Sprint {M} — "{issue summary}"
- Details: {contradiction / duplication description}
- Detection passes: {K}/{N}

...
```

### Step 6: Interactive Refinement

Interactively refine detected issues with the user. Vary the interaction approach by severity.

#### CRITICAL (Forward Dependencies) — Individual Review

For each CRITICAL detection, confirm **individually** with AskUserQuestion:

"Sprint {N}'s DoD item "{item}" assumes feature "{feature}" introduced in Sprint {M} (confidence: {score}). How should this be handled?"

| Option | Description |
|--------|-------------|
| Remove | Delete this DoD item |
| Move to Sprint {M} | Move to Sprint {M}'s DoD where the feature is available |
| Rewrite | Rewrite to be verifiable at Sprint {N}'s point in time |
| Intentionally allow | Acknowledge the forward dependency and leave unchanged |

When "Rewrite" is selected, confirm the specific rewrite content with AskUserQuestion.

#### WARNING (Completeness Gaps) — Batch Presentation

Display all WARNINGs together and confirm the approach with AskUserQuestion:

"The following WARNINGs were detected. How should they be handled?"

| Option | Description |
|--------|-------------|
| Apply all | Apply all recommended actions |
| Review individually | Review each WARNING individually |
| Skip all | Ignore all WARNINGs |

When "Review individually" is selected, confirm the action for each WARNING with AskUserQuestion.

#### INFO (Consistency) — Display Only

INFOs are recorded in the plan file only. Switch to individual review if the user requests it.

"There are {N} INFO-level detections. Would you like to review them individually?"

| Option | Description |
|--------|-------------|
| Skip (recommended) | Display only, no corrections |
| Review individually | Review each INFO individually |

### Step 7: Finalize Correction Plan and ExitPlanMode

Based on the Step 6 refinement results, write the correction plan to the plan file.

**Before calling ExitPlanMode**, append the "Post-Approval Actions" section to the end of the plan file:

When corrections exist:

```markdown
## Post-Approval Actions (Execute after ExitPlanMode)

**Note: The following is NOT project code implementation. It is `.sprint-loop/` DoD file corrections.**

1. `.sprint-loop/sprints/sprint-{NNN}/dod.md` — {correction details}
2. `.sprint-loop/sprints/sprint-{NNN}/dod.md` — {correction details}
3. `.sprint-loop/sprints/sprint-{NNN}/spec.md` — {minor consistency fix} (only if needed)
4. Run post-correction verification pass
5. Display completion report
```

When no corrections exist (all skipped / intentionally allowed / zero detections):

```markdown
## Post-Approval Actions (Execute after ExitPlanMode)

No issues detected. No corrections needed.
```

**Call ExitPlanMode** (obtain user approval)

--- After ExitPlanMode approval ---

### Step 8: Apply Corrections

Apply corrections according to the approved plan:

1. Delete, add, move, or rewrite items in `dod.md`
2. Minor consistency fixes in `spec.md` if needed
3. Move items to other sprints' `dod.md` (when move actions exist)

#### Correction Rules

- **Modifiable**: Only files under `.sprint-loop/` (`dod.md`, `spec.md`)
- **Not modifiable**: `state.json`, `config.json`, project source code
- **When moving items**: Preserve the existing structure (section headings, etc.) of the destination sprint's `dod.md`

### Step 9: Post-Correction Verification Pass

After applying corrections, launch a detection agent **once only** for verification.

- Output to: `.sprint-loop/state/dod-verify-verification.md`
- Use the same prompt as Step 3 (rebuilt with corrected data)

Result judgment:
- **No remaining CRITICALs** -> proceed to Step 10 (completion)
- **Remaining CRITICALs** -> report to user and confirm whether additional corrections are needed

AskUserQuestion for remaining CRITICALs:

"Post-correction verification found {N} remaining CRITICALs."

| Option | Description |
|--------|-------------|
| Additional corrections | Re-run the Step 6-8 cycle |
| Accept and complete | Acknowledge remaining issues and complete |

When "Additional corrections" is selected, return to Step 6 targeting only the remaining CRITICALs.

### Step 10: Completion Report

```
Sprint-DoD-Verify complete

Detection results:
  CRITICAL: {initial count} -> {post-correction remaining}
  WARNING:  {initial count} -> {post-correction remaining}
  INFO:     {count}

Modified files:
  - {list of modified files}

Verification pass result files:
  - .sprint-loop/state/dod-verify-pass-*.md (detection passes)
  - .sprint-loop/state/dod-verify-verification.md (post-correction verification)

{guidance message (see below)}
```

#### Guidance Messages

Provide appropriate command guidance based on `state.phase`:

| phase | Guidance Message |
|-------|-----------------|
| `planned` | Run `/sprint-start` to begin execution. |
| `executing` / `failed` / `fixing` | Run `/sprint-resume` to resume. |
| `replanned` | Run `/sprint-resume` to resume. |

## Error Handling

| Error Condition | Action |
|----------------|--------|
| `.sprint-loop/` missing | Display error and exit |
| `state.json` missing | Display error and exit |
| `config.json` missing | Display error and exit |
| 0 pending sprints | Display error and exit |
| `phase: "replanning"` | Guide to complete `/sprint-replan` and exit |
| Target `spec.md` missing | Skip the sprint + WARNING |
| Target `dod.md` missing | Skip the sprint + CRITICAL report (DoD missing) |
| All detection agents fail | Display error and exit |
| Some agents fail | Continue with successful passes, report failed passes as WARNING |

## Important Rules

- **Always use Plan Mode**
- **Forward dependency detection is PRIMARY** — this is the skill's primary value
- **Launch detection agents with `general-purpose`** (do not use TeamCreate)
- **Only modify files under `.sprint-loop/`** — do not touch project source code
- **Do not modify state.json or config.json**
- **Always run the post-correction verification pass** (Step 9)
- **Do not start or resume the loop** — execution is the responsibility of `/sprint-start` or `/sprint-resume`
- **Do not delete intermediate files (`.sprint-loop/state/dod-verify-pass-*.md`)** — retain as audit trail
