// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { num, str } from '../lib/args.mjs';
import { NO_PLAYWRIGHT, launch, loadPlaywright } from '../lib/browser.mjs';
import { appendCsv } from '../lib/csv.mjs';
import { ensureDir, paths, projectRoot, rel, today, writeJson, writeText } from '../lib/fsx.mjs';
import { contentOf, htmlToText, linksOf, readHead, sitemapUrls } from '../lib/html.mjs';
import { ROBOTS_TOKEN, USER_AGENT, getText, sleep } from '../lib/net.mjs';
import { fail, say } from '../lib/out.mjs';
import { isAllowed, parseRobots, rulesFor } from '../lib/robots.mjs';
import { slug } from '../lib/text.mjs';

export const help = `remaster crawl <start url> [options]

Read a public help center or docs site into research/sources/, one markdown
file per page with its URL, and log each page in remaster/sources.csv. The
help center is the most complete feature list a product has: every setting,
limit and edge case its own team wrote down.

It is polite by design: it obeys robots.txt (as RemasterResearch, else the
rules for every crawler), waits between requests, stays on the start URL's
host and path, sends a user agent that says what it is, and backs off when
the site says to slow down.

  --max 150         pages at most
  --delay 1000      milliseconds between requests (never under 500)
  --prefix /help    only follow paths under this (default: the start path's folder)
  --sitemap         also seed from the site's sitemap, filtered to the prefix
  --render          render pages in a browser first, for docs built in JavaScript`;

/** @param {string} u */
function normalize(u) {
  const x = new URL(u);
  x.hash = '';
  for (const k of [...x.searchParams.keys()]) if (/^(utm_|ref$|source$|fbclid|gclid)/.test(k)) x.searchParams.delete(k);
  return x.toString().replace(/\/$/, '');
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const start = positionals[0];
  if (!start || !/^https?:\/\//.test(start)) fail(help);
  const root = projectRoot();
  const p = paths(root);
  // Help centers often redirect (a help. subdomain to /help on the main
  // site). Follow it once and crawl where the content actually lives.
  const first = await getText(start).catch(() => null);
  const base = new URL(first?.url || start);
  const section = base.pathname.replace(/\/$/, '') || '/';
  const prefix = str(flags.prefix, section);
  const under = (/** @type {string} */ pathname) => prefix === '/' || pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
  const max = num(flags.max, 150);
  const delay = Math.max(500, num(flags.delay, 1000));

  const robotsRes = await getText(`${base.origin}/robots.txt`, { accept: 'text/plain' }).catch(() => null);
  const robotsOk = robotsRes && robotsRes.status === 200 && !/html/i.test(robotsRes.headers.get('content-type') ?? '');
  const robots = robotsOk ? parseRobots(robotsRes.text) : { groups: [], sitemaps: [] };
  const rules = rulesFor(robots.groups, ROBOTS_TOKEN);
  const allowed = (/** @type {string} */ u) => {
    const x = new URL(u);
    return isAllowed(rules, x.pathname + x.search);
  };
  if (!allowed(base.toString())) fail(`${base.origin}/robots.txt asks crawlers to stay out of ${base.pathname}. Read it in the browser instead, or use the product's public API docs.`);

  /** @type {string[]} */
  const queue = [normalize(base.toString())];
  const seen = new Set(queue);
  if (flags.sitemap) {
    const maps = robots.sitemaps.length ? robots.sitemaps : [`${base.origin}/sitemap.xml`];
    for (const m of maps.slice(0, 5)) {
      const r = await getText(m, { accept: 'application/xml,text/xml' }).catch(() => null);
      if (!r || r.status !== 200) continue;
      let urls = sitemapUrls(r.text);
      // A sitemap index points at more sitemaps; read the ones under the prefix.
      if (/<sitemapindex/i.test(r.text)) {
        const nested = [];
        for (const sm of urls.filter((u) => new URL(u).pathname.includes(prefix.replace(/\/$/, '').split('/').pop() ?? '') || urls.length <= 3).slice(0, 5)) {
          const rr = await getText(sm, { accept: 'application/xml' }).catch(() => null);
          if (rr && rr.status === 200) nested.push(...sitemapUrls(rr.text));
          await sleep(delay);
        }
        urls = nested;
      }
      for (const u of urls) {
        try {
          const x = new URL(u);
          if (x.host === base.host && under(x.pathname)) {
            const n = normalize(u);
            if (!seen.has(n)) {
              seen.add(n);
              queue.push(n);
            }
          }
        } catch {
          /* not a URL */
        }
      }
    }
  }

  let pw = null;
  let browser = null;
  if (flags.render) {
    pw = await loadPlaywright();
    if (!pw) fail(NO_PLAYWRIGHT);
    browser = await launch(pw);
  }
  ensureDir(p.crawled);
  const rows = [];
  let blocked = 0;
  let failed = 0;
  let slowdowns = 0;
  try {
    while (queue.length && rows.length < max) {
      const url = /** @type {string} */ (queue.shift());
      if (!allowed(url)) {
        blocked++;
        continue;
      }
      let html = '';
      let status = 0;
      if (browser) {
        const page = await browser.newPage({ userAgent: USER_AGENT });
        try {
          const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await page.waitForTimeout(800);
          status = res ? res.status() : 0;
          html = await page.content();
        } catch {
          status = 0;
        } finally {
          await page.close();
        }
      } else {
        const r = await getText(url).catch(() => null);
        status = r ? r.status : 0;
        if (r && r.status === 429) {
          slowdowns++;
          const wait = Number(r.headers.get('retry-after') ?? 30);
          if (slowdowns > 3) {
            say('The site keeps asking to slow down. Stopping here.');
            break;
          }
          await sleep(Math.min(120, Number.isFinite(wait) ? wait : 30) * 1000);
          queue.unshift(url);
          continue;
        }
        if (r && /html/i.test(r.headers.get('content-type') ?? '')) html = r.text;
      }
      if (status !== 200 || !html) {
        failed++;
        await sleep(delay);
        continue;
      }
      const head = readHead(html);
      const text = htmlToText(contentOf(html));
      const n = rows.length + 1;
      const file = path.join(p.crawled, `${String(n).padStart(3, '0')}-${slug(new URL(url).pathname || 'index', 50)}.md`);
      writeText(file, `---\nurl: ${url}\ntitle: ${JSON.stringify(head.title || head.h1)}\nread_at: ${today()}\n---\n\n${text}\n`);
      rows.push({ id: `help-${String(n).padStart(3, '0')}`, kind: 'help', url, title: head.title || head.h1, read_at: today(), notes: `${text.split(/\s+/).length} words, ${rel(root, file)}` });
      for (const link of linksOf(html, url)) {
        try {
          const x = new URL(link);
          if (x.host !== base.host || !under(x.pathname)) continue;
          if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|css|js)$/i.test(x.pathname)) continue;
          const nlink = normalize(link);
          if (!seen.has(nlink)) {
            seen.add(nlink);
            queue.push(nlink);
          }
        } catch {
          /* skip */
        }
      }
      await sleep(delay);
    }
  } finally {
    if (browser) await browser.close();
  }
  appendCsv(p.sources, ['id', 'kind', 'url', 'title', 'read_at', 'notes'], rows, 'url');
  writeJson(path.join(p.research, 'crawl.json'), { start, prefix, pages: rows.length, blockedByRobots: blocked, failed, left: queue.length, at: new Date().toISOString() });
  say(`Read ${rows.length} page(s) under ${base.host}${prefix} into ${rel(root, p.crawled)}.${blocked ? ` ${blocked} skipped for robots.txt.` : ''}${failed ? ` ${failed} failed.` : ''}${queue.length ? ` ${queue.length} more found; raise --max to read them.` : ''}`);
  if (rows.length && rows.every((r) => Number(String(r.notes).split(' ')[0]) < 40) && !flags.render) say('Pages came back nearly empty: the docs are probably built in JavaScript. Run again with --render.');
  return 0;
}
