'use strict';

/**
 * Read stdin as a string with timeout protection.
 * Event-based approach to avoid hangs on Linux/Windows.
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<string>}
 */
async function readStdin(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        process.stdin.removeAllListeners();
        process.stdin.destroy();
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    }, timeoutMs);

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });

    process.stdin.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve('');
      }
    });

    if (process.stdin.readableEnded) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    }
  });
}

/**
 * Read and parse stdin as JSON, with fallback to empty object.
 * @param {number} timeoutMs
 * @returns {Promise<object>}
 */
async function readStdinJson(timeoutMs = 5000) {
  const raw = await readStdin(timeoutMs);
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = { readStdin, readStdinJson };
