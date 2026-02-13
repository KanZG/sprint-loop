'use strict';

const { readStdinJson } = require('./lib/stdin.cjs');
const { readState, readConfig } = require('./lib/state.cjs');

/**
 * Build context message for active sprint-loop sessions.
 * Injected at session start so Claude understands the current state.
 */
function buildRestorationContext(state, config) {
  const sprint = String(state.current_sprint || 1).padStart(3, '0');
  const phase = state.phase || 'unknown';
  const subphase = state.current_subphase || 'unknown';
  const iteration = state.total_iterations || 0;
  const max = state.max_total_iterations || 100;
  const dodRetries = state.dod_retry_count || 0;

  const lines = [];

  lines.push('<session-restore>');
  lines.push('[SPRINT-LOOP ACTIVE]');
  lines.push('');
  lines.push(`Phase: ${phase} | Sub-phase: ${subphase}`);
  lines.push(`Sprint: ${state.current_sprint}/${state.total_sprints}`);
  if (state.current_phase) {
    lines.push(`Phase: ${state.current_phase}`);
  }
  lines.push(`Strategy: ${(config && config.planning_strategy) || 'full'}`);
  lines.push(`Iteration: ${iteration}/${max} | DoD retries: ${dodRetries}/${state.max_dod_retries || 5}`);
  lines.push(`Started: ${state.started_at || 'unknown'}`);
  lines.push('');

  if (phase === 'executing') {
    lines.push('You are the sprint-loop **orchestrator**. Do NOT write code yourself.');
    lines.push('Read the following persistent files and resume work from the current state:');
    lines.push('');
    lines.push(`  Read: .sprint-loop/state/sprint-loop-state.json`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/spec.md`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/design.md`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/dod.md`);
    lines.push(`  Read: .sprint-loop/sprints/sprint-${sprint}/execution-log.md`);
    lines.push('');

    if (subphase === 'reviewing') {
      const completedAxes = state.completed_review_axes || [];
      const allAxes = (config && config.review_axes) || [];

      // Apply per-sprint overrides
      const overrides = (config && config.sprint_overrides && config.sprint_overrides[String(state.current_sprint)]) || {};
      const skipAxes = overrides.skip_axes || [];
      const effectiveAxes = allAxes.filter(a => !skipAxes.includes(a.id));

      const allAxisIds = effectiveAxes.map(a => a.id);
      const remainingAxes = allAxisIds.filter(id => !completedAxes.includes(id));

      lines.push(`### Review Status:`);
      lines.push(`Completed axes: [${completedAxes.join(', ')}]`);
      if (remainingAxes.length > 0) {
        lines.push(`Remaining axes: [${remainingAxes.join(', ')}]`);
        lines.push('Only launch review agents for remaining axes. Do not restart completed axes.');
      } else {
        lines.push('All review axes completed. Launch the aggregator to generate the summary.');
      }
      lines.push('');
    }

    if (subphase === 'planning') {
      lines.push('### Planning Status:');
      lines.push('Generating inline plans in rolling mode.');
      lines.push(`Planned through: Sprint ${state.planned_through_sprint || '?'}`);
      lines.push('Launch planner agent within the sprint team to generate the next batch of plans.');
      lines.push('');
    }

    lines.push('Delegate all work to child agents via AgentTeam (TeamCreate / Task).');
  } else if (phase === 'planned') {
    lines.push('Sprint planning is complete. Run `/sprint-start` to begin execution.');
  } else if (phase === 'all_complete') {
    lines.push('All sprints completed successfully.');
  } else if (phase === 'failed') {
    lines.push(`Execution failed: ${state.failure_reason || 'unknown reason'}`);
    lines.push('Run `/sprint-resume` to resume from the latest state.');
  } else if (phase === 'fixing') {
    lines.push('Sprint-Loop Fix mode. Fixing the current sprint.');
    lines.push(`Sub-phase before fix: ${state.previous_subphase || 'unknown'}`);
    lines.push('');
    lines.push('If fixing was interrupted, run `/sprint-resume` to resume.');
  } else if (phase === 'replanning') {
    lines.push('Sprint-Loop Replan mode. Replanning in progress.');
    lines.push('');
    lines.push('Run `/sprint-replan` to complete replanning.');
  } else if (phase === 'replanned') {
    lines.push('Sprint-Loop replanning is complete.');
    lines.push(`Total sprints: ${state.total_sprints || 0}`);
    if (state.resume_mode) {
      lines.push('');
      lines.push('DoD-first mode: Each sprint starts from DoD evaluation; PASS skips implementation.');
    }
    lines.push('');
    lines.push('Run `/sprint-resume` to start re-execution.');
  }

  lines.push('</session-restore>');

  return lines.join('\n');
}

/**
 * Build context for planned (but not yet started) state.
 */
function buildPlannedContext(state) {
  const lines = [];
  lines.push('<session-restore>');
  lines.push('[SPRINT-LOOP PLAN READY]');
  lines.push('');
  lines.push(`Planned sprints: ${state.total_sprints || 0}`);
  lines.push('Run `/sprint-start` to begin automated execution.');
  lines.push('Run `/sprint-status` to review the plan.');
  lines.push('</session-restore>');
  return lines.join('\n');
}

async function main() {
  try {
    const data = await readStdinJson();
    const projectDir = data.cwd || data.directory || process.cwd();

    const state = readState(projectDir);

    // No state file — nothing to restore
    if (!state) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const config = readConfig(projectDir);
    let context = '';

    if (state.active && state.phase === 'executing') {
      context = buildRestorationContext(state, config);
    } else if (state.phase === 'planned') {
      context = buildPlannedContext(state);
    } else if (state.phase === 'all_complete') {
      context = buildRestorationContext(state, config);
    } else if (state.phase === 'failed') {
      context = buildRestorationContext(state, config);
    } else if (state.phase === 'fixing') {
      context = buildRestorationContext(state, config);
    } else if (state.phase === 'replanning') {
      context = buildRestorationContext(state, config);
    } else if (state.phase === 'replanned') {
      context = buildRestorationContext(state, config);
    }

    if (context) {
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
        },
      }));
    } else {
      console.log(JSON.stringify({ continue: true }));
    }

  } catch (err) {
    // Fail safe — don't block session start
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
