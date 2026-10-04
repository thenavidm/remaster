// @ts-check
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from '../lib/csv.mjs';
import { exists, filesIn, measurements, paths, projectRoot, readJson } from '../lib/fsx.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { STAGES, loadState, saveState } from '../lib/state.mjs';
import { checkCopy, itemsOf } from './copy.mjs';
import { lintDesign } from './design.mjs';
import { lintListing } from './listing.mjs';
import { verify as verifyPains } from './pains.mjs';
import { score as parityScore } from './parity.mjs';

export const help = `remaster gate [research|design|build|launch] [--json]

Run a stage's checks for this project's mode and record the result in
state.json. With no stage it runs the current one. A stage is done when its
gate passes; skipped checks are listed as skipped, never counted as passes.
A passing gate moves the project to the next stage.

  research  sources, reviews and verified pains, the verdict, the recon map, the feature matrix
  design    the original measured, your design linted, DESIGN.md written
  build     the clone measured and compared, critic verdicts, copy, sweep, parity, open bugs
  launch    brand checks run, better than the original, launch copy, listing, a clean sweep`;

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'remaster.mjs');

/** The bars, per mode. Site mode is about look and structure; app mode about jobs done. */
export const BARS = {
  structure: { app: 60, site: 80, feature: 0, migrate: 90 },
  critic: { app: 28, site: 30, feature: 28, migrate: 0 },
  pixel: 95,
  reviews: 30,
};

/**
 * @typedef {{ name: string, status: 'pass' | 'fail' | 'skip', detail: string, fix?: string }} Check
 */

/**
 * @param {string} stage
 * @param {string} root
 * @param {import('../lib/state.mjs').State} state
 * @returns {Check[]}
 */
export function runChecks(stage, root, state) {
  const p = paths(root);
  const mode = state.mode;
  /** @type {Check[]} */
  const out = [];
  const pass = (/** @type {string} */ name, /** @type {string} */ detail) => out.push({ name, status: 'pass', detail });
  const no = (/** @type {string} */ name, /** @type {string} */ detail, /** @type {string} */ fix) => out.push({ name, status: 'fail', detail, fix });
  const skip = (/** @type {string} */ name, /** @type {string} */ detail) => out.push({ name, status: 'skip', detail });
  const isApp = mode === 'app';
  const usesReviews = mode === 'app' || mode === 'feature';
  const csvRows = (/** @type {string} */ f) => (exists(f) ? readCsv(f).records : []);
  const filled = (/** @type {string} */ f) => exists(f) && !fs.readFileSync(f, 'utf8').includes('{{');

  if (stage === 'research') {
    const sources = csvRows(p.sources);
    sources.length >= 3 ? pass('sources', `${sources.length} sources logged`) : no('sources', `${sources.length} sources logged`, 'Read the public sources first: remaster crawl <help center>, remaster store lookup, remaster measure <pages>.');
    if (usesReviews) {
      const reviews = csvRows(p.reviews).filter((r) => r.url && r.text);
      reviews.length >= BARS.reviews
        ? pass('reviews', `${reviews.length} reviews with links${reviews.length < 100 ? ' (under 100: say the sample is small)' : ''}`)
        : no('reviews', `${reviews.length} reviews with links`, `Collect at least ${BARS.reviews}: remaster store reviews <id>, remaster hn "<name>", and review sites copied by hand with links.`);
      if (!exists(p.analysis)) no('pains', 'no analysis.json', 'Read the reviews, group them into themes with verbatim quotes (remaster pains --help shows the format), then run remaster pains.');
      else {
        const v = verifyPains(csvRows(p.reviews), readJson(p.analysis));
        v.errors.length
          ? no('pains', `${v.errors.length} quote or row problem(s)`, 'Run remaster pains and fix each one.')
          : v.themes.length < 3
            ? no('pains', `${v.themes.length} theme(s)`, 'Find at least 3 themes, or say plainly that the evidence is thin.')
            : pass('pains', `${v.themes.length} themes, every quote word for word`);
      }
      const verdict = exists(p.verdict) ? fs.readFileSync(p.verdict, 'utf8') : '';
      /^Decision:\s*(go|no-go|go, rescoped)\b/im.test(verdict) && !verdict.includes('{{')
        ? pass('verdict', verdict.match(/^Decision:\s*(.+)$/im)?.[1] ?? '')
        : no('verdict', 'not written', 'Fill research/verdict.md from pains.md and recon.md, and get the user\'s go or no-go.');
    } else skip('reviews', `${mode} mode`);
    if (mode !== 'feature') {
      measurements(p.measureOriginal).length ? pass('measured', `${measurements(p.measureOriginal).length} measurement(s) of the original`) : no('measured', 'nothing measured', 'remaster measure <url> for each key page.');
    }
    filled(p.recon) ? pass('recon', 'recon.md filled in') : no('recon', exists(p.recon) ? 'template placeholders left' : 'missing', 'Fill research/recon.md: screens, flows, components, data model, what can\'t be cloned, size.');
    if (usesReviews) {
      const rows = csvRows(p.features);
      const s = parityScore(rows);
      const unsourced = rows.filter((r) => !r.source);
      if (rows.length < 5) no('features', `${rows.length} rows`, 'Write the feature matrix: every feature, its priority, and the source that shows it.');
      else if (s.problems.length) no('features', s.problems[0], 'Fix the rows remaster parity complains about.');
      else if (unsourced.length) no('features', `${unsourced.length} row(s) without a source`, 'Every feature names where it was seen.');
      else if (!s.musts.total) no('features', 'no must-haves', 'Mark the core loop\'s features as must.');
      else pass('features', `${rows.length} features, ${s.musts.total} must-haves`);
    } else skip('features', `${mode} mode`);
  }

  if (stage === 'design') {
    if (mode === 'migrate') {
      skip('design', 'migrate keeps the original\'s design');
      return out;
    }
    if (mode !== 'feature') exists(p.measured) ? pass('measured-system', 'design/measured.json') : no('measured-system', 'missing', 'remaster tokens');
    const hostDesign = mode === 'feature' && exists(p.designMd) && !fs.readFileSync(p.designMd, 'utf8').includes('written by remaster design');
    if (hostDesign) pass('design', 'uses the host app\'s DESIGN.md');
    else if (!exists(p.designJson)) no('design', 'no design/design.json', 'Pick a direction with the user, write design/design.json from the template, run remaster design.');
    else {
      const errors = lintDesign(readJson(p.designJson), exists(p.measured) ? readJson(p.measured) : null, exists(p.brand) ? readJson(p.brand).colors ?? [] : []).filter((f) => f.level === 'error');
      errors.length ? no('design', `${errors.length} error(s): ${errors[0].message}`, 'remaster design, then fix design.json.') : pass('design', 'every check passed');
      exists(p.designMd) || exists(path.join(p.design, 'DESIGN.md')) ? pass('design-md', 'DESIGN.md written') : no('design-md', 'missing', 'remaster design');
    }
  }

  if (stage === 'build') {
    const clones = measurements(p.measureClone);
    clones.length ? pass('clone-measured', `${clones.length} measurement(s) of the clone`) : no('clone-measured', 'nothing measured', 'remaster measure <local url> --as clone --name <same name as the original page>.');
    const bar = BARS.structure[mode];
    const diffs = filesIn(p.diffs, ['.json']).map((f) => readJson(f));
    if (bar) {
      if (!diffs.length) no('structure', 'no diffs', 'remaster diff research/measure/<page>@<w>.json verify/measure/<page>@<w>.json for each key page.');
      else {
        const low = diffs.filter((d) => d.structure.score < bar);
        low.length ? no('structure', `${low.length} page(s) under ${bar}: ${low.map((d) => `${path.basename(d.clone)} ${d.structure.score}`).join(', ')}`, 'Build what the diff lists as missing, then measure and diff again.') : pass('structure', `${diffs.length} page(s) at ${bar} or more`);
      }
    } else skip('structure', 'a feature adopts the host app\'s layout');
    if (mode === 'migrate') {
      const v = diffs.filter((d) => d.visual);
      const low = v.filter((d) => d.visual.mode !== 'pixel' || d.visual.score < Math.min(BARS.pixel, (d.visual.calibrated ?? 100) - 2));
      !v.length ? no('pixels', 'no pixel diffs', 'remaster diff ... --pixel for each page (with --calibrate for pages that move).') : low.length ? no('pixels', `${low.length} page(s) under the bar`, 'Fix the regions the heatmap marks.') : pass('pixels', `${v.length} page(s) match`);
      if (!exists(p.urls)) no('urls', 'not checked', 'remaster urls <old sitemap> --new <new site>');
      else {
        const r = readJson(p.urls).results ?? [];
        const bad = r.filter((/** @type {any} */ x) => !x.ok);
        bad.length ? no('urls', `${bad.length} of ${r.length} old URLs fail`, 'Add the pages or 301 redirects, then run remaster urls again.') : pass('urls', `${r.length} old URLs all work`);
      }
    } else {
      const critic = exists(p.critic) ? readJson(p.critic).screens ?? [] : [];
      const cbar = BARS.critic[mode];
      const failing = critic.filter((/** @type {any} */ s) => s.hardRejects?.length || (s.total ?? 0) < cbar || Object.values(s.scores ?? {}).some((v) => Number(v) < 3));
      !critic.length ? no('critic', 'no verdicts', 'Run the design critic on every key screen at 390 and 1440 (references/critic.md) and save the verdicts to verify/critic.json.') : failing.length ? no('critic', `${failing.length} of ${critic.length} screen(s) don't pass`, 'Apply each fix the critic gave, then review again.') : pass('critic', `${critic.length} screen(s) at ${cbar} or more, no hard rejects`);
      const brand = exists(p.brand) ? readJson(p.brand) : {};
      const proof = exists(p.proof) ? readJson(p.proof).claims ?? [] : [];
      let errs = 0;
      let warns = 0;
      for (const f of clones) {
        const found = checkCopy(itemsOf(f), { avoid: brand.avoid ?? [], proof });
        errs += found.filter((x) => x.level === 'error').length;
        warns = Math.max(warns, found.filter((x) => x.level === 'warning').length);
      }
      if (!clones.length) skip('copy', 'nothing measured yet');
      else errs || warns > 3 ? no('copy', `${errs} error(s), up to ${warns} warning(s) on a page`, 'remaster copy verify/measure/*.json and rewrite what it flags.') : pass('copy', 'no errors, 3 warnings or fewer a page');
      const sw = spawnSync(process.execPath, [CLI, 'sweep', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      try {
        const j = JSON.parse(sw.stdout);
        const n = j.hits.filter((/** @type {any} */ h) => h.level === 'error').length;
        n ? no('sweep', `${n} thing(s) of the original's left`, 'remaster sweep and remove each one.') : pass('sweep', 'clean');
      } catch {
        no('sweep', (sw.stderr || 'did not run').trim().split('\n')[0], 'Fill brand.json, then remaster sweep.');
      }
    }
    if (mode === 'app' || mode === 'feature') {
      const s = parityScore(csvRows(p.features), exists(p.beat) ? readJson(p.beat) : null);
      s.verdict === 'not shippable' ? no('parity', `${s.why} (parity ${s.parity}%)`, 'remaster parity lists what is missing in build order.') : pass('parity', `${s.verdict}, parity ${s.parity}%`);
    }
    const open = csvRows(p.bugs).filter((b) => /^s[12]$/i.test(b.severity ?? '') && !/^(fixed|closed|done|wontfix)$/i.test(b.status ?? ''));
    open.length ? no('bugs', `${open.length} open S1/S2 bug(s)`, 'Fix S1 and S2 bugs first: failing test, fix, passing test.') : pass('bugs', 'no open S1 or S2');
  }

  if (stage === 'launch') {
    const brand = exists(p.brand) ? readJson(p.brand) : {};
    if (mode === 'feature' || mode === 'migrate') skip('brand', `${mode} mode keeps the existing brand`);
    else if (!brand.name) no('brand', 'no name in brand.json', 'Name it with the user (references/brand.md), then record it.');
    else if (!(brand.checks ?? []).some((/** @type {any} */ c) => c && c.date)) no('brand', 'no checks recorded', 'Run remaster domain, search the stores and trademark databases, and record each check with its date in brand.json "checks".');
    else pass('brand', `${brand.name}, ${(brand.checks ?? []).length} check(s) recorded`);
    if (isApp) {
      const s = parityScore(csvRows(p.features), exists(p.beat) ? readJson(p.beat) : null);
      s.verdict === 'better than the original' ? pass('better', s.why) : no('better', s.why, 'Build the fixes from research and measure the beat metrics (references/verify.md). A straight copy has no reason to launch.');
    }
    // Only the pages a reader sees: pricing notes and the deploy log name the
    // original on purpose and are never published.
    const launchDocs = filesIn(p.launch, ['.md']).filter((f) => /^landing/i.test(path.basename(f)));
    if (launchDocs.length && mode !== 'migrate') {
      const proof = exists(p.proof) ? readJson(p.proof).claims ?? [] : [];
      const found = launchDocs.flatMap((f) => checkCopy(itemsOf(f), { avoid: brand.avoid ?? [], proof }));
      const e = found.filter((x) => x.level === 'error').length;
      const w = found.filter((x) => x.level === 'warning').length;
      e || w > 3 ? no('launch-copy', `${e} error(s), ${w} warning(s)`, 'remaster copy remaster/launch/*.md') : pass('launch-copy', `${launchDocs.length} file(s) clean`);
    } else skip('launch-copy', 'no landing*.md in remaster/launch');
    if (exists(p.listing) && readJson(p.listing)?.appStore?.name) {
      const errs = lintListing(readJson(p.listing), brand.avoid ?? []).filter((f) => f.level === 'error');
      errs.length ? no('listing', `${errs.length} error(s)`, 'remaster listing') : pass('listing', 'within limits, no copycat names');
    } else skip('listing', 'no store listing');
    if (mode !== 'migrate') {
      const sw = spawnSync(process.execPath, [CLI, 'sweep', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      try {
        const n = JSON.parse(sw.stdout).hits.filter((/** @type {any} */ h) => h.level === 'error').length;
        n ? no('sweep', `${n} thing(s) of the original's left`, 'remaster sweep') : pass('sweep', 'clean');
      } catch {
        no('sweep', 'did not run', 'remaster sweep');
      }
    }
  }
  return out;
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const state = loadState(root);
  if (!state) fail('No Remaster project here. Start one with `remaster init <url> --mode app|site|feature|migrate`.');
  const stage = /** @type {typeof STAGES[number]} */ (positionals[0] ?? state.stage);
  if (!STAGES.includes(stage)) fail(`Unknown stage "${stage}". One of: ${STAGES.join(', ')}.`);
  const checks = runChecks(stage, root, state);
  const passed = checks.every((c) => c.status !== 'fail');
  state.gates[stage] = { passed, at: new Date().toISOString(), checks: checks.map(({ name, status, detail }) => ({ name, status, detail })) };
  if (passed && state.stage === stage) {
    const next = STAGES[STAGES.indexOf(stage) + 1];
    if (next) state.stage = next;
  }
  saveState(root, state);
  if (flags.json) {
    say(JSON.stringify({ stage, passed, checks }, null, 2));
    return passed ? 0 : 1;
  }
  say(table(['check', 'status', 'detail'], checks.map((c) => [c.name, c.status, c.detail])));
  const failing = checks.filter((c) => c.status === 'fail');
  if (passed) say(`\nThe ${stage} gate passed.${state.stage !== stage ? ` Next stage: ${state.stage}.` : ''}`);
  else {
    say(`\nThe ${stage} gate did not pass. To do:`);
    for (const c of failing) say(`  ${c.name}: ${c.fix}`);
  }
  return passed ? 0 : 1;
}
