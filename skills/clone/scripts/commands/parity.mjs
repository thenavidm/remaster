// @ts-check
import path from 'node:path';
import { exists, paths, projectRoot, readJson, rel } from '../lib/fsx.mjs';
import { readCsv } from '../lib/csv.mjs';
import { fail, mdTable, say, table } from '../lib/out.mjs';

export const help = `remaster parity [features.csv] [--beat beat.json] [--markdown] [--json]

Score the clone against the feature matrix (remaster/features.csv):

  id,feature,area,priority,original,clone,source,notes

priority is must, should or could (weights 3, 2, 1). clone is yes, partial
(half), no, or skip (left out on purpose, with a reason in notes: not
scored). A row with original "no" is something the original doesn't have,
usually a fix from the research; it's counted as a fix, never as parity.

Verdicts:
  not shippable          a must-have is missing
  shippable              every must-have done and parity 80 or more
  better than original   shippable, plus the planned fixes built (3, or all
                         of them when fewer are planned), and no measured
                         metric in remaster/verify/beat.json worse than the
                         original's

Exits 1 unless it is shippable.`;

const WEIGHT = /** @type {Record<string, number>} */ ({ must: 3, should: 2, could: 1 });
const DONE = /** @type {Record<string, number>} */ ({ yes: 1, partial: 0.5, no: 0 });

/**
 * @param {Record<string, string>[]} rows
 * @param {any} [beat]
 */
export function score(rows, beat) {
  const problems = [];
  const parityRows = [];
  const fixes = [];
  for (const r of rows) {
    const priority = (r.priority ?? '').toLowerCase();
    const clone = (r.clone ?? '').toLowerCase();
    const original = (r.original ?? 'yes').toLowerCase();
    if (!WEIGHT[priority]) problems.push(`line ${r.__line}: priority "${r.priority}" should be must, should or could`);
    if (!(clone in DONE) && clone !== 'skip') problems.push(`line ${r.__line}: clone "${r.clone}" should be yes, partial, no or skip`);
    if (clone === 'skip' && !r.notes) problems.push(`line ${r.__line}: "${r.feature}" is skipped without a reason in notes`);
    if (original === 'no') fixes.push(r);
    else if (clone !== 'skip') parityRows.push(r);
  }
  let total = 0;
  let got = 0;
  /** @type {Record<string, { total: number, got: number }>} */
  const areas = {};
  for (const r of parityRows) {
    const w = WEIGHT[(r.priority ?? '').toLowerCase()] ?? 1;
    const d = DONE[(r.clone ?? '').toLowerCase()] ?? 0;
    total += w;
    got += w * d;
    const a = (areas[r.area || 'general'] ??= { total: 0, got: 0 });
    a.total += w;
    a.got += w * d;
  }
  const musts = parityRows.filter((r) => r.priority?.toLowerCase() === 'must');
  const mustDone = musts.filter((r) => (r.clone ?? '').toLowerCase() === 'yes');
  const parity = total ? Math.round((got / total) * 1000) / 10 : 0;
  const order = { must: 0, should: 1, could: 2 };
  const missing = parityRows
    .filter((r) => (r.clone ?? '').toLowerCase() !== 'yes')
    .sort((a, b) => (order[/** @type {keyof typeof order} */ (a.priority?.toLowerCase())] ?? 3) - (order[/** @type {keyof typeof order} */ (b.priority?.toLowerCase())] ?? 3));
  const fixesBuilt = fixes.filter((r) => (r.clone ?? '').toLowerCase() === 'yes');
  const metrics = (beat?.metrics ?? []).map((/** @type {any} */ m) => {
    const lowerBetter = (m.better ?? 'lower') === 'lower';
    const o = Number(m.original);
    const c = Number(m.clone);
    const ok = Number.isFinite(o) && Number.isFinite(c);
    const delta = ok ? (lowerBetter ? (o - c) / Math.max(Math.abs(o), 1e-9) : (c - o) / Math.max(Math.abs(o), 1e-9)) : 0;
    return { name: m.name, original: m.original, clone: m.clone, better: m.better ?? 'lower', source: m.source ?? '', result: !ok ? 'unmeasured' : delta > 0.02 ? 'win' : delta < -0.02 ? 'loss' : 'tie' };
  });
  const shippable = mustDone.length === musts.length && parity >= 80;
  const fixesNeeded = Math.min(3, fixes.length);
  const losses = metrics.filter((/** @type {any} */ m) => m.result === 'loss');
  const wins = metrics.filter((/** @type {any} */ m) => m.result === 'win');
  const better = shippable && fixes.length > 0 && fixesBuilt.length >= fixesNeeded && losses.length === 0 && metrics.length > 0 && wins.length > 0;
  return {
    problems,
    parity,
    musts: { done: mustDone.length, total: musts.length },
    areas: Object.entries(areas)
      .map(([area, a]) => ({ area, score: Math.round((a.got / a.total) * 1000) / 10 }))
      .sort((a, b) => a.score - b.score),
    missing: missing.map((r) => ({ id: r.id, feature: r.feature, priority: r.priority, clone: r.clone, notes: r.notes })),
    fixes: { built: fixesBuilt.length, planned: fixes.length, list: fixes.map((r) => ({ id: r.id, feature: r.feature, clone: r.clone })) },
    metrics,
    verdict: !shippable ? 'not shippable' : better ? 'better than the original' : 'shippable',
    why: !shippable
      ? mustDone.length < musts.length
        ? `${musts.length - mustDone.length} must-have(s) not done`
        : `parity ${parity} is under 80`
      : better
        ? `${fixesBuilt.length} fix(es) built, ${wins.length} measured win(s), no losses`
        : [
            fixes.length === 0 ? 'no fixes planned from research' : fixesBuilt.length < fixesNeeded ? `${fixesBuilt.length} of ${fixesNeeded} fixes built` : '',
            metrics.length === 0 ? 'nothing measured in beat.json' : wins.length === 0 ? 'no measured win' : '',
            losses.length ? `${losses.length} metric(s) worse than the original: ${losses.map((/** @type {any} */ m) => m.name).join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('; '),
  };
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const p = paths(root);
  const file = positionals[0] ? path.resolve(positionals[0]) : p.features;
  if (!exists(file)) fail(`No feature matrix at ${rel(root, file)}. Write it during research (template: templates/features.csv in the skill).`);
  const { records } = readCsv(file);
  const beatFile = typeof flags.beat === 'string' ? path.resolve(flags.beat) : p.beat;
  const beat = exists(beatFile) ? readJson(beatFile) : null;
  const s = score(records, beat);
  if (flags.json) {
    say(JSON.stringify(s, null, 2));
    return s.verdict === 'not shippable' ? 1 : 0;
  }
  if (s.problems.length) say(`Fix these rows first:\n${s.problems.map((x) => `  ${x}`).join('\n')}\n`);
  if (flags.markdown) {
    say(`# Parity\n\n**${s.verdict}**: ${s.why}.\n\nParity ${s.parity}%, must-haves ${s.musts.done} of ${s.musts.total}, fixes built ${s.fixes.built} of ${s.fixes.planned}.\n`);
    say(mdTable(['Area', 'Score'], s.areas.map((a) => [a.area, `${a.score}%`])));
    if (s.missing.length) say(`\n## Missing, in build order\n\n${mdTable(['Id', 'Feature', 'Priority', 'Clone', 'Notes'], s.missing.map((m) => [m.id, m.feature, m.priority, m.clone, m.notes ?? '']))}`);
    if (s.metrics.length) say(`\n## Against the original\n\n${mdTable(['Metric', 'Original', 'Clone', 'Better when', 'Result', 'Source'], s.metrics.map((/** @type {any} */ m) => [m.name, m.original, m.clone, m.better, m.result, m.source]))}`);
  } else {
    say(`Verdict: ${s.verdict} (${s.why}).`);
    say(`Parity ${s.parity}%. Must-haves ${s.musts.done} of ${s.musts.total}. Fixes built ${s.fixes.built} of ${s.fixes.planned}.`);
    if (s.areas.length) say('\n' + table(['area', 'score'], s.areas.map((a) => [a.area, `${a.score}%`])));
    if (s.missing.length) say('\nMissing, in build order:\n' + s.missing.slice(0, 20).map((m) => `  [${m.priority}] ${m.id ? m.id + ' ' : ''}${m.feature}${m.clone === 'partial' ? ' (partial)' : ''}`).join('\n'));
    if (s.metrics.length) say('\n' + table(['metric', 'original', 'clone', 'result'], s.metrics.map((/** @type {any} */ m) => [m.name, m.original, m.clone, m.result])));
  }
  return s.verdict === 'not shippable' ? 1 : 0;
}
