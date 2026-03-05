'use strict';

const VALID_CAPTURE_STRATEGIES = ['file', 'browser', 'command'];

const STRATEGY_REQUIRED_FIELDS = {
  file: ['output_pattern'],
  browser: ['url'],
  command: ['command', 'output_path'],
};

/**
 * Validate config.json schema for sprint-loop.
 * Pure function — no side effects, no file I/O.
 *
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config is null or not an object'], warnings };
  }

  // Non-standard field detection (migration hints)
  if (config.visual && typeof config.visual === 'object') {
    warnings.push(
      'Top-level "visual" object found. Expected: visual axis in "review_axes" array with "capture" sub-object. ' +
      'Move visual settings into review_axes: [{ id: "visual", builtin: true, capture: { ... } }]'
    );
  }

  if (config.dod && typeof config.dod === 'object') {
    warnings.push(
      'Top-level "dod" object found. This is non-standard. ' +
      'DoD axes should be defined in "review_axes" array, not under "dod".'
    );
  }

  // review_axes must be an array
  if (!Array.isArray(config.review_axes)) {
    errors.push(
      'review_axes is missing or not an array. ' +
      'Expected: review_axes: [{ id: "test", name: "Test", builtin: true }, ...]'
    );
    return { valid: errors.length === 0, errors, warnings };
  }

  // Validate each axis entry
  for (let i = 0; i < config.review_axes.length; i++) {
    const axis = config.review_axes[i];
    const prefix = `review_axes[${i}]`;

    if (!axis || typeof axis !== 'object') {
      errors.push(`${prefix}: not an object`);
      continue;
    }

    if (!axis.id) {
      errors.push(`${prefix}: missing "id" field`);
    }
    if (!axis.name) {
      errors.push(`${prefix}: missing "name" field`);
    }
    if (typeof axis.builtin === 'undefined') {
      errors.push(`${prefix}: missing "builtin" field`);
    }

    // Visual axis specific validation
    if (axis.id === 'visual' && axis.builtin === true) {
      if (!axis.capture || typeof axis.capture !== 'object') {
        errors.push(
          `review_axes[visual].capture is missing. ` +
          'Visual reviewer cannot capture screenshots without capture configuration. ' +
          'Expected: capture: { strategy: "file"|"browser"|"command", ... }'
        );
        continue;
      }

      const strategy = axis.capture.strategy;
      if (!strategy || !VALID_CAPTURE_STRATEGIES.includes(strategy)) {
        errors.push(
          `review_axes[visual].capture.strategy is invalid: "${strategy}". ` +
          `Must be one of: ${VALID_CAPTURE_STRATEGIES.join(', ')}`
        );
        continue;
      }

      // Strategy-specific required fields
      const requiredFields = STRATEGY_REQUIRED_FIELDS[strategy] || [];
      for (const field of requiredFields) {
        if (!axis.capture[field]) {
          errors.push(
            `review_axes[visual].capture.${field} is missing (required for strategy "${strategy}")`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateConfig };
