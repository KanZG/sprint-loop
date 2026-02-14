---
name: sprint-cancel
description: Safely stop sprint-loop execution
disable-model-invocation: true
---

# /sprint-cancel — Stop Execution

Safely stop Sprint-Loop execution.

## Procedure

1. Read `.sprint-loop/state/sprint-loop-state.json`

2. If the state file does not exist or `active` is `false`:
   ```
   Sprint-Loop: No active execution.
   ```

3. If there is an active execution, update state:
   ```json
   {
     "active": false,
     "phase": "failed",
     "failure_reason": "User cancelled",
     "completed_at": "{ISO timestamp}"
   }
   ```

4. Remove the CLAUDE.md marker:
   - Read the workspace's `CLAUDE.md`
   - If CLAUDE.md doesn't exist, skip this step
   - Remove the `<!-- SPRINT-LOOP:START -->` ... `<!-- SPRINT-LOOP:END -->` block (including the markers themselves)
   - If CLAUDE.md becomes empty after removal, delete the file

5. Display confirmation message:
   ```
   Sprint-Loop stopped.

   State at stop:
     Sprint: {current_sprint}/{total_sprints}
     Sub-phase: {current_subphase}
     Iteration: {total_iterations}

   Plan files are preserved.
   To resume, reset the state and run `/sprint-start`.
   ```

## Notes

- Running sub-agents (Task calls) complete independently. They stop when the session ends because the stop hook no longer blocks.
- Plan files (spec.md, design.md, dod.md) are NOT deleted.
- To resume, manually reset the state file or replan with `/sprint-plan`.
