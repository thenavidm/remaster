// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { num } from '../lib/args.mjs';
import { paths, projectRoot, rel, writeJson } from '../lib/fsx.mjs';
import { readHead, sitemapUrls } from '../lib/html.mjs';
import { getText, sleep } from '../lib/net.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { squash } from '../lib/text.mjs';

export const help = `remaster urls <old sitemap URL | old site URL | file of URLs> --new <new site base URL> [--max 500] [--delay 200] [--strict]

The migration check: every URL of the site you own must still work on the new
build, with the same head tags, or you lose the search traffic it earned.

For each old URL it requests the same path on the new site, follows up to 5
redirects, and compares the title, description, canonical path, robots tag,
og:title and h1 with the old page. A URL passes when it ends in 200 within
one redirect and nothing went noindex. Writes remaster/verify/urls.json.
Exits 1 when a URL fails, or with --strict when any head tag changed.`;

/**
 * Request a URL without following redirects, so every hop is visible.
 * @param {string} url
 */
async function trace(url) {
  const hops = [];
  let current = url;
  for (let i = 0; i < 6; i++) {
    const r = await getText(current, { redirect: 'manual', timeout: 20_000 }).catch(() => null);
    if (!r) return { hops, status: 0, final: current, html: '' };
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) return { hops, status: r.status, final: current, html: '' };
      hops.push({ status: r.status, to: new URL(loc, current).toString() });
      current = new URL(loc, current).toString();
      continue;
    }
    return { hops, status: r.status, final: current, html: r.text };
  }
  return { hops, status: 310, final: current, html: '' };
}

/**
 * Old URLs from a sitemap (or sitemap index), a site's /sitemap.xml, or a
 * text file with one URL per line.
 * @param {string} source
 */
async function oldUrls(source) {
  if (fs.existsSync(source)) {
    return fs.readFileSync(source, 'utf8').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l));
  }
  const first = await getText(source.endsWith('.xml') ? source : `${source.replace(/\/$/, '')}/sitemap.xml`, { accept: 'application/xml' });
  if (first.status !== 200) throw new Error(`No sitemap at ${source} (status ${first.status}). Pass a file of URLs instead.`);
  let urls = sitemapUrls(first.text);
  if (/<sitemapindex/i.test(first.text)) {
    const all = [];
    for (const sm of urls) {
      const r = await getText(sm, { accept: 'application/xml' }).catch(() => null);
      if (r && r.status === 200) all.push(...sitemapUrls(r.text));
    }
    urls = all;
  }
  return urls;
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const source = positionals[0];
  const fresh = typeof flags.new === 'string' ? flags.new.replace(/\/$/, '') : '';
  if (!source || !fresh) fail(help);
  const root = projectRoot();
  const list = (await oldUrls(source)).slice(0, num(flags.max, 500));
  if (!list.length) fail('No old URLs found.');
  const delay = num(flags.delay, 200);
  const results = [];
  for (const oldUrl of list) {
    const u = new URL(oldUrl);
    const newUrl = `${fresh}${u.pathname}${u.search}`;
    const [o, n] = [await trace(oldUrl), await trace(newUrl)];
    const ho = o.html ? readHead(o.html) : null;
    const hn = n.html ? readHead(n.html) : null;
    /** @type {string[]} */
    const changed = [];
    if (ho && hn) {
      for (const key of /** @type {const} */ (['title', 'description', 'ogTitle', 'h1'])) if (squash(ho[key]) !== squash(hn[key])) changed.push(key);
      const cpath = (/** @type {string} */ c) => {
        try {
          return new URL(c, oldUrl).pathname.replace(/\/$/, '');
        } catch {
          return c;
        }
      };
      if (cpath(ho.canonical) !== cpath(hn.canonical)) changed.push('canonical');
    }
    const noindex = !!hn && /noindex/i.test(hn.robots) && !(ho && /noindex/i.test(ho.robots));
    const ok = n.status === 200 && n.hops.length <= 1 && !noindex;
    results.push({
      path: `${u.pathname}${u.search}`,
      old: o.status,
      new: n.status,
      redirects: n.hops.map((h) => `${h.status} ${new URL(h.to).pathname}`),
      changed,
      noindex,
      ok,
      before: ho ? { title: ho.title, description: ho.description } : null,
      after: hn ? { title: hn.title, description: hn.description } : null,
    });
    await sleep(delay);
  }
  const p = paths(root);
  writeJson(p.urls, { checkedAt: new Date().toISOString(), old: source, new: fresh, results });
  const failing = results.filter((r) => !r.ok);
  const drifted = results.filter((r) => r.changed.length);
  if (flags.json) say(JSON.stringify({ results }, null, 2));
  else {
    say(`${results.length} old URLs checked on ${fresh}: ${results.length - failing.length} pass, ${failing.length} fail, ${drifted.length} with changed head tags.`);
    if (failing.length) say('\n' + table(['path', 'new status', 'redirects', 'why'], failing.slice(0, 40).map((r) => [r.path, r.new, r.redirects.join(' > '), r.noindex ? 'went noindex' : r.new !== 200 ? 'not 200' : 'more than one redirect'])));
    if (drifted.length) say('\n' + table(['path', 'changed'], drifted.slice(0, 40).map((r) => [r.path, r.changed.join(', ')])));
    say(`\nSaved ${rel(root, p.urls)}.`);
  }
  return failing.length || (flags.strict && drifted.length) ? 1 : 0;
}
