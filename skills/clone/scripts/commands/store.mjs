// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { list, num } from '../lib/args.mjs';
import { appendCsv } from '../lib/csv.mjs';
import { ensureDir, paths, projectRoot, rel, today, writeJson } from '../lib/fsx.mjs';
import { getBuffer, getJson, sleep } from '../lib/net.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { squash } from '../lib/text.mjs';

export const help = `remaster store lookup <app id | App Store URL | "search words"> [--country us] [--no-screens]
remaster store reviews <app id> [--countries us,gb,ca,au] [--pages 10]

App Store research through Apple's own public endpoints: the iTunes lookup
and search API, and the customer reviews feed. No scraping, no login.

lookup saves research/store/app.json (name, seller, description, release
notes, price, rating counts, screenshot links) and downloads the screenshots
to research/store/screens/ as reference. Search words list the matches with
their ids; pick one and run lookup again with the id.

reviews appends to research/reviews.csv, newest first, up to 50 a page and
10 pages per country, skipping rows already there. Each row links to the
app's reviews page; the feed has no link per review, so the id column holds
the review's own id.

Google Play has no public reviews API for other people's apps: read its
reviews in the browser and add rows by hand, with the link.`;

const COLUMNS = ['id', 'source', 'url', 'date', 'rating', 'text'];

/** @param {string} input */
function appIdOf(input) {
  if (/^\d{6,}$/.test(input)) return input;
  const m = input.match(/\/id(\d{6,})/);
  return m ? m[1] : null;
}

/** @param {any} v */
const label = (v) => (v && typeof v === 'object' && 'label' in v ? String(v.label) : '');

/**
 * Rows from one page of the reviews feed.
 * @param {any} feed @param {string} appId @param {string} country
 */
export function reviewRows(feed, appId, country) {
  const entries = feed?.feed?.entry ? [].concat(feed.feed.entry) : [];
  return entries
    .filter((e) => e && e['im:rating'])
    .map((e) => {
      const title = squash(label(e.title));
      const content = squash(label(e.content));
      const text = title && !content.toLowerCase().startsWith(title.toLowerCase()) ? `${title}${/[.!?]$/.test(title) ? '' : '.'} ${content}` : content;
      return {
        id: `as-${country}-${label(e.id)}`,
        source: 'app-store',
        url: `https://apps.apple.com/${country}/app/id${appId}?see-all=reviews`,
        date: label(e.updated).slice(0, 10),
        rating: label(e['im:rating']),
        text,
      };
    });
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const [sub, ...rest] = positionals;
  const root = projectRoot();
  const p = paths(root);
  if (sub === 'lookup') {
    const input = rest.join(' ').trim();
    if (!input) fail(help);
    const country = typeof flags.country === 'string' ? flags.country : 'us';
    const id = appIdOf(input);
    if (!id) {
      const res = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(input)}&entity=software&country=${country}&limit=8`);
      if (!res.results?.length) fail(`No App Store apps match "${input}" in ${country}.`);
      say(table(['id', 'app', 'seller', 'ratings'], res.results.map((/** @type {any} */ r) => [r.trackId, r.trackName, r.sellerName, r.userRatingCount ?? 0])));
      say('\nRun `remaster store lookup <id>` with the right one.');
      return 0;
    }
    const res = await getJson(`https://itunes.apple.com/lookup?id=${id}&country=${country}`);
    const a = res.results?.[0];
    if (!a) fail(`Apple has no app ${id} in the ${country} store.`);
    const app = {
      id,
      country,
      name: a.trackName,
      seller: a.sellerName,
      url: a.trackViewUrl,
      genres: a.genres,
      price: a.formattedPrice,
      rating: a.averageUserRating,
      ratings: a.userRatingCount,
      version: a.version,
      released: a.releaseDate,
      updated: a.currentVersionReleaseDate,
      minimumOs: a.minimumOsVersion,
      size: a.fileSizeBytes,
      contentRating: a.contentAdvisoryRating,
      description: a.description,
      releaseNotes: a.releaseNotes,
      screenshots: a.screenshotUrls ?? [],
      ipadScreenshots: a.ipadScreenshotUrls ?? [],
      readAt: today(),
    };
    ensureDir(p.store);
    writeJson(path.join(p.store, 'app.json'), app);
    appendCsv(p.sources, ['id', 'kind', 'url', 'title', 'read_at', 'notes'], [{ id: `store-${id}`, kind: 'app-store', url: a.trackViewUrl, title: a.trackName, read_at: today(), notes: `${a.userRatingCount ?? 0} ratings, ${a.averageUserRating ?? '?'} average` }], 'id');
    let saved = 0;
    if (!flags['no-screens']) {
      const dir = path.join(p.store, 'screens');
      ensureDir(dir);
      const shots = [...app.screenshots.map((/** @type {string} */ u, /** @type {number} */ i) => [`iphone-${i + 1}`, u]), ...app.ipadScreenshots.map((/** @type {string} */ u, /** @type {number} */ i) => [`ipad-${i + 1}`, u])];
      for (const [name, url] of shots) {
        try {
          const buf = await getBuffer(url);
          fs.writeFileSync(path.join(dir, `${name}${path.extname(new URL(url).pathname) || '.jpg'}`), buf);
          saved++;
        } catch {
          /* a missing screenshot is not worth stopping for */
        }
      }
    }
    say(`${app.name} by ${app.seller}: ${app.ratings ?? 0} ratings, ${app.rating ?? '?'} average, version ${app.version}, ${app.price}.`);
    say(`Saved ${rel(root, path.join(p.store, 'app.json'))}${saved ? ` and ${saved} screenshots in ${rel(root, path.join(p.store, 'screens'))} (reference only, never shipped)` : ''}.`);
    return 0;
  }
  if (sub === 'reviews') {
    const id = appIdOf(rest[0] ?? '');
    if (!id) fail('Give the numeric app id. `remaster store lookup "<name>"` finds it.');
    const countries = list(flags.countries, ['us', 'gb', 'ca', 'au']);
    const pages = Math.min(10, num(flags.pages, 10));
    const rows = [];
    /** @type {(string | number)[][]} */
    const summary = [];
    for (const country of countries) {
      let n = 0;
      for (let page = 1; page <= pages; page++) {
        let feed;
        try {
          feed = await getJson(`https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${id}/sortby=mostrecent/json`);
        } catch {
          break;
        }
        const got = reviewRows(feed, id, country);
        if (!got.length) break;
        rows.push(...got);
        n += got.length;
        await sleep(400);
      }
      summary.push([country, n]);
    }
    const { added, skipped } = appendCsv(p.reviews, COLUMNS, rows, 'id');
    say(table(['country', 'reviews read'], summary));
    say(`\nAdded ${added} rows to ${rel(root, p.reviews)}${skipped ? ` (${skipped} were already there)` : ''}.`);
    appendCsv(p.sources, ['id', 'kind', 'url', 'title', 'read_at', 'notes'], [{ id: `store-reviews-${id}`, kind: 'reviews', url: `https://apps.apple.com/us/app/id${id}?see-all=reviews`, title: 'App Store reviews', read_at: today(), notes: `${rows.length} rows from ${countries.join(', ')}` }], 'id');
    return 0;
  }
  fail(help);
}
