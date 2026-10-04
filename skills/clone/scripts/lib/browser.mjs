// @ts-check
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** The browser snippet: the same file runs under Playwright here and in any agent's browser tool. */
export const SNIPPET = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'browser', 'measure.js');

export const NO_PLAYWRIGHT = `Playwright isn't installed where this project can find it.

Install it in the project you're working in:
  npm i -D playwright && npx playwright install chromium

Or measure with your agent's own browser tool: open the page, run the script in
  ${SNIPPET}
and save what it returns as JSON next to the other measurements.`;

/**
 * Find Playwright from the user's project first, then the global install.
 * The scripts ship with no dependencies, so they borrow the one the project
 * already has instead of bundling a 100MB browser.
 * @returns {Promise<any>}
 */
export async function loadPlaywright() {
  const roots = [process.cwd()];
  const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
  if (g.status === 0 && g.stdout.trim()) roots.push(path.dirname(g.stdout.trim()));
  for (const name of ['playwright', 'playwright-core']) {
    for (const root of roots) {
      try {
        const req = createRequire(path.join(root, 'noop.js'));
        const resolved = req.resolve(name, { paths: [root, path.join(root, 'lib')] });
        const mod = await import(pathToFileURL(resolved).href);
        return mod.default ?? mod;
      } catch {
        /* try the next place */
      }
    }
  }
  return null;
}

/**
 * Launch Chromium. Falls back to the installed Chrome when the Playwright
 * browser download is missing, which is the usual state of a fresh machine.
 * @param {any} pw
 * @param {{ headed?: boolean }} [opts]
 */
export async function launch(pw, opts = {}) {
  try {
    return await pw.chromium.launch({ headless: !opts.headed });
  } catch (first) {
    try {
      return await pw.chromium.launch({ headless: !opts.headed, channel: 'chrome' });
    } catch {
      throw first;
    }
  }
}
