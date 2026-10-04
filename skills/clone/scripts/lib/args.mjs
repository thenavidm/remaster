// @ts-check

/**
 * Parse argv into positionals and flags. A flag takes the next word as its
 * value unless it is listed as boolean, so `--json` never swallows a path.
 * @param {string[]} argv
 * @param {string[]} [booleans]
 * @returns {{ flags: Record<string, string | boolean>, positionals: string[] }}
 */
export function parseArgs(argv, booleans = []) {
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  const positionals = [];
  const bool = new Set(booleans);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (eq !== -1) {
        flags[key] = a.slice(eq + 1);
        continue;
      }
      if (bool.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
        continue;
      }
      flags[key] = next;
      i++;
      continue;
    }
    if (a === '-h') {
      flags.help = true;
      continue;
    }
    positionals.push(a);
  }
  return { flags, positionals };
}

/**
 * A comma-separated flag as a trimmed list.
 * @param {string | boolean | undefined} value
 * @param {string[]} [fallback]
 */
export function list(value, fallback = []) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A numeric flag, or the fallback when it is missing or not a number.
 * @param {string | boolean | undefined} value
 * @param {number} fallback
 */
export function num(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A string flag, or the fallback.
 * @param {string | boolean | undefined} value
 * @param {string} fallback
 */
export function str(value, fallback) {
  return typeof value === 'string' && value !== '' ? value : fallback;
}
