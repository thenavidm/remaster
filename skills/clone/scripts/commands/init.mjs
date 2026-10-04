// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { str } from '../lib/args.mjs';
import { ensureDir, exists, paths, rel, writeJson, writeText } from '../lib/fsx.mjs';
import { fail, say } from '../lib/out.mjs';
import { MODES, MODE_TEXT, newState } from '../lib/state.mjs';

export const help = `remaster init <url or name> --mode app|site|feature|migrate [--name "Original"] [--owner] [--force]

Start a project in the current folder: remaster/ with the state file, the
ledgers (features, sources, reviews, bugs) and brand.json, which the sweep
reads to keep the original's names, domains and colors out of your product.

  --mode     app      an app's features and flows, rebuilt better and yours
             site     a site or page's structure, motion and feel, with your words
             feature  one feature, into an app you already have
             migrate  a site you own, moved to a new stack with nothing lost
  --name     the original's name, for the sweep (default: from the URL)
  --owner    the user owns the target (required for migrate)

It also adds remaster/research/ to .gitignore: that folder holds the
original's words and screenshots, which are research, never something to
publish.`;

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates');

/** @param {string} target */
function nameFrom(target) {
  try {
    const host = new URL(target).hostname.replace(/^(www|app|help|docs)\./, '');
    const base = host.split('.').slice(0, -1).join('.') || host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return target;
  }
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const target = positionals.join(' ').trim();
  const mode = /** @type {typeof MODES[number]} */ (str(flags.mode, ''));
  if (!target || !MODES.includes(mode)) fail(help);
  if (mode === 'migrate' && !flags.owner) fail('Migrate mode copies words, images and structure exactly, which is only right for a site the user owns. Confirm with the user, then run again with --owner.');
  const root = process.cwd();
  const p = paths(root);
  if (exists(p.state) && !flags.force) fail(`A Remaster project already lives here (${rel(root, p.state)}). Run \`remaster status\`, or --force to start over.`);
  const name = str(flags.name, nameFrom(target));
  const state = newState(target, name, mode, !!flags.owner);
  for (const dir of [p.research, p.design, p.verify, p.launch]) ensureDir(dir);
  writeJson(p.state, state);
  /** @type {[string, string][]} */
  const copies = [
    ['features.csv', p.features],
    ['sources.csv', p.sources],
    ['reviews.csv', p.reviews],
    ['bugs.csv', p.bugs],
    ['beat.json', p.beat],
    ['critic.json', p.critic],
    ['proof.json', p.proof],
    ['recon.md', p.recon],
  ];
  if (mode === 'app' || mode === 'feature') copies.push(['verdict.md', p.verdict]);
  for (const [from, to] of copies) if (!exists(to)) fs.copyFileSync(path.join(TEMPLATES, from), to);
  if (!exists(p.brand)) {
    let domains = [];
    try {
      domains = [new URL(target).hostname.replace(/^www\./, '')];
    } catch {
      /* a name, not a URL */
    }
    writeJson(p.brand, { name: '', avoid: mode === 'migrate' ? [] : [name], domains: mode === 'migrate' ? [] : domains, colors: [], allow: [], checks: [] });
  }
  writeText(
    path.join(p.dir, 'README.md'),
    `# Remaster project\n\nCloning ${name} (${target}) in ${mode} mode: ${MODE_TEXT[mode]}.\n\n- \`state.json\`: stage, decisions and gate results\n- \`features.csv\`: the feature matrix, scored by \`remaster parity\`\n- \`sources.csv\`: every source read, with its link and date\n- \`brand.json\`: the original's names, domains and colors the sweep keeps out\n- \`research/\`: reviews, pains, recon map, measurements of the original. Never published.\n- \`design/\`: the original's measured system and yours\n- \`verify/\`: measurements of the clone, diffs, critic verdicts, bugs, beat metrics\n- \`launch/\`: listing, proof for any claim\n`,
  );
  const gi = path.join(root, '.gitignore');
  const line = `${path.basename(p.dir)}/research/`;
  const current = exists(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!current.split('\n').some((l) => l.trim() === line)) fs.writeFileSync(gi, `${current}${current && !current.endsWith('\n') ? '\n' : ''}# Remaster research: the original's words and screenshots, never published\n${line}\n`);
  say(`Started: ${name} in ${mode} mode. ${MODE_TEXT[mode]}.`);
  say(`Files are in ${rel(root, p.dir)}/. ${line} is in .gitignore.`);
  say('Next: `remaster status` says what to do first.');
  return 0;
}
