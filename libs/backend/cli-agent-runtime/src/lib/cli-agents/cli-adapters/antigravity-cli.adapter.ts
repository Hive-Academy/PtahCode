/**
 * Antigravity CLI Adapter (`agy`)
 *
 * Two transports (TASK_2026_2291, P3):
 * - ACP (preferred): `agy acp`, one long-lived Agent Client Protocol session
 *   per lane through `@ptah-extension/acp-runtime` and the provider-session
 *   lane handle (`antigravityAcpProfile`). Used when the installed `agy` is
 *   at or above `AGY_ACP_MIN_VERSION`, its `--help` lists the `acp`
 *   subcommand, and the host supplied a process spawner. Ptah MCP travels as
 *   an ACP `http` entry (D9), so `mcp_config.json` is not touched;
 *   continuation and interrupt (`session/cancel`, process kept) are supported.
 *   A lane whose ACP session cannot be opened (spawn, `initialize` or
 *   `session/new` failed) runs on stream-json instead, with one `info`.
 * - stream-json (the automatic fallback, everything below): below the
 *   version floor, when `acp` is not listed, or without a spawner.
 *   After such a fallback the binary's lanes stay on stream-json for
 *   `AGY_ACP_FAILURE_COOLDOWN_MS`. A fallback never resumes an id it cannot
 *   prove stream-json knows: it starts a fresh conversation.
 * - `PTAH_AGY_TRANSPORT=acp|stream-json` forces one transport (no probe, no
 *   fallback, no cooldown); unset or `auto` chooses as above.
 *
 * Spawn-based, structured-JSONL adapter for Google's Antigravity CLI. As of
 * `agy` v1.1.11 print mode supports `--output-format stream-json`, which emits
 * one JSON object per line, so segment parsing here is an event loop like the
 * opencode / Codex adapters — not the old plain-text heuristic classifier.
 *
 * Multi-turn run:  agy --print= --input-format stream-json
 *                      --output-format stream-json
 * The prompt and every continuation are written as validated NDJSON to stdin.
 *
 * Observed stream-json schema (captured from agy 1.1.11 — see
 * `.ptah/specs/TASK_2026_199/stream-json-capture.md`). Every line is
 * `{"event": <name>, ...}` with the payload nested under a key of that name:
 *
 * - `init`   — `{event, conversation_id, init:{cwd, tools[], permission_mode}}`
 *              The conversation id IS on the stream, so no mtime scan is needed.
 * - `step_update` — `{event, step_update:{conversation_id, step_index, state,
 *              step_type, tool_name?, tool_info?, text_delta?, duration_seconds?,
 *              usage?}}`. `state` is `ACTIVE` | `DONE`; `step_type` observed as
 *              `user_input`, `agent_response`, `tool`, `checkpoint`, `unknown`
 *              (the binary also carries a `system_message` literal).
 *              `tool_info` is `{name, parameters, output?}` — `output` only on
 *              the `DONE` update, and it carries failure text inline (there is
 *              no separate error flag or exit code).
 * - `result` — `{event, result:{conversation_id, status, response,
 *              duration_seconds, num_turns, usage}}`. `response` is the full
 *              concatenation of the `text_delta`s already streamed, so it is
 *              NOT re-emitted; only a usage summary is.
 *
 * Notes:
 * - `text_delta` is INCREMENTAL per `agent_response` step (each event carries
 *   only the newly appended chunk), so no last-seen-text diffing is required.
 * - `agy` does NOT stream reasoning text — thinking shows up only as
 *   `usage.thinking_tokens`. No `thinking` segments are emitted; guessing them
 *   from prose (the previous behaviour) produced false positives.
 * - Lines that fail to parse as JSON fall back to being emitted verbatim as
 *   `text` (banners, crash dumps, a partial final line).
 * - `--print` (alias `--prompt`/`-p`) is a STRING flag with an optional value.
 *   Stream input requires an attached empty value. Shell notation is
 *   `--print=''`; direct spawn receives the quote-free argv item `--print=`.
 * - `--dangerously-skip-permissions` maps to autoApprove; required or
 *   file-writing tool calls hang waiting for interactive approval.
 * - With an explicit model, `agy` expects the effort in its model id (for
 *   example `claude-sonnet-5-5-high`) and rejects a separate `--effort`.
 *   Without a model, `--effort` takes `low|medium|high|xhigh|max`; other values
 *   are dropped rather than passed through.
 * - `agy` has no GEMINI_SYSTEM_MD support, so projectGuidance is
 *   prepended to the task prompt via buildTaskPrompt (the shared fallback).
 *
 * See: https://antigravity.google/docs/cli/reference
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
  createCachedAgySignIn,
  readAgySignIn,
  type AgySignInState,
} from './antigravity-sign-in';

import {
  createMcpFacet,
  PTAH_SPAWN_MCP_KEY,
  type IHarnessMcpFacet,
} from '@ptah-extension/harness-sync';
import type {
  CliDetectionResult,
  CliOutputSegment,
  McpServerConfig,
} from '@ptah-extension/shared';
import type {
  CliAdapterManifest,
  CliAdapter,
  CliCommandOptions,
  CliModelInfo,
  SdkHandle,
} from './cli-adapter.interface';
import { bestMessagingCapability } from './cli-adapter.interface';
import {
  applyLaneArgvPolicy,
  translateLaneSpawnPolicy,
  validateLaneSpawnPolicy,
} from '../lane-spawn-policy';
import {
  assertCommandLineWithinLimit,
  stripAnsiCodes,
  buildTaskPrompt,
  buildArgvTaskPrompt,
  probeCliVersion,
  resolveCliPath,
  resolveDirectSpawn,
  spawnCli,
  createBufferedEmitter,
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
  AGY_ACP_FAILURE_COOLDOWN_MS,
  agyHelpListsAcp,
  antigravityAcpManifest,
  meetsAgyAcpFloor,
  readAgyTransportOverride,
  type AgyTransportOverride,
  type AntigravityAcpSeam,
} from './antigravity-acp-lane';
import { MCP_ATTACHMENT_TIMEOUT_MS } from '../mcp-attachment-probe.port';
import { createProviderSessionLaneHandle } from './provider-session/provider-session-lane-handle';
import { laneMcpAuthUrl } from './lane-mcp-credentials';
import { ptahMcpServerUrl } from './ptah-mcp-url';
import { classifyCliStderr } from './cli-stderr-severity';
import { z } from 'zod';
import {
  closestLiveModel,
  completedTurnTelemetry,
  turnIdentity,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  formatAgyDiagnostics,
  formatAgyFailure,
  redactAgyText,
  safeAgyText,
} from './antigravity-result-diagnostics';

/** One cached sign-in reader per host: each status check reuses its answer for 30 s. */
const cachedAgySignIn = createCachedAgySignIn(readAgySignIn);

/**
 * Print-mode wait timeout. `agy` defaults to 5m, which kills most real coding
 * tasks; align it with AgentProcessManager's 1h execution cap so the manager
 * owns the timeout rather than the CLI.
 */
const PRINT_TIMEOUT = '3600s';

/** Values `agy --effort` accepts. Anything else is dropped. */
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

/** Token/cost accounting attached to `agent_response` / `checkpoint` / `result`. */
const AgyUsageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    thinking_tokens: z.number().optional(),
    cache_read_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  })
  .passthrough();

/** Tool invocation detail. `output` is present only on the `DONE` update. */
const AgyToolInfoSchema = z
  .object({
    name: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    output: z.string().optional(),
  })
  .passthrough();

/** Payload of a `step_update` event. */
const AgyStepUpdateSchema = z
  .object({
    conversation_id: z.string().optional(),
    step_index: z.number().optional(),
    state: z.string().optional(),
    step_type: z.string(),
    tool_name: z.string().optional(),
    tool_info: AgyToolInfoSchema.optional(),
    text_delta: z.string().optional(),
    duration_seconds: z.number().optional(),
    usage: AgyUsageSchema.optional(),
  })
  .passthrough();

/** Payload of the terminal `result` event. */
const AgyResultSchema = z
  .object({
    conversation_id: z.string().optional(),
    status: z.string(),
    response: z.string().optional(),
    error: z.unknown().optional(),
    duration_seconds: z.number().optional(),
    num_turns: z.number().optional(),
    model: z.string().optional(),
    usage: AgyUsageSchema.optional(),
  })
  .passthrough();

/** A single line of `agy --output-format stream-json` output. */
const AgyEventHeaderSchema = z.object({ event: z.string() }).passthrough();
const AgyInitEventSchema = z
  .object({
    event: z.literal('init'),
    conversation_id: z.string(),
    init: z
      .object({
        cwd: z.string().optional(),
        tools: z.array(z.string()).optional(),
        permission_mode: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();
const AgyStepUpdateEventSchema = z
  .object({ event: z.literal('step_update'), step_update: AgyStepUpdateSchema })
  .passthrough();
const AgyResultEventSchema = z
  .object({ event: z.literal('result'), result: AgyResultSchema })
  .passthrough();
const AgyInputMessageSchema = z.object({
  event: z.literal('user'),
  message: z.object({ content: z.string() }),
});

type AgyStepUpdate = z.infer<typeof AgyStepUpdateSchema>;
type AgyResult = z.infer<typeof AgyResultSchema>;

interface TurnDeferred {
  readonly done: Promise<number>;
  readonly resolve: (exitCode: number) => void;
  settled: boolean;
}

function createTurnDeferred(): TurnDeferred {
  let resolvePromise!: (exitCode: number) => void;
  const deferred: TurnDeferred = {
    done: new Promise<number>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve: (exitCode) => {
      if (deferred.settled) return;
      deferred.settled = true;
      resolvePromise(exitCode);
    },
    settled: false,
  };
  return deferred;
}

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
 * The value for `--model` (and the ACP `model` option). A model saved from the
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

/**
 * Encode the effort in the model id when agy lists `<model>-<effort>`. An id
 * that already carries an effort is unchanged. Otherwise the model passes
 * unchanged and the effort is not appended (and no conflicting `--effort` is
 * sent): logged at `warn` when the live ids lack the combination, at `debug`
 * when no live ids are known.
 */
export function agyModelWithEffort(
  model: string,
  effort: AgyEffort | undefined,
  liveIds: ReadonlySet<string> | null,
  logger?: AgyModelLogger,
): string {
  if (!effort || AGY_EFFORT_SUFFIX.test(model)) return model;
  const withEffort = `${model}-${effort}`;
  if (liveIds?.has(withEffort)) return withEffort;
  if (liveIds && liveIds.size > 0) {
    logger?.warn(
      '[AntigravityCliAdapter] agy lists no effort variant of the model; the effort is not applied',
      { model, effort },
    );
  } else {
    logger?.debug(
      '[AntigravityCliAdapter] no agy model ids known; the effort is not encoded in the model',
      { model, effort },
    );
  }
  return model;
}

function buildAntigravityArgs(
  options: CliCommandOptions,
  taskPrompt: string,
  useStreamInput: boolean,
  liveIds: ReadonlySet<string> | null,
  logger?: AgyModelLogger,
): string[] {
  const args = useStreamInput
    ? [
        '--print=',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
      ]
    : ['--output-format', 'stream-json'];
  if (options.autoApprove !== false) {
    args.push('--dangerously-skip-permissions');
  }
  args.push('--print-timeout', PRINT_TIMEOUT);
  const effort = isAgyEffort(options.reasoningEffort)
    ? options.reasoningEffort
    : undefined;
  const model = options.model ? agyModelId(options.model, liveIds, logger, effort) : '';
  if (model) {
    args.push('--model', agyModelWithEffort(model, effort, liveIds, logger));
  } else if (effort) {
    args.push('--effort', effort);
  }
  if (options.workingDirectory) {
    args.push('--add-dir', options.workingDirectory);
  }
  if (options.resumeSessionId) {
    args.push('--conversation', options.resumeSessionId);
  }
  if (!useStreamInput) {
    args.push('--print', taskPrompt);
  }
  return args;
}

function formatUsage(
  usage: z.infer<typeof AgyUsageSchema>,
): string | undefined {
  const details: string[] = [];
  if (usage.input_tokens !== undefined) {
    details.push(`${usage.input_tokens} input`);
  }
  if (usage.output_tokens !== undefined) {
    details.push(`${usage.output_tokens} output`);
  }
  if (details.length === 0 && usage.total_tokens !== undefined) {
    details.push(`${usage.total_tokens} total`);
  }
  return details.length > 0 ? `Usage: ${details.join(', ')} tokens` : undefined;
}

/** `handle` with `info` as the first segment each subscriber receives. */
function withLeadingInfo(handle: SdkHandle, info: string): SdkHandle {
  const inner = handle.onSegment;
  return {
    ...handle,
    onSegment: (callback) => {
      callback({ type: 'info', content: info });
      inner?.(callback);
    },
  };
}

export class AntigravityCliAdapter implements CliAdapter {
  /**
   * How long a failed startup waits for its child to stop before it releases
   * the MCP startup lock. Mutable only so specs can shorten it.
   */
  static startupChildStopDeadlineMs = 5_000;

  private static readonly mcpStartupLocks = new Map<string, Promise<void>>();

  private static async lockMcpStartup(): Promise<() => void> {
    const key = process.env['HOME'] || process.env['USERPROFILE'] || homedir();
    const previous = this.mcpStartupLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mcpStartupLocks.set(key, current);
    await previous;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.mcpStartupLocks.get(key) === current)
        this.mcpStartupLocks.delete(key);
      release();
    };
  }
  readonly name = 'antigravity' as const;
  readonly displayName = 'Antigravity';
  readonly roleChannel = 'task-prompt' as const;
  /** MCP is configured via ~/.gemini/config/mcp_config.json before each spawn */
  readonly supportsMcp = true;

  /**
   * @param spawner - Off-thread process spawner. Supplied by
   *   `CliDetectionService` from `SDK_TOKENS.SDK_PROCESS_SPAWNER`. Without it
   *   every spawn below runs `cross-spawn` inline, which on Windows is a
   *   synchronous `CreateProcessW` that cost 300-900 ms of event-loop lag per
   *   rival-CLI launch (TASK_2026_367).
   */
  private streamJsonInputSupported: boolean | undefined;
  private readonly streamJsonInputSupportByBinary = new Map<string, boolean>();
  /** Non-empty `agy --help` text, per binary; a timed-out or failed read stores nothing. */
  private readonly helpTextByBinary = new Map<string, string>();
  /**
   * Whether the last probed binary runs the ACP lane; it drives
   * `capabilities()`, which has no binary argument (one `agy` per host in
   * practice). A run validates against its own transport's manifest, never
   * this field.
   */
  private acpSupported: boolean | undefined;
  /** Definite ACP answers only (S2): a probe that could not tell is retried. */
  private readonly acpSupportByBinary = new Map<string, boolean>();
  /** Lanes spawned before the first probe settles share it. */
  private readonly acpProbesInFlight = new Map<string, Promise<boolean>>();
  /** The binary `acpSupported` describes, for the cooldown in `capabilities()`. */
  private lastProbedBinary: string | undefined;
  /** When each binary's ACP setup last failed over to stream-json (round-2 M2). */
  private readonly acpFailedAtByBinary = new Map<string, number>();
  /** An unknown `PTAH_AGY_TRANSPORT` value is reported once per adapter. */
  private unknownTransportWarned = false;
  /** Ids of the last successful `agy models` read (process lifetime). */
  private lastModelIds: { ids: ReadonlySet<string>; at: number } | undefined;
  /** Spawns that need ids while none are current share one probe. */
  private modelIdsInFlight: Promise<ReadonlySet<string> | null> | undefined;
  /** When a spawn's probe last listed nothing or failed (see AGY_MODEL_IDS_RETRY_MS). */
  private modelIdsMissedAt: number | undefined;

  /**
   * @param acp - ACP seams for specs and live recordings; production passes none.
   * @param readSignIn - Sign-in reader (specs); defaults to {@link readAgySignIn}
   *   behind the shared 30 s cache.
   */
  constructor(
    private readonly spawner?: IProcessSpawner,
    private readonly streamJsonProbe?: (binary: string) => Promise<boolean>,
    private readonly logger?: Logger,
    private readonly acp: AntigravityAcpSeam = {},
    private readonly readSignIn: () => Promise<AgySignInState> = cachedAgySignIn,
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
      await this.probeStreamJsonInput(binaryPath);
      await this.probeAcp(binaryPath, version);

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
   * environment credential (see {@link readAgySignIn}). Model-free and never
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

  /**
   * The async capability probe records whether this installed `agy` supports
   * stream-json input. A live handle also reports its own capability, which is
   * authoritative while a lane is running.
   */
  capabilities(): CliAdapterManifest {
    return this.acpTransportActive()
      ? antigravityAcpManifest(this.roleChannel)
      : this.streamJsonManifest();
  }

  private transportOverride(): AgyTransportOverride {
    return (
      this.acp.transport ??
      readAgyTransportOverride(process.env, (value) => {
        if (this.unknownTransportWarned) return;
        this.unknownTransportWarned = true;
        this.logger?.warn(
          '[AntigravityCliAdapter] unknown PTAH_AGY_TRANSPORT value; choosing the transport automatically',
          { value, accepted: ['auto', 'acp', 'stream-json'] },
        );
      })
    );
  }

  private acpTransportActive(): boolean {
    const override = this.transportOverride();
    if (override !== 'auto') return override === 'acp';
    return (
      this.acpSupported === true &&
      !(this.lastProbedBinary && this.acpCoolingDown(this.lastProbedBinary))
    );
  }

  private now(): number {
    return (this.acp.now ?? Date.now)();
  }

  /** Whether `binary` failed an ACP setup within the cooldown. */
  private acpCoolingDown(binary: string): boolean {
    const failedAt = this.acpFailedAtByBinary.get(binary);
    if (failedAt === undefined) return false;
    if (this.now() - failedAt < AGY_ACP_FAILURE_COOLDOWN_MS) return true;
    this.acpFailedAtByBinary.delete(binary);
    return false;
  }

  /** The stream-json lane's manifest, whatever transport was probed. */
  private streamJsonManifest(): CliAdapterManifest {
    return {
      messaging: {
        steer: {
          state: 'unsupported',
          reason: 'Stream input has no verified mid-turn steer.',
        },
        interrupt: {
          state: 'unsupported',
          reason: 'No run-scoped interrupt is exposed.',
        },
        continuation:
          this.streamJsonInputSupported === true
            ? { state: 'supported' }
            : {
                state: 'unsupported',
                reason:
                  'Stream JSON input has not been verified for this binary.',
              },
        resume: { state: 'supported' },
      },
      roleChannel: this.roleChannel,
      permissionModes: {
        plan: {
          state: 'supported',
          nativeMode: '--mode plan',
          networkModes: ['allow'],
        },
        ask: {
          state: 'unsupported',
          reason: 'No noninteractive approval route exists.',
          networkModes: [],
        },
        'auto-edit': {
          state: 'supported',
          nativeMode: '--mode accept-edits',
          networkModes: ['allow'],
        },
        yolo: {
          state: 'supported',
          nativeMode: '--dangerously-skip-permissions',
          networkModes: ['allow'],
        },
      },
      networkModes: {
        allow: { state: 'supported' },
        deny: {
          state: 'unsupported',
          reason: 'No verified general network sandbox exists.',
        },
      },
      limitReader: { state: 'available', source: 'antigravity' },
      mcp: { state: 'supported' },
    };
  }

  private async probeStreamJsonInput(binary: string): Promise<boolean> {
    const cached = this.streamJsonInputSupportByBinary.get(binary);
    if (cached !== undefined) {
      this.streamJsonInputSupported = cached;
      return cached;
    }
    if (this.streamJsonProbe) {
      this.streamJsonInputSupported = await this.streamJsonProbe(binary);
      this.streamJsonInputSupportByBinary.set(
        binary,
        this.streamJsonInputSupported,
      );
      return this.streamJsonInputSupported;
    }

    const help = await this.readAgyHelp(binary);
    this.streamJsonInputSupported =
      help !== undefined && /--input-format\b/.test(help);
    this.streamJsonInputSupportByBinary.set(
      binary,
      this.streamJsonInputSupported,
    );
    return this.streamJsonInputSupported;
  }

  /**
   * `agy --help`, bounded at 8 s. Resolves the text when the child closed
   * with output (and stores it per binary), `undefined` on a timeout, a spawn
   * error or empty output, so a caller can tell "not listed" from "not read".
   */
  private readAgyHelp(binary: string): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve) => {
      let help = '';
      let settled = false;
      let childClosed = false;
      const finish = (text: string | undefined): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(text);
      };
      const child = spawnCli(binary, ['--help'], { spawner: this.spawner, detached: true });
      const timer = setTimeout(() => {
        void child.whenSpawned.then((pid) => {
          if (pid && !childClosed && !child.killed) {
            void killProcessTree(pid, 'SIGTERM', undefined, {
              groupOnly: process.platform !== 'win32',
            });
          }
        });
        this.logger?.warn('[AntigravityCliAdapter] agy --help timed out', {
          timeoutMs: 8000,
        });
        finish(undefined);
      }, 8000);
      const capture = (data: string): void => {
        help += stripAnsiCodes(data);
      };
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', capture);
      child.stderr?.on('data', capture);
      child.on('close', (code: number | null) => {
        childClosed = true;
        if (!help.trim()) {
          if (!settled) {
            this.logger?.warn('[AntigravityCliAdapter] agy --help printed nothing', {
              exitCode: code ?? null,
            });
          }
          finish(undefined);
          return;
        }
        if (!settled) this.helpTextByBinary.set(binary, help);
        finish(help);
      });
      child.on('error', (error: Error) => {
        this.logger?.warn('[AntigravityCliAdapter] agy --help could not be spawned', {
          error: error.message,
        });
        finish(undefined);
      });
    });
  }

  /**
   * Whether `binary` runs the ACP lane. Needs a way to spawn the agent (the
   * host spawner, or a spec transport), `agy --version` at or above
   * `AGY_ACP_MIN_VERSION`, and `acp` in `agy --help`. The help text is the
   * one the stream-json probe read, so detection spawns nothing extra; no
   * probe ever spawns `agy acp` itself. Only a definite answer is cached per
   * binary: a version or help read that timed out or failed is probed again
   * on the next lane (S2), and that lane runs on stream-json meanwhile.
   * `PTAH_AGY_TRANSPORT` overrides the probe.
   */
  private probeAcp(binary: string, knownVersion?: string): Promise<boolean> {
    const override = this.transportOverride();
    if (override !== 'auto') return Promise.resolve(override === 'acp');
    const cached = this.acpSupportByBinary.get(binary);
    if (cached !== undefined) {
      this.acpSupported = cached;
      return Promise.resolve(cached);
    }
    this.lastProbedBinary = binary;
    const inFlight = this.acpProbesInFlight.get(binary);
    if (inFlight) return inFlight;
    const probe = this.runAcpProbe(binary, knownVersion)
      .then((supported) => {
        if (supported !== undefined) {
          this.acpSupportByBinary.set(binary, supported);
        }
        this.acpSupported = supported === true;
        return supported === true;
      })
      .finally(() => this.acpProbesInFlight.delete(binary));
    this.acpProbesInFlight.set(binary, probe);
    return probe;
  }

  /** One ACP probe; `undefined` when it could not tell. */
  private async runAcpProbe(
    binary: string,
    knownVersion: string | undefined,
  ): Promise<boolean | undefined> {
    if (this.acp.probe) return this.acp.probe(binary);
    if (!this.spawner && !this.acp.transportFactory) return false;
    const version =
      knownVersion ??
      (await probeCliVersion(binary, undefined, undefined, this.spawner));
    if (!/\d+\.\d+\.\d+/.test(version ?? '')) {
      this.logger?.warn(
        '[AntigravityCliAdapter] ACP probe could not read the agy version; the next lane probes again',
        { version: version ?? null },
      );
      return undefined;
    }
    if (!meetsAgyAcpFloor(version)) {
      this.logger?.info('[AntigravityCliAdapter] agy is below the ACP floor', {
        version,
      });
      return false;
    }
    const help =
      this.helpTextByBinary.get(binary) ?? (await this.readAgyHelp(binary));
    if (help === undefined) {
      this.logger?.warn(
        '[AntigravityCliAdapter] ACP probe could not read agy --help; the next lane probes again',
        { version },
      );
      return undefined;
    }
    const listed = agyHelpListsAcp(help);
    if (listed) {
      this.logger?.info('[AntigravityCliAdapter] ACP transport available', {
        version,
      });
    } else {
      this.logger?.warn(
        '[AntigravityCliAdapter] agy is at or above the ACP floor but --help lists no acp; the lane runs on stream-json',
        { version },
      );
    }
    return listed;
  }

  /**
   * The ACP lane: `agy acp` through the provider-session lane handle. The
   * folder trust write stays (PF-5 not run); the Ptah MCP entry goes in
   * `session/new.mcpServers`, so `mcp_config.json` is left alone.
   *
   * The headless sink grants a tool approval only when the lane runs
   * unattended (`antigravitySkipsPermissions`, S1): `plan` and `auto-edit`
   * lanes are refused, as the stream-json `--mode` lanes are. With
   * `fallBack`, a session that never opened runs on stream-json (S3).
   */
  private async runAcp(
    options: CliCommandOptions,
    binary: string,
    fallBack: boolean,
  ): Promise<SdkHandle> {
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
      transportFactory: this.acp.transportFactory,
      logger: this.logger,
      ...(fallBack
        ? {
            fallback: {
              label: 'stream-json',
              run: () => this.runStreamJsonFallback(options, binary),
            },
          }
        : {}),
    });
  }

  /**
   * The stream-json lane after an ACP setup failure. Starts the binary's
   * cooldown (round-2 M2). A resume id is dropped (round-2 M3): it may be
   * an ACP session id, and neither the code nor a recording proves that
   * `--conversation` accepts one, so the lane starts a fresh conversation
   * with the full task prompt and says so.
   */
  private async runStreamJsonFallback(
    options: CliCommandOptions,
    binary: string,
  ): Promise<SdkHandle> {
    this.acpFailedAtByBinary.set(binary, this.now());
    this.logger?.warn(
      '[AntigravityCliAdapter] ACP setup failed; this binary runs stream-json for the cooldown',
      { cooldownMs: AGY_ACP_FAILURE_COOLDOWN_MS },
    );
    if (!options.resumeSessionId) return this.runStreamJson(options);
    this.logger?.info(
      '[AntigravityCliAdapter] stream-json fallback starts a fresh conversation instead of resuming',
      { agentId: options.agentId },
    );
    const handle = await this.runStreamJson({
      ...options,
      resumeSessionId: undefined,
    });
    return withLeadingInfo(
      handle,
      'Antigravity cannot resume the earlier session on stream-json (it may be an ACP session id); this lane starts a fresh conversation.',
    );
  }

  parseOutput(raw: string): string {
    return stripAnsiCodes(raw);
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
   * A probe that times out, cannot start or exits non-zero without a model
   * throws (the timeout with code `ETIMEDOUT`, a start failure with the spawn
   * error's code), so a caller can tell a failure from an empty answer. A
   * clean exit that lists nothing is `[]`. A non-empty answer becomes the ids
   * spawns read ({@link currentModelIds}).
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
    const models = parseAgyModels(stripAnsiCodes(probe.stdout));
    if (models.length > 0) {
      this.lastModelIds = { ids: new Set(models.map((m) => m.id)), at: this.now() };
      return models;
    }
    if (probe.exitCode !== null && probe.exitCode !== 0) {
      throw new Error(`agy models exited with code ${probe.exitCode}`);
    }
    return [];
  }

  /**
   * The live model ids a spawn derives its model value from: the last read
   * while it is under 10 minutes old, otherwise one `agy models` probe shared
   * by every spawn waiting on it. `null` when the probe lists nothing or
   * fails; that answer is kept for {@link AGY_MODEL_IDS_RETRY_MS}, so spawns
   * in that window do not each wait out the probe budget again.
   */
  private currentModelIds(binary: string): Promise<ReadonlySet<string> | null> {
    const last = this.lastModelIds;
    if (last && this.now() - last.at < AGY_MODEL_IDS_FRESH_MS) {
      return Promise.resolve(last.ids);
    }
    const missed = this.modelIdsMissedAt;
    if (missed !== undefined && this.now() - missed < AGY_MODEL_IDS_RETRY_MS) {
      return Promise.resolve(null);
    }
    if (!this.modelIdsInFlight) {
      this.modelIdsInFlight = this.readModels(binary)
        .then((models) => {
          if (models.length > 0) {
            this.modelIdsMissedAt = undefined;
            return new Set(models.map((m) => m.id));
          }
          this.modelIdsMissedAt = this.now();
          this.logger?.debug(
            '[AntigravityCliAdapter] agy models listed nothing; the model passes as chosen',
          );
          return null;
        })
        .catch((error: unknown) => {
          // degradation-audit: reported - logged at warn; without live ids the model passes as chosen and agy validates it
          this.modelIdsMissedAt = this.now();
          this.logger?.warn('[AntigravityCliAdapter] agy models probe failed; the model passes as chosen', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        })
        .finally(() => {
          this.modelIdsInFlight = undefined;
        });
    }
    return this.modelIdsInFlight;
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
      // --dangerously-skip-permissions bypasses tool approval, so a failure
      // here only re-surfaces the trust prompt on a future interactive run.
    }
  }

  /**
   * The ONE writer of `~/.gemini/config/mcp_config.json`.
   *
   * This adapter used to hand-roll its own read-modify-write of that file. Then
   * `agy` became a user-installable MCP target (TASK_2026_285) and the harness
   * reconciler started writing the SAME file, which made the hand-rolled copy a
   * second writer with a second idea of the format and no serialization at all
   * — one lost update and the user's installed server disappears after an agent
   * run, silently.
   *
   * So both sides go through the facet from `harness-sync`, which owns the
   * schema (`mcpServers`, `serverUrl` for remote), the atomic write and the
   * config-file lock. The dependency direction is the allowed one:
   * `cli-agent-runtime` → `harness-sync`, never the reverse.
   *
   * `homeDir` is resolved env-first for the same reason `geminiRoot()` is —
   * tests and sandboxes reassign `HOME` after module load, and the facet's
   * default would otherwise resolve `os.homedir()` and write to the real one.
   */
  private static mcpFacet(): IHarnessMcpFacet {
    return createMcpFacet('antigravity', {
      homeDir: process.env['HOME'] || process.env['USERPROFILE'] || homedir(),
    });
  }

  /**
   * Publish Ptah's own MCP server for this run.
   *
   * The key is `PTAH_SPAWN_MCP_KEY`, shared with the reconciler so the two
   * writers cannot disagree about which name is ephemeral. The facet's write is
   * read-modify-write of ONE key, so a user's servers — installed through the
   * marketplace or by hand — are carried through untouched.
   *
   * Non-fatal: a failure here costs MCP tools for this run, and the CLI still
   * functions, so it must not abort the spawn.
   */
  private async configureMcpServer(
    port: number,
    workingDirectory: string,
    agentId: string,
    token: string,
  ): Promise<{
    prior?: McpServerConfig;
    configured: boolean;
    restoreNeeded: boolean;
  }> {
    const facet = AntigravityCliAdapter.mcpFacet();
    const existing = facet.readAll('').get(PTAH_SPAWN_MCP_KEY);
    // Older launches could leave a lane URL behind. Never restore that route
    // (or its credential) as the next lane's persistent prior entry.
    const prior =
      existing &&
      'url' in existing &&
      typeof existing.url === 'string' &&
      /^http:\/\/localhost:\d+\/(?:auth|agent)\//.test(existing.url)
        ? { ...existing, url: new URL(existing.url).origin }
        : existing;
    const url = laneMcpAuthUrl(
      ptahMcpServerUrl(port, workingDirectory, agentId),
      token,
    );
    try {
      await facet.write('', PTAH_SPAWN_MCP_KEY, { type: 'http', url });
      return { prior, configured: true, restoreNeeded: true };
    } catch {
      this.logger?.warn('[AntigravityCliAdapter] MCP config write failed');
      // A failed atomic write may have reached disk. Restore the previous key.
      return { prior, configured: false, restoreNeeded: true };
    }
  }

  /**
   * Put the `ptah` key back the way this run found it, so no stale localhost
   * port is left pointing at a closed server.
   *
   * **RESTORE, not delete.** The key may hold an entry this run did not write:
   * a user's own `ptah` server, or a persistent entry an older Ptah left
   * (`CodeExecutionMCP` no longer writes one, TASK_2026_2297, and its
   * reconcile removes the leftover). An unconditional delete would drop the
   * user's server every time a Ptah-spawned agent finished.
   *
   * Restoring needs no knowledge of who the other writer is: `prior` is
   * whatever was in the file before this run. Absent means nobody owned the
   * key, and removing it is exactly the old behaviour.
   *
   * Removes or rewrites exactly `PTAH_SPAWN_MCP_KEY` and nothing else. An older
   * version also deleted the whole `mcpServers` map once it looked empty, which
   * was safe only while Ptah was its sole writer; now that a user's install can
   * live in that map, "empty" is a claim this code is not entitled to make.
   *
   * Non-fatal: the next spawn, and the next registration pass, both rewrite it.
   */
  private async cleanupMcpEntry(prior?: McpServerConfig): Promise<void> {
    try {
      const facet = AntigravityCliAdapter.mcpFacet();
      if (prior === undefined) {
        await facet.remove('', PTAH_SPAWN_MCP_KEY);
      } else {
        await facet.write('', PTAH_SPAWN_MCP_KEY, prior);
      }
    } catch {
      // degradation-audit: optional-capability - a failed restore is retried by
      // the next startup and must not change the lane's result.
      // Stale ptah entry will be overwritten on next configureMcpServer().
      this.logger?.error('[AntigravityCliAdapter] MCP config restore failed');
    }
  }

  /**
   * Run the task on `agy acp` when this binary supports it (or the transport
   * is forced to it), else on the stream-json lane.
   */
  async runSdk(options: CliCommandOptions): Promise<SdkHandle> {
    const binary = options.binaryPath ?? 'agy';
    if (!(await this.probeAcp(binary))) return this.runStreamJson(options);
    const auto = this.transportOverride() === 'auto';
    if (auto && this.acpCoolingDown(binary)) {
      this.logger?.info('[AntigravityCliAdapter] ACP is cooling down after a setup failure', {
        agentId: options.agentId,
      });
      return withLeadingInfo(
        await this.runStreamJson(options),
        `Antigravity runs this lane on stream-json: an earlier ACP session failed to start within the last ${AGY_ACP_FAILURE_COOLDOWN_MS / 60_000} minutes.`,
      );
    }
    return this.runAcp(options, binary, auto);
  }

  /**
   * Run the task via `agy` print mode with `--output-format stream-json`.
   *
   * Spawns `agy` with the prompt as the value of the trailing `--print` flag,
   * buffers stdout by line, JSON.parses each line defensively, and dispatches
   * to structured `CliOutputSegment`s. The conversation id is captured from the
   * `init` event. stderr and non-zero exit surface as `error` segments.
   */
  private async runStreamJson(options: CliCommandOptions): Promise<SdkHandle> {
    const policy = translateLaneSpawnPolicy(
      this.name,
      this.streamJsonManifest(),
      options,
    );
    if (options.workingDirectory) {
      await this.ensureFolderTrusted(options.workingDirectory);
    }
    const spawnEnv: Record<string, string> = {};
    if (process.platform === 'win32') {
      spawnEnv['NODE_PTY_USE_CONPTY'] = '0';
    }

    // No GEMINI_SYSTEM_MD support in `agy`: fold projectGuidance
    // into the task prompt via the shared builder.
    const taskPrompt = buildTaskPrompt(options, this.name);
    const abortController = new AbortController();
    let capturedSessionId: string | undefined;

    const binary = options.binaryPath ?? 'agy';
    const useStreamInput = await this.probeStreamJsonInput(binary);

    const prompt = useStreamInput
      ? taskPrompt
      : buildArgvTaskPrompt(options, this.name);
    const liveIds = options.model ? await this.currentModelIds(binary) : null;
    const args = applyLaneArgvPolicy(
      buildAntigravityArgs(options, prompt, useStreamInput, liveIds, this.logger),
      policy.cli === 'antigravity'
        ? policy.argv
        : { addArgs: [], removeArgs: [] },
    );

    // `agy` ships as a real `.exe` under %LOCALAPPDATA%\agy\bin, which
    // resolveDirectSpawn returns unchanged; when it is instead an npm `.cmd`
    // shim, resolveDirectSpawn points spawn at the real node entrypoint/binary
    // so child.pid is the process taskkill /T should walk from (not the cmd.exe
    // shim). No-op off-Windows.
    const spawnDescriptor = await resolveDirectSpawn(binary);
    assertCommandLineWithinLimit(spawnDescriptor.command, [
      ...spawnDescriptor.prefixArgs,
      ...args,
    ]);

    // The `ptah` entry as this run found it. Held in a LOCAL, not a field:
    // two `agy` agents can be in flight at once and a shared slot would let
    // one run's cleanup restore the other run's snapshot.
    const releaseMcpStartup = options.mcpPort
      ? await AntigravityCliAdapter.lockMcpStartup()
      : undefined;
    let priorMcpEntry: McpServerConfig | undefined;
    let mcpConfigured = false;
    let mcpRestoreNeeded = false;
    let mcpRestored = false;
    const restoreMcpConfig = async (): Promise<void> => {
      if (!mcpRestoreNeeded || mcpRestored) return;
      mcpRestored = true;
      await this.cleanupMcpEntry(priorMcpEntry);
      options.onMcpConfigRestored?.();
    };
    let spawnedChild: ReturnType<typeof spawnCli> | undefined;
    try {
      if (options.mcpPort && options.mcpToken && options.agentId) {
        const setup = await this.configureMcpServer(
          options.mcpPort,
          options.workingDirectory,
          options.agentId,
          options.mcpToken,
        );
        priorMcpEntry = setup.prior;
        mcpConfigured = setup.configured;
        mcpRestoreNeeded = setup.restoreNeeded;
      }

      const output = createBufferedEmitter<string>();
      const segment = createBufferedEmitter<CliOutputSegment>();

      const child = spawnCli(
        spawnDescriptor.command,
        [...spawnDescriptor.prefixArgs, ...args],
        {
          cwd: options.workingDirectory,
          env: Object.keys(spawnEnv).length > 0 ? spawnEnv : undefined,
          needsConsole: true,
          detached: true,
          cleanupOrphanDescendants: true,
          windowsJobPolicy: 'no-job',
          spawner: this.spawner,
        },
      );
      spawnedChild = child;
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      let processClosed = false;
      let stdinClosed = false;
      let currentTurn = createTurnDeferred();
      let turnSequence = 1;
      let currentTurnId = '';
      let observedModelId: string | undefined;
      const seenResultIds = new Set<string>();
      const firstTurn = currentTurn;
      const errorSteps: AgyStepUpdate[] = [];
      const agyErrors: string[] = [];
      let failedResult = false;
      let failedEvent: z.infer<typeof AgyResultEventSchema> | undefined;
      let previousResultUsage: AgyResult['usage'];
      let stepUsage: AgyResult['usage'];
      const seenUsageSteps = new Set<number>();
      let sawResult = false;
      const validTokens = (value: number | undefined): value is number =>
        value !== undefined && Number.isSafeInteger(value) && value >= 0;
      const complete = (usage: AgyResult['usage']): boolean =>
        !!usage &&
        validTokens(usage.input_tokens) &&
        validTokens(usage.output_tokens);
      const emitTelemetry = (usage?: AgyResult['usage']): void => {
        segment.emit({
          type: 'info',
          content: 'Antigravity turn telemetry',
          ...(usage && complete(usage)
            ? {
                usage: {
                  inputTokens: usage.input_tokens,
                  outputTokens: usage.output_tokens,
                  cacheReadTokens: usage.cache_read_tokens,
                },
              }
            : {}),
          turnTelemetry: completedTurnTelemetry({
            ...turnIdentity({
              provider: 'antigravity',
              turnId: currentTurnId,
              sessionId:
                capturedSessionId ??
                options.agentId ??
                `agy:${child.pid ?? 'unknown'}`,
              runId: options.agentId,
              sequence: turnSequence,
              modelId: observedModelId,
              source: 'stream',
            }),
            usage: usage
              ? {
                  inputTokens: usage.input_tokens,
                  outputTokens: usage.output_tokens,
                  cacheReadTokens: usage.cache_read_tokens,
                }
              : undefined,
          }),
        });
      };
      const onStep = (step: AgyStepUpdate): void => {
        if (
          step.step_type === 'agent_response' &&
          step.state === 'DONE' &&
          complete(step.usage) &&
          (step.step_index === undefined ||
            !seenUsageSteps.has(step.step_index))
        ) {
          if (step.step_index !== undefined)
            seenUsageSteps.add(step.step_index);
          stepUsage = stepUsage
            ? {
                input_tokens:
                  (stepUsage.input_tokens ?? 0) +
                  (step.usage?.input_tokens ?? 0),
                output_tokens:
                  (stepUsage.output_tokens ?? 0) +
                  (step.usage?.output_tokens ?? 0),
                cache_read_tokens:
                  validTokens(stepUsage.cache_read_tokens) &&
                  validTokens(step.usage?.cache_read_tokens)
                    ? stepUsage.cache_read_tokens +
                      step.usage!.cache_read_tokens!
                    : undefined,
              }
            : step.usage;
        }
        if (step.state === 'ERROR' || step['status'] === 'ERROR') {
          errorSteps.push(step);
          if (errorSteps.length > 5) errorSteps.shift();
        }
      };
      const onResult = (event: z.infer<typeof AgyResultEventSchema>): void => {
        const nativeTurnId =
          event.result.conversation_id && event.result.num_turns !== undefined
            ? `${event.result.conversation_id}:${event.result.num_turns}`
            : undefined;
        currentTurnId =
          nativeTurnId ?? `${event.result.conversation_id}:${turnSequence}`;
        if (
          seenResultIds.has(currentTurnId) &&
          (!failedResult || event.result.status !== 'SUCCESS')
        )
          return;
        seenResultIds.add(currentTurnId);
        observedModelId = event.result.model ?? observedModelId;
        sawResult = true;
        failedResult = event.result.status !== 'SUCCESS';
        failedEvent = failedResult ? event : undefined;
        if (!failedResult) {
          const cumulative = event.result.usage;
          let delta: AgyResult['usage'];
          if (complete(cumulative)) {
            if (!previousResultUsage) delta = cumulative;
            else if (
              complete(previousResultUsage) &&
              cumulative!.input_tokens! >= previousResultUsage.input_tokens! &&
              cumulative!.output_tokens! >= previousResultUsage.output_tokens!
            ) {
              delta = {
                input_tokens:
                  cumulative!.input_tokens! - previousResultUsage.input_tokens!,
                output_tokens:
                  cumulative!.output_tokens! -
                  previousResultUsage.output_tokens!,
                cache_read_tokens:
                  validTokens(cumulative?.cache_read_tokens) &&
                  validTokens(previousResultUsage.cache_read_tokens) &&
                  cumulative.cache_read_tokens >=
                    previousResultUsage.cache_read_tokens
                    ? cumulative.cache_read_tokens -
                      previousResultUsage.cache_read_tokens
                    : undefined,
              };
            }
            previousResultUsage = cumulative;
          }
          const usage =
            complete(delta) &&
            (!complete(stepUsage) ||
              (delta!.input_tokens! >= stepUsage!.input_tokens! &&
                delta!.output_tokens! >= stepUsage!.output_tokens!))
              ? {
                  ...delta,
                  cache_read_tokens: validTokens(delta?.cache_read_tokens)
                    ? delta!.cache_read_tokens
                    : stepUsage?.cache_read_tokens,
                }
              : stepUsage;
          emitTelemetry(usage);
        }
        stepUsage = undefined;
        seenUsageSteps.clear();
      };

      const emitAdapterError = (error: Error): void => {
        output.emit(`\n[Antigravity CLI Error] ${error.message}\n`);
        segment.emit({
          type: 'error',
          content: `Antigravity CLI Error: ${error.message}`,
        });
      };

      child.stdin?.on?.('error', (error: Error) => {
        stdinClosed = true;
        currentTurn.resolve(1);
        emitAdapterError(error);
      });

      const writeTurn = (message: string): void => {
        const parsed = AgyInputMessageSchema.safeParse({
          event: 'user',
          message: { content: message },
        });
        if (!parsed.success) {
          throw new Error(
            `Refusing to send an invalid Antigravity stream-json message: ${z.prettifyError(parsed.error)}`,
          );
        }
        if (processClosed || stdinClosed || !child.stdin) {
          throw new Error('Antigravity stdin is no longer writable');
        }
        child.stdin.write(`${JSON.stringify(parsed.data)}\n`);
      };

      if (useStreamInput) {
        writeTurn(taskPrompt);
      } else {
        // The fallback prompt is carried in argv and remains strictly one-shot.
        child.stdin?.end();
        stdinClosed = true;
      }

      const closeAfterSettledTurn = (settledTurn: TurnDeferred): void => {
        setImmediate(() => {
          if (
            !processClosed &&
            !stdinClosed &&
            currentTurn === settledTurn &&
            settledTurn.settled
          ) {
            child.stdin?.end();
            stdinClosed = true;
          }
        });
      };

      const onAbort = (): void => {
        // `pid` is known synchronously for an inline spawn and NOT for an
        // off-thread one, where the child is created on a worker. `whenSpawned`
        // is the one read that works for both; it settles to null if the child
        // never started, so this can never hang (TASK_2026_367).
        void child.whenSpawned.then((pid) => {
          if (pid && !child.killed) {
            // Tree-kill the whole process group — child.kill() alone orphans the
            // real `agy` process (and any shell subprocesses) when child is a shim.
            void killProcessTree(pid);
          }
        });
      };
      abortController.signal.addEventListener('abort', onAbort);

      const setSessionId = (id: string | undefined): void => {
        if (!capturedSessionId && id) {
          capturedSessionId = id;
        }
      };

      let lineBuf = '';
      child.stdout?.on('data', (data: string) => {
        lineBuf += stripAnsiCodes(data);
        const lines = lineBuf.split(/\r?\n/);
        lineBuf = lines.pop() ?? '';
        // A single stream-json line carries a whole tool output, so the cap is
        // sized like opencode's rather than the old plain-text 64KB.
        const LINE_BUF_CAP = 1024 * 1024;
        if (lineBuf.length > LINE_BUF_CAP) {
          output.emit(
            `[Antigravity CLI Warning] Line buffer exceeded ${LINE_BUF_CAP} bytes without a newline; resetting.\n`,
          );
          segment.emit({
            type: 'info',
            content: `Line buffer exceeded ${LINE_BUF_CAP} bytes without a newline; resetting.`,
          });
          lineBuf = '';
        }
        for (const line of lines) {
          this.handleLine(
            line,
            output.emit,
            segment.emit,
            setSessionId,
            onStep,
            onResult,
            useStreamInput
              ? (exitCode) => {
                  if (exitCode !== 0) sawResult = true;
                  const settledTurn = currentTurn;
                  // A result may share a stdout batch with later lines. Let
                  // queued data callbacks emit them before exposing turn end.
                  setImmediate(() => {
                    if (processClosed || settledTurn.settled) return;
                    settledTurn.resolve(exitCode);
                    if (exitCode !== 0 && failedResult) {
                      child.stdin?.end();
                      stdinClosed = true;
                    } else {
                      closeAfterSettledTurn(settledTurn);
                    }
                  });
                }
              : undefined,
          );
        }
      });

      let suppressConptyLines = 0;
      let stderrLineBuf = '';
      const emitStderrLine = (line: string): void => {
        const cleaned = line.trim();
        if (!cleaned) return;
        if (cleaned.includes('conpty_console_list_agent')) {
          suppressConptyLines = 5;
          return;
        }
        if (cleaned.includes('AttachConsole failed')) {
          suppressConptyLines = 3;
          return;
        }
        if (suppressConptyLines > 0) {
          suppressConptyLines--;
          return;
        }
        const safeLine = redactAgyText(cleaned).replaceAll(
          options.mcpToken ?? '\u0000',
          '[REDACTED]',
        );
        output.emit(`[stderr] ${safeLine}\n`);
        segment.emit({ type: classifyCliStderr(safeLine), content: safeLine });
      };
      child.stderr?.on('data', (data: string) => {
        const raw = stripAnsiCodes(data);
        stderrLineBuf += raw;
        const stderrLines = stderrLineBuf.split(/\r?\n/);
        stderrLineBuf = stderrLines.pop()?.slice(0, 8192) ?? '';
        for (const line of stderrLines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('AGY_ERROR')) {
            agyErrors.push(safeAgyText(trimmed));
            if (agyErrors.length > 5) agyErrors.shift();
          }
          emitStderrLine(line);
        }
      });

      const done = new Promise<number>((resolve) => {
        child.on('close', (code, signal) => {
          processClosed = true;
          abortController.signal.removeEventListener('abort', onAbort);
          if (lineBuf.trim()) {
            this.handleLine(
              lineBuf,
              output.emit,
              segment.emit,
              setSessionId,
              onStep,
              onResult,
              useStreamInput
                ? (turnCode) => {
                    if (turnCode !== 0) sawResult = true;
                    currentTurn.resolve(turnCode);
                  }
                : undefined,
            );
            lineBuf = '';
          }
          const exitCode = code ?? (signal ? 1 : 0);
          if (!sawResult && exitCode === 0 && !abortController.signal.aborted)
            emitTelemetry(stepUsage);
          const trailingStderr = stderrLineBuf.trim();
          emitStderrLine(trailingStderr);
          if (trailingStderr.startsWith('AGY_ERROR')) {
            agyErrors.push(safeAgyText(trailingStderr));
            if (agyErrors.length > 5) agyErrors.shift();
          }
          if (
            (failedResult || exitCode !== 0) &&
            !abortController.signal.aborted
          ) {
            const detail = `Antigravity CLI process exited with code ${exitCode}${agyErrors.length ? `; ${agyErrors.join('; ')}` : ''}`;
            output.emit(`\n[Error] ${detail}\n`);
            segment.emit({ type: 'error', content: detail });
          }
          if (useStreamInput) {
            currentTurn.resolve(failedResult ? 1 : exitCode);
          }
          resolve(exitCode);
          if (!failedResult && exitCode === 0 && agyErrors.length > 0) {
            this.logger?.warn(
              `[Antigravity] AGY_ERROR on successful turn: ${agyErrors.join('; ')}`,
            );
          }
          if (failedEvent) {
            this.logger?.error(
              `[Antigravity] Failed result: ${formatAgyDiagnostics({ resultEvent: failedEvent, processExitCode: exitCode }, errorSteps, agyErrors)}`,
            );
          }
        });

        child.on('error', (err) => {
          processClosed = true;
          abortController.signal.removeEventListener('abort', onAbort);
          if (useStreamInput) {
            currentTurn.resolve(1);
          }
          emitAdapterError(err);
          resolve(1);
        });
      });

      // Keep the credential valid for the whole lane. Startup restore would
      // revoke it before the lane could send its final report.
      void done.then(() => restoreMcpConfig());

      let mcpTimedOut = false;
      let onMcpTimeout: (() => void) | undefined;
      if (releaseMcpStartup) {
        if (!mcpConfigured) {
          output.emit(
            '\n[Antigravity MCP warning: config-write-failed] Ptah MCP was not configured; report in your final message.\n',
          );
        }
        let startupGrace: ReturnType<typeof setTimeout> | undefined;
        const startup =
          mcpConfigured &&
          options.attachmentProbe &&
          options.agentId &&
          options.mcpPort
            ? Promise.race([
                options.attachmentProbe
                  .waitFor(
                    options.agentId,
                    options.mcpPort,
                    MCP_ATTACHMENT_TIMEOUT_MS,
                  )
                  .then((entry) => ({ exited: false as const, entry })),
                done.then(() => ({ exited: true as const, entry: undefined })),
              ])
            : mcpRestoreNeeded
              ? // No probe can confirm that agy read the lane URL, so keep the
                // startup lock for the same window (or until the lane ends).
                // Releasing at once would race agy's config read.
                Promise.race([
                  done.then(() => ({
                    exited: true as const,
                    entry: undefined,
                  })),
                  new Promise<{ exited: true; entry: undefined }>((resolve) => {
                    startupGrace = setTimeout(
                      () => resolve({ exited: true, entry: undefined }),
                      MCP_ATTACHMENT_TIMEOUT_MS,
                    );
                  }),
                ])
              : Promise.resolve({ exited: true as const, entry: undefined });
        void startup
          .then(async (result) => {
            if (
              !processClosed &&
              mcpConfigured &&
              !result.exited &&
              !result.entry &&
              options.attachmentProbe &&
              options.agentId &&
              options.mcpPort
            ) {
              mcpTimedOut = true;
              onMcpTimeout?.();
              output.emit(
                '\n[Antigravity MCP warning: handshake-timeout] Ptah MCP did not connect within 15s; report in your final message.\n',
              );
            }
          })
          .catch((error: unknown) => {
            this.logger?.error(
              '[AntigravityCliAdapter] MCP startup wait failed',
              error instanceof Error ? error : new Error(String(error)),
            );
          })
          .finally(async () => {
            clearTimeout(startupGrace);
            releaseMcpStartup();
          });
      }

      return {
        outcomeUsageIsTurnTotal: true,
        usageScope: 'turn',
        abort: abortController,
        done: useStreamInput ? firstTurn.done : done,
        onOutput: output.subscribe,
        onSegment: segment.subscribe,
        onMcpAttachmentTimeout: (callback) => {
          onMcpTimeout = callback;
          if (mcpTimedOut && !processClosed) callback();
        },
        mcpConfigWriteFailed: !!options.mcpPort && !mcpConfigured,
        getSessionId: () => capturedSessionId,
        getPid: () => child.pid,
        ...(useStreamInput
          ? {
              supportsContinuation: () => !processClosed && !stdinClosed,
              continue: async (message: string) => {
                if (!currentTurn.settled) {
                  throw new Error(
                    'Antigravity is still processing the current turn',
                  );
                }
                const previousTurn = currentTurn;
                const nextTurn = createTurnDeferred();
                currentTurn = nextTurn;
                turnSequence++;
                currentTurnId = '';
                observedModelId = undefined;
                failedResult = false;
                failedEvent = undefined;
                sawResult = false;
                stepUsage = undefined;
                seenUsageSteps.clear();
                errorSteps.length = 0;
                agyErrors.length = 0;
                try {
                  writeTurn(message);
                } catch (error: unknown) {
                  currentTurn = previousTurn;
                  throw error;
                }
                return { done: nextTurn.done };
              },
            }
          : {}),
      };
    } catch (error: unknown) {
      try {
        // The pid report and the Windows tree kill have no deadline of their
        // own. Bound the wait so restore and release always run; a pid that
        // arrives later is still killed, just without holding the lock.
        const stopChild = (async (): Promise<void> => {
          const pid = await spawnedChild?.whenSpawned;
          if (pid) await killProcessTree(pid);
        })().catch((killError: unknown) => {
          // degradation-audit: optional-capability - cleanup still restores the shared key.
          this.logger?.error(
            '[AntigravityCliAdapter] Failed to stop child after startup error',
            killError instanceof Error
              ? killError
              : new Error(String(killError)),
          );
        });
        let deadline: ReturnType<typeof setTimeout> | undefined;
        const stopped = await Promise.race([
          stopChild.then(() => true),
          new Promise<false>((resolve) => {
            deadline = setTimeout(
              () => resolve(false),
              AntigravityCliAdapter.startupChildStopDeadlineMs,
            );
          }),
        ]);
        clearTimeout(deadline);
        if (!stopped) {
          this.logger?.warn(
            '[AntigravityCliAdapter] Child stop after startup error is still pending; restoring MCP config and releasing the startup lock',
            { deadlineMs: AntigravityCliAdapter.startupChildStopDeadlineMs },
          );
        }
        await restoreMcpConfig();
      } finally {
        releaseMcpStartup?.();
      }
      throw error;
    }
  }

  /**
   * Parse one stream-json line and emit its raw text + structured segment(s).
   * A line that is not valid JSON falls back to being emitted verbatim as
   * `text` — `agy` prints banners and crash dumps outside the event stream.
   */
  private handleLine(
    line: string,
    emitOutput: (data: string) => void,
    emitSegment: (segment: CliOutputSegment) => void,
    setSessionId: (id: string | undefined) => void,
    onStep: (step: AgyStepUpdate) => void,
    onResult: (event: z.infer<typeof AgyResultEventSchema>) => void,
    settleTurn?: (exitCode: number) => void,
  ): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      // degradation-audit: optional-capability - agy prints banners and crash
      // dumps outside the JSON event stream; a non-JSON line is emitted
      // verbatim as text instead of being treated as a parse failure, per the
      // doc comment on this method.
      emitOutput(trimmed + '\n');
      emitSegment({ type: 'text', content: trimmed });
      return;
    }

    const header = AgyEventHeaderSchema.safeParse(value);
    if (!header.success) {
      emitSegment({
        type: 'error',
        content: `Invalid Antigravity stream-json event: ${z.prettifyError(header.error)}`,
      });
      return;
    }

    switch (header.data.event) {
      case 'init':
        this.parseKnownEvent(
          AgyInitEventSchema,
          value,
          emitSegment,
          (event) => {
            setSessionId(event.conversation_id);
          },
        );
        break;
      case 'step_update':
        this.parseKnownEvent(
          AgyStepUpdateEventSchema,
          value,
          emitSegment,
          (event) => {
            setSessionId(event.step_update.conversation_id);
            onStep(event.step_update);
            this.handleStepUpdate(event.step_update, emitOutput, emitSegment);
          },
        );
        break;
      case 'result':
        if (
          !this.parseKnownEvent(
            AgyResultEventSchema,
            value,
            emitSegment,
            (event) => {
              setSessionId(event.result.conversation_id);
              onResult(event);
              this.handleResult(event.result, emitOutput, emitSegment);
              settleTurn?.(event.result.status === 'SUCCESS' ? 0 : 1);
            },
          )
        ) {
          settleTurn?.(1);
        }
        break;
      default:
        // Defensive fallback — surface unrecognized events rather than dropping.
        emitSegment({ type: 'info', content: trimmed });
        break;
    }
  }

  private parseKnownEvent<T>(
    schema: z.ZodType<T>,
    value: unknown,
    emitSegment: (segment: CliOutputSegment) => void,
    consume: (event: T) => void,
  ): boolean {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      emitSegment({
        type: 'error',
        content: `Invalid Antigravity stream-json event: ${z.prettifyError(parsed.error)}`,
      });
      return false;
    }
    consume(parsed.data);
    return true;
  }

  /**
   * Map a `step_update` to segments.
   *
   * - `tool` + `ACTIVE` → `tool-call` (parameters known, output not yet)
   * - `tool` + `DONE`   → `tool-result` (`tool_info.output`)
   * - `tool` + `ERROR`  → `tool-result-error` for the same `toolCallId`
   * - `agent_response`  → `text` for each incremental `text_delta`
   * - everything else (`user_input`, `checkpoint`, `unknown`, …) is a
   *   structural marker and produces no segment.
   */
  private handleStepUpdate(
    step: AgyStepUpdate,
    emitOutput: (data: string) => void,
    emitSegment: (segment: CliOutputSegment) => void,
  ): void {
    if (step.step_type === 'tool') {
      const toolName = step.tool_name ?? step.tool_info?.name ?? 'tool';
      const toolCallId =
        step.step_index !== undefined ? String(step.step_index) : undefined;

      if (step.state === 'DONE' || step.state === 'ERROR') {
        emitSegment({
          type: step.state === 'ERROR' ? 'tool-result-error' : 'tool-result',
          toolName,
          content:
            step.tool_info?.output ??
            (step.state === 'ERROR' ? 'Tool failed' : ''),
          toolCallId,
        });
        return;
      }

      const parameters = step.tool_info?.parameters;
      emitOutput(`[Tool] ${toolName}\n`);
      emitSegment({
        type: 'tool-call',
        toolName,
        toolArgs: parameters ? JSON.stringify(parameters) : undefined,
        toolInput: parameters,
        content: '',
        toolCallId,
      });
      return;
    }

    if (step.step_type === 'agent_response' && step.text_delta) {
      emitOutput(step.text_delta);
      emitSegment({ type: 'text', content: step.text_delta });
    }

    if (
      step.step_type === 'agent_response' &&
      step.state === 'DONE' &&
      step.usage
    ) {
      const usageStr = formatUsage(step.usage);
      if (
        usageStr &&
        Number.isSafeInteger(step.usage.input_tokens) &&
        Number.isSafeInteger(step.usage.output_tokens) &&
        step.usage.input_tokens !== undefined &&
        step.usage.output_tokens !== undefined &&
        step.usage.input_tokens >= 0 &&
        step.usage.output_tokens >= 0
      ) {
        emitOutput(`\n[${usageStr}]\n`);
        emitSegment({
          type: 'info',
          content: usageStr,
          usage: {
            inputTokens: step.usage.input_tokens,
            outputTokens: step.usage.output_tokens,
            cacheReadTokens: step.usage.cache_read_tokens,
            totalTokens: step.usage.total_tokens,
          },
        });
      } else {
        emitSegment({
          type: 'info',
          content:
            'Antigravity turn telemetry unavailable: complete input/output totals missing.',
        });
      }
    }
  }

  /**
   * Emit the terminal outcome. `result.response` repeats text already streamed
   * as deltas, so only a usage summary is emitted on success; a non-SUCCESS
   * status surfaces as an `error` segment carrying the response body.
   */
  private handleResult(
    result: AgyResult,
    emitOutput: (data: string) => void,
    emitSegment: (segment: CliOutputSegment) => void,
  ): void {
    if (result.status && result.status !== 'SUCCESS') {
      const message = formatAgyFailure(result);
      emitOutput(`\n[Error] ${message}\n`);
      emitSegment({ type: 'error', content: message });
    }

    // result.usage and result.num_turns are cumulative across the whole
    // process. Per-turn usage is emitted from the DONE agent_response step so
    // a second result cannot double-count the first turn.
  }
}
