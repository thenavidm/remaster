#!/usr/bin/env node
// @ts-check
/*
 * Remaster's command line. One entry point so the skill only has to know one
 * path; each command lives in its own module and loads only when called.
 * Node 18 or later, no dependencies.
 */
import { parseArgs } from './lib/args.mjs';

const COMMANDS = {
  install: 'Install the skill for Claude Code, Codex, Cursor and Gemini CLI',
  init: 'Start a Remaster project in this folder',
  status: 'Where the project is, what passed, what to do next',
  store: 'App Store lookup and reviews (official public feeds)',
  hn: 'Hacker News comments and stories (official search API)',
  crawl: 'Read a public help center or docs, obeying robots.txt',
  frames: 'Frames from a screen recording you made, with timestamps',
  pains: 'Check an analysis of reviews against the rows, then rank it',
  measure: 'Measure a page: design system, skeleton, text, screenshot',
  interact: 'Sweep a page\'s hover, keyboard focus and scroll behavior',
  tokens: 'Summarize measurements into the original\'s design system',
  design: 'Check your design and write DESIGN.md and tokens.css',
  diff: 'Compare the clone with the original: structure and layout',
  copy: 'Check copy for AI tells, fake proof and placeholders',
  sweep: 'Find anything of the original left in your project',
  parity: 'Feature parity, fixes built, and better-than-original',
  domain: 'Check domain names against the registries (RDAP)',
  listing: 'Check an App Store and Google Play listing',
  urls: 'Migration check: every old URL and its head tags on the new site',
  teardown: 'Write the shareable teardown report',
  gate: 'Run a stage\'s checks and record the result',
};

const BOOLEANS = ['json', 'help', 'headed', 'snippet', 'force', 'owner', 'render', 'sitemap', 'markdown', 'pixel', 'dashes-ok', 'quiet', 'no-screens', 'strict', 'project', 'remove'];

function usage() {
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  return [
    'remaster <command> [options]',
    '',
    ...Object.entries(COMMANDS).map(([k, v]) => `  ${k.padEnd(width)}  ${v}`),
    '',
    'remaster <command> --help shows a command\'s options.',
  ].join('\n');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(usage() + '\n');
    return 0;
  }
  if (!(command in COMMANDS)) {
    process.stderr.write(`Unknown command: ${command}\n\n${usage()}\n`);
    return 2;
  }
  const mod = await import(`./commands/${command}.mjs`);
  const args = parseArgs(rest, BOOLEANS);
  if (args.flags.help) {
    process.stdout.write(mod.help + '\n');
    return 0;
  }
  return (await mod.run(args)) ?? 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`remaster: ${err && err.message ? err.message : err}\n`);
    process.exit(2);
  },
);
