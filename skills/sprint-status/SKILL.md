---
name: sprint-status
description: Show current sprint-loop execution status and progress
disable-model-invocation: true
---

# /sprint-status — Progress Check

Read the current state from persistent files and display progress.

## Procedure

1. Read `.sprint-loop/state/sprint-loop-state.json`
2. If the state file does not exist:
   ```
   Sprint-Loop: No plan found.
   Create a plan with `/sprint-plan`.
   ```

3. Display based on current state:

### planned state
```
Sprint-Loop Status: Planned (Not Yet Executed)

Sprint count: {total_sprints}
{list of sprint titles}

Run `/sprint-start` to begin execution.
```

### executing state
```
Sprint-Loop Status: Executing

Current Sprint: {current_sprint}/{total_sprints} — {title}
Sub-phase: {current_subphase}
Iteration: {total_iterations}/{max_total_iterations}
DoD Retries: {dod_retry_count}/{max_dod_retries}
Started: {started_at}
Last Activity: {last_checked_at}

Sprint Progress:
  [x] Sprint 1: {title} — completed
  [>] Sprint 2: {title} — in_progress ({current_subphase})
  [ ] Sprint 3: {title} — pending
```

If latest review results exist, also display:
```
Latest Review (attempt {N}):
  Test:    {verdict} — {details}
  Spec:    {verdict} — {details}
  Quality: {verdict} — {details}
```

### all_complete state
```
Sprint-Loop Status: All Sprints Complete

Total Sprints: {total_sprints}
Total Iterations: {total_iterations}
Duration: {started_at} — {completed_at}
```

### failed state
```
Sprint-Loop Status: Failed

Reason: {failure_reason}
Failed at Sprint: {current_sprint}/{total_sprints}
Total Iterations: {total_iterations}

Run `/sprint-resume` to resume from the latest state.
```

### fixing state
```
Sprint-Loop Status: Fix Mode (Paused)

Current Sprint: {current_sprint}/{total_sprints} — {title}
Sub-phase before fix: {previous_subphase}
DoD Retries: {dod_retry_count}

Fix in progress. Execution resumes automatically after the fix completes.
If the fix was interrupted, resume with `/sprint-resume`.
```

### replanning state
```
Sprint-Loop Status: Replan Mode (Replanning)

Current Sprint: {current_sprint}/{total_sprints}
Total Iterations: {total_iterations}

Replanning in progress. Complete with `/sprint-replan`.
```

### replanned state
```
Sprint-Loop Status: Replanned (Not Yet Resumed)

Total Sprints: {total_sprints}
Resume Mode: DoD-first (each sprint starts from DoD evaluation)

Sprint Progress:
  [ ] Sprint 1: {title} — pending
  [ ] Sprint 2: {title} — pending
  ...

Run `/sprint-resume` to begin re-execution.
DoD-first mode will fast-track unchanged sprints with DoD evaluation only.
```

## Additional Information

- Also display a concise summary of `.sprint-loop/plan.md` content
- If the current sprint has an `execution-log.md`, display its summary as well
