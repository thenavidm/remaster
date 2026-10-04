import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, list, num } from '../skills/clone/scripts/lib/args.mjs';
import { parseCsv, csvObjects, toCsv, appendCsv, readCsv } from '../skills/clone/scripts/lib/csv.mjs';
import { parseColor, contrast, deltaE, hex, chroma, colorsInText } from '../skills/clone/scripts/lib/color.mjs';
import { identWords, containsRun, shingles, fold, graphemes, words, slug, similarity } from '../skills/clone/scripts/lib/text.mjs';
import { parseRobots, rulesFor, isAllowed } from '../skills/clone/scripts/lib/robots.mjs';
import { htmlToText, readHead, linksOf, sitemapUrls, contentOf } from '../skills/clone/scripts/lib/html.mjs';
import { decodePng, encodePng, resizeToWidth } from '../skills/clone/scripts/lib/png.mjs';
import { toYaml } from '../skills/clone/scripts/lib/yaml.mjs';

test('args: flags, booleans, positionals, lists', () => {
  const { flags, positionals } = parseArgs(['measure', 'https://x.com', '--widths', '1440,390', '--json', 'extra', '--as=clone'], ['json']);
  assert.deepEqual(positionals, ['measure', 'https://x.com', 'extra']);
  assert.equal(flags.json, true);
  assert.equal(flags.as, 'clone');
  assert.deepEqual(list(flags.widths), ['1440', '390']);
  assert.equal(num(flags.missing, 7), 7);
});

test('csv: quotes, doubled quotes, newlines and CRLF survive a round trip', () => {
  const rows = [{ id: 'a', text: 'He said "hi",\nthen left' }, { id: 'b', text: 'plain' }];
  const text = toCsv(['id', 'text'], rows).replace(/\n(?=b,)/, '\r\n');
  const { records } = csvObjects(text);
  assert.equal(records[0].text, 'He said "hi",\nthen left');
  assert.equal(records[1].id, 'b');
  assert.deepEqual(parseCsv('a,"b,c"\n'), [['a', 'b,c']]);
});

test('csv: appendCsv writes the header once and skips rows it already has', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-'));
  const f = path.join(dir, 'r.csv');
  assert.deepEqual(appendCsv(f, ['id', 'v'], [{ id: '1', v: 'a' }], 'id'), { added: 1, skipped: 0 });
  assert.deepEqual(appendCsv(f, ['id', 'v'], [{ id: '1', v: 'a' }, { id: '2', v: 'b' }], 'id'), { added: 1, skipped: 1 });
  assert.equal(readCsv(f).records.length, 2);
  assert.equal(fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('id,')).length, 1);
});

test('color: parses hex, rgb, hsl, oklch and oklab to the same sRGB', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('rgb(255 0 0 / 50%)'), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.equal(hex(/** @type {any} */ (parseColor('hsl(120, 100%, 25%)'))), '#008000');
  assert.equal(hex(/** @type {any} */ (parseColor('oklch(1 0 0)'))), '#ffffff');
  assert.equal(hex(/** @type {any} */ (parseColor('oklab(0 0 0)'))), '#000000');
  assert.equal(parseColor('not a color'), null);
});

test('color: WCAG contrast and OKLab distance', () => {
  const black = /** @type {any} */ (parseColor('#000'));
  const white = /** @type {any} */ (parseColor('#fff'));
  assert.equal(Math.round(contrast(black, white) * 10) / 10, 21);
  assert.ok(contrast(/** @type {any} */ (parseColor('#777')), white) < 4.5, '#777 on white fails AA');
  assert.equal(deltaE(black, black), 0);
  assert.ok(chroma(/** @type {any} */ (parseColor('#808080'))) < 0.001);
  assert.ok(chroma(/** @type {any} */ (parseColor('#533afd'))) > 0.15);
  assert.deepEqual(colorsInText('a { color: #533afd; background: rgb(1 2 3) }').map((c) => c.raw), ['#533afd', 'rgb(1 2 3)']);
});

test('text: identifier words, runs, shingles, folding', () => {
  assert.deepEqual(identWords('CalendlyEmbed'), ['calendly', 'embed']);
  assert.deepEqual(identWords('calendly-embed_v2'), ['calendly', 'embed', 'v', '2']);
  assert.ok(containsRun(identWords('useCalComBooking'), identWords('Cal.com')));
  assert.ok(!containsRun(identWords('calendar'), identWords('cal')));
  assert.deepEqual(shingles(['a', 'b', 'c', 'd'], 3), ['a b c', 'b c d']);
  assert.equal(fold('It\u2019s \u201Cfine\u201D \u2014 ok\u2026'), 'It\'s "fine" - ok...');
  assert.equal(graphemes('Hi 👋🏽'), 4);
  assert.deepEqual(words("Don't stop"), ["don't", 'stop']);
  assert.equal(slug('https://Cal.com/Pricing/'), 'cal-com-pricing');
  assert.ok(similarity('Calendly', 'Calendlee') > 0.7);
});

test('robots: longest rule wins, allow wins a tie, wildcards and anchors', () => {
  const { groups, sitemaps } = parseRobots(`
User-agent: *
Disallow: /admin
Allow: /admin/public
Disallow: /*.pdf$

User-agent: remasterresearch
Disallow: /help/private

Sitemap: https://x.com/sitemap.xml`);
  assert.deepEqual(sitemaps, ['https://x.com/sitemap.xml']);
  const star = rulesFor(groups, 'otherbot');
  assert.equal(isAllowed(star, '/admin/x'), false);
  assert.equal(isAllowed(star, '/admin/public/page'), true);
  assert.equal(isAllowed(star, '/files/a.pdf'), false);
  assert.equal(isAllowed(star, '/files/a.pdf?x=1'), true);
  const ours = rulesFor(groups, 'remasterresearch');
  assert.equal(isAllowed(ours, '/admin/x'), true, 'a named group replaces the * group');
  assert.equal(isAllowed(ours, '/help/private/a'), false);
  assert.equal(isAllowed([], '/anything'), true);
});

test('html: content, text, head tags, links, sitemaps', () => {
  const html = `<html><head><title>Plans &amp; billing</title><meta name="description" content="How billing works"><link rel="canonical" href="https://x.com/help/billing"></head>
<body><nav><a href="/a">Nav</a></nav><main><h1>Plans</h1><p>Pay <b>monthly</b> or yearly.</p><ul><li>One</li><li>Two</li></ul><a href="/help/next#top">Next</a></main><footer>Foot</footer></body></html>`;
  const text = htmlToText(contentOf(html));
  assert.match(text, /^# Plans/m);
  assert.match(text, /Pay monthly or yearly\./);
  assert.match(text, /^- One$/m);
  assert.doesNotMatch(text, /Foot|Nav/);
  const head = readHead(html);
  assert.equal(head.title, 'Plans & billing');
  assert.equal(head.description, 'How billing works');
  assert.equal(head.canonical, 'https://x.com/help/billing');
  assert.equal(head.h1, 'Plans');
  assert.ok(linksOf(html, 'https://x.com/help/').includes('https://x.com/help/next'));
  assert.deepEqual(sitemapUrls('<urlset><url><loc> https://x.com/a </loc></url></urlset>'), ['https://x.com/a']);
});

test('png: encode, decode and resize round trip', () => {
  const width = 8;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([i * 7, 255 - i * 3, i % 2 ? 255 : 0, 255], i * 4);
  const back = decodePng(encodePng({ width, height, data }));
  assert.equal(back.width, 8);
  assert.equal(back.height, 4);
  assert.deepEqual([...back.data], [...data]);
  const small = resizeToWidth(back, 4);
  assert.equal(small.width, 4);
  assert.equal(small.height, 2);
  assert.throws(() => decodePng(Buffer.from('nope')), /Not a PNG/);
});

test('yaml: quotes what YAML would misread', () => {
  const y = toYaml({ colors: { canvas: '#ffffff' }, name: 'Booklink', yes: 'yes', size: '56px', n: 700 });
  assert.match(y, /canvas: "#ffffff"/);
  assert.match(y, /name: Booklink/);
  assert.match(y, /yes: "yes"/);
  assert.match(y, /size: "56px"/);
  assert.match(y, /n: 700/);
});
