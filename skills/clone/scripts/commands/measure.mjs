// @ts-check
import fs, { writeFileSync } from 'node:fs';
import path from 'node:path';
import { list, num, str } from '../lib/args.mjs';
import { NO_PLAYWRIGHT, SNIPPET, launch, loadPlaywright } from '../lib/browser.mjs';
import { ensureDir, paths, projectRoot, rel, writeJson } from '../lib/fsx.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { getBuffer } from '../lib/net.mjs';
import { pathHash } from '../lib/svg.mjs';
import { slug } from '../lib/text.mjs';

export const help = `remaster measure <url> [options]

Open a page in a clean browser (no cookies, no logins) and save, for each
width: a full-page screenshot and a JSON measurement of the design system,
skeleton, visible text, head tags and the hosts it loaded from.

  --as original|clone   where to save: research/measure (default) or verify/measure
  --name <slug>         file name (default: from the URL)
  --widths 1440,390     viewport widths
  --wait 1200           extra milliseconds after load before measuring
  --dpr 1               device pixel ratio for the screenshot
  --max-height 16000    cap on the screenshot height in pixels
  --headed              show the browser
  --snippet             print the path of the browser script and stop

Logged-in pages of the user's own account are measured through the agent's
browser tool instead, with the user present: run the script that --snippet
prints and save its JSON next to these files.`;

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  if (flags.snippet) {
    say(SNIPPET);
    return 0;
  }
  const url = positionals[0];
  if (!url || !/^https?:\/\//.test(url)) fail('Give a full URL, starting with http:// or https://\n\n' + help);
  const root = projectRoot();
  const p = paths(root);
  const as = str(flags.as, 'original');
  const outDir = typeof flags.out === 'string' ? path.resolve(flags.out) : as === 'clone' ? p.measureClone : p.measureOriginal;
  const name = str(flags.name, slug(new URL(url).host + new URL(url).pathname.replace(/\/$/, '')));
  const widths = list(flags.widths, ['1440', '390']).map(Number).filter((n) => n >= 200);
  const wait = num(flags.wait, 1200);
  const dpr = num(flags.dpr, 1);
  const maxHeight = num(flags['max-height'], 16000);

  const pw = await loadPlaywright();
  if (!pw) fail(NO_PLAYWRIGHT);
  const snippet = fs.readFileSync(SNIPPET, 'utf8');
  ensureDir(outDir);
  const browser = await launch(pw, { headed: !!flags.headed });
  const rows = [];
  let logoSaved = false;
  try {
    for (const width of widths) {
      const height = width >= 1024 ? 900 : width >= 700 ? 1024 : 844;
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: dpr,
        locale: 'en-US',
        isMobile: width < 700,
        hasTouch: width < 700,
      });
      const page = await context.newPage();
      /** @type {Set<string>} */
      const origins = new Set();
      let requests = 0;
      page.on('request', (/** @type {any} */ req) => {
        requests++;
        try {
          const u = new URL(req.url());
          if (/^https?:$/.test(u.protocol)) origins.add(u.host);
        } catch {
          /* data: and blob: URLs */
        }
      });
      const res = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      // Scroll the page once so lazy images and reveal-on-scroll sections render,
      // then return to the top, where every measurement is taken.
      await page.evaluate(async () => {
        const step = Math.max(200, Math.floor(innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight && y < 40000; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(wait);
      const data = await page.evaluate(snippet);
      const fullH = Math.min(data.page.h, maxHeight);
      const shot = path.join(outDir, `${name}@${width}.png`);
      await page.screenshot({ path: shot, fullPage: fullH === data.page.h, clip: fullH === data.page.h ? undefined : { x: 0, y: 0, width, height: fullH } });
      data.network = { status: res ? res.status() : null, requests, origins: [...origins].sort() };
      data.screenshot = path.basename(shot);
      // Stylesheets on another host refuse the page's own script. They are
      // public files, so read their media queries directly.
      if (data.breakpoints?.unreadableSheets) {
        const hrefs = await page.evaluate(() => [...document.styleSheets].map((s) => s.href).filter(Boolean));
        /** @type {Map<number, number>} */
        const found = new Map((data.breakpoints.values ?? []).map((/** @type {any} */ b) => [b.value, b.count]));
        for (const href of hrefs.slice(0, 12)) {
          try {
            const r = await page.request.get(href, { timeout: 15_000 });
            if (!r.ok()) continue;
            for (const m of (await r.text()).matchAll(/@media[^{]*?(?:(?:min|max)-width:\s*([\d.]+)(px|em|rem)|width\s*[<>]=?\s*([\d.]+)(px|em|rem))/g)) {
              const v = Math.round(parseFloat(m[1] || m[3]) * ((m[2] || m[4]) === 'px' ? 1 : 16));
              if (v >= 240 && v <= 3000) found.set(v, (found.get(v) ?? 0) + 1);
            }
          } catch {
            /* one unreadable sheet doesn't stop the rest */
          }
        }
        data.breakpoints.values = [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([value, count]) => ({ value, count }));
      }
      // Keep fingerprints of the SVG paths, not the paths: the sweep only needs
      // to recognize them, and the files stay small.
      data.svgPathHashes = [...new Set((data.svgPaths ?? []).map((/** @type {string} */ d) => pathHash(d)))];
      delete data.svgPaths;
      // The original's logo file, as research, so the sweep can recognize a copy.
      if (as !== 'clone' && data.logo?.src && /^https?:/.test(data.logo.src) && !logoSaved) {
        try {
          const buf = await getBuffer(data.logo.src);
          const ext = (path.extname(new URL(data.logo.src).pathname).toLowerCase().match(/^\.(png|jpe?g|webp|gif|svg|avif)$/) ?? ['.png'])[0];
          writeFileSync(path.join(outDir, `${name}-logo${ext}`), buf);
          data.logo.saved = `${name}-logo${ext}`;
          logoSaved = true;
        } catch {
          /* a logo that won't download is not worth stopping for */
        }
      }
      const json = path.join(outDir, `${name}@${width}.json`);
      writeJson(json, data);
      rows.push([width, data.page.h, data.nodes.length, data.text.length, data.network.origins.length, rel(root, json)]);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  say(table(['width', 'page height', 'nodes', 'text blocks', 'hosts', 'saved'], rows));
  return 0;
}
