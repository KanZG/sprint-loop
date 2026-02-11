'use strict';

const STALENESS_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_MAX_DOD_RETRIES = 5;

/**
 * Check if the stop reason indicates a context limit.
 * Must always allow to prevent deadlock (compaction blocked).
 * @param {string} stopReason
 * @returns {boolean}
 */
function isContextLimitStop(stopReason) {
  if (!stopReason) return false;
  const lower = stopReason.toLowerCase();
  return lower.includes('context') || lower.includes('compact');
}

/**
 * Check if the stop reason indicates user abort (Ctrl+C).
 * @param {string} stopReason
 * @returns {boolean}
 */
function isUserAbort(stopReason) {
  if (!stopReason) return false;
  const lower = stopReason.toLowerCase();
  return lower.includes('user') || lower.includes('abort') || lower.includes('cancel');
}

/**
 * Check if the state is stale (last update > threshold).
 * @param {object} state
 * @returns {boolean}
 */
function isStale(state) {
  const lastChecked = state.last_checked_at || state.started_at;
  if (!lastChecked) return true;

  const elapsed = Date.now() - new Date(lastChecked).getTime();
  return elapsed > STALENESS_THRESHOLD_MS;
}

/**
 * Check if the session ID matches.
 * @param {object} state
 * @param {string} currentSessionId
 * @returns {boolean}
 */
function isSessionMatch(state, currentSessionId) {
  if (!state.session_id) return true; // no session lock
  if (!currentSessionId) return false; // state has lock but we have no ID
  return state.session_id === currentSessionId;
}

/**
 * Check if total iterations exceeded max.
 * @param {object} state
 * @returns {boolean}
 */
function isMaxIterationsReached(state) {
  const max = state.max_total_iterations || DEFAULT_MAX_ITERATIONS;
  return (state.total_iterations || 0) >= max;
}

/**
 * Check if DoD retry limit exceeded for current sprint.
 * @param {object} state
 * @returns {boolean}
 */
function isMaxDodRetriesReached(state) {
  const max = state.max_dod_retries || DEFAULT_MAX_DOD_RETRIES;
  return (state.dod_retry_count || 0) >= max;
}

/**
 * Run all safety checks in priority order.
 * Returns { allow: true, reason: string } if stop should be allowed.
 * Returns { allow: false } if loop should continue.
 *
 * @param {object} params
 * @param {object|null} params.state
 * @param {string} params.sessionId
 * @param {string} params.stopReason
 * @returns {{ allow: boolean, reason?: string, failState?: string }}
 */
function runSafetyChecks({ state, sessionId, stopReason }) {
  // 1. Context limit — always allow (prevent deadlock)
  if (isContextLimitStop(stopReason)) {
    return { allow: true, reason: 'context_limit' };
  }

  // 2. User abort — always respect
  if (isUserAbort(stopReason)) {
    return { allow: true, reason: 'user_abort' };
  }

  // 3. No state file — no loop active
  if (!state) {
    return { allow: true, reason: 'no_state' };
  }

  // 4. Not active
  if (state.active !== true) {
    return { allow: true, reason: 'not_active' };
  }

  // 5. Session mismatch — cross-session protection
  if (!isSessionMatch(state, sessionId)) {
    return { allow: true, reason: 'session_mismatch' };
  }

  // 6. Staleness — stale lock protection
  if (isStale(state)) {
    return { allow: true, reason: 'stale' };
  }

  // 7. Max total iterations
  if (isMaxIterationsReached(state)) {
    return { allow: true, reason: 'max_iterations', failState: 'failed' };
  }

  // 8. Max DoD retries for current sprint
  if (isMaxDodRetriesReached(state)) {
    return { allow: true, reason: 'max_dod_retries', failState: 'failed' };
  }

  // All safety checks passed — loop may continue
  return { allow: false };
}

module.exports = {
  isContextLimitStop,
  isUserAbort,
  isStale,
  isSessionMatch,
  isMaxIterationsReached,
  isMaxDodRetriesReached,
  runSafetyChecks,
  STALENESS_THRESHOLD_MS,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MAX_DOD_RETRIES,
};
