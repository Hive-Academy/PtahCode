import 'reflect-metadata';
import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
import {
  readTaskEndHookSettings,
  TASK_END_HOOK_CLAMPS,
  TASK_END_HOOK_DEFAULTS,
  TASK_END_HOOK_KEYS,
  TaskEndHookSettingsReader,
} from './task-end-hook-config';

type Key = (typeof TASK_END_HOOK_KEYS)[keyof typeof TASK_END_HOOK_KEYS];

function seeded(values: Partial<Record<Key, unknown>>) {
  const config: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    config[`ptah.${key}`] = value;
  }
  return createMockWorkspaceProvider({ config });
}

describe('readTaskEndHookSettings', () => {
  it('returns the plan defaults when nothing is set', () => {
    const out = readTaskEndHookSettings(createMockWorkspaceProvider());
    expect(out).toEqual({
      enabled: true,
      disposalMode: 'off',
      settleWindowMs: 60_000,
      queueCap: 50,
      censusCooldownMs: 21_600_000,
      maxWorktreesPerRun: 8,
      archive: { maxBytes: 268_435_456, maxFiles: 5000 },
      memory: {
        enabled: true,
        sessionEndEnabled: true,
        bootScanIdleBackoffMs: 300_000,
      },
    });
  });

  it('reads every key under the ptah section', () => {
    const out = readTaskEndHookSettings(
      seeded({
        [TASK_END_HOOK_KEYS.enabled]: false,
        [TASK_END_HOOK_KEYS.disposalMode]: 'confirm',
        [TASK_END_HOOK_KEYS.settleWindowMs]: 10_000,
        [TASK_END_HOOK_KEYS.queueCap]: 7,
        [TASK_END_HOOK_KEYS.censusCooldownMs]: 0,
        [TASK_END_HOOK_KEYS.maxWorktreesPerRun]: 3,
        [TASK_END_HOOK_KEYS.archiveMaxBytes]: 1024,
        [TASK_END_HOOK_KEYS.archiveMaxFiles]: 10,
        [TASK_END_HOOK_KEYS.memoryEnabled]: false,
        [TASK_END_HOOK_KEYS.memorySessionEndEnabled]: false,
        [TASK_END_HOOK_KEYS.memoryBootScanIdleBackoffMs]: 1000,
      }),
    );
    expect(out).toEqual({
      enabled: false,
      disposalMode: 'confirm',
      settleWindowMs: 10_000,
      queueCap: 7,
      censusCooldownMs: 0,
      maxWorktreesPerRun: 3,
      archive: { maxBytes: 1024, maxFiles: 10 },
      memory: {
        enabled: false,
        sessionEndEnabled: false,
        bootScanIdleBackoffMs: 1000,
      },
    });
  });

  it.each(['off', 'auto', 'confirm'] as const)(
    'accepts disposalMode %s as the requested mode',
    (mode) => {
      const out = readTaskEndHookSettings(
        seeded({ [TASK_END_HOOK_KEYS.disposalMode]: mode }),
      );
      expect(out.disposalMode).toBe(mode);
    },
  );

  it.each(['remove', 'AUTO', '', 1, true, null])(
    'turns disposalMode %j into off',
    (raw) => {
      const out = readTaskEndHookSettings(
        seeded({ [TASK_END_HOOK_KEYS.disposalMode]: raw }),
      );
      expect(out.disposalMode).toBe('off');
    },
  );

  it.each([-1, '60000', Number.NaN, Number.POSITIVE_INFINITY, {}, null])(
    'falls back to the defaults for the non-numeric or negative value %j',
    (raw) => {
      const out = readTaskEndHookSettings(
        seeded({
          [TASK_END_HOOK_KEYS.settleWindowMs]: raw,
          [TASK_END_HOOK_KEYS.queueCap]: raw,
          [TASK_END_HOOK_KEYS.censusCooldownMs]: raw,
          [TASK_END_HOOK_KEYS.maxWorktreesPerRun]: raw,
          [TASK_END_HOOK_KEYS.archiveMaxBytes]: raw,
          [TASK_END_HOOK_KEYS.archiveMaxFiles]: raw,
          [TASK_END_HOOK_KEYS.memoryBootScanIdleBackoffMs]: raw,
        }),
      );
      expect(out.settleWindowMs).toBe(TASK_END_HOOK_DEFAULTS.settleWindowMs);
      expect(out.queueCap).toBe(TASK_END_HOOK_DEFAULTS.queueCap);
      expect(out.censusCooldownMs).toBe(
        TASK_END_HOOK_DEFAULTS.censusCooldownMs,
      );
      expect(out.maxWorktreesPerRun).toBe(
        TASK_END_HOOK_DEFAULTS.maxWorktreesPerRun,
      );
      expect(out.archive).toEqual({
        maxBytes: TASK_END_HOOK_DEFAULTS.archiveMaxBytes,
        maxFiles: TASK_END_HOOK_DEFAULTS.archiveMaxFiles,
      });
      expect(out.memory.bootScanIdleBackoffMs).toBe(
        TASK_END_HOOK_DEFAULTS.memoryBootScanIdleBackoffMs,
      );
    },
  );

  it('clamps values below the floor', () => {
    const out = readTaskEndHookSettings(
      seeded({
        [TASK_END_HOOK_KEYS.settleWindowMs]: 100,
        [TASK_END_HOOK_KEYS.queueCap]: 0,
      }),
    );
    expect(out.settleWindowMs).toBe(TASK_END_HOOK_CLAMPS.settleWindowMs.min);
    expect(out.queueCap).toBe(TASK_END_HOOK_CLAMPS.queueCap.min);
  });

  it('clamps values above the ceiling', () => {
    const out = readTaskEndHookSettings(
      seeded({
        [TASK_END_HOOK_KEYS.settleWindowMs]: 10_000_000,
        [TASK_END_HOOK_KEYS.queueCap]: 5000,
        [TASK_END_HOOK_KEYS.censusCooldownMs]: 30 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(out.settleWindowMs).toBe(3_600_000);
    expect(out.queueCap).toBe(1000);
    expect(out.censusCooldownMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('keeps the clamp bounds themselves', () => {
    const out = readTaskEndHookSettings(
      seeded({
        [TASK_END_HOOK_KEYS.settleWindowMs]: 5000,
        [TASK_END_HOOK_KEYS.queueCap]: 1000,
        [TASK_END_HOOK_KEYS.censusCooldownMs]: 0,
      }),
    );
    expect(out.settleWindowMs).toBe(5000);
    expect(out.queueCap).toBe(1000);
    expect(out.censusCooldownMs).toBe(0);
  });

  it('floors fractional counts and durations', () => {
    const out = readTaskEndHookSettings(
      seeded({
        [TASK_END_HOOK_KEYS.queueCap]: 7.9,
        [TASK_END_HOOK_KEYS.maxWorktreesPerRun]: 2.5,
        [TASK_END_HOOK_KEYS.settleWindowMs]: 6000.7,
      }),
    );
    expect(out.queueCap).toBe(7);
    expect(out.maxWorktreesPerRun).toBe(2);
    expect(out.settleWindowMs).toBe(6000);
  });

  it.each(['false', 0, 1, null, 'yes'])(
    'falls back to the default for the non-boolean switch %j',
    (raw) => {
      const out = readTaskEndHookSettings(
        seeded({
          [TASK_END_HOOK_KEYS.enabled]: raw,
          [TASK_END_HOOK_KEYS.memoryEnabled]: raw,
          [TASK_END_HOOK_KEYS.memorySessionEndEnabled]: raw,
        }),
      );
      expect(out.enabled).toBe(true);
      expect(out.memory.enabled).toBe(true);
      expect(out.memory.sessionEndEnabled).toBe(true);
    },
  );

  it('only reads, never writes settings', () => {
    const ws = createMockWorkspaceProvider();
    readTaskEndHookSettings(ws);
    expect(ws.getConfiguration).toHaveBeenCalled();
    for (const [section] of (ws.getConfiguration as jest.Mock).mock.calls) {
      expect(section).toBe('ptah');
    }
    expect(ws.setConfiguration).not.toHaveBeenCalled();
  });
});

describe('TaskEndHookSettingsReader', () => {
  it('takes a fresh snapshot on every read', async () => {
    const ws = createMockWorkspaceProvider();
    const reader = new TaskEndHookSettingsReader(ws);
    expect(reader.read().enabled).toBe(true);
    await ws.setConfiguration('ptah', TASK_END_HOOK_KEYS.enabled, false);
    expect(reader.read().enabled).toBe(false);
  });
});
