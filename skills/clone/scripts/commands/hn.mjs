// @ts-check
import { num, str } from '../lib/args.mjs';
import { appendCsv } from '../lib/csv.mjs';
import { paths, projectRoot, rel, today } from '../lib/fsx.mjs';
import { decodeEntities, htmlToText } from '../lib/html.mjs';
import { getJson, sleep } from '../lib/net.mjs';
import { fail, say } from '../lib/out.mjs';
import { squash } from '../lib/text.mjs';

export const help = `remaster hn "<query>" [--tags comment|story] [--since 2024-01-01] [--max 300]

Hacker News comments (or stories) that mention the query, through the
official search API, newest first, appended to research/reviews.csv with a
link to each comment. Good queries are the product's name, "<name>
alternative" and "switched from <name>". Hacker News has no star ratings,
so the rating column stays empty.`;

/**
 * @param {any} hit
 * @param {'comment' | 'story'} tag
 */
export function hnRow(hit, tag) {
  const raw = tag === 'comment' ? hit.comment_text : [hit.title, hit.story_text].filter(Boolean).join('. ');
  const text = squash(htmlToText(decodeEntities(raw ?? '')));
  return {
    id: `hn-${hit.objectID}`,
    source: 'hacker-news',
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    date: String(hit.created_at ?? '').slice(0, 10),
    rating: '',
    text,
  };
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const query = positionals.join(' ').trim();
  if (!query) fail(help);
  const tag = str(flags.tags, 'comment') === 'story' ? 'story' : 'comment';
  const max = num(flags.max, 300);
  const since = typeof flags.since === 'string' ? Math.floor(new Date(flags.since).getTime() / 1000) : 0;
  const root = projectRoot();
  const p = paths(root);
  const rows = [];
  for (let page = 0; rows.length < max && page < 20; page++) {
    const filter = since ? `&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}` : '';
    const res = await getJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=${tag}&hitsPerPage=100&page=${page}${filter}`);
    const hits = res.hits ?? [];
    if (!hits.length) break;
    for (const h of hits) {
      const row = hnRow(h, tag);
      if (row.text.length >= 20) rows.push(row);
    }
    if (page + 1 >= (res.nbPages ?? 0)) break;
    await sleep(300);
  }
  const { added, skipped } = appendCsv(p.reviews, ['id', 'source', 'url', 'date', 'rating', 'text'], rows.slice(0, max), 'id');
  appendCsv(p.sources, ['id', 'kind', 'url', 'title', 'read_at', 'notes'], [{ id: `hn-${query.toLowerCase().replace(/\W+/g, '-')}`, kind: 'hacker-news', url: `https://hn.algolia.com/?q=${encodeURIComponent(query)}`, title: `Hacker News: ${query}`, read_at: today(), notes: `${rows.length} ${tag}s` }], 'id');
  say(`Read ${rows.length} ${tag}s mentioning "${query}". Added ${added} rows to ${rel(root, p.reviews)}${skipped ? ` (${skipped} already there)` : ''}.`);
  return 0;
}
