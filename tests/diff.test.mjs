import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structure, alignRole, visual } from '../skills/clone/scripts/commands/diff.mjs';

/** @param {any[]} nodes @param {number} [h] */
const page = (nodes, h = 3000) => ({ nodes, viewport: { w: 1440, h: 900 }, page: { w: 1440, h } });
const nodes = [
  { role: 'header', x: 0, y: 0, w: 1440, h: 72 },
  { role: 'h1', x: 200, y: 240, w: 600, h: 120, name: 'Hero' },
  { role: 'button', x: 200, y: 420, w: 160, h: 48, name: 'Start' },
  { role: 'input', x: 1100, y: 20, w: 240, h: 36 },
  { role: 'h2', x: 200, y: 1200, w: 600, h: 60 },
  { role: 'h2', x: 200, y: 1900, w: 600, h: 60 },
  { role: 'footer', x: 0, y: 2700, w: 1440, h: 300 },
];

test('structure: a page against itself is 100', () => {
  const s = structure(page(nodes), page(nodes));
  assert.equal(s.score, 100);
  assert.equal(s.orderScore, 100);
  assert.equal(s.missing.length, 0);
});

test('structure: names what is missing and what moved below the fold', () => {
  const clone = nodes.filter((n) => n.role !== 'input').map((n) => (n.role === 'button' ? { ...n, y: 1000 } : n));
  const s = structure(page(nodes), page(clone));
  assert.ok(s.score < 100);
  assert.equal(s.missing[0].role, 'input');
  assert.match(s.missing[0].where, /top bar, right/);
  assert.equal(s.moved.length, 1);
  assert.equal(s.moved[0].role, 'button');
});

test('alignRole keeps page order', () => {
  const a = [0, 1, 2].map((i) => ({ role: 'h2', x: 200, y: 500 + i * 600, w: 600, h: 60 }));
  const b = [0, 1, 2, 3].map((i) => ({ role: 'h2', x: 200, y: 500 + i * 450, w: 600, h: 60 }));
  const pairs = alignRole(a, b, page([]), page([]));
  assert.ok(pairs.length >= 2);
  for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i][0] > pairs[i - 1][0] && pairs[i][1] > pairs[i - 1][1]);
});

/**
 * A synthetic screenshot: bands of text-like stripes, optionally with an
 * extra band inserted part way down, the way a taller section shifts the rest.
 * @param {number} insertAt @param {number} insertHeight
 */
function shot(insertAt = -1, insertHeight = 0) {
  const width = 720;
  const blocks = [100, 300, 520, 760, 1000, 1260];
  const height = 1500 + insertHeight;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const draw = (/** @type {number} */ y0, /** @type {number} */ x0, /** @type {number} */ w) => {
    for (let line = 0; line < 5; line++)
      for (let y = y0 + line * 22; y < y0 + line * 22 + 10; y++)
        for (let x = x0; x < x0 + w - line * 30; x++) {
          const i = (y * width + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 30;
        }
  };
  for (const b of blocks) {
    const y = insertAt >= 0 && b >= insertAt ? b + insertHeight : b;
    draw(y, 60, 400);
  }
  if (insertAt >= 0) draw(insertAt, 300, 300);
  return { width, height, data };
}

test('visual: identical screenshots are 100%', () => {
  assert.equal(visual(shot(), shot()).score, 100);
});

test('visual: a section that grew shifts the rest instead of failing it', () => {
  const v = visual(shot(), shot(640, 80));
  assert.ok(v.score >= 85, `score ${v.score}`);
  assert.ok(v.drift.some((d) => d.shift >= 60), 'reports the shift');
});

test('visual: a different page scores low', () => {
  const other = shot();
  for (let i = 0; i < other.data.length; i += 4) other.data[i] = other.data[i + 1] = other.data[i + 2] = (i / 4) % 720 < 360 ? 20 : 255;
  assert.ok(visual(shot(), other).score < 50);
});
