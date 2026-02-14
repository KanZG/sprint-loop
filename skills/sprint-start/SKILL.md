---
name: sprint-start
description: Start autonomous sprint-loop execution - orchestrates implementation and DoD review cycles
disable-model-invocation: true
---

# /sprint-start — Start Autonomous Execution

You are the sprint-loop **orchestrator**. You never write code yourself; all work is delegated to sub-agents via Task().

## Precondition Checks

Verify the following before starting execution:

1. `.sprint-loop/state/sprint-loop-state.json` exists
2. `phase` is `"planned"`
3. Sprint files exist according to the planning strategy:
   - `full` / `full-adaptive`: `spec.md` and `dod.md` exist for all sprints
   - `rolling`: `spec.md` and `dod.md` exist for sprints up to `planned_through_sprint`

If any condition is not met, display an error and exit:
```
Error: Sprint plan not found.
Run `/sprint-plan` to create a plan first.
```

4. If Plan Mode is active, disable it with the following steps:
   1. Overwrite the plan file with **empty content (0 bytes)** (`Write(plan_file_path, "")`)
      - **Important**: Write nothing. Any content triggers a Session Clear option, risking context loss
   2. Call ExitPlanMode (the user sees only a Yes/No prompt)
   3. Once approved, proceed to the next step

## Startup Procedure

1. Update the state file:
   > **Schema compliance**: All field names use `snake_case`. Use `phase` (not `status`), `current_sprint` as a number, `session_id` (not `sessionId`).
   ```json
   {
     "active": true,
     "session_id": "{current session ID — generate with crypto.randomUUID()}",
     "phase": "executing",
     "current_sprint": 1,
     "current_subphase": "implementing",
     "started_at": "{ISO timestamp}",
     "total_iterations": 0,
     "dod_retry_count": 0
   }
   ```

2. Notify the user of the start:
   ```
   Starting Sprint-Loop autonomous execution.

   Total sprints: {N}
   Planning strategy: {planning_strategy}
   Current phase: {current_phase or "None"}
   Max iterations: {max}
   Max DoD retries per sprint: {max}

   Starting with Sprint 1: {title}.
   The stop hook maintains the loop during execution.
   Use `/sprint-cancel` to stop.
   ```

3. Verify CLAUDE.md marker exists:
   - Read the workspace's `CLAUDE.md` (create if it doesn't exist)
   - If `<!-- SPRINT-LOOP:START -->` block is missing, generate and append it based on `config.json`
   - This ensures orchestrator rules survive compaction via the system prompt

4. Begin the first sprint execution workflow

## Counter Definitions

| Counter | Definition | Increment Trigger |
|---------|-----------|-------------------|
| `total_iterations` | Stop hook block count (internal mechanism) | Each time the stop hook returns block |
| `dod_retry_count` | impl-to-review cycle count for current sprint (quality gate) | Each time DoD is rejected and re-implementation begins |

`total_iterations` is for the loop safety mechanism (forced stop on limit). Never reset.
`dod_retry_count` is for the quality gate (max retries per sprint). Reset to 0 on sprint completion.

## Sprint Execution Workflow

### Agent Dispatch Pattern

All agents are dispatched via **Task()** (SubAgent). No TeamCreate/TeamDelete is used.
Each Task() call is independent — the agent runs, returns a result, and terminates.

```
Orchestrator
  ├── Task(implementor)     — Phase A: run once, get result
  ├── Task(reviewer) x N    — Phase B: run in parallel, each returns result
  └── Task(aggregator)      — Phase B: run once after reviewers complete
```

Benefits:
- No lifecycle management (no shutdown_request, no TeamDelete)
- Compaction-resilient (no persistent team state to get out of sync)
- No "Already leading team" errors

### Pre-Phase: Plan Validation / Inline Planning (by planning_strategy)

Before starting implementation for each sprint, execute additional steps based on `config.json`'s `planning_strategy`.

#### For full

No additional steps. Proceed directly to Phase A.

#### For full-adaptive

Validate plan consistency before each sprint starts:

1. Launch "plan-validator":
   ```
   Task(
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="Read the following files and validate plan consistency:
       - .sprint-loop/sprints/sprint-{NNN}/spec.md
       - .sprint-loop/sprints/sprint-{NNN}/design.md
       - .sprint-loop/sprints/sprint-{NNN}/dod.md
       - result.md from the previous 1-2 sprints

       Validation items:
       - Do the APIs/functions referenced in design.md actually exist in the codebase?
       - Are the assumed deliverables from previous sprints as expected?
       - Does the technical approach need changes?

       If discrepancies found: Revise spec.md / design.md / dod.md and
       output a revision summary to .sprint-loop/sprints/sprint-{NNN}/plan-revision.md.
       If no discrepancies: Write 'No revision needed' in plan-revision.md."
   )
   ```
2. Read `plan-revision.md` from the result
3. Proceed to Phase A (implementing)

#### For rolling

Generate the next batch of plans when the current sprint is near the end of the planned range:

Condition: `config.planning_strategy == "rolling" AND current_sprint > state.planned_through_sprint - 1`

1. Set `current_subphase` to `"planning"` and update the state file
2. Launch "planner":
   ```
   Task(
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="Read the following and generate detailed plans for the next {rolling_horizon} sprints:
       - .sprint-loop/plan.md (title + goal list)
       - result.md from the previous sprint (actuals)
       - .sprint-loop/config.json (DoD axis configuration)

       Generate for each sprint:
       - spec.md (specification)
       - design.md (detailed design)
       - dod.md (acceptance criteria, based on config's review_axes)

       On completion, output the list of generated sprint numbers to
       .sprint-loop/state/planning-result.md."
   )
   ```
3. Read `planning-result.md` from the result
4. Update `state.planned_through_sprint`
5. Set `current_subphase` back to `"implementing"`
6. Proceed to Phase A

### Phase A: Implementation (implementing)

1. Read the sprint's persistent files:
   ```
   Read: .sprint-loop/sprints/sprint-{NNN}/spec.md
   Read: .sprint-loop/sprints/sprint-{NNN}/design.md
   Read: .sprint-loop/sprints/sprint-{NNN}/dod.md
   ```

2. Launch the implementor agent:
   ```
   Task(
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="Implement based on the following spec and design.

     [spec.md contents]
     [design.md contents]

     ## Implementation Rules
     - Implement design.md faithfully. If there are inconsistencies with dod.md, prioritize design.md.
     - Inconsistencies with dod.md will be caught during DoD evaluation and correction instructions will be provided as feedback.
     - The orchestrator must not anticipate DoD and alter implementation.

     On completion, write an implementation summary to:
     .sprint-loop/sprints/sprint-{NNN}/execution-log.md

     ## execution-log.md format (for Attempt 1):
     ```markdown
     ## Attempt 1 — {ISO timestamp}

     ### Implementation
     - List of changed files
     - Summary of implementation
     - Notes and known limitations
     ```
     "
   )
   ```

   **On retry (Attempt 2+)**, launch with previous DoD feedback included:
   ```
   Task(
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="Fix the implementation based on the following spec and design.

     [spec.md contents]
     [design.md contents]

     ## Previous DoD Evaluation Feedback:
     [Paste summary.json's action_required verbatim]

     ## Implementation Rules
     - Implement design.md faithfully.
     - Address all issues from the feedback above.

     On completion, **append** an implementation summary to:
     .sprint-loop/sprints/sprint-{NNN}/execution-log.md

     ## execution-log.md append format:
     ```markdown
     ## Attempt {N} — {ISO timestamp}

     ### Feedback from previous attempt
     - Previous DoD failure reasons (action_required content)

     ### Implementation
     - List of changed files
     - Summary of implementation
     - Issues addressed
     ```
     "
   )
   ```

3. Task() returns when the implementor completes. Collect the result.

4. Update state:
   ```json
   { "current_subphase": "reviewing" }
   ```

### Phase B: DoD Evaluation (reviewing)

1. Read `review_axes` and `sprint_overrides` from `config.json`

2. If `sprint_overrides` exist for the current sprint number, filter effective axes:
   ```
   const overrides = config.sprint_overrides?.[String(current_sprint)] || {};
   const skipAxes = overrides.skip_axes || [];
   const effectiveAxes = config.review_axes.filter(a => !skipAxes.includes(a.id));
   ```
   Log any skipped axes.

3. Reset `completed_review_axes` to `[]` in state

4. Launch review agents for each axis in `effectiveAxes` **in parallel** via Task():

   **Builtin axes** (`builtin: true`): Use the corresponding bare-name agent
   ```
   Task(
     subagent_type="{axis.id}-reviewer",
     mode="acceptEdits",
     prompt="Evaluate '{axis.name}' for Sprint {N}.
     [Relevant section from dod.md]
     Write the result to .sprint-loop/sprints/sprint-{NNN}/reviews/{axis.id}-attempt-{M}.json.

     > **Review JSON schema**: Field names must be `snake_case` (`sprint_id`, `axis_verdicts`).
     > `verdict` must be `"approved"` or `"rejected"` only (`"pass"` ❌, `"fail"` ❌, `"PASS"` ❌).

     Output JSON format:
     {
       \"sprint_id\": {N},
       \"attempt\": {M},
       \"timestamp\": \"{ISO}\",
       \"reviews\": {
         \"{axis.id}\": {
           \"verdict\": \"approved|rejected\",
           \"details\": \"...\",
           \"failures\": []
         }
       }
     }"
   )
   ```

   **Custom axes** (`builtin: false`): Use `general-purpose` agent with `agent_prompt_hint`
   ```
   Task(
     subagent_type="general-purpose",
     mode="acceptEdits",
     prompt="Evaluate '{axis.name}' for Sprint {N}.
     Evaluation method: {axis.evaluation_method}
     Pass criteria: {axis.pass_criteria}
     {axis.agent_prompt_hint}

     [Relevant section from dod.md]

     Write the result in the following JSON format to .sprint-loop/sprints/sprint-{NNN}/reviews/{axis.id}-attempt-{M}.json:
     {
       \"sprint_id\": {N},
       \"attempt\": {M},
       \"timestamp\": \"{ISO}\",
       \"reviews\": {
         \"{axis.id}\": {
           \"verdict\": \"approved|rejected\",
           \"details\": \"...\",
           \"failures\": []
         }
       }
     }"
   )
   ```

   > **subagent_type naming rule**: Reference project-local `.claude/agents/` agents by **bare name** (no prefix).
   > Example: `"test-reviewer"` O / `"sprint-loop:test-reviewer"` X

5. Task() calls return when complete. After launching all reviewers in parallel, collect their results.
   - Add each completed axis.id to `state.completed_review_axes` and update sprint-loop-state.json

   **If a reviewer Task() fails (no review JSON written):**
   1. Launch a retry Task() for the same axis (fresh agent)
   2. Only if the retry also fails, the orchestrator writes an error review JSON directly:
      ```json
      {
        "sprint_id": {N}, "attempt": {M}, "timestamp": "{ISO}",
        "reviews": {
          "{axis.id}": {
            "verdict": "rejected",
            "details": "Reviewer agent failed after retry",
            "failures": ["Agent could not complete evaluation"]
          }
        }
      }
      ```
      Then add to `completed_review_axes` and proceed

6. **After all reviews complete, launch the aggregator agent** (fixed step, no decision needed):
   ```
   Task(
     subagent_type="review-aggregator",
     mode="acceptEdits",
     prompt="Read all review result files and create an aggregated summary.
     File pattern: .sprint-loop/sprints/sprint-{NNN}/reviews/*-attempt-{M}.json
     (Exclude summary-*.json)

     Output to .sprint-loop/sprints/sprint-{NNN}/reviews/summary-attempt-{M}.json in the following format:
     {
       \"sprint_id\": {N},
       \"attempt\": {M},
       \"timestamp\": \"{ISO}\",
       \"overall_verdict\": \"approved|rejected\",
       \"axis_verdicts\": { \"{axis_id}\": \"approved|rejected\", ... },
       \"action_required\": \"List failures from rejected axes as bullet points. null if all approved\"
     }"
   )
   ```

   > **Note**: The aggregator follows a fixed pattern: "all reviewers complete -> always launch."
   > Reading individual review JSONs directly would consume excessive context,
   > so the aggregator consolidates them and the orchestrator reads only the summary file.

6b. Task() returns when the aggregator completes. Collect the result.

7. **The orchestrator reads only `summary-attempt-{M}.json`** (not individual reviews)

### Review Result File Naming Convention

| File Type | Path | Example |
|-----------|------|---------|
| Individual review | `reviews/{axis_id}-attempt-{N}.json` | `reviews/test-attempt-1.json` |
| Aggregated summary | `reviews/summary-attempt-{N}.json` | `reviews/summary-attempt-1.json` |

`{N}` is `dod_retry_count + 1` (1-based).

### Phase C: Result Judgment

**If all approved:**
> **Schema compliance**: When updating the `sprints` array, each element must maintain `{number, title, status}` structure.
> `status` must be one of `"completed"` / `"in_progress"` / `"pending"`.

1. Write sprint completion summary to `result.md`
2. Update the sprint's status to `"completed"`
3. Update the corresponding sprint's status to `"completed"` in state's `sprints` array
4. Increment `current_sprint`
5. If the next sprint belongs to a new Phase, update `current_phase` (refer to Phase sections in plan.md)
6. Update the next sprint's status to `"in_progress"` in state's `sprints` array
7. Reset `dod_retry_count` to 0
8. If there is a next sprint -> proceed to Phase A with `current_subphase: "implementing"`
9. If all sprints are complete:
   - Set `phase: "all_complete"`, `active: false`
   - Remove the CLAUDE.md marker: read the workspace's `CLAUDE.md` (if it exists), remove the `<!-- SPRINT-LOOP:START -->` ... `<!-- SPRINT-LOOP:END -->` block (including the markers themselves). If CLAUDE.md becomes empty after removal, delete the file.

**If any rejected:**
1. Increment `dod_retry_count`
2. Append `action_required` from `summary-attempt-{M}.json` to execution-log.md
3. Set `current_subphase: "implementing"`
4. Return to Phase A (pass feedback to implementor via a new Task())

## Orchestrator Rules

1. **Never write code yourself** — everything goes through Task()
2. **Always update persistent files** — update sprint-loop-state.json on every state transition
3. **Log decisions** — append reasoning to .sprint-loop/logs/orchestrator-log.md
4. **Use Task() for all delegation** — no TeamCreate/TeamDelete/SendMessage needed
5. **Be specific with feedback** — on rejection, pass the `action_required` content verbatim to the implementor
6. **Use bare names for subagent_type** — `"test-reviewer"`, not `"sprint-loop:test-reviewer"`
7. **Task() is synchronous** — each call returns when the agent completes. For parallel execution, launch multiple Task() calls in the same turn.
