import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { Video } from '@playwright/test';

const assetDir = path.resolve(__dirname, '../../../../ptah-docs/public/assets/videos');

/** Playwright writes WebM on app close; only then can it be converted safely. */
export async function finalizeVideo(video: Video, name: string, markAtMs: number, startedAtMs = markAtMs): Promise<void> {
  const recordedPath = await video.path();
  const birthtime = fs.statSync(recordedPath).birthtimeMs;
  const recordingStartedAt = birthtime > 0 ? birthtime : startedAtMs;
  // Electron's video encoder buffers the previous surface briefly after navigation.
  const trimSeconds = Math.max(0, (markAtMs - recordingStartedAt) / 1000 + 1.7);
  const source = path.join(path.dirname(recordedPath), `${name}.webm`);
  const output = path.join(path.dirname(recordedPath), `${name}-${randomUUID()}.mp4`);
  const published = path.join(assetDir, `${name}.mp4`);
  const stage = path.join(assetDir, `.${name}-${randomUUID()}.mp4`);
  try {
    await video.saveAs(source);
    const result = spawnSync('ffmpeg', [
    '-y', '-v', 'error', '-ss', trimSeconds.toFixed(2), '-i', source, '-an', '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', output,
  ], { encoding: 'utf8', timeout: 180_000 });
    if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.error?.message || result.stderr || String(result.status)}`);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', output], { encoding: 'utf8', timeout: 30_000 });
    if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.error?.message || probe.stderr || String(probe.status)}`);
  const duration = Number(probe.stdout.trim());
  if (!Number.isFinite(duration) || duration < 1) throw new Error(`${name}.mp4 is empty or shorter than one second`);
  const size = fs.statSync(output).size;
  if (size > 5_000_000) throw new Error(`${name}.mp4 exceeds 5 MB (${size} bytes)`);
  fs.copyFileSync(output, stage);
  fs.renameSync(stage, published);
  process.stdout.write(`[docs-video] ${name}.mp4 ${size} bytes; trim ${trimSeconds.toFixed(2)}s\n`);
  } finally {
    fs.rmSync(source, { force: true });
    fs.rmSync(output, { force: true });
    fs.rmSync(stage, { force: true });
  }
}
