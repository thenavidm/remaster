// @ts-check

/** @typedef {{ allow: boolean, path: string }} Rule */
/** @typedef {{ agents: string[], rules: Rule[] }} Group */

/**
 * robots.txt as RFC 9309 reads it: groups of user-agent lines followed by
 * their rules, plus every Sitemap line anywhere in the file.
 * @param {string} text
 * @returns {{ groups: Group[], sitemaps: string[] }}
 */
export function parseRobots(text) {
  /** @type {Group[]} */
  const groups = [];
  const sitemaps = [];
  /** @type {Group | null} */
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current) continue;
      if (key === 'disallow' && value === '') continue;
      current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'sitemap') {
      sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

/**
 * The rules that apply to a crawler: every group naming its product token,
 * merged, else the `*` groups merged, else nothing (everything allowed).
 * @param {Group[]} groups @param {string} token
 */
export function rulesFor(groups, token) {
  const t = token.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a === t));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

/**
 * A robots path pattern as a RegExp: `*` matches anything, `$` anchors the end.
 * @param {string} pattern
 */
function patternRe(pattern) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/**
 * Whether a path (with its query) may be fetched. The longest matching rule
 * wins, and an allow wins a tie, as the RFC says.
 * @param {Rule[]} rules @param {string} pathWithQuery
 */
export function isAllowed(rules, pathWithQuery) {
  if (pathWithQuery === '/robots.txt') return true;
  let best = null;
  for (const r of rules) {
    if (!patternRe(r.path).test(pathWithQuery)) continue;
    const len = r.path.replace(/\*/g, '').length;
    if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}
