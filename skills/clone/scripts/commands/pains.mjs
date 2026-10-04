// @ts-check
import path from 'node:path';
import { num } from '../lib/args.mjs';
import { readCsv } from '../lib/csv.mjs';
import { exists, paths, projectRoot, readJson, rel, writeJson, writeText } from '../lib/fsx.mjs';
import { fail, mdTable, say, table } from '../lib/out.mjs';
import { fold } from '../lib/text.mjs';

export const help = `remaster pains [reviews.csv] [analysis.json] [--months 18] [--json]

The evidence check for what users say about the original.

reviews.csv (remaster/research/reviews.csv) holds the real rows:
  id,source,url,date,rating,text
A row without a url or text is dropped and counted, never guessed.

analysis.json (remaster/research/analysis.json) is your reading of them:
  { "themes": [ { "id": "per-seat-pricing", "kind": "hate", "label": "Per-seat price jumps",
      "rows": ["as-12", "hn-4"], "quotes": [ { "row": "as-12", "text": "exact words from that row" } ] } ] }
kind is hate (they complain about it), missing (they ask for it), unsolved
(a job or group the app ignores) or love (keep it, or lose them).

It checks every row id exists and every quote is word for word in its row,
then counts reviews and sources per theme, weights low ratings and recent
reviews higher, marks themes with fewer than 3 reviews or 1 source as thin,
and lists low-rated reviews no theme covers. Writes research/pains.md and
pains.json. Exits 1 if a quote or row doesn't check out.`;

const KINDS = ['hate', 'missing', 'unsolved', 'love'];
const KIND_TITLE = /** @type {Record<string, string>} */ ({
  hate: 'What they hate (fix it)',
  missing: 'What they ask for (add it)',
  unsolved: 'Who and what it leaves out (position on it)',
  love: 'What they love (keep it, or lose them)',
});

/**
 * @param {Record<string, string>[]} rows
 * @param {any} analysis
 * @param {{ months?: number, now?: Date }} [opts]
 */
export function verify(rows, analysis, opts = {}) {
  const months = opts.months ?? 18;
  const now = opts.now ?? new Date();
  const kept = [];
  let dropped = 0;
  rows.forEach((r, i) => {
    if (!r.url || !r.text) {
      dropped++;
      return;
    }
    kept.push({ ...r, id: r.id || `row-${i + 2}` });
  });
  const byId = new Map(kept.map((r) => [String(r.id), r]));
  const errors = [];
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  /** @param {Record<string, string>} r @param {string} kind */
  const weightOf = (r, kind) => {
    const rating = Number(r.rating);
    const base = !Number.isFinite(rating) || !r.rating ? 0.6 : kind === 'love' ? [0.2, 0.2, 0.3, 0.6, 0.9, 1][Math.round(rating)] ?? 0.6 : [1, 1, 0.8, 0.5, 0.3, 0.2][Math.round(rating)] ?? 0.6;
    const d = r.date ? new Date(r.date.length === 7 ? `${r.date}-01` : r.date) : null;
    return base * (d && !Number.isNaN(d.getTime()) && d < cutoff ? 0.5 : 1);
  };
  const themes = [];
  const covered = new Set();
  for (const t of analysis?.themes ?? []) {
    if (!KINDS.includes(t.kind)) errors.push(`Theme "${t.id}": kind "${t.kind}" should be one of ${KINDS.join(', ')}.`);
    const ids = [...new Set((t.rows ?? []).map(String))];
    const unknown = ids.filter((id) => !byId.has(id));
    for (const id of unknown) errors.push(`Theme "${t.id}" cites row "${id}", which isn't in reviews.csv (or has no url).`);
    const real = ids.filter((id) => byId.has(id)).map((id) => /** @type {Record<string, string>} */ (byId.get(id)));
    if (!real.length) errors.push(`Theme "${t.id}" has no rows that exist.`);
    const quotes = [];
    for (const q of t.quotes ?? []) {
      const row = byId.get(String(q.row));
      if (!row) {
        errors.push(`Theme "${t.id}" quotes row "${q.row}", which doesn't exist.`);
        continue;
      }
      if (!fold(row.text).toLowerCase().includes(fold(q.text).toLowerCase())) {
        errors.push(`Theme "${t.id}": the quote "${String(q.text).slice(0, 60)}" is not word for word in row ${q.row}.`);
        continue;
      }
      if (!ids.includes(String(q.row))) errors.push(`Theme "${t.id}" quotes row ${q.row} but doesn't list it in rows.`);
      quotes.push({ text: q.text, url: row.url, source: row.source, rating: row.rating, date: row.date });
    }
    real.forEach((r) => covered.add(r.id));
    const sources = new Set(real.map((r) => (r.source || new URL(r.url).hostname).toLowerCase()));
    themes.push({
      id: t.id,
      kind: t.kind,
      label: t.label ?? t.id,
      summary: t.summary ?? '',
      reviews: real.length,
      sources: [...sources],
      weight: Math.round(real.reduce((s, r) => s + weightOf(r, t.kind), 0) * 10) / 10,
      thin: real.length < 3 || sources.size < 2,
      quotes,
    });
  }
  themes.sort((a, b) => b.weight - a.weight);
  const lowUncovered = kept.filter((r) => Number(r.rating) > 0 && Number(r.rating) <= 2 && !covered.has(r.id));
  const low = kept.filter((r) => Number(r.rating) > 0 && Number(r.rating) <= 2);
  const sourceCounts = {};
  for (const r of kept) {
    const s = (r.source || 'unknown').toLowerCase();
    sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
  }
  const dates = kept.map((r) => r.date).filter(Boolean).sort();
  return {
    sample: { reviews: kept.length, dropped, sources: sourceCounts, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
    coverage: low.length ? Math.round(((low.length - lowUncovered.length) / low.length) * 100) : null,
    errors,
    themes,
    uncovered: lowUncovered.slice(0, 15).map((r) => ({ id: r.id, rating: r.rating, url: r.url, text: r.text.slice(0, 220) })),
  };
}

/** @param {ReturnType<typeof verify>} v @param {string} target */
export function toMarkdown(v, target) {
  const out = [
    `# What users say about ${target || 'the original'}`,
    '',
    `${v.sample.reviews} reviews from ${Object.entries(v.sample.sources).map(([s, n]) => `${s} (${n})`).join(', ')}${v.sample.from ? `, dated ${v.sample.from} to ${v.sample.to}` : ''}. ${v.sample.dropped ? `${v.sample.dropped} rows dropped for a missing link or text. ` : ''}Every quote below is word for word from a linked review.`,
    '',
  ];
  if (v.sample.reviews < 100) out.push(`Small sample: ${v.sample.reviews} reviews. Treat every theme as a lead to check, not a finding.`, '');
  for (const kind of KINDS) {
    const list = v.themes.filter((t) => t.kind === kind && t.reviews > 0);
    if (!list.length) continue;
    out.push(`## ${KIND_TITLE[kind]}`, '');
    list.forEach((t, i) => {
      out.push(`${i + 1}. **${t.label}**: ${t.reviews} reviews across ${t.sources.length} source${t.sources.length === 1 ? '' : 's'} (${t.sources.join(', ')})${t.thin ? ', thin' : ''}.${t.summary ? ` ${t.summary}` : ''}`);
      for (const q of t.quotes.slice(0, 2)) out.push(`   > "${q.text}" ([${q.source || 'source'}${q.rating ? `, ${q.rating} stars` : ''}${q.date ? `, ${q.date}` : ''}](${q.url}))`);
      out.push('');
    });
  }
  if (v.uncovered.length) {
    out.push('## Low ratings no theme covers', '', 'Read these by hand. They are often the most useful part.', '');
    out.push(mdTable(['Row', 'Rating', 'Review'], v.uncovered.map((r) => [`[${r.id}](${r.url})`, r.rating, r.text])));
    out.push('');
  }
  return out.join('\n');
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const p = paths(root);
  const reviewsFile = positionals[0] ? path.resolve(positionals[0]) : p.reviews;
  const analysisFile = positionals[1] ? path.resolve(positionals[1]) : p.analysis;
  if (!exists(reviewsFile)) fail(`No reviews at ${rel(root, reviewsFile)}. Collect them first: remaster store reviews, remaster hn, and rows copied by hand with their links.`);
  const { records } = readCsv(reviewsFile);
  if (!exists(analysisFile)) {
    const { sample } = verify(records, { themes: [] });
    say(`${sample.reviews} usable reviews (${sample.dropped} dropped). No analysis yet at ${rel(root, analysisFile)}: read the rows, group them into themes, and write it (format: remaster pains --help).`);
    return 0;
  }
  const v = verify(records, readJson(analysisFile), { months: num(flags.months, 18) });
  const state = exists(p.state) ? readJson(p.state) : null;
  writeJson(p.painsJson, v);
  // The readable report is what gets shared, so it is only written once every
  // quote and row has checked out.
  if (!v.errors.length) writeText(p.pains, toMarkdown(v, state?.target?.name ?? ''));
  if (flags.json) say(JSON.stringify(v, null, 2));
  else {
    if (v.errors.length) say(`Not checked out:\n${v.errors.map((e) => `  ${e}`).join('\n')}\n`);
    say(`${v.sample.reviews} reviews, ${Object.keys(v.sample.sources).length} sources, ${v.themes.length} themes${v.coverage != null ? `, ${v.coverage}% of 1 and 2 star reviews covered` : ''}.`);
    if (v.themes.length) say(table(['kind', 'theme', 'reviews', 'sources', 'weight', ''], v.themes.map((t) => [t.kind, t.label, t.reviews, t.sources.length, t.weight, t.thin ? 'thin' : ''])));
    say(v.errors.length ? `\nNothing written to ${rel(root, p.pains)} until every quote and row checks out.` : `\nWrote ${rel(root, p.pains)}.`);
  }
  return v.errors.length ? 1 : 0;
}
