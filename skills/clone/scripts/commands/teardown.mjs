// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { readCsv } from '../lib/csv.mjs';
import { exists, filesIn, paths, projectRoot, readJson, rel, today, writeText } from '../lib/fsx.mjs';
import { summarize as summarizeInteract } from './interact.mjs';
import { fail, mdTable, say } from '../lib/out.mjs';
import { loadState } from '../lib/state.mjs';
import { score as parityScore } from './parity.mjs';

export const help = `remaster teardown [--out remaster/TEARDOWN.md]

Write the shareable teardown: one markdown page on the original, built only
from files that have passed their checks. It covers what users say (from the
verified pains.md), the verdict and opening, how the product is built (feature
matrix by area, from recon), its design system as measured, how it behaves
(from the interaction sweep), and every source with its link. Nothing in it is new: it stitches what the research proved.

Share it as it is, paste it into a doc, or publish it as a page.`;

/** A report's body without its title, one heading level down so it nests. @param {string} text */
const dropTitle = (text) => text.replace(/^# .*\n+/, '').replace(/^(#{2,5}) /gm, '#$1 ');

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags }) {
  const root = projectRoot();
  const p = paths(root);
  const state = loadState(root);
  if (!state) fail('No Remaster project here.');
  const out = typeof flags.out === 'string' ? path.resolve(flags.out) : p.teardown;
  const parts = [`# Teardown: ${state.target.name}`, '', `${state.target.url} · researched ${today()} with Remaster.`, ''];

  if (exists(path.join(p.store, 'app.json'))) {
    const a = readJson(path.join(p.store, 'app.json'));
    parts.push(`**On the App Store:** ${a.name} by ${a.seller}, ${a.ratings ?? 0} ratings averaging ${a.rating ? Number(a.rating).toFixed(2) : '?'}, ${a.price}, version ${a.version} (read ${a.readAt}).`, '');
  }
  if (exists(p.verdict)) {
    const v = fs.readFileSync(p.verdict, 'utf8');
    if (!v.includes('{{')) parts.push('## The verdict', '', dropTitle(v).trim(), '');
  }
  if (exists(p.pains)) parts.push('## What users say', '', dropTitle(fs.readFileSync(p.pains, 'utf8')).trim(), '');
  else if (exists(p.analysis)) parts.push('## What users say', '', 'The review analysis has not checked out yet (run `remaster pains`), so it is left out rather than shown unverified.', '');

  if (exists(p.features)) {
    const rows = readCsv(p.features).records;
    if (rows.length) {
      /** @type {Record<string, { must: number, should: number, could: number }>} */
      const areas = {};
      for (const r of rows.filter((x) => (x.original ?? 'yes').toLowerCase() !== 'no')) {
        const a = (areas[r.area || 'general'] ??= { must: 0, should: 0, could: 0 });
        const k = /** @type {'must' | 'should' | 'could'} */ ((r.priority ?? '').toLowerCase());
        if (k in a) a[k]++;
      }
      parts.push('## How it is built', '', `${rows.length} features mapped from public sources.`, '', mdTable(['Area', 'Must', 'Should', 'Could'], Object.entries(areas).map(([k, v]) => [k, v.must, v.should, v.could])), '');
      const s = parityScore(rows, exists(p.beat) ? readJson(p.beat) : null);
      if (rows.some((r) => (r.clone ?? 'no').toLowerCase() !== 'no')) parts.push(`Clone progress: ${s.verdict}, parity ${s.parity}%, must-haves ${s.musts.done} of ${s.musts.total}, fixes built ${s.fixes.built} of ${s.fixes.planned}.`, '');
    }
  }
  if (exists(p.measuredMd)) parts.push('## Design system, as measured', '', dropTitle(fs.readFileSync(p.measuredMd, 'utf8')).replace(/^Reference only\..*\n+/m, '').trim(), '');
  const sweeps = filesIn(p.measureOriginal, ['.interact.json']);
  if (sweeps.length) {
    parts.push('## How it behaves', '');
    for (const f of sweeps) {
      const r = readJson(f);
      parts.push(`**${r.url}** at ${r.width}px:`, '', ...summarizeInteract(r).map((l) => `- ${l}`), '');
    }
  }

  if (exists(p.sources)) {
    const rows = readCsv(p.sources).records;
    if (rows.length) {
      parts.push('## Sources', '', `${rows.length} sources, each read on the date shown.`, '');
      parts.push(mdTable(['Kind', 'Source', 'Read'], rows.slice(0, 60).map((r) => [r.kind, r.url ? `[${(r.title || r.url).slice(0, 70)}](${r.url})` : r.title, r.read_at])));
      if (rows.length > 60) parts.push('', `...and ${rows.length - 60} more in sources.csv.`);
      parts.push('');
    }
  }
  parts.push('---', '', 'Made with [Remaster](https://github.com/thenavidm/remaster): every quote is word for word from a linked source, and every number was measured.', '');
  writeText(out, parts.join('\n'));
  say(`Wrote ${rel(root, out)}.`);
  return 0;
}
