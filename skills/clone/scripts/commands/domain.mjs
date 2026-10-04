// @ts-check
import { list } from '../lib/args.mjs';
import { getJson, getText } from '../lib/net.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { today } from '../lib/fsx.mjs';

export const help = `remaster domain <name[,name...]> [--tlds com,app,io,co,ai,dev]

Check names against the registries themselves through RDAP, the lookup that
replaced WHOIS, with IANA's list of which registry answers for each ending.
Endings with no RDAP server fall back to DNS: a name with nameservers is
taken. Prints the date it was checked, because availability changes.

"Looks free" means the registry has no record. A registrar can still price
it as premium or hold it reserved, so confirm at the registrar before you
plan around it.`;

/** @param {string} name */
function clean(name) {
  return name.toLowerCase().replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9-]/g, '');
}

/**
 * The registry's answer for one domain.
 * @param {string} domain
 * @param {Record<string, string>} bases tld -> RDAP base URL
 */
export async function checkDomain(domain, bases) {
  const tld = domain.split('.').pop() ?? '';
  const base = bases[tld];
  if (base) {
    const r = await getText(`${base.replace(/\/?$/, '/')}domain/${domain}`, { accept: 'application/rdap+json', timeout: 15_000 }).catch(() => null);
    if (r && r.status === 404) return { domain, status: 'looks free', detail: 'no registry record', via: 'RDAP' };
    if (r && r.status === 200) {
      let detail = '';
      try {
        const j = JSON.parse(r.text);
        const ev = (/** @type {string} */ a) => (j.events ?? []).find((/** @type {any} */ e) => e.eventAction === a)?.eventDate?.slice(0, 10);
        detail = [ev('registration') && `registered ${ev('registration')}`, ev('expiration') && `expires ${ev('expiration')}`].filter(Boolean).join(', ');
      } catch {
        /* a 200 is enough to say it's taken */
      }
      return { domain, status: 'taken', detail, via: 'RDAP' };
    }
  }
  const dns = await getJson(`https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`, { headers: { accept: 'application/dns-json' } }).catch(() => null);
  if (dns && dns.Status === 3) return { domain, status: 'looks free', detail: 'no DNS record', via: 'DNS' };
  if (dns && dns.Status === 0 && (dns.Answer?.length || dns.Authority?.length)) return { domain, status: 'taken', detail: 'has DNS records', via: 'DNS' };
  // A server failure at the delegation means the registry delegates the name
  // to nameservers that don't answer: registered, just broken.
  if (dns && dns.Status === 2) return { domain, status: 'taken', detail: 'registered, its nameservers don\'t answer', via: 'DNS' };
  return { domain, status: 'unknown', detail: 'no answer; check at a registrar', via: base ? 'RDAP' : 'DNS' };
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const names = positionals.flatMap((p) => list(p)).map(clean).filter(Boolean);
  if (!names.length) fail(help);
  const tlds = list(flags.tlds, ['com', 'app', 'io', 'co', 'ai', 'dev']).map((t) => t.replace(/^\./, '').toLowerCase());
  const boot = await getJson('https://data.iana.org/rdap/dns.json');
  /** @type {Record<string, string>} */
  const bases = {};
  for (const [endings, urls] of boot.services ?? []) for (const e of endings) bases[e] = urls[0];
  const rows = [];
  for (const n of names) for (const t of tlds) rows.push(await checkDomain(`${n}.${t}`, bases));
  say(table(['domain', 'status', 'detail', 'checked by'], rows.map((r) => [r.domain, r.status, r.detail, r.via])));
  say(`\nChecked ${today()}. Confirm at a registrar before you buy.`);
  return 0;
}
