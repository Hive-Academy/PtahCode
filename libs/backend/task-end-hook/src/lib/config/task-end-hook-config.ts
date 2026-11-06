import { inject, injectable } from 'tsyringe';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type { TaskEndDisposeRequestedMode } from '@ptah-extension/shared';

/**
 * Task-end hook settings (TASK_2026_886, plan Component 9).
 *
 * Read through `IWorkspaceProvider.getConfiguration('ptah', key, default)`, so
 * they resolve from `~/.ptah/settings.json` on every host (pattern:
 * `memory-curator/src/lib/triggers/memory-trigger-config.ts`). The hook only
 * reads; it never writes any key, `memory.*` included.
 */

export const TASK_END_HOOK_SECTION = 'ptah';

export const TASK_END_HOOK_KEYS = {
  enabled: 'taskEndHook.enabled',
  disposalMode: 'taskEndHook.disposalMode',
  settleWindowMs: 'taskEndHook.settleWindowMs',
  queueCap: 'taskEndHook.queueCap',
  censusCooldownMs: 'taskEndHook.censusCooldownMs',
  maxWorktreesPerRun: 'taskEndHook.maxWorktreesPerRun',
  archiveMaxBytes: 'taskEndHook.archive.maxBytes',
  archiveMaxFiles: 'taskEndHook.archive.maxFiles',
  /**
   * Memory keys the hook reads, never writes. The strings and defaults mirror
   * `MEMORY_TRIGGER_KEYS` / `MEMORY_TRIGGER_DEFAULTS` (`memory-trigger-config.ts`
   * `:18`, `:34`, `:50`, `:74`, `:93`, `:108-109`); the library does not import
   * memory-curator, so they are restated here.
   */
  memoryEnabled: 'memory.enabled',
  memorySessionEndEnabled: 'memory.triggers.sessionEnd.enabled',
  memoryBootScanIdleBackoffMs: 'memory.triggers.bootScanIdleBackoffMs',
} as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const TASK_END_HOOK_DEFAULTS = {
  enabled: true,
  /** C1: `auto` and `confirm` are recorded but resolve to `effectiveMode: off`. */
  disposalMode: 'off' as TaskEndDisposeRequestedMode,
  settleWindowMs: 60_000,
  queueCap: 50,
  /** 6 h: at most four censuses a day per main root. */
  censusCooldownMs: 21_600_000,
  maxWorktreesPerRun: 8,
  /** 256 MiB; evaluated only (P7, report-only). */
  archiveMaxBytes: 268_435_456,
  archiveMaxFiles: 5000,
  memoryEnabled: true,
  memorySessionEndEnabled: true,
  memoryBootScanIdleBackoffMs: 300_000,
} as const;

/** Inclusive clamp ranges (plan Component 9 "Validation"). */
export const TASK_END_HOOK_CLAMPS = {
  settleWindowMs: { min: 5000, max: 3_600_000 },
  queueCap: { min: 1, max: 1000 },
  censusCooldownMs: { min: 0, max: SEVEN_DAYS_MS },
} as const;

const DISPOSAL_MODES: readonly TaskEndDisposeRequestedMode[] = [
  'off',
  'auto',
  'confirm',
];

export interface TaskEndHookSettings {
  readonly enabled: boolean;
  readonly disposalMode: TaskEndDisposeRequestedMode;
  readonly settleWindowMs: number;
  readonly queueCap: number;
  readonly censusCooldownMs: number;
  readonly maxWorktreesPerRun: number;
  readonly archive: {
    readonly maxBytes: number;
    readonly maxFiles: number;
  };
  readonly memory: {
    readonly enabled: boolean;
    readonly sessionEndEnabled: boolean;
    readonly bootScanIdleBackoffMs: number;
  };
}

function readRaw(
  ws: IWorkspaceProvider,
  key: string,
  fallback: unknown,
): unknown {
  return ws.getConfiguration<unknown>(TASK_END_HOOK_SECTION, key, fallback);
}

function readBoolean(
  ws: IWorkspaceProvider,
  key: string,
  fallback: boolean,
): boolean {
  const raw = readRaw(ws, key, fallback);
  return typeof raw === 'boolean' ? raw : fallback;
}

/**
 * A non-negative finite number, else `fallback`. `integer` floors it (counts
 * and byte sizes are whole numbers).
 */
function readNonNegative(
  ws: IWorkspaceProvider,
  key: string,
  fallback: number,
  integer: boolean,
): number {
  const raw = readRaw(ws, key, fallback);
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return fallback;
  }
  return integer ? Math.floor(raw) : raw;
}

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function readDisposalMode(ws: IWorkspaceProvider): TaskEndDisposeRequestedMode {
  const raw = readRaw(
    ws,
    TASK_END_HOOK_KEYS.disposalMode,
    TASK_END_HOOK_DEFAULTS.disposalMode,
  );
  return DISPOSAL_MODES.find((mode) => mode === raw) ?? 'off';
}

/**
 * Reads one settings snapshot. Non-numeric or negative numbers fall back to
 * the default; `settleWindowMs`, `queueCap` and `censusCooldownMs` are then
 * clamped; a `disposalMode` outside the three literals becomes `off`.
 */
export function readTaskEndHookSettings(
  ws: IWorkspaceProvider,
): TaskEndHookSettings {
  const d = TASK_END_HOOK_DEFAULTS;
  const k = TASK_END_HOOK_KEYS;
  return {
    enabled: readBoolean(ws, k.enabled, d.enabled),
    disposalMode: readDisposalMode(ws),
    settleWindowMs: clamp(
      readNonNegative(ws, k.settleWindowMs, d.settleWindowMs, true),
      TASK_END_HOOK_CLAMPS.settleWindowMs,
    ),
    queueCap: clamp(
      readNonNegative(ws, k.queueCap, d.queueCap, true),
      TASK_END_HOOK_CLAMPS.queueCap,
    ),
    censusCooldownMs: clamp(
      readNonNegative(ws, k.censusCooldownMs, d.censusCooldownMs, true),
      TASK_END_HOOK_CLAMPS.censusCooldownMs,
    ),
    maxWorktreesPerRun: readNonNegative(
      ws,
      k.maxWorktreesPerRun,
      d.maxWorktreesPerRun,
      true,
    ),
    archive: {
      maxBytes: readNonNegative(ws, k.archiveMaxBytes, d.archiveMaxBytes, true),
      maxFiles: readNonNegative(ws, k.archiveMaxFiles, d.archiveMaxFiles, true),
    },
    memory: {
      enabled: readBoolean(ws, k.memoryEnabled, d.memoryEnabled),
      sessionEndEnabled: readBoolean(
        ws,
        k.memorySessionEndEnabled,
        d.memorySessionEndEnabled,
      ),
      bootScanIdleBackoffMs: readNonNegative(
        ws,
        k.memoryBootScanIdleBackoffMs,
        d.memoryBootScanIdleBackoffMs,
        true,
      ),
    },
  };
}

/**
 * Injectable reader bound to `TASK_END_TOKENS.SETTINGS_READER`. `read()` takes
 * a fresh snapshot on every call, so a settings edit applies to the next
 * observation or run without a restart.
 */
@injectable()
export class TaskEndHookSettingsReader {
  constructor(
    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspace: IWorkspaceProvider,
  ) {}

  read(): TaskEndHookSettings {
    return readTaskEndHookSettings(this.workspace);
  }
}
