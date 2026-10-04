// @ts-check
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { list } from '../lib/args.mjs';
import { fail, say, table } from '../lib/out.mjs';

export const help = `remaster install [--agent claude,agents] [--project] [--remove]

Put the Remaster skill where your AI agents look for skills, in one step.

  --agent claude   Claude Code: ~/.claude/skills/clone
  --agent agents   Codex, Cursor and Gemini CLI, which all read ~/.agents/skills/clone
                   (codex, cursor and gemini are accepted as names for the same folder)
  (no --agent)     both, which covers all four
  --project        install into the current project (.claude/skills, .agents/skills)
                   instead of your home folder
  --remove         take Remaster out of those folders again

Claude Code fills in the skill's own folder for its scripts. Other agents
don't, so the copy for them has that folder written into its SKILL.md, and
every command in it works as written. Run it again after an update to
refresh the copies. A different skill already named "clone" is never
overwritten.

The plugin installs (Claude Code's /plugin, Codex's plugin marketplace,
Gemini CLI's extensions) are the other way in; see the README.`;

/** The skill folder this CLI lives in. */
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Where each agent family reads skills from.
 * @param {boolean} project
 * @param {string} home
 */
export function targets(project, home) {
  const base = project ? process.cwd() : home;
  return {
    claude: { label: 'Claude Code', dir: path.join(base, '.claude', 'skills', 'clone'), substitutes: true },
    agents: { label: 'Codex, Cursor, Gemini CLI', dir: path.join(base, '.agents', 'skills', 'clone'), substitutes: false },
  };
}

/**
 * Whether a folder holds Remaster (safe to replace) rather than some other
 * skill that happens to be called clone.
 * @param {string} dir
 */
export function isRemaster(dir) {
  const f = path.join(dir, 'SKILL.md');
  return fs.existsSync(f) && /^# Remaster/m.test(fs.readFileSync(f, 'utf8'));
}

/**
 * A plain recursive copy. fs.cpSync is still marked experimental on older
 * Node versions and prints a warning there.
 * @param {string} from @param {string} to
 */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === '.DS_Store' || e.name === 'node_modules') continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
  }
}

/**
 * Copy the skill, writing its real folder into SKILL.md for agents that
 * don't substitute ${CLAUDE_SKILL_DIR} themselves.
 * @param {string} dest
 * @param {boolean} substitutes
 */
export function installTo(dest, substitutes) {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  copyDir(SKILL, dest);
  if (!substitutes) {
    const skillMd = path.join(dest, 'SKILL.md');
    fs.writeFileSync(skillMd, fs.readFileSync(skillMd, 'utf8').replaceAll('${CLAUDE_SKILL_DIR}', dest));
  }
}

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags }) {
  const wanted = list(flags.agent, ['claude', 'agents']).map((a) => (['codex', 'cursor', 'gemini'].includes(a.toLowerCase()) ? 'agents' : a.toLowerCase()));
  const known = targets(!!flags.project, os.homedir());
  const unknown = wanted.filter((a) => !(a in known));
  if (unknown.length) fail(`Unknown agent: ${unknown.join(', ')}. Use claude, agents, codex, cursor or gemini.\n\n${help}`);
  const rows = [];
  let refused = 0;
  for (const key of [...new Set(wanted)]) {
    const t = known[/** @type {'claude' | 'agents'} */ (key)];
    if (fs.existsSync(t.dir) && !isRemaster(t.dir)) {
      rows.push([t.label, t.dir, 'left alone: a different skill named clone is there']);
      refused++;
      continue;
    }
    if (flags.remove) {
      if (fs.existsSync(t.dir)) {
        fs.rmSync(t.dir, { recursive: true, force: true });
        rows.push([t.label, t.dir, 'removed']);
      } else rows.push([t.label, t.dir, 'not installed']);
      continue;
    }
    const existed = fs.existsSync(t.dir);
    installTo(t.dir, t.substitutes);
    rows.push([t.label, t.dir, existed ? 'updated' : 'installed']);
  }
  say(table(['agent', 'folder', 'result'], rows));
  if (!flags.remove && rows.some((r) => r[2] === 'installed' || r[2] === 'updated')) {
    say('\nStart a new session, then:');
    say('  Claude Code   /clone <url>, or just ask for a clone');
    say('  Codex         $clone <url>, or just ask');
    say('  Gemini CLI    ask for a clone; it offers to activate the skill');
    say('  Cursor        ask for a clone; it picks the skill from its description');
  }
  return refused ? 1 : 0;
}
