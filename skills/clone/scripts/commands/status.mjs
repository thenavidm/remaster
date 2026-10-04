// @ts-check
import { projectRoot } from '../lib/fsx.mjs';
import { say, table } from '../lib/out.mjs';
import { MODE_TEXT, STAGES, loadState } from '../lib/state.mjs';
import { runChecks } from './gate.mjs';

export const help = `remaster status [--json]

Where the project is: the target and mode, each stage's last gate result,
and, for the current stage, what is done and the next thing to do. Read-only:
it runs the current stage's checks without recording them.`;

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags }) {
  const root = projectRoot();
  const state = loadState(root);
  if (!state) {
    say('No Remaster project here yet.\n\nStart one in the folder the clone will live in:\n  remaster init <url or name> --mode app|site|feature|migrate\n\nModes:');
    for (const [k, v] of Object.entries(MODE_TEXT)) say(`  ${k.padEnd(8)} ${v}`);
    return 0;
  }
  const checks = runChecks(state.stage, root, state);
  const next = checks.find((c) => c.status === 'fail');
  if (flags.json) {
    say(JSON.stringify({ state, current: { stage: state.stage, checks }, next: next ?? null }, null, 2));
    return 0;
  }
  say(`${state.target.name} (${state.target.url}), ${state.mode} mode: ${MODE_TEXT[state.mode]}.`);
  say(
    '\n' +
      table(
        ['stage', 'gate'],
        STAGES.map((s) => {
          const g = state.gates[s];
          return [s + (s === state.stage ? '  <- now' : ''), g ? `${g.passed ? 'passed' : 'not passed'} ${g.at.slice(0, 16).replace('T', ' ')}` : 'not run'];
        }),
      ),
  );
  say(`\n${state.stage} stage:`);
  say(table(['check', 'status', 'detail'], checks.map((c) => [c.name, c.status, c.detail])));
  say(next ? `\nNext: ${next.fix}` : `\nEverything in ${state.stage} checks out. Run \`remaster gate\` to record it and move on.`);
  return 0;
}
