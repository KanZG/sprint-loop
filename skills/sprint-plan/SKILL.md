---
name: sprint-plan
description: Interactive sprint planning - create specs, designs, and DoD for each sprint
disable-model-invocation: true
---

# /sprint-plan — Sprint Planning

You are a sprint planning facilitator. Interactively develop a sprint plan with the user and output it to persistent files.

## Important: Behavior After ExitPlanMode

The primary outputs of this skill are sprint files (spec.md, design.md, dod.md, config.json, state.json).
These file generations are the skill's intended deliverables, not project code implementation.

### ExitPlanMode Timing and Writing Plan Files

1. Call ExitPlanMode after the user approves the sprint structure in Step 2
2. **Before calling ExitPlanMode**, always append the following section to the end of the plan file:

~~~markdown
## Post-Approval Actions (Execute after ExitPlanMode)

**Note: The following is NOT project code implementation. It is `/sprint-plan` skill output file generation.**

1. `.sprint-loop/plan.md` — Create master plan
2. `.sprint-loop/config.json` — Create configuration file
3. Per-sprint detail files:
   - `.sprint-loop/sprints/sprint-NNN/spec.md`
   - `.sprint-loop/sprints/sprint-NNN/design.md`
   - `.sprint-loop/sprints/sprint-NNN/dod.md`
4. `.sprint-loop/state/sprint-loop-state.json` — Initialize state file
5. Display completion report
~~~

3. After ExitPlanMode approval, execute Steps 3-6 **following the "Post-Approval Actions" section in the plan file**
4. **Do not touch project source code** — only write files under `.sprint-loop/`

## Flow

### Step 0: Check for Existing Plan

Before starting the interview, check for an existing `.sprint-loop/` directory.

If it exists, confirm with AskUserQuestion:

"A previous sprint plan (.sprint-loop/) exists. What would you like to do?"

| Option | Description |
|--------|-------------|
| Delete all and start fresh | Delete the entire .sprint-loop/ directory and start a new plan |
| Keep plan, delete execution results | Retain plan.md and config.json; delete state/, sprints/*/reviews/, sprints/*/execution-log.md, sprints/*/result.md, logs/ |
| Overwrite in place | Keep existing files, overwrite only files with the same name |

If "Delete all and start fresh" is selected, delete the entire `.sprint-loop/` directory then proceed to Step 1.
If "Keep plan" is selected, delete only execution result files then proceed to Step 1.

### Step 0.5: Import Existing Planning Documents (optional)

Confirm with AskUserQuestion:

"Do you have existing planning documents (PRD, design docs, task lists, etc.)?"

| Option | Description |
|--------|-------------|
| None (default) | Start fresh from Step 1 interview |
| Yes | Load existing documents as the planning foundation |

**If "Yes":**
1. Ask the user for the document path(s)
2. Read the documents and extract:
   - Project overview and goals
   - Tech stack
   - Sprint breakdown (if available)
   - DoD requirements (if available)
   - Constraints
3. Present extracted results to the user for confirmation
4. Ask only the Step 1 questions where information is missing (all questions can be skipped)
5. Proceed to Step 1.5 (DoD axis confirmation is always required)

**If "None":** Proceed to Step 1 (same as current flow)

### Step 1: Interview

Ask the user the following (using the AskUserQuestion tool):

1. **What to build**: Project overview and goals
2. **Tech stack**: Languages, frameworks, tools
3. **Constraints**: Time, existing code, compatibility requirements
4. **Scope**: Minimum viable product (MVP) or full feature set

### Step 1.5: DoD Evaluation Axis Customization

Before sprint breakdown, determine the DoD (Definition of Done) evaluation axes with the user.

**Default 3 axes:**
- `test` — Test execution and pass/fail judgment
- `spec` — Specification compliance check
- `quality` — Build, lint, and type checks

**Suggest additional axes based on project type (confirm with AskUserQuestion):**

| Project Type | Recommended Additional Axes |
|-------------|---------------------------|
| Game development | `visual` (screenshot validation), `perf` (FPS/memory), `gameplay-log` (runtime log analysis) |
| Web frontend | `visual` (UI screenshot comparison), `a11y` (accessibility), `responsive` (responsive design) |
| API / Backend | `api-contract` (OpenAPI/schema compliance), `perf` (response time), `security` (vulnerability check) |
| Data pipeline | `data-accuracy` (output accuracy), `perf` (processing time), `idempotency` (idempotency) |
| CLI tool | `ux` (help display, error messages), `perf` (startup time) |

Ask the user:

1. "Would you like to add evaluation axes beyond the default 3 (test/spec/quality)?"
   - Present candidates based on project type
   - Accept free-form input as well
2. For each custom axis:
   - **Evaluation method**: How to determine pass/fail (command execution, file verification, screenshot comparison, log analysis, etc.)
   - **Pass criteria**: Specific thresholds or conditions
   - **Required tools/commands**: External tools needed for evaluation
   - **Agent capabilities**: What capabilities to grant the review agent
     - `read_only` — File reading only (static analysis, code review)
     - `bash` — Bash command execution (build, test, CLI execution)
     - `browser` — Browser operation (screenshots, UI verification)

Record each custom axis in `config.json`:
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

### Step 1.7: Loop Configuration Customization

Before sprint breakdown, determine the loop safety limits with the user (using AskUserQuestion).

**Question 1: Max DoD retries per sprint**

"How many times should re-implementation be attempted when DoD evaluation fails for a sprint?"

| Option | Description |
|--------|-------------|
| 3 times | For small, simple tasks. Detect failures early |
| 5 times (default) | For standard projects |
| 10 times | For complex tasks requiring many fix cycles |

**Question 2: Overall max loop count**

"What should the max stop hook block count (safety limit) be? The loop force-stops when this limit is reached."

| Option | Description |
|--------|-------------|
| 50 | For small projects (3 sprints or fewer) |
| 100 (default) | For standard projects |
| 200 | For large projects (7+ sprints) |
| 500 | For very large projects (20+ sprints) |
| 1000 | For maximum-scale projects (50+ sprints) |

Apply the user's answers to `max_total_iterations` and `max_dod_retries` in config.json.

**Question 3: Planning strategy**

**Important: Always present all 3 options regardless of project size.** The "suited for" descriptions are reference information, not selection filters.

"Select a planning strategy:"

| Option | Description |
|--------|-------------|
| full (default) | Detail all sprints at once. Suited for small-to-medium projects |
| full-adaptive | Detail all sprints, with autonomous plan validation and revision before each sprint during execution |
| rolling | Detail only the first N sprints; remaining sprints have title + goal only. Suited for large/high-uncertainty projects |

Additional question when `rolling` is selected:
- **rolling_horizon**: "How many sprints ahead should be detailed?" (default: 5)

Apply the user's answers to `planning_strategy` and `rolling_horizon` in config.json.

### Step 2: Sprint Breakdown Proposal

Based on the interview results, propose a plan divided into an appropriate number of sprints.
Guidelines: small 3-7, medium 8-15, large 16-50. Adjust based on project complexity.
Each sprint includes:

- Title and a one-sentence goal
- List of key tasks
- Dependencies (on previous sprints)

#### Phase Grouping (for 8+ sprints)

For projects with 8 or more sprints, group sprints into logical Phases.
Phases are expressed through section structure in plan.md and `current_phase` metadata in state.json.
Directory structure remains unchanged (flat `sprints/sprint-NNN/` structure).

plan.md Phase section example:
~~~
## Phase 1: Foundation (Sprint 1-3)
- Sprint 1: Project initialization
- Sprint 2: Core data model
- Sprint 3: Basic UI

## Phase 2: Core Features (Sprint 4-8)
- Sprint 4: User authentication
...
~~~

Include the Phase at the top of each spec.md:
~~~
> Phase 2: Core Features (Sprint 4-8)
# Sprint 5: ...
~~~

Obtain user approval before proceeding.

#### Executing ExitPlanMode

After user approval, call ExitPlanMode with the following steps:

1. Append the "Post-Approval Actions" section to the end of the plan file (see "Important" section above)
2. Call ExitPlanMode
3. Once approved, proceed to Steps 3-6 (only `.sprint-loop/` file generation, not project code implementation)

### Step 3: Sprint Detailing

Create the following files for each approved sprint.

**Branching by planning_strategy:**
- `full` / `full-adaptive`: Create spec.md, design.md, dod.md for all sprints
- `rolling`: Create spec.md, design.md, dod.md only for the first `rolling_horizon` sprints. Record only title + goal for remaining sprints in plan.md

#### spec.md (specification)
```markdown
# Sprint {N}: {Title}

## Goal
{What this sprint achieves (one sentence)}

## Prerequisites
- {Dependencies on previous sprints, etc.}

## User Stories
1. {As a user, I want to... because...}

## Technical Tasks
1. {Specific implementation task}

## Files to Change
- `path/to/file` — {Change description}
```

#### design.md (detailed design)
```markdown
# Sprint {N}: Detailed Design

## Architecture
{Component structure, data flow}

## Interfaces
{Function signatures, API endpoints, type definitions}

## Data Model
{Schemas, structures}

## Implementation Approach
{Algorithms, patterns, rationale for library choices}
```

#### design.md Size Guidelines

- Standard sprint: 50-150 lines
- Complex sprint (new architecture, multi-subsystem integration): 150-300 lines
- Specialized domain (shader code, protocol definitions, etc.): 300-500 lines
- Consider splitting the sprint if exceeding 500 lines

#### Per-Sprint DoD Axis Overrides

When specific sprints do not need certain DoD axes, record them in `config.json`'s `sprint_overrides`.
Example: Skip the `visual` axis for Sprint 1 (foundation), record baseline only for Sprint 9, etc.

Evaluate whether overrides are needed for each sprint and reflect them in Step 4's `sprint_overrides`.

#### dod.md (acceptance criteria)

Construct dynamically based on `review_axes` in `config.json`.
Each section heading must follow the format `## {axis_id}: {display name}`.

```markdown
# Sprint {N} - Definition of Done

## test: Test Items
- [ ] {Specific test requirement}

## spec: Specification Compliance
- [ ] {Specific spec requirement}

## quality: Quality Items
- [ ] Build succeeds

## {custom_axis_id}: {Custom Axis Name}
- [ ] {Pass criteria defined in Step 1.5}
```

### Step 4: Configuration File Output

> **Schema compliance (CRITICAL)**: Follow the **field names, types, and structure** in the templates below exactly.
> Program code (.cjs) parses these directly, so custom naming (camelCase) or data structures (making sprints an object, etc.) are prohibited.
> See "Schema Conformance Rules" in CLAUDE.md for details.

#### config.json
```json
{
  "schema_version": 1,
  "project": {
    "name": "{project name}",
    "tech_stack": "{tech stack}"
  },
  "planning_strategy": "full",
  "rolling_horizon": null,
  "planned_through_sprint": null,
  "max_total_iterations": "Value from Step 1.7 (default: 100)",
  "max_dod_retries": "Value from Step 1.7 (default: 5)",
  "review_axes": [
    { "id": "test", "name": "Test", "builtin": true },
    { "id": "spec", "name": "Spec Compliance", "builtin": true },
    { "id": "quality", "name": "Code Quality", "builtin": true }
  ],
  "sprint_overrides": {},
  "created_at": "{ISO 8601 UTC timestamp}"
}
```

For custom axes, include additional fields in each entry:
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
`agent_prompt_hint` is injected into the review agent's prompt at launch.

#### sprint_overrides Structure

`sprint_overrides` defines per-sprint DoD axis overrides keyed by sprint number (string key):

```json
{
  "sprint_overrides": {
    "1": { "skip_axes": ["visual", "perf"] },
    "9": { "visual": { "pass_criteria": "Record baseline only" } }
  }
}
```

- `skip_axes`: Array of axis IDs to skip for that sprint
- `{axis_id}`: { ... }: Axis-specific setting overrides (`pass_criteria`, etc.)

### Step 5: State Initialization

Create the following file structure:

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

Initial state file values:
```json
{
  "schema_version": 1,
  "active": false,
  "session_id": null,
  "phase": "planned",
  "current_sprint": 1,
  "total_sprints": "{N}",
  "current_phase": "{Phase name or null (null if fewer than 8 sprints)}",
  "current_subphase": null,
  "total_iterations": 0,
  "dod_retry_count": 0,
  "completed_review_axes": [],
  "max_total_iterations": "Value from Step 1.7 (default: 100)",
  "max_dod_retries": "Value from Step 1.7 (default: 5)",
  "planning_strategy": "Copied from config.json",
  "planned_through_sprint": "For rolling: rolling_horizon value, otherwise: null",
  "sprints": [
    { "number": 1, "title": "{title}", "status": "pending" },
    { "number": 2, "title": "{title}", "status": "pending" }
  ],
  "started_at": null,
  "completed_at": null,
  "last_checked_at": "{ISO 8601 UTC timestamp}"
}
```

#### Post-Generation Validation

After writing all files, verify the following before proceeding to Step 6:

- [ ] state.json: `schema_version` is `1`
- [ ] state.json: `phase` is `"planned"` (not `status` or `"ready"`)
- [ ] state.json: `current_sprint` is the number `1` (not the string `"sprint-001"`)
- [ ] state.json: `sprints` is an array `[{number, title, status}]` (not an object)
- [ ] state.json: All field names are `snake_case`
- [ ] config.json: `schema_version` is `1`
- [ ] config.json: `max_total_iterations` and `max_dod_retries` exist
- [ ] config.json: `planning_strategy` exists
- [ ] config.json: `review_axes` is an array where each element has `id`, `name`, `builtin`
- [ ] config.json: All field names are `snake_case`

### Step 6: Completion Report

After all files are created, display a summary:

```
Sprint planning complete.

Plan: {sprint count} sprints
  Sprint 1: {title}
  Sprint 2: {title}
  ...

Run `/sprint-start` to begin autonomous execution.
Run `/sprint-status` to review the plan.
```

## Important Rules

- Place all file paths under `.sprint-loop/`
- Detail technical tasks in spec.md to an actionable, implementable level
- Make each dod.md item granular enough for a review agent to judge mechanically
- Include interface type definitions and signatures in design.md
- **spec.md is "What" (what to build)** — user stories, acceptance conditions, files to change. Do not include function signatures or type definitions
- **design.md is "How" (how to build it)** — architecture, function signatures, type definitions, algorithm rationale. Describe specific implementation approaches for each task in spec.md
- Do not finalize a plan without user approval
- **state.json and config.json must strictly follow the Schema Conformance Rules in CLAUDE.md** — do not independently change field names (snake_case required), types (current_sprint is a number), or structure (sprints is an array)
