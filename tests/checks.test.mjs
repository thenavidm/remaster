import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintDesign, toDesignMd, toCss } from '../skills/clone/scripts/commands/design.mjs';
import { checkCopy } from '../skills/clone/scripts/commands/copy.mjs';
import { verify } from '../skills/clone/scripts/commands/pains.mjs';
import { score } from '../skills/clone/scripts/commands/parity.mjs';
import { lintListing } from '../skills/clone/scripts/commands/listing.mjs';
import { copySimilarity, sourceStrings } from '../skills/clone/scripts/commands/sweep.mjs';
import { summarize, spacingBase } from '../skills/clone/scripts/commands/tokens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = JSON.parse(fs.readFileSync(path.join(here, '..', 'skills', 'clone', 'templates', 'design.json'), 'utf8'));
const errorsOf = (/** @type {any[]} */ f) => f.filter((x) => x.level === 'error');

test('design: the template passes, and every check bites', () => {
  assert.deepEqual(errorsOf(lintDesign(template)), []);
  const measured = { colors: { brand: ['#1f6f5c'] }, fonts: [{ family: 'Cabinet Grotesk' }] };
  const rules = errorsOf(lintDesign(template, measured)).map((f) => f.rule);
  assert.ok(rules.includes('too-close'), 'accent identical to the original brand color');
  assert.ok(rules.includes('their-font'), 'the original typeface');
  const bad = structuredClone(template);
  bad.colors['ink-soft'] = '#c8c4bb';
  bad.components.card.backgroundColor = '{colors.nope}';
  bad.colors.ink = 'banana';
  const r = errorsOf(lintDesign(bad)).map((f) => f.rule);
  assert.ok(r.includes('contrast'));
  assert.ok(r.includes('missing-token'));
  assert.ok(r.includes('invalid-color'));
  const violet = structuredClone(template);
  violet.colors.accent = '#7c3aed';
  assert.ok(lintDesign(violet).some((f) => f.rule === 'ai-violet'));
});

test('design: a far-off hue is not "too close" just because both are colorful', () => {
  const d = structuredClone(template);
  d.colors.accent = '#5a3ff5';
  d.colors['on-accent'] = '#ffffff';
  const near = lintDesign(d, { colors: { brand: ['#0071c1'] }, fonts: [] }).filter((f) => f.rule === 'too-close');
  assert.equal(near.length, 0);
});

test('design: DESIGN.md has front matter and the sections in order; CSS has a theme', () => {
  const md = toDesignMd(template);
  assert.match(md, /^---\nversion: alpha\nname: Your product/);
  const order = ['## Overview', '## Colors', '## Typography', '## Layout', '## Elevation & Depth', '## Shapes', '## Components', "## Do's and Don'ts"].map((h) => md.indexOf(h));
  assert.ok(order.every((i) => i > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const css = toCss(template);
  assert.match(css, /--accent: #1f6f5c;/);
  assert.match(css, /@theme inline \{[\s\S]*--color-accent: var\(--accent\);/);
  assert.match(css, /prefers-color-scheme: dark/);
});

test('copy: errors, warnings and a clean page', () => {
  const items = [
    { kind: 'heading', t: 'Supercharge your scheduling!', where: 'p' },
    { kind: 'text', t: 'Trusted by 10,000+ teams.', where: 'p' },
    { kind: 'text', t: 'Lorem ipsum dolor sit amet.', where: 'p' },
    { kind: 'button', t: 'Submit', where: 'p' },
    { kind: 'text', t: 'Booking is not just a calendar \u2014 it is a hub.', where: 'p' },
    { kind: 'button', t: 'Get started', where: 'p' },
    { kind: 'button', t: 'Get started', where: 'p' },
    { kind: 'button', t: 'Get started', where: 'p' },
    { kind: 'text', t: 'Embed your Calendly link anywhere.', where: 'p' },
  ];
  const f = checkCopy(items, { avoid: ['Calendly'] });
  const rules = f.map((x) => x.rule);
  for (const r of ['word:supercharge', 'exclamation', 'proof:user-count', 'proof:trusted-by', 'placeholder', 'generic-button', 'em-dash', 'repeated-cta', 'their-name']) assert.ok(rules.includes(r), r);
  const withProof = checkCopy([{ kind: 'text', t: 'Trusted by 10,000+ teams.', where: 'p' }], { proof: [{ text: 'Trusted by 10,000+ teams' }] });
  assert.equal(errorsOf(withProof).length, 0);
  const clean = checkCopy([
    { kind: 'heading', t: 'Booking links for small teams', where: 'p' },
    { kind: 'text', t: 'Share one link. Guests pick a time that works, and it lands on your calendar.', where: 'p' },
    { kind: 'button', t: 'Create your link', where: 'p' },
    { kind: 'text', t: 'Add a todo for the follow-up call.', where: 'p' },
  ]);
  assert.deepEqual(clean.filter((x) => x.level !== 'note'), []);
});

test('copy: links, code, and ordinary English are not flagged', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { itemsOf } = await import('../skills/clone/scripts/commands/copy.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-copy-'));
  const f = path.join(dir, 'page.md');
  fs.writeFileSync(f, '| 1 | [What it is](#1-what-it-is-) | The idea |\nRecord the content of every tab, not just the first.\nRun `remaster copy` on it.\nOops, something went wrong.\n');
  const found = checkCopy(itemsOf(f));
  assert.ok(!found.some((x) => x.rule === 'proof:number-one'), 'an anchor is not a ranking claim');
  assert.ok(!found.some((x) => x.rule === 'move:not-just'), 'plain "not just the first" is fine');
  assert.equal(found.filter((x) => x.rule === 'vague-error').length, 1, 'one finding per line');
  for (const t of ["It isn't just a calendar", 'Booking is not just a calendar, it is a hub.']) {
    const move = checkCopy([{ kind: 'text', t, where: 'p' }]);
    assert.equal(move.filter((x) => x.rule === 'move:not-just').length, 1, t);
  }
});

test('pains: every quote is checked word for word and every row must exist', () => {
  const rows = [
    { id: 'a1', source: 'app-store', url: 'https://x/1', date: '2026-09-01', rating: '1', text: 'The per-seat price doubled overnight.' },
    { id: 'a2', source: 'app-store', url: 'https://x/2', date: '2026-08-01', rating: '2', text: 'Per seat pricing is too much for a team of 4.' },
    { id: 'h1', source: 'hacker-news', url: 'https://x/3', date: '2023-01-01', rating: '', text: 'We left because per-seat pricing.' },
    { id: 'a3', source: 'app-store', url: '', date: '2026-08-01', rating: '1', text: 'no link, dropped' },
    { id: 'a4', source: 'app-store', url: 'https://x/4', date: '2026-08-01', rating: '1', text: 'Reminders never arrive.' },
  ];
  const good = verify(rows, { themes: [{ id: 'price', kind: 'hate', label: 'Per-seat price', rows: ['a1', 'a2', 'h1'], quotes: [{ row: 'a1', text: 'per-seat price doubled' }] }] }, { now: new Date('2026-10-01') });
  assert.deepEqual(good.errors, []);
  assert.equal(good.sample.dropped, 1);
  assert.equal(good.themes[0].reviews, 3);
  assert.equal(good.themes[0].thin, false);
  assert.equal(good.uncovered.length, 1, 'the reminders review is a low rating no theme covers');
  const bad = verify(rows, { themes: [{ id: 'x', kind: 'hate', rows: ['a1', 'zz'], quotes: [{ row: 'a1', text: 'they stole my data' }] }] });
  assert.equal(bad.errors.length, 2);
  assert.equal(bad.themes[0].thin, true);
});

test('parity: the three verdicts', () => {
  const base = [
    { __line: '2', id: 'F1', feature: 'Booking page', area: 'booking', priority: 'must', original: 'yes', clone: 'yes' },
    { __line: '3', id: 'F2', feature: 'Calendar sync', area: 'calendar', priority: 'must', original: 'yes', clone: 'yes' },
    { __line: '4', id: 'F3', feature: 'Marketplace', area: 'platform', priority: 'could', original: 'yes', clone: 'skip', notes: 'their network' },
  ];
  assert.equal(score([...base.slice(0, 1), { ...base[1], clone: 'no' }]).verdict, 'not shippable');
  assert.equal(score(base).verdict, 'shippable');
  const fixes = [1, 2, 3].map((i) => ({ __line: String(10 + i), id: `X${i}`, feature: `Fix ${i}`, area: 'fixes', priority: 'should', original: 'no', clone: 'yes' }));
  const beat = { metrics: [{ name: 'Clicks', original: 6, clone: 3, better: 'lower' }] };
  assert.equal(score([...base, ...fixes], beat).verdict, 'better than the original');
  const worse = { metrics: [...beat.metrics, { name: 'LCP', original: 900, clone: 2000, better: 'lower' }] };
  assert.equal(score([...base, ...fixes], worse).verdict, 'shippable');
  assert.ok(score([{ ...base[2], notes: '' }]).problems.some((p) => p.includes('without a reason')));
});

test('listing: limits, names, emoji and keywords', () => {
  const f = lintListing({ appStore: { name: 'Booklink: #1 Calendly Alternative 📅', subtitle: 'Book meetings fast', keywords: 'booking, meetings,booking', description: 'x' } }, ['Calendly']);
  const msgs = f.map((x) => x.message).join(' | ');
  assert.match(msgs, /limit is 30/);
  assert.match(msgs, /original's name/);
  assert.match(msgs, /No emoji/);
  assert.match(msgs, /Ranking or price/);
  assert.match(msgs, /Spaces after commas/);
  assert.match(msgs, /Repeated: booking/);
});

test('sweep: copied sentences are caught, conventions are not', () => {
  const original = ['Let your bookers overlay their calendar and receive booking confirmations via text or email.', 'Forgot your password? We will send you a link.'];
  const hits = copySimilarity(original, [
    { text: 'Let your bookers overlay their calendar and receive booking confirmations by text.', where: 'a.tsx', line: 3 },
    { text: 'Forgot your password? We will email you a reset link.', where: 'a.tsx', line: 9 },
    { text: 'Pick a time and we will put it on both calendars right away.', where: 'a.tsx', line: 12 },
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
  const strings = sourceStrings('<p>Share one link and let guests pick a time.</p>\nconst t = "Booking confirmed for your team";');
  assert.deepEqual(strings.map((s) => s.line), [1, 2]);
});

test('tokens: roles come from how colors are used', () => {
  const page = {
    url: 'https://x.com',
    viewport: { w: 1440 },
    canvas: '#ffffff',
    colors: [
      { hex: '#ffffff', text: 0, bg: 90000, border: 0, icon: 0, action: 0, label: 0 },
      { hex: '#888888', text: 5000, bg: 0, border: 0, icon: 0, action: 0, label: 0 },
      { hex: '#111111', text: 3000, bg: 0, border: 0, icon: 0, action: 0, label: 2 },
      { hex: '#eeeeee', text: 0, bg: 400, border: 0, icon: 0, action: 9, label: 0 },
      { hex: '#533afd', text: 0, bg: 300, border: 0, icon: 0, action: 3, label: 0 },
      { hex: '#ea4335', text: 0, bg: 0, border: 0, icon: 12, action: 0, label: 0 },
      { hex: '#e5e5e5', text: 0, bg: 0, border: 40, icon: 0, action: 0, label: 0 },
    ],
    type: [{ size: '16px', lineHeight: '24px', weight: '400', family: 'Geist', chars: 8000, tags: { p: 3 } }],
    fonts: [{ family: 'Geist', chars: 8000, weights: { 400: 8000 } }],
    spacing: [8, 16, 24, 32, 48].map((value) => ({ value, count: 10 })),
  };
  const s = summarize([page]);
  assert.equal(s.colors.ink, '#111111', 'darkest common text, not the most frequent gray');
  assert.equal(s.colors.inkSoft, '#888888');
  assert.equal(s.colors.accent, '#533afd', 'the colored fill beats more numerous neutral buttons');
  assert.ok(!s.colors.brand.includes('#ea4335'), 'icon-only colors are someone else\'s logo');
  assert.equal(s.spacing.base, 8);
  assert.deepEqual(spacingBase([{ value: 6, count: 5 }, { value: 10, count: 5 }]).base, 2);
});
