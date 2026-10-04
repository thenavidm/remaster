// @ts-check

const ENTITIES = /** @type {Record<string, string>} */ ({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '-', ndash: '-', hellip: '...',
  rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', copy: '(c)', reg: '(R)', trade: '(TM)', middot: '·',
  bull: '•', laquo: '«', raquo: '»', times: '×', rarr: '→', larr: '←', check: '✓',
});

/** @param {string} s */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    const k = String(e).toLowerCase();
    if (k.startsWith('#x')) return safeChar(parseInt(k.slice(2), 16), m);
    if (k.startsWith('#')) return safeChar(parseInt(k.slice(1), 10), m);
    return ENTITIES[k] ?? m;
  });
}

/** @param {number} code @param {string} fallback */
function safeChar(code, fallback) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/**
 * Remove whole elements, content and all. Regex is enough here because these
 * tags never nest inside themselves in real pages.
 * @param {string} html @param {string[]} tags
 */
function dropBlocks(html, tags) {
  let out = html;
  for (const t of tags) out = out.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, 'gi'), ' ');
  return out;
}

/**
 * The part of a page that holds its content: <main>, else <article>, else the
 * body without its header, nav, footer and sidebars.
 * @param {string} html
 */
export function contentOf(html) {
  const clean = dropBlocks(html.replace(/<!--[\s\S]*?-->/g, ' '), ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'head']);
  const main = clean.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i) ?? clean.match(/<[a-z]+\b[^>]*role=["']main["'][^>]*>([\s\S]*)/i);
  if (main) return dropBlocks(main[1], ['nav', 'aside']);
  const article = clean.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i);
  if (article) return article[1];
  const body = clean.match(/<body\b[^>]*>([\s\S]*?)(<\/body\s*>|$)/i);
  return dropBlocks(body ? body[1] : clean, ['header', 'nav', 'footer', 'aside', 'form']);
}

/**
 * HTML as readable markdown-ish text: headings keep their level, list items
 * keep their bullet, and nothing else of the markup survives.
 * @param {string} html
 */
export function htmlToText(html) {
  let s = String(html ?? '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, lvl, inner) => `\n\n${'#'.repeat(Number(lvl))} ${inner.replace(/<[^>]+>/g, ' ')}\n\n`);
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(p|div|section|article|ul|ol|table|tr|blockquote|pre|figure|details|summary|dl|dt|dd)\s*>/gi, '\n\n');
  s = s.replace(/<(td|th)\b[^>]*>/gi, ' | ');
  s = s.replace(/<hr\b[^>]*>/gi, '\n\n---\n\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/**
 * Every followable link on a page, resolved against its URL.
 * @param {string} html @param {string} base
 */
export function linksOf(html, base) {
  const out = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim());
    if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      u.hash = '';
      out.add(u.toString());
    } catch {
      /* not a URL */
    }
  }
  return [...out];
}

/**
 * The head tags that matter for search and sharing, plus the first h1.
 * @param {string} html
 */
export function readHead(html) {
  const head = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i) ?? [null, html])[1] ?? '';
  /** @param {RegExp} re */
  const pick = (re) => {
    const m = head.match(re);
    return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
  };
  /** @param {string} key */
  const meta = (key) => {
    const tag = [...head.matchAll(/<meta\b[^>]*>/gi)].map((t) => t[0]).find((t) => new RegExp(`(?:name|property)\\s*=\\s*["']${key}["']`, 'i').test(t));
    if (!tag) return '';
    const c = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    return c ? decodeEntities(c[1] ?? c[2] ?? '').replace(/\s+/g, ' ').trim() : '';
  };
  const canonicalTag = [...head.matchAll(/<link\b[^>]*>/gi)].map((t) => t[0]).find((t) => /rel\s*=\s*["']canonical["']/i.test(t));
  const canonical = canonicalTag ? (canonicalTag.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i) ?? [])[1] ?? '' : '';
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i);
  return {
    title: pick(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i),
    description: meta('description'),
    canonical,
    robots: meta('robots'),
    ogTitle: meta('og:title'),
    ogDescription: meta('og:description'),
    ogImage: meta('og:image'),
    h1: h1 ? decodeEntities(h1[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '',
  };
}

/** The URLs in a sitemap or sitemap index. @param {string} xml */
export function sitemapUrls(xml) {
  return [...String(xml ?? '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
}
