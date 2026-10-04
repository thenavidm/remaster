// @ts-check
import fs from 'node:fs';
import { paths, readJson, writeJson } from './fsx.mjs';

export const MODES = /** @type {const} */ (['app', 'site', 'feature', 'migrate']);
export const STAGES = /** @type {const} */ (['research', 'design', 'build', 'launch']);

/** What each mode is, in the words `status` prints. */
export const MODE_TEXT = {
  app: 'Clone an app: its features and flows, rebuilt clean, better and yours',
  site: 'Clone a site or page: its structure, motion and feel, with your words and brand',
  feature: 'Clone one feature into an app you already have, in that app\'s own design',
  migrate: 'Move a site you own to a new stack: same pages, same words, nothing lost',
};

/**
 * @typedef {{ passed: boolean, at: string, checks: { name: string, status: 'pass' | 'fail' | 'skip', detail: string }[] }} GateResult
 * @typedef {{
 *   version: number,
 *   target: { url: string, name: string },
 *   mode: typeof MODES[number],
 *   owner: boolean,
 *   created: string,
 *   stage: typeof STAGES[number],
 *   gates: Partial<Record<typeof STAGES[number], GateResult>>,
 *   decisions: { at: string, what: string }[],
 * }} State
 */

/**
 * @param {string} root
 * @returns {State | null}
 */
export function loadState(root) {
  const p = paths(root).state;
  return fs.existsSync(p) ? readJson(p) : null;
}

/** @param {string} root @param {State} state */
export function saveState(root, state) {
  writeJson(paths(root).state, state);
}

/**
 * @param {string} url
 * @param {string} name
 * @param {typeof MODES[number]} mode
 * @param {boolean} owner
 * @returns {State}
 */
export function newState(url, name, mode, owner) {
  return {
    version: 1,
    target: { url, name },
    mode,
    owner,
    created: new Date().toISOString(),
    stage: 'research',
    gates: {},
    decisions: [],
  };
}
