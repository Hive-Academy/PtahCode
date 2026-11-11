import { mkdtemp, mkdir, readFile, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexRolloutUsageSource, CODEX_ROLLOUT_TAIL_BYTES } from './codex-rollout-usage.reader';
import { supersedes } from '@ptah-extension/shared';

const NOW = Date.UTC(2026, 10, 11, 12, 5);
const reset = Math.floor((NOW + 60 * 60 * 1000) / 1000);
const request = {
  target: { providerId: 'openai-codex', ownerRef: { key: '<account>', providerId: 'openai-codex', identityKind: 'unknown' as const, label: '<account>' } },
  refresh: false,
};
function line(at = NOW - 60_000, resetsAt = reset): string {
  return JSON.stringify({ timestamp: new Date(at).toISOString(), type: 'event_msg', payload: {
    type: 'token_count', rate_limits: {
      primary: { used_percent: 37, window_minutes: 300, resets_at: resetsAt },
      secondary: null,
    },
  } });
}
async function home(): Promise<{ root: string; day: string }> {
  const root = await mkdtemp(join(tmpdir(), 'codex-rollout-synthetic-'));
  const day = join(root, 'sessions', '2026', '11', '11');
  await mkdir(day, { recursive: true });
  const auth = join(root, 'auth.json');
  await writeFile(auth, 'synthetic');
  await utimes(auth, new Date(NOW - 20 * 60_000), new Date(NOW - 20 * 60_000));
  return { root, day };
}

describe('Codex rollout usage source', () => {
  it('returns source-not-applicable when no sessions file exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-no-file-synthetic-'));
    expect(await createCodexRolloutUsageSource(() => root, () => NOW).read(request)).toMatchObject({
      ok: false, reason: 'source-not-applicable',
    });
  });

  it('accepts a junction home when resolved sessions and files remain inside it', async () => {
    const { root, day } = await home();
    const alias = await mkdtemp(join(tmpdir(), 'codex-home-alias-'));
    const link = join(alias, 'home');
    await symlink(root, link, 'junction');
    await writeFile(join(day, 'rollout-junction.jsonl'), line());
    expect((await createCodexRolloutUsageSource(() => link, () => NOW).read(request)).ok).toBe(true);
  });
  it('rejects an event older than the auth change', async () => {
    const { root, day } = await home();
    await writeFile(join(day, 'rollout-owner.jsonl'), line());
    await utimes(join(root, 'auth.json'), new Date(NOW), new Date(NOW));
    expect(await createCodexRolloutUsageSource(() => root, () => NOW).read(request)).toMatchObject({
      ok: false, reason: 'account-unverified',
    });
  });

  it('a 100% rollout window has non-live evidence', async () => {
    const { root, day } = await home();
    await writeFile(join(day, 'rollout-full.jsonl'), line().replace('"used_percent":37', '"used_percent":100'));
    const result = await createCodexRolloutUsageSource(() => root, () => NOW).read(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const window = result.reading.windows[0];
    expect(window.exhaustion).toBeUndefined();
    expect(window.usedSource).toBe('provider-unofficial');
    expect(supersedes({ observedAt: NOW, source: 'provider-api', stale: true },
      { observedAt: NOW - 60_000, source: window.usedSource!, exhausted: true })).toBe(true);
  });
  it('chooses the newest file and reports local evidence without exhaustion', async () => {
    const { root, day } = await home();
    const old = join(day, 'rollout-old.jsonl');
    const fresh = join(day, 'rollout-new.jsonl');
    await writeFile(old, `${line(NOW - 20 * 60_000)}\n`);
    await writeFile(fresh, `${line()}\n`);
    await utimes(old, new Date(NOW - 10000), new Date(NOW - 10000));
    await utimes(fresh, new Date(NOW), new Date(NOW));
    const result = await createCodexRolloutUsageSource(() => root, () => NOW).read(request);
    expect(result).toMatchObject({ ok: true, source: 'local-state', readAt: NOW - 60_000 });
    if (result.ok) {
      expect(result.reading.windows[0]).toMatchObject({ usedSource: 'provider-unofficial', resetSource: 'provider-unofficial' });
      expect(result.reading.windows[0].exhaustion).toBeUndefined();
    }
  });

  it('bounds the read to the tail and ignores malformed lines', async () => {
    const { root, day } = await home();
    const path = join(day, 'rollout-tail.jsonl');
    await writeFile(path, `${'x'.repeat(CODEX_ROLLOUT_TAIL_BYTES + 100)}\n{malformed}\n${line()}\n`);
    const result = await createCodexRolloutUsageSource(() => root, () => NOW).read(request);
    expect(result.ok).toBe(true);
    expect((await readFile(path)).length).toBeGreaterThan(CODEX_ROLLOUT_TAIL_BYTES);
  });

  it('rejects stale events and passed reset times', async () => {
    const { root, day } = await home();
    const path = join(day, 'rollout-stale.jsonl');
    await writeFile(path, `${line(NOW - 16 * 60_000)}\n`);
    expect((await createCodexRolloutUsageSource(() => root, () => NOW).read(request)).ok).toBe(false);
    await writeFile(path, `${line(NOW - 1000, Math.floor((NOW - 1000) / 1000))}\n`);
    expect((await createCodexRolloutUsageSource(() => root, () => NOW).read(request)).ok).toBe(false);
  });

  it('rejects a session path that escapes its owner home', async () => {
    const { root } = await home();
    const outside = await home();
    const escape = join(root, 'sessions', '2026', '11', '12');
    await symlink(outside.day, escape, 'junction');
    await writeFile(join(outside.day, 'rollout-outside.jsonl'), `${line()}\n`);
    expect((await createCodexRolloutUsageSource(() => root, () => NOW).read(request)).ok).toBe(false);
  });
});

