// @ts-check
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { list } from '../lib/args.mjs';
import { colorsInText, deltaE, parseColor } from '../lib/color.mjs';
import { exists, filesIn, looksBinary, measurements, paths, projectRoot, readJson, rel, walkText } from '../lib/fsx.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { loadState } from '../lib/state.mjs';
import { pathHash, pathsInText } from '../lib/svg.mjs';
import { containsRun, identWords, sentences, shingles, words } from '../lib/text.mjs';

export const help = `remaster sweep [folder] [options]

Find anything of the original's left in your project, and block the launch
until it's clean. Reads the original's names, domains and colors from
remaster/brand.json ("avoid", "domains", "colors"), the project's target, and
the brand colors measured from the original. Checks:

  names     in file contents and file names, including inside identifiers
            (OriginalEmbed, original-embed, original_embed all count)
  domains   anywhere in the code, and as hosts the running clone loads from
  colors    any color in your code within a hair of the original's brand colors
  copy      sentences too close to the original's public words (needs a
            measurement of the clone, or scans string literals in your code)
  images    files identical to the screenshots, logo and images from research
  svg       icons, logos and illustrations drawn with the original's own SVG paths

A mention that has to stay, like an "Import from X" feature, goes in
brand.json "allow" (a file path or an exact string), or gets a
\`remaster-allow\` comment on the same line. Allowed hits are listed, not failed.

  --avoid "Name,Company"   extra names
  --domains a.com,b.com    extra domains
  --colors "#006bff"       extra colors
  --json                   print findings as JSON

Exits 1 while anything is left.`;

const GENERIC = readJson(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'generic-phrases.json')).phrases.map((/** @type {string} */ p) => new Set(words(p)));
const CODE_EXT = /\.(css|scss|sass|less|tsx?|jsx?|mjs|cjs|json|html?|svg|vue|svelte|astro|mdx?|ya?ml|toml|txt)$/i;

/** @typedef {{ kind: string, level: 'error' | 'allowed', file: string, line: number, text: string, detail: string }} Hit */

/**
 * Sentences of a text worth comparing: 6 words or more and not one of the
 * phrases every product writes the same way.
 * @param {string} text
 */
export function comparable(text) {
  return sentences(text)
    .map((s) => ({ s, w: words(s) }))
    .filter((x) => x.w.length >= 6)
    .filter((x) => !GENERIC.some((/** @type {Set<string>} */ g) => x.w.filter((w) => g.has(w)).length / x.w.length >= 0.7));
}

/**
 * Clone sentences that share too much with the original's: half or more of
 * their 5-word runs, or 10 words in a row.
 * @param {string[]} originalTexts
 * @param {{ text: string, where: string, line: number }[]} cloneTexts
 */
export function copySimilarity(originalTexts, cloneTexts) {
  /** @type {Map<string, number[]>} */
  const index = new Map();
  /** @type {string[]} */
  const originals = [];
  for (const t of originalTexts)
    for (const { s, w } of comparable(t)) {
      const id = originals.push(s) - 1;
      for (const g of shingles(w, 5)) {
        const ids = index.get(g) ?? [];
        if (ids[ids.length - 1] !== id) ids.push(id);
        index.set(g, ids);
      }
    }
  const out = [];
  for (const c of cloneTexts)
    for (const { s, w } of comparable(c.text)) {
      const grams = shingles(w, 5);
      if (!grams.length) continue;
      let hits = 0;
      let run = 0;
      let longest = 0;
      /** @type {Map<number, number>} */
      const votes = new Map();
      for (const g of grams) {
        const ids = index.get(g);
        if (ids) {
          hits++;
          run++;
          longest = Math.max(longest, run);
          for (const id of ids) votes.set(id, (votes.get(id) ?? 0) + 1);
        } else run = 0;
      }
      const containment = hits / grams.length;
      const shared = longest ? longest + 4 : 0;
      if (containment >= 0.5 || shared >= 10) {
        const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
        out.push({ where: c.where, line: c.line, clone: s, original: best ? originals[best[0]] : '', containment: Math.round(containment * 100), shared });
      }
    }
  return out;
}

/**
 * Strings a reader could see, pulled from source: JSX text and quoted strings
 * of four words or more.
 * @param {string} src
 */
export function sourceStrings(src) {
  const out = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(/>([^<>{}]{20,})</g)) out.push({ text: m[1], line: i + 1 });
    for (const m of line.matchAll(/(["'`])((?:(?!\1).){20,}?)\1/g)) if (m[2].trim().split(/\s+/).length >= 4) out.push({ text: m[2], line: i + 1 });
  }
  return out;
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const p = paths(root);
  const target = path.resolve(positionals[0] ?? root);
  const brand = exists(p.brand) ? readJson(p.brand) : {};
  const state = loadState(root);
  const measured = exists(p.measured) ? readJson(p.measured) : null;
  if (state?.mode === 'migrate' && state.owner && !flags.force)
    say('This is a migration of a site the user owns, so its own name, words and colors are expected. Running the checks anyway; read the hits as information.\n');

  const names = [...new Set([...(brand.avoid ?? []), ...list(flags.avoid), ...(state?.target?.name ? [state.target.name] : [])])].filter(Boolean);
  const domains = new Set([...(brand.domains ?? []), ...list(flags.domains)].map((d) => d.toLowerCase().replace(/^www\./, '')));
  if (state?.target?.url) {
    try {
      domains.add(new URL(state.target.url).hostname.replace(/^www\./, ''));
    } catch {
      /* not a URL: an app store id or a name */
    }
  }
  const colorList = [...new Set([...(brand.colors ?? []), ...list(flags.colors), ...(measured?.colors?.brand ?? [])])]
    .map((c) => ({ raw: c, rgba: parseColor(c) }))
    .filter((c) => c.rgba);
  if (!names.length && !domains.size && !colorList.length)
    fail('Nothing to sweep for. Put the original\'s names, domains and colors in remaster/brand.json ("avoid", "domains", "colors"), or pass --avoid, --domains and --colors.');

  const allow = /** @type {string[]} */ (brand.allow ?? []);
  const allowed = (/** @type {string} */ file, /** @type {string} */ text) =>
    /remaster-allow/.test(text) || allow.some((a) => rel(root, file) === a || rel(root, file).startsWith(a.replace(/\/?$/, '/')) || text.includes(a));
  const nameWords = names.map((n) => ({ n, w: identWords(n) })).filter((x) => x.w.length);
  /** @type {Hit[]} */
  const hits = [];
  const hit = (/** @type {string} */ kind, /** @type {string} */ file, /** @type {number} */ line, /** @type {string} */ text, /** @type {string} */ detail) =>
    hits.push({ kind, level: allowed(file, text) ? 'allowed' : 'error', file: rel(root, file), line, text: text.trim().slice(0, 100), detail });

  const files = walkText(target);
  /** @type {{ text: string, where: string, line: number }[]} */
  const cloneTexts = [];
  for (const file of files) {
    const base = path.basename(file);
    for (const { n, w } of nameWords) if (containsRun(identWords(base), w)) hit('name', file, 0, base, `the file name holds "${n}"`);
    const buf = fs.readFileSync(file);
    if (looksBinary(buf)) continue;
    const src = buf.toString('utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 4000) continue;
      const lw = identWords(line);
      for (const { n, w } of nameWords) if (containsRun(lw, w)) hit('name', file, i + 1, line, `"${n}"`);
      const lower = line.toLowerCase();
      for (const d of domains) if (lower.includes(d)) hit('domain', file, i + 1, line, d);
      if (CODE_EXT.test(file))
        for (const c of colorsInText(line)) {
          const rgba = parseColor(c.raw);
          if (!rgba) continue;
          for (const t of colorList) {
            const dE = deltaE(rgba, /** @type {any} */ (t.rgba));
            if (dE < 3) hit('color', file, i + 1, line, `${c.raw} is ${dE.toFixed(1)} from the original's ${t.raw}`);
          }
        }
    }
    if (/\.(tsx|jsx|vue|svelte|astro|html?|mdx?)$/i.test(file)) for (const s of sourceStrings(src)) cloneTexts.push({ text: s.text, where: rel(root, file), line: s.line });
  }

  // What the running clone loaded, and what it showed.
  for (const mfile of measurements(p.measureClone)) {
    const m = readJson(mfile);
    for (const host of m.network?.origins ?? [])
      for (const d of domains) if (host === d || host.endsWith(`.${d}`)) hits.push({ kind: 'runtime', level: 'error', file: rel(root, mfile), line: 0, text: host, detail: `the clone loaded from the original's host ${host}` });
    for (const t of m.text ?? []) cloneTexts.push({ text: t.t, where: `${path.basename(mfile)} (rendered)`, line: 0 });
  }

  // The original's SVG paths (icons, logos, illustrations), by fingerprint.
  /** @type {Map<string, string>} */
  const originalPaths = new Map();
  for (const f of measurements(p.measureOriginal)) {
    const m = readJson(f);
    for (const h of m.svgPathHashes ?? (m.svgPaths ?? []).map((/** @type {string} */ d) => pathHash(d))) originalPaths.set(h, path.basename(f));
  }
  // A logo served as an .svg file draws with paths too.
  for (const f of filesIn(p.measureOriginal, ['.svg'])) for (const { d } of pathsInText(fs.readFileSync(f, 'utf8'))) originalPaths.set(pathHash(d), path.basename(f));
  if (originalPaths.size)
    for (const file of files) {
      if (!/\.(svg|tsx|jsx|ts|js|mjs|html?|vue|svelte|astro)$/i.test(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('d=')) continue;
      for (const { d, line } of pathsInText(src)) {
        const from = originalPaths.get(pathHash(d));
        if (from) hit('svg', file, line, d.slice(0, 60) + '...', `an SVG path drawn exactly like one on the original's page (${from}): an icon, logo or illustration of theirs`);
      }
    }

  // The original's words: what its pages showed, its help docs, its store text.
  const originalTexts = [];
  for (const f of measurements(p.measureOriginal)) for (const t of readJson(f).text ?? []) originalTexts.push(t.t);
  for (const f of filesIn(p.crawled, ['.md'])) originalTexts.push(fs.readFileSync(f, 'utf8'));
  const app = path.join(p.store, 'app.json');
  if (exists(app)) {
    const a = readJson(app);
    originalTexts.push(a.description ?? '', a.releaseNotes ?? '');
  }
  const copies = originalTexts.length ? copySimilarity(originalTexts, cloneTexts) : [];
  for (const c of copies)
    hits.push({ kind: 'copy', level: 'error', file: c.where, line: c.line, text: c.clone.slice(0, 100), detail: `${c.containment}% shared, ${c.shared} words in a row, with: "${c.original.slice(0, 80)}"` });

  // Images identical to the research captures.
  const researchImages = new Map();
  const hash = (/** @type {string} */ f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  for (const dir of [p.store, path.join(p.store, 'screens'), p.measureOriginal, p.frames])
    for (const f of filesIn(dir, ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'])) researchImages.set(hash(f), rel(root, f));
  if (researchImages.size) {
    const visit = (/** @type {string} */ dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '.git', 'remaster', '.next', 'dist', 'build'].includes(e.name)) visit(full);
        } else if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(e.name) && fs.statSync(full).size < 20_000_000) {
          const h = hash(full);
          if (researchImages.has(h)) hits.push({ kind: 'image', level: 'error', file: rel(root, full), line: 0, text: e.name, detail: `identical to research file ${researchImages.get(h)}` });
        }
      }
    };
    visit(target);
  }

  const errors = hits.filter((h) => h.level === 'error');
  if (flags.json) say(JSON.stringify({ clean: errors.length === 0, hits }, null, 2));
  else {
    say(`Swept ${files.length} files for ${names.length} name(s), ${domains.size} domain(s), ${colorList.length} color(s)${originalTexts.length ? `, and copy against ${originalTexts.length} pieces of the original's text` : ''}.`);
    const rank = { runtime: 0, image: 1, svg: 2, name: 3, domain: 4, color: 5, copy: 6 };
    const sorted = [...hits].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1) || (rank[/** @type {keyof typeof rank} */ (a.kind)] ?? 9) - (rank[/** @type {keyof typeof rank} */ (b.kind)] ?? 9));
    // Copy hits come in runs from one page; show a few per file and count the rest.
    /** @type {Map<string, number>} */
    const perFile = new Map();
    const shown = sorted.filter((h) => {
      if (h.kind !== 'copy') return true;
      const n = (perFile.get(h.file) ?? 0) + 1;
      perFile.set(h.file, n);
      return n <= 5;
    });
    if (shown.length) say(table(['kind', 'status', 'where', 'what'], shown.slice(0, 80).map((h) => [h.kind, h.level, h.line ? `${h.file}:${h.line}` : h.file, `${h.detail}: ${h.text}`])));
    for (const [file, n] of perFile) if (n > 5) say(`  copy: ${n - 5} more sentence(s) in ${file}`);
    if (shown.length > 80) say(`...and ${shown.length - 80} more (use --json).`);
    say(errors.length ? `\nNot clean: ${errors.length} thing(s) of the original's are still in the project.` : '\nClean.');
  }
  return errors.length ? 1 : 0;
}
