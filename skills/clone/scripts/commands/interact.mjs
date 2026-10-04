// @ts-check
import path from 'node:path';
import { num, str } from '../lib/args.mjs';
import { NO_PLAYWRIGHT, launch, loadPlaywright } from '../lib/browser.mjs';
import { ensureDir, paths, projectRoot, readJson, rel, writeJson } from '../lib/fsx.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { slug } from '../lib/text.mjs';

export const help = `remaster interact <url> [options]
remaster interact compare <original.json> <clone.json>

The interaction sweep, in a clean browser: what the page does when you scroll,
hover and use the keyboard, without clicking anything.

  scroll   the header's changes once the page scrolls, the elements that fade
           or slide in as they arrive, what stays pinned, and a screenshot at
           0, 25, 50, 75 and 100% down the page
  hover    up to --max controls: what changes on hover (color, fill, shadow,
           movement) and how long it takes
  focus    Tab through the page: which controls show a visible focus and which
           don't, and whether the first stop skips to the content

Run it on the original to learn the interaction model before building, and on
the clone to check it behaves the same, or better: every control with a
visible focus is a measurable win. compare prints the two side by side.

  --as original|clone   where to save: research/measure (default) or verify/measure
  --name <slug>         file name (default: from the URL)
  --width 1440          viewport width
  --max 40              controls to hover, and Tab stops to follow`;

/** Style properties that carry a hover or focus change. */
const PROPS = ['backgroundColor', 'backgroundImage', 'color', 'borderTopColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'outlineStyle', 'outlineWidth', 'outlineColor', 'filter'];

/**
 * The properties that differ between two style snapshots.
 * @param {Record<string, string>} a @param {Record<string, string>} b
 */
export function changed(a, b) {
  /** @type {Record<string, [string, string]>} */
  const out = {};
  for (const k of Object.keys(a)) if (a[k] !== b[k]) out[k] = [a[k], b[k]];
  return out;
}

/**
 * Whether a focused control's style tells a keyboard user where they are.
 * @param {Record<string, string>} base unfocused
 * @param {Record<string, string>} focused
 */
export function focusVisible(base, focused) {
  const outline = focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) > 0;
  const diff = changed(base, focused);
  return outline || ['boxShadow', 'backgroundColor', 'borderTopColor', 'textDecorationLine', 'color'].some((k) => k in diff);
}

/**
 * A summary of one sweep, the part a person reads.
 * @param {any} r
 */
export function summarize(r) {
  const lines = [];
  const h = r.scroll.header;
  lines.push(h ? (Object.keys(h.changes).length ? `Header changes on scroll: ${Object.entries(h.changes).map(([k, [a, b]]) => `${k} ${a} -> ${b}`).join('; ')}.` : 'Header stays the same on scroll.') : 'No pinned header.');
  lines.push(`${r.scroll.reveals.count} element(s) fade or slide in as they arrive${r.scroll.reveals.samples.length ? ` (${r.scroll.reveals.samples.slice(0, 3).join(', ')})` : ''}.`);
  lines.push(`${r.scroll.pinned.length} pinned element(s) while scrolling.`);
  const hv = r.hover;
  const props = Object.entries(hv.props).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} (${n})`).join(', ');
  lines.push(`Hover: ${hv.changed} of ${hv.checked} controls respond${props ? `, mostly by ${props}` : ''}${hv.durations.length ? `, usually in ${hv.durations[0].value}ms` : ''}.`);
  const f = r.focus;
  lines.push(`Keyboard: ${f.visited} Tab stops, ${f.visible} with a visible focus, ${f.visited - f.visible} without${f.skipLink ? ', and the first stop skips to the content' : ''}.`);
  return lines;
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const root = projectRoot();
  const p = paths(root);
  if (positionals[0] === 'compare') {
    const [a, b] = positionals.slice(1).map((f) => readJson(path.resolve(f)));
    if (!a || !b) fail(help);
    const rows = [
      ['header changes on scroll', Object.keys(a.scroll.header?.changes ?? {}).join(', ') || 'no', Object.keys(b.scroll.header?.changes ?? {}).join(', ') || 'no'],
      ['elements revealed on scroll', a.scroll.reveals.count, b.scroll.reveals.count],
      ['pinned while scrolling', a.scroll.pinned.length, b.scroll.pinned.length],
      ['controls that respond to hover', `${a.hover.changed} of ${a.hover.checked}`, `${b.hover.changed} of ${b.hover.checked}`],
      ['Tab stops with a visible focus', `${a.focus.visible} of ${a.focus.visited}`, `${b.focus.visible} of ${b.focus.visited}`],
      ['skip link first', a.focus.skipLink ? 'yes' : 'no', b.focus.skipLink ? 'yes' : 'no'],
    ];
    say(table(['', 'original', 'clone'], rows));
    const lostFocus = b.focus.visited && b.focus.visible / b.focus.visited < (a.focus.visited ? a.focus.visible / a.focus.visited : 0);
    if (lostFocus) say('\nThe clone shows a visible focus on fewer controls than the original. That is a measured loss: fix it before launch.');
    return 0;
  }

  const url = positionals[0];
  if (!url || !/^https?:\/\//.test(url)) fail(help);
  const as = str(flags.as, 'original');
  const outDir = as === 'clone' ? p.measureClone : p.measureOriginal;
  const name = str(flags.name, slug(new URL(url).host + new URL(url).pathname.replace(/\/$/, '')));
  const width = num(flags.width, 1440);
  const max = num(flags.max, 40);
  const pw = await loadPlaywright();
  if (!pw) fail(NO_PLAYWRIGHT);
  ensureDir(outDir);
  const browser = await launch(pw);
  /** @type {any} */
  const result = { v: 1, url, width, measuredAt: new Date().toISOString(), scroll: {}, hover: {}, focus: {} };
  try {
    const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, locale: 'en-US' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Scroll. Tag elements below the fold with their starting opacity and
    // transform, then see which ones change as they arrive.
    await page.evaluate((props) => {
      const w = /** @type {any} */ (window);
      w.__rm = { start: new Map(), props };
      // How visible an element really is: its opacity times every ancestor's,
      // since a fade is usually set on a wrapper; and whether it or a near
      // ancestor is shifted, since a slide is too.
      w.__rmLook = (/** @type {Element} */ el) => {
        let opacity = 1;
        let shifted = false;
        let depth = 0;
        for (let e = el; e && e !== document.body; e = e.parentElement, depth++) {
          const cs = getComputedStyle(e);
          opacity *= Number(cs.opacity);
          if (depth < 4 && cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)') shifted = true;
        }
        return { opacity, shifted };
      };
      // Elements a person would see arrive: ones holding their own text, and
      // media. Wrappers are skipped so one reveal counts once.
      const all = [...document.body.querySelectorAll('*')].slice(0, 8000);
      let n = 0;
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight || r.width < 40 || r.height < 16) continue;
        const media = /^(IMG|SVG|VIDEO|PICTURE|CANVAS)$/i.test(el.tagName);
        const ownText = [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue && c.nodeValue.trim().length > 2);
        if (!media && !ownText) continue;
        el.setAttribute('data-rm-r', String(n));
        w.__rm.start.set(n, { ...w.__rmLook(el), label: (el.tagName.toLowerCase() + (el.textContent ? ` "${el.textContent.trim().slice(0, 30)}"` : '')) });
        if (++n >= 400) break;
      }
    }, PROPS);
    const pinnedAt = async () =>
      page.evaluate(() =>
        [...document.body.querySelectorAll('*')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
            const r = el.getBoundingClientRect();
            return r.width > 40 && r.height > 16 && r.bottom > 0 && r.top < innerHeight;
          })
          .slice(0, 12)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return { tag: el.tagName.toLowerCase(), top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width), backgroundColor: cs.backgroundColor, boxShadow: cs.boxShadow, backdropFilter: cs.backdropFilter, borderBottomColor: cs.borderBottomColor };
          }),
      );
    const headerAt0 = (await pinnedAt()).find((x) => x.top <= 24 && x.width >= width * 0.5) ?? null;
    await page.evaluate(() => window.scrollTo(0, 320));
    await page.waitForTimeout(600);
    const headerAfter = (await pinnedAt()).find((x) => x.top <= 24 && x.width >= width * 0.5) ?? null;
    if (headerAt0 && headerAfter) {
      const { tag: _t, top: _a, width: _w, ...before } = headerAt0;
      const { tag: _t2, top: _b, width: _w2, ...after } = headerAfter;
      result.scroll.header = { tag: headerAt0.tag, changes: changed(/** @type {any} */ (before), /** @type {any} */ (after)) };
    } else result.scroll.header = headerAt0 ? { tag: headerAt0.tag, changes: { position: ['pinned', 'scrolled away'] } } : null;

    const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const journey = [];
    /** @type {Set<string>} */
    const pinned = new Set();
    for (const [i, f] of [0, 0.25, 0.5, 0.75, 1].entries()) {
      const y = Math.max(0, Math.round(height * f));
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(700);
      const shot = path.join(outDir, `${name}@${width}-scroll-${i}.png`);
      await page.screenshot({ path: shot });
      journey.push({ at: `${Math.round(f * 100)}%`, y, screenshot: path.basename(shot) });
      for (const x of await pinnedAt()) pinned.add(`${x.tag} at top ${x.top}px, ${x.width}x${x.height}`);
    }
    // Walk the page in viewport steps so every tagged element has arrived.
    const reveals = await page.evaluate(async () => {
      const w = /** @type {any} */ (window);
      const hits = [];
      for (let y = 0; y < document.documentElement.scrollHeight; y += Math.floor(innerHeight * 0.7)) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 160));
      }
      await new Promise((r) => setTimeout(r, 500));
      for (const [n, s] of w.__rm.start) {
        const el = document.querySelector(`[data-rm-r="${n}"]`);
        if (!el) continue;
        const now = w.__rmLook(el);
        const faded = s.opacity < 0.5 && now.opacity >= 0.9;
        const moved = s.shifted && !now.shifted;
        if (faded || moved) hits.push(s.label);
      }
      return hits;
    });
    result.scroll.journey = journey;
    result.scroll.pinned = [...pinned];
    result.scroll.reveals = { count: reveals.length, samples: reveals.slice(0, 8) };

    // Hover. Back to the top, then each control in turn.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const targets = await page.evaluate((maxN) => {
      const els = [...document.querySelectorAll('button, [role="button"], a[href], [onclick], summary')].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width >= 16 && r.height >= 16 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
      });
      // Buttons first: they carry the hover states a clone has to match.
      const rank = (/** @type {Element} */ el) => (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ? 0 : el.tagName === 'A' && el.getBoundingClientRect().height >= 28 ? 1 : 2);
      els.sort((a, b) => rank(a) - rank(b));
      return els.slice(0, maxN).map((el, i) => {
        el.setAttribute('data-rm-h', String(i));
        return { i, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), tag: el.tagName.toLowerCase() };
      });
    }, max);
    const read = (/** @type {number} */ i) =>
      page.evaluate(
        ({ i: idx, props }) => {
          const el = document.querySelector(`[data-rm-h="${idx}"]`);
          if (!el) return null;
          const pick = (/** @type {Element} */ e) => {
            const cs = /** @type {any} */ (getComputedStyle(e));
            return Object.fromEntries(props.map((k) => [k, cs[k]]));
          };
          // Site builders paint hover on inner layers, so read the first few.
          const kids = [...el.querySelectorAll('*')].slice(0, 4);
          return { self: pick(el), kids: kids.map(pick), duration: getComputedStyle(el).transitionDuration };
        },
        { i, props: PROPS },
      );
    const hoverRows = [];
    for (const t of targets) {
      const before = await read(t.i);
      if (!before) continue;
      try {
        await page.hover(`[data-rm-h="${t.i}"]`, { timeout: 2_000, force: true });
      } catch {
        continue;
      }
      await page.waitForTimeout(500);
      const after = await read(t.i);
      await page.mouse.move(0, 0);
      if (!after) continue;
      /** @type {Record<string, [string, string]>} */
      const diff = { ...changed(before.self, after.self) };
      before.kids.forEach((/** @type {Record<string, string>} */ k, /** @type {number} */ j) => {
        if (after.kids[j]) for (const [prop, v] of Object.entries(changed(k, after.kids[j]))) diff[`inner ${prop}`] ??= v;
      });
      hoverRows.push({ label: t.label, tag: t.tag, changes: diff, duration: before.duration });
    }
    /** @type {Record<string, number>} */
    const propCounts = {};
    /** @type {Map<number, number>} */
    const durations = new Map();
    for (const h of hoverRows) {
      for (const k of Object.keys(h.changes)) propCounts[k.replace(/^inner /, '')] = (propCounts[k.replace(/^inner /, '')] ?? 0) + 1;
      const ms = Math.round(Math.max(...String(h.duration).split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000))));
      if (Object.keys(h.changes).length && ms > 0) durations.set(ms, (durations.get(ms) ?? 0) + 1);
    }
    result.hover = {
      checked: hoverRows.length,
      changed: hoverRows.filter((h) => Object.keys(h.changes).length).length,
      props: propCounts,
      durations: [...durations.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })),
      samples: hoverRows.filter((h) => Object.keys(h.changes).length).slice(0, 12),
      none: hoverRows.filter((h) => !Object.keys(h.changes).length).map((h) => h.label).slice(0, 12),
    };

    // Focus. Record every focusable control's resting style, then Tab
    // through and compare.
    await page.evaluate((props) => {
      const w = /** @type {any} */ (window);
      w.__rmBase = new Map();
      const focusable = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')];
      focusable.forEach((el, i) => {
        el.setAttribute('data-rm-f', String(i));
        const cs = /** @type {any} */ (getComputedStyle(el));
        w.__rmBase.set(i, Object.fromEntries(props.map((k) => [k, cs[k]])));
      });
      /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.();
      window.scrollTo(0, 0);
    }, PROPS);
    const stops = [];
    for (let k = 0; k < max; k++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(80);
      const s = await page.evaluate((props) => {
        const w = /** @type {any} */ (window);
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const id = el.getAttribute('data-rm-f');
        const cs = /** @type {any} */ (getComputedStyle(el));
        return {
          id,
          label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 40),
          href: el.getAttribute('href') || '',
          base: id !== null ? w.__rmBase.get(Number(id)) : null,
          now: Object.fromEntries(props.map((p) => [p, cs[p]])),
        };
      }, PROPS);
      if (!s) continue;
      if (stops.length && stops[0].id === s.id) break;
      stops.push(s);
    }
    const visible = stops.filter((s) => s.base && focusVisible(s.base, s.now));
    result.focus = {
      visited: stops.length,
      visible: visible.length,
      without: stops.filter((s) => !(s.base && focusVisible(s.base, s.now))).map((s) => s.label).slice(0, 15),
      skipLink: !!stops[0] && /^#/.test(stops[0].href) && /skip|content|main/i.test(stops[0].label),
    };
    await context.close();
  } finally {
    await browser.close();
  }
  const file = path.join(outDir, `${name}@${width}.interact.json`);
  writeJson(file, result);
  say(summarize(result).join('\n'));
  say(`\nSaved ${rel(root, file)} and ${result.scroll.journey.length} scroll screenshots.`);
  return 0;
}
