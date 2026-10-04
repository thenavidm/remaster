// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/** The folder every Remaster file lives in, inside the user's project. */
export const DIR = 'remaster';

/**
 * The project root: the nearest folder above the working directory that holds
 * remaster/state.json. Falling back to the working directory means `init`
 * creates the folder where the user is, never somewhere surprising.
 * @param {string} [start]
 */
export function projectRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, DIR, 'state.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}

/**
 * Every path the stages read and write, from one place, so a renamed file
 * changes once.
 * @param {string} root
 */
export function paths(root) {
  const dir = path.join(root, DIR);
  const research = path.join(dir, 'research');
  const design = path.join(dir, 'design');
  const verify = path.join(dir, 'verify');
  const launch = path.join(dir, 'launch');
  return {
    root,
    dir,
    state: path.join(dir, 'state.json'),
    profile: path.join(dir, 'profile.md'),
    features: path.join(dir, 'features.csv'),
    sources: path.join(dir, 'sources.csv'),
    brand: path.join(dir, 'brand.json'),
    teardown: path.join(dir, 'TEARDOWN.md'),
    research,
    reviews: path.join(research, 'reviews.csv'),
    analysis: path.join(research, 'analysis.json'),
    pains: path.join(research, 'pains.md'),
    painsJson: path.join(research, 'pains.json'),
    verdict: path.join(research, 'verdict.md'),
    recon: path.join(research, 'recon.md'),
    store: path.join(research, 'store'),
    crawled: path.join(research, 'sources'),
    measureOriginal: path.join(research, 'measure'),
    frames: path.join(research, 'frames'),
    design,
    measured: path.join(design, 'measured.json'),
    measuredMd: path.join(design, 'measured.md'),
    designJson: path.join(design, 'design.json'),
    tokensCss: path.join(design, 'tokens.css'),
    designMd: path.join(root, 'DESIGN.md'),
    verify,
    measureClone: path.join(verify, 'measure'),
    diffs: path.join(verify, 'diff'),
    critic: path.join(verify, 'critic.json'),
    bugs: path.join(verify, 'bugs.csv'),
    beat: path.join(verify, 'beat.json'),
    urls: path.join(verify, 'urls.json'),
    launch,
    listing: path.join(launch, 'listing.json'),
    proof: path.join(launch, 'proof.json'),
  };
}

/** @param {string} file */
export function exists(file) {
  return fs.existsSync(file);
}

/** @param {string} dir */
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * @param {string} file
 * @param {any} [fallback]
 */
export function readJson(file, fallback = undefined) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Not found: ${file}`);
  }
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${/** @type {Error} */ (e).message}`);
  }
}

/**
 * @param {string} file
 * @param {unknown} value
 */
export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/**
 * @param {string} file
 * @param {string} text
 */
export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}

/** @param {string} file */
export function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

/** Folders that are build output, installs or tooling, never the user's source. */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.open-next', '.wrangler', '.vercel', '.netlify', '.turbo', '.svelte-kit',
  '.astro', '.output', '.nuxt', '.expo', '.cache', 'dist', 'build', 'out', 'coverage', 'playwright-report',
  'test-results', '.idea', '.vscode', DIR,
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.tiff', '.psd', '.mp4', '.mov', '.webm',
  '.mp3', '.wav', '.ogg', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.zip', '.gz', '.tgz', '.br',
  '.wasm', '.lock', '.db', '.sqlite', '.bin', '.exe', '.dylib', '.so', '.map',
]);

/**
 * Every text file under a folder, skipping installs, build output and the
 * remaster/ research folder (which is supposed to hold the original's words).
 * @param {string} root
 * @param {{ maxBytes?: number, skip?: Set<string> }} [opts]
 * @returns {string[]}
 */
export function walkText(root, opts = {}) {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const skip = opts.skip ?? SKIP_DIRS;
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        visit(full);
      } else if (e.isFile()) {
        if (BINARY_EXT.has(path.extname(e.name).toLowerCase())) continue;
        if (e.name.endsWith('.min.js') || e.name.endsWith('.min.css')) continue;
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        if (size > maxBytes) continue;
        out.push(full);
      }
    }
  };
  visit(root);
  return out;
}

/**
 * True when the buffer looks binary: a NUL byte in the first 8KB.
 * @param {Buffer} buf
 */
export function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Files matching a simple glob-free filter: every file in a folder with one of
 * the extensions, sorted for stable output.
 * @param {string} dir
 * @param {string[]} exts
 */
export function filesIn(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => exts.some((x) => f.toLowerCase().endsWith(x)))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * The page measurements in a folder, without the interaction sweeps that sit
 * beside them.
 * @param {string} dir
 */
export function measurements(dir) {
  return filesIn(dir, ['.json']).filter((f) => !f.endsWith('.interact.json'));
}

/** @param {string} root @param {string} file */
export function rel(root, file) {
  const r = path.relative(root, file);
  return r.startsWith('..') ? file : r;
}

/** Today's date as YYYY-MM-DD, the format every ledger uses. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}
