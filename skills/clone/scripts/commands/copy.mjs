// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { num } from '../lib/args.mjs';
import { exists, paths, projectRoot, readJson, rel } from '../lib/fsx.mjs';
import { htmlToText } from '../lib/html.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { fold, hasEmoji, identWords, containsRun, squash } from '../lib/text.mjs';

export const help = `remaster copy <file ...> [--max-warnings 3] [--dashes-ok] [--json]

Check the words a reader will see: a clone measurement (verify/measure/*.json),
a markdown page, a store listing JSON, or HTML. It flags:

  errors    placeholder text, the original's name, and proof you can't back up
            (user counts, "trusted by", star ratings, "#1") unless
            remaster/launch/proof.json lists it with a source
  warnings  the words and moves that make copy read as AI-written, em dashes,
            emoji and exclamation marks on controls, buttons that say "Submit",
            the same call to action repeated, errors that don't say what to do
  notes     weaker signals worth a look

Exits 1 when there is an error or more warnings than --max-warnings.`;

const RULES = readJson(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'copy-rules.json'));

/** @typedef {{ kind: string, t: string, where: string }} Item */
/** @typedef {{ level: 'error' | 'warning' | 'note', rule: string, where: string, text: string, fix: string }} Finding */

/**
 * What a reader sees in a file, as items with a kind, so a word in a button
 * can be judged differently from the same word in a paragraph.
 * @param {string} file
 * @returns {Item[]}
 */
export function itemsOf(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const base = path.basename(file);
  if (file.endsWith('.json')) {
    const data = JSON.parse(raw);
    // An interaction sweep holds labels, not copy.
    if (data.scroll && data.hover && data.focus) return [];
    if (Array.isArray(data.text)) return data.text.map((/** @type {any} */ x) => ({ kind: x.kind ?? 'text', t: x.t, where: base }));
    /** @type {Item[]} */
    const out = [];
    const walk = (/** @type {any} */ v, /** @type {string} */ key) => {
      if (typeof v === 'string') out.push({ kind: /name|title|subtitle|heading/i.test(key) ? 'heading' : 'text', t: v, where: `${base} ${key}` });
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, key ? `${key}.${k}` : k);
    };
    walk(data, '');
    return out;
  }
  const text = /\.html?$/i.test(file) ? htmlToText(raw) : raw;
  return text
    .split('\n')
    .map((line, i) => {
      const heading = /^#{1,6}\s/.test(line);
      // A reader sees a link's words, not its target, and code isn't copy.
      const visible = line
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`[^`]*`/g, ' ')
        .replace(/^#{1,6}\s+|^[-*]\s+/, '')
        .trim();
      return { kind: heading ? 'heading' : 'text', t: visible, where: `${base}:${i + 1}` };
    })
    .filter((x) => x.t && !x.t.startsWith('<!--') && !/^```/.test(x.t));
}

/**
 * Check items against the rules.
 * @param {Item[]} items
 * @param {{ avoid?: string[], proof?: { text: string, source?: string }[], dashesOk?: boolean }} [opts]
 * @returns {Finding[]}
 */
export function checkCopy(items, opts = {}) {
  /** @type {Finding[]} */
  const out = [];
  const add = (/** @type {Finding['level']} */ level, /** @type {string} */ rule, /** @type {Item} */ it, /** @type {string} */ fix) =>
    out.push({ level, rule, where: it.where, text: it.t.slice(0, 90), fix });
  const control = (/** @type {Item} */ it) => it.kind === 'heading' || it.kind === 'button' || it.kind === 'nav';
  const avoid = (opts.avoid ?? []).map((n) => identWords(n)).filter((w) => w.length);
  const proof = (opts.proof ?? []).map((p) => fold(p.text).toLowerCase());
  /** @type {Map<string, { count: number, first: Item, rule: any }>} */
  const tally = new Map();
  /** @type {Map<string, number>} */
  const buttons = new Map();
  let dashes = 0;
  /** @type {Item | null} */
  let firstDash = null;

  for (const it of items) {
    const t = squash(it.t);
    if (!t) continue;
    const lower = fold(t).toLowerCase();
    const ph = RULES.placeholders.find((/** @type {{ re: string, flags: string }} */ p) => new RegExp(p.re, p.flags).test(t));
    if (ph) add('error', 'placeholder', it, 'Replace it with the real thing before anyone sees it.');
    const words = identWords(t);
    for (const name of avoid) if (containsRun(words, name)) add('error', 'their-name', it, `The original's name ("${name.join(' ')}") is in your copy. Your product says your name.`);
    for (const p of RULES.proof) {
      const m = lower.match(new RegExp(p.re, 'i'));
      if (m && !proof.some((claim) => claim.includes(m[0].toLowerCase()) || lower.includes(claim))) add('error', `proof:${p.id}`, it, 'Back it with a source in remaster/launch/proof.json, or cut it. Invented proof is false advertising.');
    }
    for (const w of RULES.words) {
      if (!new RegExp(`(^|[^\\p{L}-])${w.w.replace(/[-]/g, '[- ]?')}([^\\p{L}-]|$)`, 'iu').test(lower)) continue;
      const key = `word:${w.w}`;
      const prev = tally.get(key);
      if (prev) prev.count++;
      else tally.set(key, { count: 1, first: it, rule: w });
      if (w.tier === 1 && control(it)) add('warning', key, it, w.fix);
    }
    for (const p of RULES.patterns) {
      if (!new RegExp(p.re, 'i').test(lower)) continue;
      const key = `move:${p.id}`;
      const prev = tally.get(key);
      if (prev) prev.count++;
      else tally.set(key, { count: 1, first: it, rule: p });
      if (p.tier === 1 && control(it)) add('warning', key, it, p.fix);
    }
    if (t.includes('\u2014')) {
      dashes++;
      firstDash ??= it;
    }
    if (control(it) && /!/.test(t)) add('warning', 'exclamation', it, 'Let the words carry the energy; drop the exclamation mark.');
    if (control(it) && hasEmoji(t)) add('warning', 'emoji', it, 'Use an icon from your icon set, or nothing.');
    if (it.kind === 'button') {
      const label = lower.replace(/[^\p{L}\p{N} ]/gu, '').trim();
      if (RULES.generic_buttons.includes(label)) add('warning', 'generic-button', it, 'Say the action and its object: "Send invoice", "Book the call".');
      if (label) buttons.set(label, (buttons.get(label) ?? 0) + 1);
    }
    if (RULES.vague_errors.some((/** @type {string} */ v) => lower.includes(v))) add('warning', 'vague-error', it, 'Say what happened and what to do next: "That card was declined. Try another card or contact your bank."');
  }

  for (const [key, { count, first, rule }] of tally) {
    const tier = rule.tier;
    const inControl = control(first);
    if (tier === 1 && !inControl) add('warning', key, first, rule.fix + (count > 1 ? ` (${count} times)` : ''));
    else if (tier === 1 && count > 1) {
      /* already flagged on each control; the body sightings are covered there */
    } else if (tier === 2) add(count >= 2 ? 'warning' : 'note', key, first, rule.fix + (count > 1 ? ` (${count} times)` : ''));
    else if (tier === 3) add('note', key, first, rule.fix);
  }
  for (const [label, count] of buttons)
    if (count >= 3 && label.split(' ').length <= 4) {
      const it = items.find((x) => x.kind === 'button' && fold(x.t).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim() === label);
      if (it) add('warning', 'repeated-cta', it, `"${it.t}" is on ${count} buttons. Give each one the action it starts.`);
    }
  if (dashes && !opts.dashesOk && firstDash) add('warning', 'em-dash', firstDash, `${dashes} em dash${dashes > 1 ? 'es' : ''}. Use a comma, a colon or a full stop; dashes read as AI-drafted.`);

  const headings = items.filter((x) => x.kind === 'heading' && squash(x.t).split(' ').length >= 3);
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'vs']);
  const isTitle = (/** @type {string} */ s) => {
    const w = squash(s).split(' ').slice(1).filter((x) => !small.has(x.toLowerCase()) && /^\p{L}/u.test(x));
    return w.length >= 2 && w.filter((x) => /^\p{Lu}/u.test(x)).length / w.length >= 0.7;
  };
  const titled = headings.filter((h) => isTitle(h.t));
  if (titled.length >= 2 && headings.length - titled.length >= 2) add('note', 'mixed-case', titled[0], `${titled.length} headings in Title Case and ${headings.length - titled.length} in sentence case. Pick one.`);
  return out;
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  if (!positionals.length) fail(help);
  const root = projectRoot();
  const p = paths(root);
  const brand = exists(p.brand) ? readJson(p.brand) : {};
  const proofFile = exists(p.proof) ? readJson(p.proof) : { claims: [] };
  /** @type {Finding[]} */
  const all = [];
  for (const f of positionals) {
    const file = path.resolve(f);
    if (!exists(file)) fail(`Not found: ${f}`);
    all.push(...checkCopy(itemsOf(file), { avoid: brand.avoid ?? [], proof: proofFile.claims ?? [], dashesOk: !!flags['dashes-ok'] }));
  }
  const order = { error: 0, warning: 1, note: 2 };
  all.sort((a, b) => order[a.level] - order[b.level]);
  const errors = all.filter((f) => f.level === 'error').length;
  const warnings = all.filter((f) => f.level === 'warning').length;
  const max = num(flags['max-warnings'], 3);
  if (flags.json) say(JSON.stringify({ errors, warnings, findings: all }, null, 2));
  else {
    if (all.length) say(table(['level', 'rule', 'where', 'text', 'fix'], all.map((f) => [f.level, f.rule, f.where, f.text, f.fix])));
    say(`\n${errors} error(s), ${warnings} warning(s), ${all.length - errors - warnings} note(s) in ${positionals.map((f) => rel(root, path.resolve(f))).join(', ')}.`);
    if (errors || warnings > max) say(`Not passing: ${errors ? 'fix every error' : ''}${errors && warnings > max ? ' and ' : ''}${warnings > max ? `get warnings to ${max} or fewer` : ''}.`);
  }
  return errors || warnings > max ? 1 : 0;
}
