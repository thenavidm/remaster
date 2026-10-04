import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathKey, pathHash, pathsInText } from '../skills/clone/scripts/lib/svg.mjs';
import { changed, focusVisible, summarize } from '../skills/clone/scripts/commands/interact.mjs';
import { toDtcg, toShadcn } from '../skills/clone/scripts/commands/design.mjs';
import { measurements } from '../skills/clone/scripts/lib/fsx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'skills', 'clone', 'scripts', 'remaster.mjs');
const template = JSON.parse(fs.readFileSync(path.join(here, '..', 'skills', 'clone', 'templates', 'design.json'), 'utf8'));
const LOGO = 'M12.5,3.2C7.3,3.2,3.1,7.4,3.1,12.6s4.2,9.4,9.4,9.4c5.2,0,9.4-4.2,9.4-9.4S17.7,3.2,12.5,3.2z M12.5,19.9c-4,0-7.3-3.3-7.3-7.3';

test('svg: the same drawing gets the same fingerprint, however it is written', () => {
  const spaced = LOGO.replace(/,/g, ' ').replace(/([a-zA-Z])/g, ' $1 ');
  assert.equal(pathHash(LOGO), pathHash(spaced));
  assert.equal(pathHash('M10.04 20L30 40'), pathHash('M10,20 L30,40'), 'rounded to one decimal');
  assert.notEqual(pathHash(LOGO), pathHash(LOGO.replace('3.2', '4.2')));
  assert.match(pathKey('M1,2L3,4'), /^M 1 2 L 3 4$/);
});

test('svg: path data is found in SVG, HTML and JSX, short paths are not', () => {
  const src = `<path d="${LOGO}"/>\n<path d={"${LOGO}"} />\n<path d="M0 0L1 1"/>`;
  const found = pathsInText(src);
  assert.deepEqual(found.map((f) => f.line), [1, 2]);
});

test('sweep: an SVG path from the original is caught after reformatting', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-svg-'));
  spawnSync(process.execPath, [CLI, 'init', 'https://example.com', '--mode', 'site'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'remaster', 'research', 'measure'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'remaster', 'research', 'measure', 'home@1440.json'), JSON.stringify({ v: 1, text: [], svgPathHashes: [pathHash(LOGO)] }));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'Mark.tsx'), `export const Mark = () => <svg><path d="${LOGO.replace(/,/g, ' ')}" /></svg>;\n`);
  const r = spawnSync(process.execPath, [CLI, 'sweep', '--json'], { cwd: dir, encoding: 'utf8' });
  const hits = JSON.parse(r.stdout).hits;
  assert.ok(hits.some((/** @type {any} */ h) => h.kind === 'svg' && h.file === 'src/Mark.tsx'));
  assert.equal(r.status, 1);
});

test('interact: focus is visible when an outline or a style change shows it', () => {
  const base = { outlineStyle: 'none', outlineWidth: '0px', boxShadow: 'none', backgroundColor: 'rgb(255, 255, 255)', borderTopColor: 'rgb(0, 0, 0)', textDecorationLine: 'none', color: 'rgb(0, 0, 0)' };
  assert.equal(focusVisible(base, { ...base }), false);
  assert.equal(focusVisible(base, { ...base, outlineStyle: 'solid', outlineWidth: '2px' }), true);
  assert.equal(focusVisible(base, { ...base, boxShadow: 'rgb(0, 0, 255) 0px 0px 0px 2px' }), true);
  assert.deepEqual(changed({ a: '1', b: '2' }, { a: '1', b: '3' }), { b: ['2', '3'] });
});

test('interact: the summary says what a person needs', () => {
  const lines = summarize({
    scroll: { header: { tag: 'header', changes: { backgroundColor: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'] } }, reveals: { count: 3, samples: ['h2 "Plans"'] }, pinned: ['header at top 0px'] },
    hover: { checked: 10, changed: 8, props: { backgroundColor: 6 }, durations: [{ value: 150, count: 6 }] },
    focus: { visited: 12, visible: 9, skipLink: true },
  });
  assert.match(lines[0], /Header changes on scroll: backgroundColor/);
  assert.match(lines[3], /8 of 10 controls respond, mostly by backgroundColor \(6\), usually in 150ms/);
  assert.match(lines[4], /12 Tab stops, 9 with a visible focus, 3 without, and the first stop skips to the content/);
});

test('design: shadcn theme and W3C tokens', () => {
  const css = toShadcn(template);
  assert.match(css, /--primary: #1f6f5c;/, "our accent is shadcn's primary");
  assert.match(css, /--primary-foreground: #ffffff;/);
  assert.match(css, /--ring: #1f6f5c;/);
  assert.match(css, /\.dark \{[\s\S]*--background: #141310;/);
  assert.match(css, /--radius: 10px;/);
  const t = toDtcg(template);
  assert.deepEqual(t.color.accent, { $type: 'color', $value: '#1f6f5c' });
  assert.equal(t.typography.body.$type, 'typography');
  assert.equal(t.spacing['4'].$value, '16px');
});

test('fsx: interaction sweeps are not page measurements', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-m-'));
  for (const f of ['home@1440.json', 'home@1440.interact.json', 'home@390.json']) fs.writeFileSync(path.join(dir, f), '{}');
  assert.deepEqual(measurements(dir).map((f) => path.basename(f)), ['home@1440.json', 'home@390.json']);
});
