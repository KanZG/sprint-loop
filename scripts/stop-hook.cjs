'use strict';

const { readStdinJson } = require('./lib/stdin.cjs');
const { readState, updateState, readConfig } = require('./lib/state.cjs');
const { runSafetyChecks } = require('./lib/safety.cjs');

/**
 * Build the continuation message that gets injected as a "user message"
 * when the stop hook blocks. References persistent files so the orchestrator
 * can recover even after compaction.
 */
/**
 * Build the reviewing sub-phase instructions with dynamic review axes from config.
 */
function buildReviewingInstructions(sprint, config, sprintNum, state) {
  const axes = (config && config.review_axes) || [
    { id: 'test', name: 'Test' },
    { id: 'spec', name: 'Spec Compliance' },
    { id: 'quality', name: 'Code Quality' },
  ];

  // Apply per-sprint overrides
  const overrides = (config && config.sprint_overrides && config.sprint_overrides[String(sprintNum)]) || {};
  const skipAxes = overrides.skip_axes || [];
  const effectiveAxes = axes.filter(a => !skipAxes.includes(a.id));

  // Diff against completed axes (align with session-start.cjs logic)
  const completedAxes = (state && state.completed_review_axes) || [];
  const remainingAxes = effectiveAxes.filter(a => !completedAxes.includes(a.id));

  const axisLines = effectiveAxes.map(a => {
    if (a.builtin !== false) {
      return `   - ${a.id}-reviewer: ${a.name} [builtin -> Task(subagent_type="${a.id}-reviewer")]`;
    } else {
      const hint = a.agent_prompt_hint ? ` hint: "${String(a.agent_prompt_hint).substring(0, 100)}"` : '';
      return `   - ${a.id}: ${a.name} [custom -> Task(subagent_type="general-purpose")${hint}]`;
    }
  }).join('\n');

  // Build reviewing status section
  let reviewingStatus = '';
  if (completedAxes.length > 0) {
    reviewingStatus = `\n### Review Status\nCompleted axes: [${completedAxes.join(', ')}]\n`;
    if (remainingAxes.length > 0) {
      reviewingStatus += `Remaining axes: [${remainingAxes.map(a => a.id).join(', ')}]\n`;
      reviewingStatus += `Only launch review agents for remaining axes. Do not restart completed axes.`;
    } else {
      reviewingStatus += `All review axes completed. Launch the aggregator to generate the summary.`;
    }
  }

  return `**reviewing (DoD evaluation)**:
1. Read review_axes from config.json and launch review agents via Task() in parallel:
${axisLines}${reviewingStatus}
   Builtin axes: Task(subagent_type="{axis_id}-reviewer", mode="acceptEdits", prompt="...")
   Custom axes: Task(subagent_type="general-purpose", mode="acceptEdits", prompt="...include agent_prompt_hint from config.json...")
2. Output results to .sprint-loop/sprints/sprint-${sprint}/reviews/{axis_id}-attempt-{M}.json
3. Add each completed axis ID to state's completed_review_axes
4. **After all reviewers complete, launch aggregator**:
   Task(subagent_type="review-aggregator", mode="acceptEdits", prompt="...")
5. Orchestrator reads **only** summary-attempt-{M}.json (do not read individual reviews)
6. All PASS -> set sub-phase to "completed" -> update state
7. Any FAIL -> return to "implementing" with feedback`;
}

function buildContinuationMessage(state, config) {
  const sprint = String(state.current_sprint || 1).padStart(3, '0');
  const iteration = state.total_iterations || 0;
  const max = state.max_total_iterations || 100;
  const subphase = state.current_subphase || 'implementing';
  const dodRetries = state.dod_retry_count || 0;
  const maxDodRetries = state.max_dod_retries || 5;

  const sprintNum = state.current_sprint || 1;
  const reviewingSection = buildReviewingInstructions(sprint, config, sprintNum, state);

  // Ping throttle: only include ping instructions when enough time has elapsed
  const pingInterval = (config && config.ping_interval_seconds) || 60;
  const lastPingAt = state.last_ping_at ? new Date(state.last_ping_at).getTime() : 0;
  const now = Date.now();
  const pingDue = (now - lastPingAt) >= pingInterval * 1000;

  const remainingSeconds = pingDue ? 0 : Math.ceil((pingInterval * 1000 - (now - lastPingAt)) / 1000);

  const message = `[SPRINT-LOOP Iteration ${iteration}/${max} | Sub-phase: ${subphase} | DoD retries: ${dodRetries}/${maxDodRetries}]

You are the sprint-loop **orchestrator**. Do NOT write code yourself — delegate everything via Task().

## Current State
Read the current state file and determine the next action:
  Read: .sprint-loop/state/sprint-loop-state.json

## Current Sprint Info
  Read: .sprint-loop/sprints/sprint-${sprint}/spec.md
  Read: .sprint-loop/sprints/sprint-${sprint}/design.md
  Read: .sprint-loop/sprints/sprint-${sprint}/dod.md

## Execution Log
  Read: .sprint-loop/sprints/sprint-${sprint}/execution-log.md

## Current Sub-phase: ${subphase}

### Actions by Sub-phase:

**implementing (in progress)**:
1. Launch implementor via Task(subagent_type="general-purpose", mode="acceptEdits", prompt="{spec + design}")
2. When Task() returns, update sub-phase to "reviewing"

${reviewingSection}

**planning (generating plan — rolling mode only)**:
1. Launch planner via Task(subagent_type="general-purpose", mode="acceptEdits")
2. Generate detailed plans (spec.md / design.md / dod.md) for the next batch of sprints
3. After completion, read planning-result.md and update state.planned_through_sprint
4. Transition to implementing sub-phase

**completed (sprint done)**:
1. Write sprint completion summary to result.md
2. Transition to the next sprint (current_sprint++)
3. If all sprints done, set phase to "all_complete" and remove the CLAUDE.md marker (delete the <!-- SPRINT-LOOP:START/END --> block)
4. If resume_mode is true, set next sprint's current_subphase to "reviewing" (DoD-first)

## About resume_mode (DoD-first)
${state.resume_mode ? `
**resume_mode is active.** Start each sprint from reviewing (DoD evaluation).
- All DoD PASS -> skip implementation, next sprint also starts from reviewing
- Any DoD FAIL -> switch to implementing for normal implementation cycle
- When all sprints complete -> set resume_mode: false
` : '(Normal mode — start from implementing)'}

## Important Rules
- Always read persistent files before making decisions
- Always write execution results to persistent files
- Update state file (sprint-loop-state.json) at each step
- Use Task() for all agent delegation — no TeamCreate needed`;

  return { message, pingDue };
}

/**
 * Determine the phase-based decision.
 * Only "executing" phase blocks the stop.
 */
function getPhaseDecision(state) {
  const phase = state.phase || '';

  switch (phase) {
    case 'planning':
    case 'planned':
      // Interactive phases — user controls flow
      return { allow: true, reason: 'interactive_phase' };

    case 'executing':
      // Active execution — block and continue
      return { allow: false };

    case 'fixing':
    case 'replanning':
    case 'replanned':
      // Interactive/waiting phases — user controls flow
      return { allow: true, reason: 'interactive_phase' };

    case 'all_complete':
    case 'failed':
      // Terminal states — allow stop
      return { allow: true, reason: 'terminal_phase' };

    default:
      // Unknown phase — fail safe
      return { allow: true, reason: 'unknown_phase' };
  }
}

async function main() {
  try {
    const data = await readStdinJson();
    const projectDir = data.cwd || data.directory || process.cwd();
    const sessionId = data.session_id || data.sessionId || '';
    const stopReason = data.stop_hook_reason || data.reason || '';

    const state = readState(projectDir);

    // Run safety checks first (highest priority)
    const config = readConfig(projectDir);
    const safetyResult = runSafetyChecks({ state, sessionId, stopReason, config });

    if (safetyResult.allow) {
      // If safety check says to mark as failed, update state
      if (safetyResult.failState && state && state.active) {
        updateState(projectDir, {
          active: false,
          phase: 'failed',
          failure_reason: `Safety limit: ${safetyResult.reason}`,
          completed_at: new Date().toISOString(),
        });
      }
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Phase-based decision
    const phaseResult = getPhaseDecision(state);

    if (phaseResult.allow) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Block the stop — build continuation message, throttle idle cycles, protect iteration counter
    const displayIterations = (state.total_iterations || 0) + 1;
    const { message, pingDue } = buildContinuationMessage({
      ...state,
      total_iterations: displayIterations,
    }, config);

    // Throttle idle cycles: sleep when ping is not due to slow down the loop
    if (!pingDue) {
      const HOOK_TIMEOUT = 90; // Must match hooks.json timeout
      const MAX_SLEEP = HOOK_TIMEOUT - 10; // Leave buffer for post-sleep processing
      const sleepSeconds = Math.min((config && config.throttle_sleep_seconds) || 60, MAX_SLEEP);
      await new Promise(resolve => setTimeout(resolve, sleepSeconds * 1000));
    }

    // Only increment total_iterations on ping-eligible cycles
    const stateUpdates = { last_checked_at: new Date().toISOString() };
    if (pingDue) {
      stateUpdates.total_iterations = displayIterations;
      stateUpdates.last_ping_at = new Date().toISOString();
    }
    updateState(projectDir, stateUpdates);

    console.log(JSON.stringify({
      decision: 'block',
      reason: message,
    }));

  } catch (err) {
    // On any error, fail safe — allow stop
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
