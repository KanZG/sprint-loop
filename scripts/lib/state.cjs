'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = '.sprint-loop/state';
const STATE_FILE = 'sprint-loop-state.json';

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Resolve the state file path for a given project directory.
 * @param {string} projectDir
 * @returns {string}
 */
function getStatePath(projectDir) {
  return path.join(projectDir, STATE_DIR, STATE_FILE);
}

/**
 * Resolve the sprints directory path.
 * @param {string} projectDir
 * @param {number|string} [sprintNum]
 * @returns {string}
 */
function getSprintDir(projectDir, sprintNum) {
  const base = path.join(projectDir, '.sprint-loop', 'sprints');
  if (sprintNum != null) {
    const padded = String(sprintNum).padStart(3, '0');
    return path.join(base, `sprint-${padded}`);
  }
  return base;
}

/**
 * Read and parse the state file. Returns null if not found or invalid.
 * @param {string} projectDir
 * @returns {object|null}
 */
function readState(projectDir) {
  const filePath = getStatePath(projectDir);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const state = JSON.parse(content);
    if (state.schema_version && state.schema_version > CURRENT_SCHEMA_VERSION) {
      process.stderr.write(`Warning: state schema version ${state.schema_version} > supported ${CURRENT_SCHEMA_VERSION}\n`);
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Write state to the state file. Creates directories as needed.
 * @param {string} projectDir
 * @param {object} state
 */
function writeState(projectDir, state) {
  const filePath = getStatePath(projectDir);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  state.last_checked_at = new Date().toISOString();

  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Update specific fields in the state file (merge).
 * @param {string} projectDir
 * @param {object} updates
 * @returns {object} The updated state
 */
function updateState(projectDir, updates) {
  const current = readState(projectDir) || {};
  const merged = { ...current, ...updates };
  writeState(projectDir, merged);
  return merged;
}

/**
 * Read the config file.
 * @param {string} projectDir
 * @returns {object|null}
 */
function readConfig(projectDir) {
  const filePath = path.join(projectDir, '.sprint-loop', 'config.json');
  try {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (config.schema_version && config.schema_version > CURRENT_SCHEMA_VERSION) {
      process.stderr.write(`Warning: config schema version ${config.schema_version} > supported ${CURRENT_SCHEMA_VERSION}\n`);
    }
    return config;
  } catch {
    return null;
  }
}

/**
 * Read a sprint-specific file.
 * @param {string} projectDir
 * @param {number} sprintNum
 * @param {string} filename - e.g. 'spec.md', 'dod.md', 'design.md'
 * @returns {string|null}
 */
function readSprintFile(projectDir, sprintNum, filename) {
  const filePath = path.join(getSprintDir(projectDir, sprintNum), filename);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

module.exports = {
  getStatePath,
  getSprintDir,
  readState,
  writeState,
  updateState,
  readConfig,
  readSprintFile,
  STATE_DIR,
  STATE_FILE,
  CURRENT_SCHEMA_VERSION,
};
