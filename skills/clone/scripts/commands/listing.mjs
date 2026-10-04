// @ts-check
import path from 'node:path';
import { exists, paths, projectRoot, readJson, rel } from '../lib/fsx.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { containsRun, graphemes, hasEmoji, identWords } from '../lib/text.mjs';

export const help = `remaster listing [listing.json]

Check a store listing (remaster/launch/listing.json) before you paste it in:

  { "appStore": { "name": "", "subtitle": "", "promotionalText": "", "keywords": "", "description": "" },
    "googlePlay": { "title": "", "shortDescription": "", "fullDescription": "" } }

App Store limits: name 30, subtitle 30, promotional text 170, keywords 100,
description 4000. Google Play: title 30, short description 80, full
description 4000. Characters are counted the way the stores count them, so
an emoji is 1.

It also flags the original's name anywhere (brand.json "avoid"), ranking and
price claims in short fields, emoji in the name, spaces after keyword commas,
and keywords that repeat words already in the name or subtitle (Apple
indexes those already). Store limits change: check the console when you
upload. Exits 1 on an error.`;

const LIMITS = {
  appStore: { name: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000 },
  googlePlay: { title: 30, shortDescription: 80, fullDescription: 4000 },
};

/**
 * @param {any} listing
 * @param {string[]} avoid
 */
export function lintListing(listing, avoid = []) {
  /** @type {{ level: 'error' | 'warning', field: string, message: string }[]} */
  const out = [];
  const names = avoid.map((n) => identWords(n)).filter((w) => w.length);
  for (const [store, limits] of Object.entries(LIMITS)) {
    const s = listing?.[store];
    if (!s) continue;
    for (const [field, max] of Object.entries(limits)) {
      const v = String(s[field] ?? '');
      const where = `${store}.${field}`;
      if (!v) {
        if (['name', 'title', 'description', 'fullDescription'].includes(field)) out.push({ level: 'error', field: where, message: 'Empty.' });
        continue;
      }
      const n = graphemes(v);
      if (n > max) out.push({ level: 'error', field: where, message: `${n} characters, the limit is ${max}.` });
      for (const w of names) if (containsRun(identWords(v), w)) out.push({ level: 'error', field: where, message: `Holds the original's name ("${w.join(' ')}"). The stores reject it and it invites a takedown.` });
      const short = ['name', 'title', 'subtitle', 'shortDescription', 'promotionalText'].includes(field);
      if (short && /(^|[^\w#])(#1|no\.? ?1)\b|\b(best|top|number one|free|cheapest|leading)\b/i.test(v)) out.push({ level: 'warning', field: where, message: 'Ranking or price claims in a short field are a common rejection reason.' });
      if ((field === 'name' || field === 'title') && hasEmoji(v)) out.push({ level: 'error', field: where, message: 'No emoji in the name.' });
      if (short && /^[^a-z]*[A-Z]{4,}[^a-z]*$/.test(v)) out.push({ level: 'warning', field: where, message: 'All caps reads as shouting and is often rejected.' });
    }
    if (store === 'appStore' && s.keywords) {
      const kw = String(s.keywords);
      if (/,\s/.test(kw)) out.push({ level: 'warning', field: 'appStore.keywords', message: 'Spaces after commas waste characters.' });
      const used = new Set(identWords(`${s.name ?? ''} ${s.subtitle ?? ''}`));
      const repeats = kw.split(',').map((k) => k.trim().toLowerCase()).filter((k) => k && identWords(k).every((w) => used.has(w)));
      if (repeats.length) out.push({ level: 'warning', field: 'appStore.keywords', message: `Already in the name or subtitle: ${repeats.join(', ')}.` });
      const parts = kw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      const dupes = parts.filter((k, i) => parts.indexOf(k) !== i);
      if (dupes.length) out.push({ level: 'warning', field: 'appStore.keywords', message: `Repeated: ${[...new Set(dupes)].join(', ')}.` });
    }
  }
  return out;
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const p = paths(root);
  const file = positionals[0] ? path.resolve(positionals[0]) : p.listing;
  if (!exists(file)) fail(`No listing at ${rel(root, file)}. Write it with the launch stage (template: templates/listing.json in the skill).`);
  const brand = exists(p.brand) ? readJson(p.brand) : {};
  const findings = lintListing(readJson(file), brand.avoid ?? []);
  if (flags.json) say(JSON.stringify({ findings }, null, 2));
  else if (findings.length) say(table(['level', 'field', 'finding'], findings.map((f) => [f.level, f.field, f.message])));
  else say('The listing passes every check.');
  return findings.some((f) => f.level === 'error') ? 1 : 0;
}
