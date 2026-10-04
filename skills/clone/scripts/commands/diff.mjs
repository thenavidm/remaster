// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { list, num } from '../lib/args.mjs';
import { paths, projectRoot, readJson, rel, writeJson } from '../lib/fsx.mjs';
import { fail, say, table } from '../lib/out.mjs';
import { decodePng, edges, encodePng, luma, resizeToWidth } from '../lib/png.mjs';

export const help = `remaster diff <original.json> <clone.json> [options]

Compare the clone with the original at the same width. Both files come from
\`remaster measure\` (or the browser script), one with --as clone.

Structure: matches landmarks, headings, controls, media and lists between the
two pages by role, position and size, in page order. Reports what is
missing, what was added and what moved across the first screen, plus a
structure score. This is the score that matters for app and site mode: it
says a switcher will find things where they expect them.

Layout (when both screenshots sit next to the JSON files): compares where
edges are, ignoring color, so a rebrand doesn't count against you. --pixel
compares exact pixels instead, for migrating a site you own.

  --pixel               exact pixel comparison (migrate mode)
  --mask x,y,w,h;...    regions to ignore, in the original's pixels (clocks, carousels)
  --calibrate <png>     a second capture of the original: its own variance sets the bar
  --fail-under <n>      exit 1 when the structure score is under n
  --json                print the result as JSON`;

/** How much each role counts toward the structure score. */
export const WEIGHTS = /** @type {Record<string, number>} */ ({
  header: 3, nav: 3, main: 1, footer: 2, aside: 2, dialog: 2, form: 2, h1: 3, h2: 2, h3: 1, h4: 0.5,
  button: 2, input: 2, tab: 1, table: 2, list: 1, image: 1, video: 1.5, canvas: 1.5, embed: 1, link: 0.5,
});

/**
 * @typedef {{ role: string, x: number, y: number, w: number, h: number, name?: string, fixed?: boolean }} Node
 * @typedef {{ nodes: Node[], viewport: { w: number, h: number }, page: { w: number, h: number }, url?: string, screenshot?: string }} Measure
 */

/**
 * Match two lists of nodes with the same role, in page order, by position and
 * size. Dynamic programming keeps the order, so the third card matches the
 * third card, not whichever one happens to sit closest.
 * @param {Node[]} a original
 * @param {Node[]} b clone
 * @param {Measure} ma @param {Measure} mb
 */
export function alignRole(a, b, ma, mb) {
  const W = ma.viewport.w || 1440;
  const Ha = ma.page.h || 1;
  const Hb = mb.page.h || 1;
  /** @param {Node} p @param {Node} q */
  const sim = (p, q) => {
    const dx = Math.abs(p.x - q.x) / W;
    const dw = Math.abs(p.w - q.w) / W;
    const dy = Math.abs(p.y / Ha - q.y / Hb);
    if (dx > 0.3 || dw > 0.4 || dy > 0.2) return -1;
    const named = p.name && q.name && p.name.toLowerCase() === q.name.toLowerCase() ? 0.15 : 0;
    return 1 - (dx + dw + dy) + named;
  };
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const s = sim(a[i - 1], b[j - 1]);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], s > 0 ? dp[i - 1][j - 1] + s : -Infinity);
    }
  /** @type {[number, number][]} */
  const pairs = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const s = sim(a[i - 1], b[j - 1]);
    if (s > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + s)) < 1e-9) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j]) i--;
    else j--;
  }
  return pairs.reverse();
}

/**
 * Where a node is, in words a person can act on.
 * @param {Node} n @param {Measure} m
 */
export function where(n, m) {
  const W = m.viewport.w || 1440;
  const cx = (n.x + n.w / 2) / W;
  const side = n.w > W * 0.6 ? 'full width' : cx < 0.36 ? 'left' : cx > 0.64 ? 'right' : 'center';
  const vertical = n.y < 120 ? 'top bar' : n.y < m.viewport.h ? 'first screen' : `${Math.round((n.y / m.page.h) * 100)}% down the page`;
  return `${vertical}, ${side}`;
}

/**
 * The structure comparison.
 * @param {Measure} orig @param {Measure} clone
 */
export function structure(orig, clone) {
  const roles = [...new Set([...orig.nodes, ...clone.nodes].map((n) => n.role))].filter((r) => (WEIGHTS[r] ?? 0) > 0);
  let total = 0;
  let got = 0;
  /** @type {{ role: string, where: string, name: string, size: string }[]} */
  const missing = [];
  /** @type {{ role: string, where: string, name: string }[]} */
  const added = [];
  /** @type {{ role: string, name: string, from: string, to: string }[]} */
  const moved = [];
  /** @type {Record<string, { original: number, clone: number, matched: number }>} */
  const byRole = {};
  for (const role of roles) {
    const a = orig.nodes.filter((n) => n.role === role).sort((p, q) => p.y - q.y || p.x - q.x);
    const b = clone.nodes.filter((n) => n.role === role).sort((p, q) => p.y - q.y || p.x - q.x);
    const pairs = alignRole(a, b, orig, clone);
    const w = WEIGHTS[role];
    total += a.length * w;
    got += pairs.length * w;
    byRole[role] = { original: a.length, clone: b.length, matched: pairs.length };
    const ma = new Set(pairs.map((p) => p[0]));
    const mb = new Set(pairs.map((p) => p[1]));
    a.forEach((n, i) => {
      if (!ma.has(i)) missing.push({ role, where: where(n, orig), name: n.name ?? '', size: `${n.w}x${n.h}` });
    });
    b.forEach((n, i) => {
      if (!mb.has(i)) added.push({ role, where: where(n, clone), name: n.name ?? '' });
    });
    for (const [i, j] of pairs) {
      const foldA = a[i].y < orig.viewport.h;
      const foldB = b[j].y < clone.viewport.h;
      if (foldA !== foldB) moved.push({ role, name: a[i].name ?? '', from: where(a[i], orig), to: where(b[j], clone) });
    }
  }
  const order = (/** @type {Measure} */ m) =>
    m.nodes.filter((n) => ['header', 'nav', 'main', 'footer', 'h1', 'h2', 'form', 'table'].includes(n.role)).sort((p, q) => p.y - q.y).map((n) => n.role);
  const sa = order(orig);
  const sb = order(clone);
  const lcs = Array.from({ length: sa.length + 1 }, () => new Array(sb.length + 1).fill(0));
  for (let i = 1; i <= sa.length; i++) for (let j = 1; j <= sb.length; j++) lcs[i][j] = sa[i - 1] === sb[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
  const orderScore = sa.length ? Math.round((lcs[sa.length][sb.length] / sa.length) * 100) : 100;
  const weightOf = (/** @type {{ role: string }} */ x) => WEIGHTS[x.role] ?? 0;
  missing.sort((p, q) => weightOf(q) - weightOf(p));
  return { score: total ? Math.round((got / total) * 100) : 100, orderScore, byRole, missing, added, moved };
}

/**
 * Parse --mask "x,y,w,h;x,y,w,h".
 * @param {string | boolean | undefined} v
 */
function masks(v) {
  if (typeof v !== 'string') return [];
  return v
    .split(';')
    .map((s) => list(s).map(Number))
    .filter((a) => a.length === 4 && a.every(Number.isFinite))
    .map(([x, y, w, h]) => ({ x, y, w, h }));
}

/**
 * Compare two screenshots. Each band of the original first finds where it
 * sits in the clone (within a drift window), so a section that grew 40px
 * shifts what follows instead of failing every cell below it. Layout mode
 * then compares edge density per cell, so colors don't count; pixel mode
 * compares exact colors.
 * @param {import('../lib/png.mjs').Image} a original
 * @param {import('../lib/png.mjs').Image} b clone
 * @param {{ pixel?: boolean, masks?: { x: number, y: number, w: number, h: number }[], width?: number }} [opts]
 */
export function visual(a, b, opts = {}) {
  const width = opts.width ?? 720;
  const scale = a.width / width;
  const A = resizeToWidth(a, width);
  const B = resizeToWidth(b, width);
  const cell = 16;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(A.height / cell);
  const ea = edges(luma(A), width, A.height);
  const eb = edges(luma(B), width, B.height);
  /** Prefix sums of edge pixels per column bin, so any band's density is two lookups. */
  const prefix = (/** @type {Float32Array} */ e, /** @type {number} */ h) => {
    const p = Array.from({ length: cols }, () => new Uint32Array(h + 1));
    for (let y = 0; y < h; y++) {
      const row = new Uint32Array(cols);
      for (let x = 0; x < width; x++) if (e[y * width + x] > 60) row[Math.floor(x / cell)]++;
      for (let c = 0; c < cols; c++) p[c][y + 1] = p[c][y] + row[c];
    }
    return p;
  };
  const pa = prefix(ea, A.height);
  const pb = prefix(eb, B.height);
  const dens = (/** @type {Uint32Array[]} */ p, /** @type {number} */ h, /** @type {number} */ c, /** @type {number} */ y0, /** @type {number} */ y1) => {
    const lo = Math.max(0, Math.min(h, y0));
    const hi = Math.max(0, Math.min(h, y1));
    return hi > lo ? (p[c][hi] - p[c][lo]) / (cell * (hi - lo)) : 0;
  };
  // Align the two pages row by row with dynamic time warping over 4px row
  // profiles: a global, order-keeping match that lets inserted or removed
  // content shift everything after it, and charges a little for every shift
  // so identical layouts stay straight.
  const R = 4;
  const na = Math.ceil(A.height / R);
  const nb = Math.ceil(B.height / R);
  const feat = (/** @type {Uint32Array[]} */ p, /** @type {number} */ h, /** @type {number} */ n) => {
    const f = new Float32Array(n * cols);
    for (let r = 0; r < n; r++) for (let c = 0; c < cols; c++) f[r * cols + c] = dens(p, h, c, r * R, r * R + R);
    return f;
  };
  const fa = feat(pa, A.height, na);
  const fb = feat(pb, B.height, nb);
  const band = Math.min(400, Math.max(100, Math.abs(na - nb) + 25));
  const span = 2 * band + 1;
  const D = new Float64Array(na * span).fill(Infinity);
  const step = new Uint8Array(na * span);
  const LAMBDA = 0.08;
  const cost = (/** @type {number} */ i, /** @type {number} */ j) => {
    let c = 0;
    for (let k = 0; k < cols; k++) c += Math.abs(fa[i * cols + k] - fb[j * cols + k]);
    return c;
  };
  for (let i = 0; i < na; i++) {
    for (let k = 0; k < span; k++) {
      const j = i - band + k;
      if (j < 0 || j >= nb) continue;
      const here = cost(i, j);
      if (i === 0 && j === 0) {
        D[k] = here;
        continue;
      }
      let best = Infinity;
      let dir = 0;
      if (i > 0 && j > 0 && D[(i - 1) * span + k] < best) {
        best = D[(i - 1) * span + k];
        dir = 1;
      }
      if (i > 0 && k + 1 < span && D[(i - 1) * span + k + 1] + LAMBDA < best) {
        best = D[(i - 1) * span + k + 1] + LAMBDA;
        dir = 2;
      }
      if (j > 0 && k > 0 && D[i * span + k - 1] + LAMBDA < best) {
        best = D[i * span + k - 1] + LAMBDA;
        dir = 3;
      }
      if (best === Infinity) continue;
      D[i * span + k] = here + best;
      step[i * span + k] = dir;
    }
  }
  // End where the clone ends if it is reachable, else at the best last row.
  let endK = nb - 1 - (na - 1 - band);
  if (endK < 0 || endK >= span || D[(na - 1) * span + endK] === Infinity) {
    endK = 0;
    for (let k = 1; k < span; k++) if (D[(na - 1) * span + k] < D[(na - 1) * span + endK]) endK = k;
  }
  const matchOf = new Int32Array(na).fill(-1);
  for (let i = na - 1, k = endK; i >= 0 && k >= 0 && k < span; ) {
    const j = i - band + k;
    if (matchOf[i] === -1 || j < matchOf[i]) matchOf[i] = j;
    const dir = step[i * span + k];
    if (dir === 1) i--;
    else if (dir === 2) {
      i--;
      k++;
    } else if (dir === 3) k--;
    else break;
  }
  for (let i = 1; i < na; i++) if (matchOf[i] === -1) matchOf[i] = matchOf[i - 1] + 1;
  if (matchOf[0] === -1) matchOf[0] = 0;
  /** @type {number[]} */
  const offsets = [];
  for (let cy = 0; cy < rows; cy++) {
    const r = Math.min(na - 1, Math.floor((cy * cell + cell / 2) / R));
    offsets.push(matchOf[r] * R - r * R);
  }
  const masked = (/** @type {number} */ cx, /** @type {number} */ cy) =>
    (opts.masks ?? []).some((m) => {
      const x0 = cx * cell * scale;
      const y0 = cy * cell * scale;
      return x0 + cell * scale > m.x && x0 < m.x + m.w && y0 + cell * scale > m.y && y0 < m.y + m.h;
    });
  const diff = new Uint8Array(cols * rows);
  let compared = 0;
  let differing = 0;
  for (let cy = 0; cy < rows; cy++) {
    const y0 = cy * cell;
    const o = offsets[cy];
    if (y0 + o >= B.height) break;
    for (let cx = 0; cx < cols; cx++) {
      if (masked(cx, cy)) continue;
      let differs = false;
      if (opts.pixel) {
        let bad = 0;
        let n = 0;
        for (let y = y0; y < Math.min(A.height, y0 + cell, B.height - o); y++)
          for (let x = cx * cell; x < Math.min(width, (cx + 1) * cell); x++) {
            const i = (y * width + x) * 4;
            const j = ((y + o) * width + x) * 4;
            if (Math.max(Math.abs(A.data[i] - B.data[j]), Math.abs(A.data[i + 1] - B.data[j + 1]), Math.abs(A.data[i + 2] - B.data[j + 2])) > 24) bad++;
            n++;
          }
        if (!n) continue;
        differs = bad / n > 0.02;
      } else {
        const da = dens(pa, A.height, cx, y0, y0 + cell);
        const db = dens(pb, B.height, cx, y0 + o, y0 + o + cell);
        if (da < 0.01 && db < 0.01) continue;
        differs = Math.abs(da - db) > 0.03 && Math.abs(da - db) / Math.max(da, db) > 0.6;
      }
      compared++;
      if (differs) {
        diff[cy * cols + cx] = 1;
        differing++;
      }
    }
  }
  // Group differing cells into regions, biggest first, in the original's pixels.
  const seen = new Uint8Array(cols * rows);
  const regions = [];
  for (let k = 0; k < diff.length; k++) {
    if (!diff[k] || seen[k]) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    const stack = [k];
    seen[k] = 1;
    while (stack.length) {
      const c = /** @type {number} */ (stack.pop());
      const x = c % cols;
      const y = Math.floor(c / cols);
      count++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1], [x + 1, y + 1], [x - 1, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nk = ny * cols + nx;
        if (diff[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    regions.push({
      x: Math.round(minX * cell * scale),
      y: Math.round(minY * cell * scale),
      w: Math.round((maxX - minX + 1) * cell * scale),
      h: Math.round((maxY - minY + 1) * cell * scale),
      cells: count,
    });
  }
  regions.sort((p, q) => q.cells - p.cells);
  // Where content sits lower or higher in the clone, as runs of one offset.
  const drift = [];
  for (let cy = 0; cy < offsets.length; cy++) {
    if (cy === 0 ? offsets[0] !== 0 : offsets[cy] !== offsets[cy - 1]) drift.push({ fromY: Math.round(cy * cell * scale), shift: Math.round(offsets[cy] * scale) });
  }
  // A heatmap on the original at 720px: dimmed, with differing cells in red.
  const heat = new Uint8ClampedArray(width * A.height * 4);
  for (let y = 0; y < A.height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const hot = diff[Math.floor(y / cell) * cols + Math.floor(x / cell)];
      const g = 0.2126 * A.data[i] + 0.7152 * A.data[i + 1] + 0.0722 * A.data[i + 2];
      heat[i] = hot ? 220 : g * 0.55 + 100;
      heat[i + 1] = hot ? 40 + g * 0.2 : g * 0.55 + 100;
      heat[i + 2] = hot ? 40 + g * 0.2 : g * 0.55 + 100;
      heat[i + 3] = 255;
    }
  return {
    mode: opts.pixel ? 'pixel' : 'layout',
    score: compared ? Math.round((1 - differing / compared) * 1000) / 10 : 100,
    heightRatio: Math.round((b.height / a.height) * 100) / 100,
    regions: regions.slice(0, 10),
    drift: drift.slice(0, 20),
    heatmap: encodePng({ width, height: A.height, data: heat }),
  };
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  if (positionals.length < 2) fail(help);
  const root = projectRoot();
  const [fa, fb] = positionals.map((f) => path.resolve(f));
  /** @type {Measure} */
  const orig = readJson(fa);
  /** @type {Measure} */
  const clone = readJson(fb);
  if (Math.abs((orig.viewport?.w ?? 0) - (clone.viewport?.w ?? 0)) > 2)
    fail(`The two measurements are at different widths (${orig.viewport?.w} and ${clone.viewport?.w}). Measure both at the same width.`);
  const s = structure(orig, clone);
  /** @type {any} */
  let v = null;
  const pa = fa.replace(/\.json$/, '.png');
  const pb = fb.replace(/\.json$/, '.png');
  const name = path.basename(fb, '.json');
  const outDir = paths(root).diffs;
  if (fs.existsSync(pa) && fs.existsSync(pb)) {
    const a = decodePng(fs.readFileSync(pa));
    const b = decodePng(fs.readFileSync(pb));
    v = visual(a, b, { pixel: !!flags.pixel, masks: masks(flags.mask) });
    if (typeof flags.calibrate === 'string') {
      const self = visual(a, decodePng(fs.readFileSync(path.resolve(flags.calibrate))), { pixel: !!flags.pixel, masks: masks(flags.mask) });
      v.calibrated = self.score;
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${name}.png`), v.heatmap);
  }
  const result = {
    original: rel(root, fa),
    clone: rel(root, fb),
    width: orig.viewport.w,
    structure: s,
    visual: v ? { mode: v.mode, score: v.score, calibrated: v.calibrated ?? null, heightRatio: v.heightRatio, regions: v.regions, drift: v.drift, heatmap: rel(root, path.join(outDir, `${name}.png`)) } : null,
  };
  writeJson(path.join(outDir, `${name}.json`), result);
  if (flags.json) say(JSON.stringify(result, null, 2));
  else {
    say(`Structure ${s.score}/100 at ${orig.viewport.w}px (section order ${s.orderScore}/100).`);
    say(table(['role', 'original', 'clone', 'matched'], Object.entries(s.byRole).filter(([, r]) => r.original || r.clone).map(([k, r]) => [k, r.original, r.clone, r.matched])));
    if (s.missing.length) {
      say('\nMissing from the clone, most important first:');
      for (const m of s.missing.slice(0, 15)) say(`  ${m.role} ${m.name ? `"${m.name}" ` : ''}(${m.where}, ${m.size})`);
      if (s.missing.length > 15) say(`  ...and ${s.missing.length - 15} more in the JSON.`);
    }
    if (s.moved.length) {
      say('\nMoved across the first screen:');
      for (const m of s.moved.slice(0, 10)) say(`  ${m.role} ${m.name ? `"${m.name}" ` : ''}from ${m.from} to ${m.to}`);
    }
    if (s.added.length) say(`\n${s.added.length} element(s) the original doesn't have (fine when they are your fixes).`);
    if (v) {
      say(`\n${v.mode === 'pixel' ? 'Pixels' : 'Layout'} ${v.score}% alike${v.calibrated != null ? ` (the original against itself: ${v.calibrated}%)` : ''}; the clone is ${v.heightRatio}x the original's height.`);
      for (const r of v.regions.slice(0, 5)) say(`  differs at x ${r.x}, y ${r.y}, ${r.w}x${r.h}`);
      const shifts = v.drift.filter((/** @type {{ shift: number }} */ d) => Math.abs(d.shift) >= 16);
      if (shifts.length) say(`  content shifts: ${shifts.slice(0, 5).map((/** @type {{ fromY: number, shift: number }} */ d) => `from y ${d.fromY} by ${d.shift > 0 ? '+' : ''}${d.shift}px`).join('; ')}`);
      say(`Heatmap: ${result.visual?.heatmap}`);
    }
  }
  const under = num(flags['fail-under'], -1);
  return under >= 0 && s.score < under ? 1 : 0;
}
