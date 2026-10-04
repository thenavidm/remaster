// @ts-check

/**
 * Every request says who it is and where to read about it, so a site owner
 * looking at their logs can see what this is and block it in robots.txt.
 */
export const USER_AGENT = 'Mozilla/5.0 (compatible; RemasterResearch/0.1; +https://github.com/thenavidm/remaster)';

/** The product token robots.txt groups are matched against. */
export const ROBOTS_TOKEN = 'remasterresearch';

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a URL as text with a timeout and a size cap.
 * @param {string} url
 * @param {{ timeout?: number, accept?: string, maxBytes?: number, redirect?: RequestRedirect, headers?: Record<string, string> }} [opts]
 */
export async function getText(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 20_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: opts.redirect ?? 'follow',
      headers: { 'user-agent': USER_AGENT, accept: opts.accept ?? 'text/html,application/xhtml+xml,*/*;q=0.8', ...(opts.headers ?? {}) },
    });
    const max = opts.maxBytes ?? 5_000_000;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > max) return { status: res.status, url: res.url, headers: res.headers, text: '', tooBig: true };
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, url: res.url, headers: res.headers, text: buf.subarray(0, max).toString('utf8'), tooBig: buf.length > max };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET JSON. Throws with the status when the answer is not JSON, so a caller
 * reports "the API said 429" instead of a parse error.
 * @param {string} url
 * @param {{ timeout?: number, headers?: Record<string, string> }} [opts]
 */
export async function getJson(url, opts = {}) {
  const r = await getText(url, { ...opts, accept: 'application/json' });
  if (r.status >= 400) throw new Error(`${r.status} from ${url}`);
  try {
    return JSON.parse(r.text);
  } catch {
    throw new Error(`Not JSON from ${url} (status ${r.status})`);
  }
}

/**
 * Download a file to a buffer.
 * @param {string} url
 */
export async function getBuffer(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
