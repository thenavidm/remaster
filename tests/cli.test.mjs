import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'clone', 'scripts', 'remaster.mjs');
/** @param {string[]} args @param {string} cwd */
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('cli: help, unknown command, every command has help', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-cli-'));
  const h = run([], dir);
  assert.equal(h.status, 0);
  const commands = [...h.stdout.matchAll(/^ {2}(\w+)\s{2,}/gm)].map((m) => m[1]);
  assert.ok(commands.length >= 19);
  for (const c of commands) {
    const r = run([c, '--help'], dir);
    assert.equal(r.status, 0, `${c} --help`);
    assert.match(r.stdout, new RegExp(`remaster ${c}`), `${c} help names itself`);
  }
  assert.equal(run(['nope'], dir).status, 2);
});

test('cli: init, status and the research gate on an empty project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-cli-'));
  assert.equal(run(['init', 'https://example.com', '--mode', 'app'], dir).status, 0);
  for (const f of ['state.json', 'features.csv', 'sources.csv', 'brand.json', 'research/reviews.csv', 'research/recon.md', 'research/verdict.md', 'verify/bugs.csv']) assert.ok(fs.existsSync(path.join(dir, 'remaster', f)), f);
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^remaster\/research\/$/m);
  const brand = JSON.parse(fs.readFileSync(path.join(dir, 'remaster', 'brand.json'), 'utf8'));
  assert.deepEqual(brand.avoid, ['Example']);
  assert.deepEqual(brand.domains, ['example.com']);
  const status = run(['status'], dir);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /research {2}<- now/);
  assert.match(status.stdout, /Next: /);
  const gate = run(['gate', '--json'], dir);
  assert.equal(gate.status, 1);
  const g = JSON.parse(gate.stdout);
  assert.equal(g.passed, false);
  assert.ok(g.checks.some((/** @type {any} */ c) => c.name === 'reviews' && c.status === 'fail'));
  assert.equal(run(['init', 'https://example.com', '--mode', 'app'], dir).status, 2, 'refuses to overwrite');
  assert.equal(run(['init', 'https://mine.com', '--mode', 'migrate'], fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-cli-'))).status, 2, 'migrate needs --owner');
});

test('cli: design writes DESIGN.md from the template, and never over a host file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remaster-cli-'));
  run(['init', 'https://example.com', '--mode', 'feature'], dir);
  fs.mkdirSync(path.join(dir, 'remaster', 'design'), { recursive: true });
  fs.copyFileSync(path.join(path.dirname(CLI), '..', 'templates', 'design.json'), path.join(dir, 'remaster', 'design', 'design.json'));
  fs.writeFileSync(path.join(dir, 'DESIGN.md'), '# The host app\'s design\n');
  const r = run(['design'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'DESIGN.md'), 'utf8'), '# The host app\'s design\n');
  assert.ok(fs.existsSync(path.join(dir, 'remaster', 'design', 'DESIGN.md')));
  assert.ok(fs.existsSync(path.join(dir, 'remaster', 'design', 'tokens.css')));
});
