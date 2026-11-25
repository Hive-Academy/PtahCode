/**
 * Antigravity CLI Adapter (`agy`), ACP-only (TASK_2026_2291 P3, TASK_2026_2322).
 *
 * Every lane runs `agy acp`: one long-lived Agent Client Protocol session per
 * lane through `@ptah-extension/acp-runtime` and the provider-session lane
 * handle (`antigravityAcpProfile`). The installed `agy` must be at or above
 * `AGY_ACP_MIN_VERSION`; an older build fails the spawn with an upgrade
 * message, and detection still reports it installed. A version that cannot
 * be read is not cached, and the lane tries ACP: the handshake reports a real
 * failure as one error.
 *
 * - Ptah MCP travels as an ACP `http` entry in `session/new`, so
 *   `~/.gemini/config/mcp_config.json` is never written by a lane.
 * - Continuation and interrupt (`session/cancel`, process kept) are
 *   supported; steer and `ask` are not (see `antigravityAcpManifest`).
 * - A resume id the agent does not know starts a new session with one info
 *   notice (the lane handle's `attachFailure: 'new-session'`), so ids saved
 *   by older lanes are safe.
 * - Effort travels as the ACP `thought_level` option. With a chosen model,
 *   `agyModelId` maps a saved id agy no longer lists to the closest live one
 *   (`agy models`, cached per binary).
 * - The workspace folder is added to agy's `trustedWorkspaces` before a lane
 *   starts, so the "trust this folder?" prompt never blocks a headless run.
 * - The headless sink grants tool approvals only for an unattended lane
 *   (`antigravitySkipsPermissions`): `plan` and `auto-edit` lanes are refused.
 *
 * See: https://antigravity.google/docs/cli/reference
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
  readCachedAgySignIn,
  type AgySignInState,
} from '@ptah-extension/auth-providers';
import type { CliDetectionResult } from '@ptah-extension/shared';
import { closestLiveModel } from '@ptah-extension/shared';
import type {
  CliAdapterManifest,
  CliAdapter,
  CliCommandOptions,
  CliModelInfo,
  SdkHandle,
} from './cli-adapter.interface';
import { bestMessagingCapability } from './cli-adapter.interface';
import { validateLaneSpawnPolicy } from '../lane-spawn-policy';
import {
  stripAnsiCodes,
  probeCliVersion,
  resolveCliPath,
  spawnCli,
} from './cli-adapter.utils';
import {
  killProcessTree,
  type IProcessSpawner,
} from '@ptah-extension/platform-core';
import {
  antigravityAcpProfile,
  antigravitySkipsPermissions,
} from '@ptah-extension/acp-runtime';
import {
  AGY_ACP_MIN_VERSION,
  antigravityAcpManifest,
  meetsAgyAcpFloor,
  withAgyConptyNoiseFilter,
  type AntigravityAcpSeam,
} from './antigravity-acp-lane';
import {
  acpProfileEfforts,
  createProviderSessionLaneHandle,
} from './provider-session/provider-session-lane-handle';
import type { Logger } from '@ptah-extension/vscode-core';

/** Values agy accepts as an effort (ACP `thought_level`, model-id suffix). Anything else is dropped. */
const AGY_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type AgyEffort = (typeof AGY_EFFORTS)[number];

function isAgyEffort(value: string | undefined): value is AgyEffort {
  return value !== undefined && (AGY_EFFORTS as readonly string[]).includes(value);
}

const AGY_EFFORT_SUFFIX = /-(?:low|medium|high|xhigh|max)$/;

/** How long the ids of the last successful `agy models` read stay current. */
const AGY_MODEL_IDS_FRESH_MS = 10 * 60_000;

/** Budget of the `agy models` probe. */
const AGY_MODELS_PROBE_TIMEOUT_MS = 8000;

/** How long spawns skip the `agy models` probe after one listed nothing or failed. */
const AGY_MODEL_IDS_RETRY_MS = 60_000;

/** What one `agy models` run produced. */
type AgyModelsProbe =
  | { readonly kind: 'output'; readonly stdout: string; readonly exitCode: number | null }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'error'; readonly code: string | undefined };

type AgyModelLogger = Pick<Logger, 'debug' | 'warn'>;

/** A legacy-format line that starts with a status or error word is never a model. */
const AGY_STATUS_LINE_START =
  /^(error|warning|fetching|loading|usage|failed)\b/i;

/** A legacy-format line ending in an ellipsis ("...", "…") or ":" is a status line. */
const AGY_STATUS_LINE_END = /(\.\.\.|…|:)$/;

/**
 * Parse `agy models` stdout (TASK_2026_555 Batch 52.2). Two formats:
 *
 * - agy 1.2: a status line ("Fetching available models...") and then
 *   `id<TAB>display name` per model ("claude-sonnet-4-6\tClaude Sonnet 4.6
 *   (Thinking)"). When ANY line has a tab, only tab lines are read and every
 *   other line (status, progress, error) is ignored.
 * - Older builds: one label per line ("Gemini 3.1 Pro (High)"), which is both
 *   the id and the name. With no tab anywhere, a line is a model unless it is
 *   a status or error line: ending in "...", "…" or ":", or starting with a
 *   status/error word ({@link AGY_STATUS_LINE_START}).
 *
 * The spawn passes only the id (`agyModelId`).
 */
export function parseAgyModels(stdout: string): CliModelInfo[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (lines.some((line) => line.includes('\t'))) {
    return lines.flatMap((line) => {
      const tab = line.indexOf('\t');
      if (tab < 0) return [];
      const id = line.slice(0, tab).trim();
      const name = line.slice(tab + 1).trim();
      return id ? [{ id, name: name || id }] : [];
    });
  }
  return lines
    .filter(
      (line) =>
        !AGY_STATUS_LINE_END.test(line) && !AGY_STATUS_LINE_START.test(line),
    )
    .map((line) => ({ id: line, name: line }));
}

/**
 * Effort variants tried, in order, when a replacement base is not itself live
 * and no chosen effort is: a middle effort first.
 */
const AGY_DEFAULT_EFFORT_ORDER: readonly AgyEffort[] = ['medium', 'high', 'low', 'xhigh', 'max'];

/**
 * The value of the ACP `model` option. A model saved from the
 * earlier parse is the whole `id<TAB>name` line; only its id is passed
 * (Batch 52.2).
 *
 * `liveIds` are the ids of the last `agy models` read (`null` when none could
 * be read). A saved id agy no longer lists is replaced by a live id of the
 * closest live base (a live id with its effort suffix removed), logged at
 * `warn`. The replacement is always a member of `liveIds`, tried in order:
 * `<base>-<chosen effort>` (the saved id's own effort suffix, else `effort`),
 * then the unsuffixed `<base>`, then `<base>-<effort>` over
 * {@link AGY_DEFAULT_EFFORT_ORDER}. With no live ids, or no close base, the
 * id passes unchanged and agy reports it.
 */
export function agyModelId(
  value: string,
  liveIds: ReadonlySet<string> | null,
  logger?: AgyModelLogger,
  effort?: AgyEffort,
): string {
  const modelId = value.split('\t')[0].trim();
  if (!liveIds || liveIds.size === 0 || liveIds.has(modelId)) return modelId;
  const savedEffort = AGY_EFFORT_SUFFIX.exec(modelId)?.[0].slice(1);
  const chosenEffort = isAgyEffort(savedEffort) ? savedEffort : effort;
  const bases = [...new Set([...liveIds].map((id) => id.replace(AGY_EFFORT_SUFFIX, '')))];
  const base = closestLiveModel(modelId.replace(AGY_EFFORT_SUFFIX, ''), bases);
  if (base === null) return modelId;
  const candidates = [
    ...(chosenEffort ? [`${base}-${chosenEffort}`] : []),
    base,
    ...AGY_DEFAULT_EFFORT_ORDER.map((variant) => `${base}-${variant}`),
  ];
  // `base` came from a live id, so one candidate is live unless that id's
  // suffix is outside AGY_EFFORT_SUFFIX, which the base strip cannot produce.
  const model = candidates.find((id) => liveIds.has(id));
  if (model === undefined) return modelId;
  logger?.warn(
    '[AntigravityCliAdapter] agy no longer lists the saved model; using the closest live model',
    { saved: modelId, model },
  );
  return model;
}

export class AntigravityCliAdapter implements CliAdapter {
  readonly name = 'antigravity' as const;
  readonly displayName = 'Antigravity';
  readonly roleChannel = 'task-prompt' as const;
  /**
   * Ptah MCP travels as an ACP `http` entry in `session/new.mcpServers`;
   * `~/.gemini/config/mcp_config.json` is not written.
   */
  readonly supportsMcp = true;

  /**
   * Binaries whose version met the ACP floor. Only a pass is cached: a
   * below-floor or unreadable answer is probed again, so an in-place agy
   * upgrade is seen without a restart. A below-floor read in detection
   * drops the pass, so an in-place downgrade is seen too.
   */
  private readonly acpFloorPassed = new Set<string>();
  /** Binaries whose unreadable version was already logged at warn (later reads log at debug). */
  private readonly unreadableVersionWarned = new Set<string>();
  /** Lanes spawned before a binary's first probe settles share it. */
  private readonly acpProbesInFlight = new Map<string, Promise<boolean | undefined>>();
  /** The version string the floor check last read, per binary, for the upgrade message. */
  private readonly versionByBinary = new Map<string, string>();
  /**
   * Ids of the last successful `agy models` read, per binary (process
   * lifetime): two `agy` builds can accept different ids.
   */
  private readonly lastModelIds = new Map<
    string,
    { ids: ReadonlySet<string>; at: number }
  >();
  /** Spawns of one binary that need ids while none are current share one probe. */
  private readonly modelIdsInFlight = new Map<
    string,
    Promise<ReadonlySet<string> | null>
  >();
  /** When a binary's spawn probe last listed nothing or failed (see AGY_MODEL_IDS_RETRY_MS). */
  private readonly modelIdsMissedAt = new Map<string, number>();

  /**
   * @param spawner - Off-thread process spawner. Supplied by
   *   `CliDetectionService` from `SDK_TOKENS.SDK_PROCESS_SPAWNER`. Without it
   *   every spawn below runs `cross-spawn` inline, which on Windows is a
   *   synchronous `CreateProcessW` that cost 300-900 ms of event-loop lag per
   *   rival-CLI launch (TASK_2026_367). The ACP lane handle reports a missing
   *   spawner as the lane's one error.
   * @param acp - ACP seams for specs and live recordings; production passes none.
   * @param readSignIn - Sign-in reader (specs); defaults to the shared `readCachedAgySignIn`
   *   behind the shared 30 s cache.
   */
  constructor(
    private readonly spawner?: IProcessSpawner,
    private readonly logger?: Logger,
    private readonly acp: AntigravityAcpSeam = {},
    private readonly readSignIn: () => Promise<AgySignInState> = readCachedAgySignIn,
  ) {}

  async detect(): Promise<CliDetectionResult> {
    try {
      const binaryPath = await resolveCliPath('agy');
      if (!binaryPath) {
        return {
          cli: 'antigravity',
          installed: false,
          messagingMode: bestMessagingCapability(this.capabilities()),
        };
      }
      const version = await probeCliVersion(
        binaryPath,
        undefined,
        undefined,
        this.spawner,
      );
      // Detection read the version already, even when it came back unreadable.
      await this.probeAcp(binaryPath, { version });

      return {
        cli: 'antigravity',
        installed: true,
        path: binaryPath,
        version,
        messagingMode: bestMessagingCapability(this.capabilities()),
      };
    } catch {
      return {
        cli: 'antigravity',
        installed: false,
        messagingMode: bestMessagingCapability(this.capabilities()),
      };
    }
  }

  /**
   * Whether agy's own sign-in is usable, from its keyring entry or an
   * environment credential (see `readAgySignIn` in auth-providers). Model-free and never
   * starts the agent. A state that cannot be read (Linux, a failed or slow
   * keyring query) answers `true`, the previous optimistic behaviour: the
   * auth row has no "unknown" value, and a missing sign-in still surfaces as
   * `auth-required` on open. Never reads or logs the credential itself.
   */
  async ensureTokensFresh(): Promise<boolean> {
    try {
      const state = await this.readSignIn();
      if (state === 'unknown')
        this.logger?.debug('[AntigravityCliAdapter] agy sign-in state unknown; assuming signed in');
      return state !== 'signed-out';
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn; an unreadable keyring keeps the optimistic answer, and open reports auth-required
      this.logger?.warn('[AntigravityCliAdapter] agy sign-in check failed; assuming signed in', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      return true;
    }
  }

  /** Every lane runs on `agy acp`, so the manifest is the ACP lane's. */
  capabilities(): CliAdapterManifest {
    return antigravityAcpManifest(this.roleChannel);
  }

  private now(): number {
    return (this.acp.now ?? Date.now)();
  }

  /**
   * Whether `binary` meets the ACP version floor: `true` or `false` once
   * known, `undefined` while the version cannot be read. Only `true` is
   * cached per binary; `false` and `undefined` re-read the version on the
   * next check, so an agy upgraded in place passes without a restart. Lanes
   * that ask while a probe runs share it. Never spawns `agy acp` itself.
   *
   * `fresh` is a `--version` read the caller already made (detection),
   * unreadable or not: the floor is judged from it, with no second read and
   * no cache short-cut, and a below-floor answer drops a cached pass so an
   * agy downgraded in place is rejected by the next lane. Without `fresh` the
   * probe reads `agy --version` itself unless a pass is cached.
   */
  private probeAcp(
    binary: string,
    fresh?: { readonly version: string | undefined },
  ): Promise<boolean | undefined> {
    if (!fresh && this.acpFloorPassed.has(binary)) return Promise.resolve(true);
    const inFlight = this.acpProbesInFlight.get(binary);
    if (inFlight) return inFlight;
    const probe = this.runAcpProbe(binary, fresh)
      .then((meetsFloor) => {
        if (meetsFloor === true) this.acpFloorPassed.add(binary);
        if (meetsFloor === false) this.acpFloorPassed.delete(binary);
        return meetsFloor;
      })
      .finally(() => this.acpProbesInFlight.delete(binary));
    this.acpProbesInFlight.set(binary, probe);
    return probe;
  }

  /** One version-floor probe; `undefined` when it could not tell. */
  private async runAcpProbe(
    binary: string,
    fresh: { readonly version: string | undefined } | undefined,
  ): Promise<boolean | undefined> {
    if (this.acp.probe) return this.acp.probe(binary);
    const version = fresh
      ? fresh.version
      : await probeCliVersion(binary, undefined, undefined, this.spawner);
    if (version === undefined || !/\d+\.\d+\.\d+/.test(version)) {
      // Detection polls, so only the first unreadable read per binary warns.
      const message =
        '[AntigravityCliAdapter] could not read the agy version; the lane tries ACP and the next lane probes again';
      const context = { version: version ?? null };
      if (this.unreadableVersionWarned.has(binary)) {
        this.logger?.debug(message, context);
      } else {
        this.unreadableVersionWarned.add(binary);
        this.logger?.warn(message, context);
      }
      return undefined;
    }
    this.versionByBinary.set(binary, version);
    const meetsFloor = meetsAgyAcpFloor(version);
    if (!meetsFloor) {
      this.logger?.info('[AntigravityCliAdapter] agy is below the ACP floor', {
        version,
        minVersion: AGY_ACP_MIN_VERSION,
      });
    }
    return meetsFloor;
  }

  /**
   * The ACP lane: `agy acp` through the provider-session lane handle. The
   * folder trust write stays (PF-5 not run); the Ptah MCP entry goes in
   * `session/new.mcpServers`, so `mcp_config.json` is left alone. A session
   * that never opens fails the lane with one error.
   *
   * The headless sink grants a tool approval only when the lane runs
   * unattended (`antigravitySkipsPermissions`, S1): `plan` and `auto-edit`
   * lanes are refused.
   */
  private async runAcp(options: CliCommandOptions, binary: string): Promise<SdkHandle> {
    validateLaneSpawnPolicy(
      this.name,
      antigravityAcpManifest(this.roleChannel),
      options,
    );
    if (options.workingDirectory) {
      await this.ensureFolderTrusted(options.workingDirectory);
    }
    this.logger?.info('[AntigravityCliAdapter] lane runs on agy acp', {
      agentId: options.agentId,
    });
    const model = options.model
      ? agyModelId(
          options.model,
          await this.currentModelIds(binary),
          this.logger,
          isAgyEffort(options.reasoningEffort) ? options.reasoningEffort : undefined,
        )
      : undefined;
    return createProviderSessionLaneHandle({
      profile: antigravityAcpProfile,
      options: {
        ...options,
        model,
        autoApprove: antigravitySkipsPermissions(options),
      },
      command: binary,
      spawner: this.spawner,
      // Without a spawner or a seam factory the lane handle reports the
      // missing spawner; a wrapped factory would hide that.
      transportFactory:
        this.spawner || this.acp.transportFactory
          ? withAgyConptyNoiseFilter(this.acp.transportFactory)
          : undefined,
      logger: this.logger,
    });
  }

  parseOutput(raw: string): string {
    return stripAnsiCodes(raw);
  }

  /**
   * The levels a live agy lane serves for `model` (the profile mapping); no
   * lane needed. A model id that carries its own effort suffix gets none.
   */
  laneEfforts(model?: string): readonly string[] {
    return acpProfileEfforts(antigravityAcpProfile, model);
  }

  /**
   * Resolve the ~/.gemini home root.
   *
   * Prefers $HOME / $USERPROFILE over os.homedir() so tests (and sandbox
   * setups) that reassign HOME after module load are honoured. Mirrors the
   * env-first pattern in FileCodexLaneCredentialProbe.check().
   */
  private static geminiRoot(): string {
    const home = process.env['HOME'] || process.env['USERPROFILE'] || homedir();
    return join(home, '.gemini');
  }

  /**
   * List available models by parsing `agy models` stdout (`parseAgyModels`).
   * A probe that times out, cannot start or exits non-zero throws (the
   * timeout with code `ETIMEDOUT`, a start failure with the spawn error's
   * code), so a caller can tell a failure from an empty answer: rows printed
   * before a failing exit or a signal may be incomplete and are not used. A
   * clean exit that lists nothing is `[]` and drops that binary's earlier
   * ids. A non-empty answer becomes the ids spawns of that binary read
   * ({@link currentModelIds}).
   */
  async listModels(): Promise<CliModelInfo[]> {
    const binaryPath = (await resolveCliPath('agy')) ?? 'agy';
    return this.readModels(binaryPath);
  }

  private async readModels(binary: string): Promise<CliModelInfo[]> {
    const probe = await this.probeModels(binary, AGY_MODELS_PROBE_TIMEOUT_MS);
    if (probe.kind === 'timeout') {
      throw Object.assign(new Error('agy models timed out'), { code: 'ETIMEDOUT' });
    }
    if (probe.kind === 'error') {
      throw Object.assign(new Error('agy models could not start'), { code: probe.code });
    }
    // Only a clean exit is a complete answer. A signal-terminated probe closes
    // with a `null` code and may have printed part of the list.
    if (probe.exitCode !== 0) {
      throw new Error(
        probe.exitCode === null
          ? 'agy models was terminated by a signal'
          : `agy models exited with code ${probe.exitCode}`,
      );
    }
    const models = parseAgyModels(stripAnsiCodes(probe.stdout));
    if (models.length > 0) {
      this.lastModelIds.set(binary, { ids: new Set(models.map((m) => m.id)), at: this.now() });
    } else {
      // A clean empty answer replaces an earlier list: spawns must not keep
      // deriving their model from ids the binary no longer reports.
      this.lastModelIds.delete(binary);
      this.modelIdsMissedAt.set(binary, this.now());
    }
    return models;
  }

  /**
   * The live model ids a spawn derives its model value from: the last read
   * while it is under 10 minutes old, otherwise one `agy models` probe shared
   * by every spawn waiting on it. `null` when the probe lists nothing or
   * fails; that answer is kept for {@link AGY_MODEL_IDS_RETRY_MS}, so spawns
   * in that window do not each wait out the probe budget again.
   */
  private currentModelIds(binary: string): Promise<ReadonlySet<string> | null> {
    const last = this.lastModelIds.get(binary);
    if (last && this.now() - last.at < AGY_MODEL_IDS_FRESH_MS) {
      return Promise.resolve(last.ids);
    }
    const missed = this.modelIdsMissedAt.get(binary);
    if (missed !== undefined && this.now() - missed < AGY_MODEL_IDS_RETRY_MS) {
      return Promise.resolve(null);
    }
    let inFlight = this.modelIdsInFlight.get(binary);
    if (!inFlight) {
      inFlight = this.readModels(binary)
        .then((models) => {
          if (models.length > 0) {
            this.modelIdsMissedAt.delete(binary);
            return new Set(models.map((m) => m.id));
          }
          this.modelIdsMissedAt.set(binary, this.now());
          this.logger?.debug(
            '[AntigravityCliAdapter] agy models listed nothing; the model passes as chosen',
          );
          return null;
        })
        .catch((error: unknown) => {
          // degradation-audit: reported - logged at warn; without live ids the model passes as chosen and agy validates it
          this.modelIdsMissedAt.set(binary, this.now());
          this.logger?.warn('[AntigravityCliAdapter] agy models probe failed; the model passes as chosen', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        })
        .finally(() => {
          this.modelIdsInFlight.delete(binary);
        });
      this.modelIdsInFlight.set(binary, inFlight);
    }
    return inFlight;
  }

  /**
   * Run `agy models` and capture stdout. Never rejects: a timeout, a start
   * error and the exit are each reported as an {@link AgyModelsProbe}.
   * Separate from probeCliVersion because we need the full multi-line
   * stdout, not just the first line.
   */
  private probeModels(binary: string, timeoutMs: number): Promise<AgyModelsProbe> {
    return new Promise((resolve) => {
      let stdout = '';
      let childClosed = false;
      const child = spawnCli(binary, ['models'], { spawner: this.spawner, detached: true });
      const timer = setTimeout(() => {
        void child.whenSpawned.then((pid) => {
          if (pid && !childClosed && !child.killed) {
            void killProcessTree(pid, 'SIGTERM', undefined, {
              groupOnly: process.platform !== 'win32',
            });
          }
        });
        resolve({ kind: 'timeout' });
      }, timeoutMs);

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (data: string) => {
        stdout += data;
      });
      child.on('close', (code: number | null) => {
        childClosed = true;
        clearTimeout(timer);
        resolve({ kind: 'output', stdout: stdout.trim(), exitCode: code ?? null });
      });
      child.on('error', (error: Error) => {
        clearTimeout(timer);
        const code = (error as { code?: unknown }).code;
        resolve({ kind: 'error', code: typeof code === 'string' ? code : undefined });
      });
    });
  }

  /**
   * Ensure the workspace folder is trusted by `agy`.
   * Prevents the interactive "Do you trust this folder?" prompt from blocking
   * headless execution. `agy` reads a `trustedWorkspaces` ARRAY of absolute
   * paths from ~/.gemini/antigravity-cli/settings.json.
   * Non-fatal: errors are silently caught.
   */
  private async ensureFolderTrusted(folder: string): Promise<void> {
    try {
      const cliDir = join(
        AntigravityCliAdapter.geminiRoot(),
        'antigravity-cli',
      );
      const settingsPath = join(cliDir, 'settings.json');
      const normalizedFolder =
        process.platform === 'win32' ? folder.replace(/\//g, '\\') : folder;

      let settings: Record<string, unknown> = {};
      try {
        const content = await readFile(settingsPath, 'utf8');
        settings = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // Missing or malformed file — start fresh.
      }

      const trusted = Array.isArray(settings['trustedWorkspaces'])
        ? (settings['trustedWorkspaces'] as unknown[]).filter(
            (v): v is string => typeof v === 'string',
          )
        : [];
      if (trusted.includes(folder) || trusted.includes(normalizedFolder)) {
        return;
      }
      trusted.push(normalizedFolder);
      settings['trustedWorkspaces'] = trusted;

      await mkdir(cliDir, { recursive: true });
      await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch {
      // degradation-audit: optional-capability - the lane decides tool
      // approvals headlessly, so a failure here only re-surfaces the trust
      // prompt on a future interactive run.
    }
  }

  /**
   * Run the task on `agy acp`. An `agy` below `AGY_ACP_MIN_VERSION` rejects
   * before any spawn, MCP use or folder write; the manager revokes the lane
   * credential and surfaces the message. A version that cannot be read runs
   * ACP, and the handshake reports a real failure.
   */
  async runSdk(options: CliCommandOptions): Promise<SdkHandle> {
    const binary = options.binaryPath ?? 'agy';
    if ((await this.probeAcp(binary)) === false) {
      const installed = this.versionByBinary.get(binary) ?? 'unknown';
      throw new Error(
        `Antigravity lanes need agy ${AGY_ACP_MIN_VERSION} or later (installed: ${installed}). Update agy and try again.`,
      );
    }
    return this.runAcp(options, binary);
  }
}
