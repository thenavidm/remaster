// @ts-check
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { num } from '../lib/args.mjs';
import { ensureDir, paths, projectRoot, rel, writeJson } from '../lib/fsx.mjs';
import { fail, say } from '../lib/out.mjs';
import { slug } from '../lib/text.mjs';

export const help = `remaster frames <video file> [--scene 0.3] [--max 200] [--out folder]

Pull a frame at every scene change from a screen recording, with its
timestamp, so an agent can read a walkthrough screen by screen. Needs ffmpeg.

Use it on recordings you made yourself (a walk through your own account of
the original, with the user driving), or videos you have the right to copy.
For someone else's public video, watch it and take notes instead.

  --scene 0.3   how big a change starts a new frame (0.2 catches more)
  --max 200     frames at most`;

/** @param {number} t */
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** @param {{ flags: Record<string, string | boolean>, positionals: string[] }} args */
export async function run({ flags, positionals }) {
  const video = positionals[0] ? path.resolve(positionals[0]) : '';
  if (!video || !fs.existsSync(video)) fail(help);
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (probe.status !== 0) fail('ffmpeg is not installed. macOS: brew install ffmpeg. Windows: winget install ffmpeg. Linux: your package manager.');
  const root = projectRoot();
  const out = typeof flags.out === 'string' ? path.resolve(flags.out) : path.join(paths(root).frames, slug(path.basename(video, path.extname(video)), 40));
  ensureDir(out);
  const scene = num(flags.scene, 0.3);
  const max = num(flags.max, 200);
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', video, '-vf', `select='eq(n\\,0)+gt(scene\\,${scene})',showinfo,scale='min(1440\\,iw)':-2`, '-fps_mode', 'vfr', '-frames:v', String(max), '-q:v', '3', path.join(out, '%04d.jpg')],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) fail(`ffmpeg could not read the video:\n${(r.stderr ?? '').split('\n').slice(-6).join('\n')}`);
  const times = [...(r.stderr ?? '').matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const files = fs.readdirSync(out).filter((f) => f.endsWith('.jpg')).sort();
  const frames = files.map((f, i) => ({ file: f, t: times[i] ?? null, at: times[i] != null ? clock(times[i]) : '' }));
  writeJson(path.join(out, 'frames.json'), { video: path.basename(video), scene, frames });
  say(`${frames.length} frames in ${rel(root, out)}, with timestamps in frames.json. Read them in order and note each screen, state and click.`);
  return 0;
}
