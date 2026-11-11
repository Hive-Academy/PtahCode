import { open, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { windowKindFromDuration, type PlanLimitWindow } from '@ptah-extension/shared';
import type { UsageSource, UsageSourceResult } from './plan-usage-reader.types';

export const CODEX_ROLLOUT_TAIL_BYTES = 256 * 1024;
export const CODEX_ROLLOUT_FRESHNESS_MS = 15 * 60 * 1000;
const MAX_RECENT_DIRS = 3;
const MAX_RECENT_FILES = 64;

const quotaWindow = z.object({
  used_percent: z.number().finite().min(0).max(100),
  window_minutes: z.number().int().positive(),
  resets_at: z.number().int().positive(),
});
const event = z.object({
  timestamp: z.string().datetime({ offset: true }),
  type: z.literal('event_msg'),
  payload: z.object({
    type: z.literal('token_count'),
    rate_limits: z.object({
      primary: quotaWindow.nullish(),
      secondary: quotaWindow.nullish(),
    }),
  }),
});

export interface CodexRolloutFileSystem {
  readdir: typeof readdir;
  realpath: typeof realpath;
  stat: typeof stat;
  open: typeof open;
}

const nodeFiles: CodexRolloutFileSystem = { readdir, realpath, stat, open };

function inside(candidate: string, root: string): boolean {
  const part = relative(resolve(root), resolve(candidate));
  return part === '' || (part !== '..' && !part.startsWith(`..\\`) &&
    !part.startsWith('../') && !isAbsolute(part));
}

async function newestRollout(home: string, fs: CodexRolloutFileSystem): Promise<string | undefined> {
  const root = await fs.realpath(home);
  const sessions = join(home, 'sessions');
  if (!inside(await fs.realpath(sessions), root)) return undefined;
  let dirs = [sessions];
  const files: { path: string; mtimeMs: number }[] = [];
  for (let depth = 0; depth < 4; depth++) {
    const next: string[] = [];
    for (const dir of dirs) {
      if (!inside(await fs.realpath(dir), root)) continue;
      const entries = (await fs.readdir(dir, { withFileTypes: true }))
        .sort((a, b) => b.name.localeCompare(a.name));
      const recentDirs = entries.filter((entry) => entry.isDirectory() && /^\d{2,4}$/.test(entry.name)).slice(0, MAX_RECENT_DIRS);
      const recentFiles = depth === 3 ? entries.filter((entry) => entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)).slice(0, MAX_RECENT_FILES) : [];
      for (const entry of [...recentDirs, ...recentFiles]) {
        const path = join(dir, entry.name);
        if (!inside(await fs.realpath(path), root)) continue;
        if (entry.isDirectory() && depth < 3) next.push(path);
        if (entry.isFile()) {
          files.push({ path, mtimeMs: (await fs.stat(path)).mtimeMs });
        }
      }
    }
    dirs = next;
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  return files[0]?.path;
}

async function tail(path: string, fs: CodexRolloutFileSystem): Promise<string> {
  const handle = await fs.open(path, 'r');
  try {
    const size = (await handle.stat()).size;
    const length = Math.min(size, CODEX_ROLLOUT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    return size > length ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    await handle.close();
  }
}

export function createCodexRolloutUsageSource(
  homeSource: () => string | undefined,
  now: () => number = Date.now,
  fs: CodexRolloutFileSystem = nodeFiles,
): UsageSource {
  return {
    id: 'codex-rollout', label: 'local-state',
    async read(): Promise<UsageSourceResult> {
      const home = homeSource();
      if (!home) return { ok: false, source: 'local-state', reason: 'source-not-applicable' };
      try {
        const path = await newestRollout(home, fs);
        if (!path) return { ok: false, source: 'local-state', reason: 'source-not-applicable' };
        let authChangedAt: number;
        try { authChangedAt = (await fs.stat(join(home, 'auth.json'))).mtimeMs; }
        catch (_error: unknown) {
          // degradation-audit: optional-capability - without auth change time the rollout owner is unverified.
          return { ok: false, source: 'local-state', reason: 'account-unverified' };
        }
        const lines = (await tail(path, fs)).split(/\r?\n/);
        for (let i = lines.length - 1; i >= 0; i--) {
          let parsedJson: unknown;
          try { parsedJson = JSON.parse(lines[i]); } catch (_error: unknown) {
            // degradation-audit: optional-capability - malformed local event lines are ignored.
            continue;
          }
          const parsed = event.safeParse(parsedJson);
          if (!parsed.success) continue;
          const readAt = Date.parse(parsed.data.timestamp);
          if (!Number.isFinite(authChangedAt) || readAt < authChangedAt)
            return { ok: false, source: 'local-state', reason: 'account-unverified' };
          const current = now();
          if (readAt > current || current - readAt > CODEX_ROLLOUT_FRESHNESS_MS)
            return { ok: false, source: 'local-state', reason: 'cli-unavailable' };
          const windows: PlanLimitWindow[] = [];
          for (const [position, quota] of [parsed.data.payload.rate_limits.primary, parsed.data.payload.rate_limits.secondary].entries()) {
            if (!quota || quota.resets_at * 1000 <= current) continue;
            const descriptor = windowKindFromDuration(quota.window_minutes, position === 0 ? 1 : 2);
            windows.push({
              ...descriptor, durationMins: quota.window_minutes,
              used: { kind: 'percent', percent: quota.used_percent },
              usedSource: 'provider-unofficial', usedObservedAt: readAt,
              resetsAt: quota.resets_at * 1000, resetSource: 'provider-unofficial', observedAt: readAt,
            });
          }
          if (windows.length === 0) return { ok: false, source: 'local-state', reason: 'cli-unavailable' };
          return { ok: true, source: 'local-state', readAt, reading: {
            status: 'available', fetchedAt: readAt, windowSetEstablished: true, windows,
          } };
        }
        return { ok: false, source: 'local-state', reason: 'cli-unavailable' };
      } catch (error: unknown) {
        // degradation-audit: optional-capability - absent or inaccessible local sessions cannot answer usage.
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
          return { ok: false, source: 'local-state', reason: 'source-not-applicable' };
        return { ok: false, source: 'local-state', reason: 'cli-unavailable' };
      }
    },
  };
}
