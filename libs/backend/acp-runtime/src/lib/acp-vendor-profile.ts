/**
 * AcpVendorProfile — the per-vendor data and small functions the ACP runner
 * (`createAcpSession`) needs. Everything vendor-specific lives here, so
 * the runner stays vendor-neutral and a further ACP agent is a new profile only.
 *
 * A profile holds no state and performs no I/O beyond the logger it is
 * handed. Vendor names, vendor extension methods and vendor wording live here
 * and nowhere in the runner.
 *
 * The runner offers `authenticate` (once, when the profile names a method and
 * `session/new` answers the ACP auth-required error), `session/set_mode` (for
 * {@link AcpVendorProfile.modeFor}) and `session/set_config_option`. The ACP
 * SDK has no `session/set_model` request, so a model is always a config
 * option.
 */
import type { McpServer } from '@agentclientprotocol/sdk';
import type {
  ProviderMcpAttachment,
  ProviderSessionLogger,
} from '@ptah-extension/provider-session-contracts';
import type { AcpSpawnEnv } from './acp-spawn-env';
import type { CliType, LanePermissionMode } from '@ptah-extension/shared';

/**
 * Where a lane's model came from, so a rejected model names the setting to
 * change. Mirrors `LaneModelSource` in `cli-agent-runtime`.
 */
export type AcpModelSource =
  | 'request'
  | 'setting'
  | 'ptah-default'
  | 'cli-default';

/**
 * The per-session settings a profile and the runner read. A lane passes its
 * `CliCommandOptions`, which is a structural superset; the runner reads
 * nothing else.
 */
export interface AcpSessionOptions {
  readonly workingDirectory: string;
  readonly permission?: LanePermissionMode;
  readonly autoApprove?: boolean;
  readonly model?: string;
  readonly modelSource?: AcpModelSource;
  readonly reasoningEffort?: string;
  /** Re-attach to this session instead of starting a new one. */
  readonly resumeSessionId?: string;
  /**
   * The re-attach request to prefer: `resume` (no history replay) or `load`
   * (history replayed into the session's replay). The other one is used when
   * the agent advertises only that one. Default `resume`.
   */
  readonly attachMethod?: 'resume' | 'load';
  /**
   * What a failed re-attach does: start a new session with an `info` (lanes,
   * the default) or fail the setup with `resume-failed` (a chat that must not
   * silently lose its history).
   */
  readonly attachFailure?: 'new-session' | 'error';
  /**
   * Bound on one prompt (lanes). On expiry the turn fails with
   * `prompt-timeout`, the agent is cancelled and then stopped. Omit for none.
   */
  readonly promptTimeoutMs?: number;
  /** The lane's agent id: names the run in logs and turn ids. */
  readonly agentId?: string;
  /**
   * The MCP servers the caller built for this session (URL and bearer). A
   * profile turns them into ACP `McpServer` entries in `buildMcpServers`.
   */
  readonly mcp: readonly ProviderMcpAttachment[];
}

/**
 * One `session/set_config_option` call the profile wants before the first prompt.
 *
 * `binding: true` marks a setting the turn cannot run without (e.g. the
 * model): it is sent even when its value is not advertised, and a rejection
 * fails the turn. Any other entry is a hint: an unadvertised value is skipped
 * and a rejection only emits an info.
 */
export type AcpSessionConfigEntry =
  | {
      readonly configId: string;
      readonly value: string;
      readonly binding?: boolean;
    }
  | {
      readonly configId: string;
      readonly value: boolean;
      readonly binding?: boolean;
    };

/** The ACP request that failed, as seen by {@link AcpVendorProfile.describeError}. */
export type AcpRequestMethod =
  | 'initialize'
  | 'authenticate'
  | 'session/new'
  | 'session/resume'
  | 'session/load'
  | 'session/set_config_option'
  | 'session/set_mode'
  | 'session/prompt';

/** A JSON-RPC error answer to one of the runner's requests, with its context. */
export interface AcpRequestFailure {
  readonly method: AcpRequestMethod;
  /** JSON-RPC error code, e.g. `-32602` (invalid params). */
  readonly code: number;
  readonly message: string;
  /** JSON-RPC error data: a string, an object (usually with `message`), or absent. */
  readonly data?: unknown;
  /** Set for `session/set_config_option`: the option and value that were refused. */
  readonly configId?: string;
  readonly configValue?: string | boolean;
  /** Set for `session/set_config_option`: the values the session advertised for that option. */
  readonly advertisedValues?: readonly string[];
  /** The lane's options, so a message can name the setting a value came from. */
  readonly options: AcpSessionOptions;
}

/** How to start the agent: the argv after the binary, its environment and console. */
export interface AcpSpawnSpec {
  /** E.g. `['agent', 'stdio']`. */
  readonly args: readonly string[];
  /**
   * Applied to the caller's `baseEnv` (see `buildAcpSpawnEnv`). Omit to run
   * with `baseEnv` unchanged.
   */
  readonly env?: AcpSpawnEnv;
  /** Windows: the agent needs its own hidden console (ConPTY). Default false. */
  readonly needsConsole?: boolean;
}

/**
 * What `interrupt` does after `session/cancel`:
 * - `await-reply`: the agent answers the cancelled prompt and keeps running,
 *   so the session takes the next prompt on the same process;
 * - `kill`: the agent is not trusted to survive a cancel; it is stopped after
 *   the cancel grace, as on abort (no interrupt is offered).
 */
export type AcpCancelBehavior = 'await-reply' | 'kill';

/** Vendor extension hooks. Unknown methods fall through to the runner. */
export interface AcpExtensionHooks {
  /**
   * A vendor notification (e.g. `_vendor/...`). Return true when handled, so
   * the runner stays silent; false reports the method once as unsupported.
   */
  notification?(
    method: string,
    params: Record<string, unknown>,
    logger: ProviderSessionLogger | undefined,
  ): boolean;
  /**
   * A vendor request from the agent. Resolve the result, or `undefined` to
   * answer method-not-found. Without this hook every agent request is
   * answered method-not-found.
   */
  request?(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined>;
}

export interface AcpVendorProfile {
  /** The lane type this profile serves. */
  readonly vendor: CliType;
  /** Human name used in every message, e.g. "Grok". */
  readonly displayName: string;
  /** What the user runs to sign in; used for `auth-required` (m-3). */
  readonly signInHint: string;
  /** Default `kill`: interrupt is offered only for `await-reply`. */
  readonly cancelBehavior?: AcpCancelBehavior;
  /**
   * The `authenticate` method id to try once when `session/new` answers the
   * ACP auth-required error and the agent advertised that method.
   */
  readonly authMethod?: string;
  /**
   * The argv after the binary and any lane-specific environment. The model and
   * effort never go here: they are applied through {@link sessionConfig},
   * because a vendor may ignore the flags silently.
   */
  buildSpawn(options: AcpSessionOptions): AcpSpawnSpec;
  /** The MCP servers attached on `session/new`, `session/resume` and `session/load`. */
  buildMcpServers(options: AcpSessionOptions): readonly McpServer[];
  /** Optional `_meta` for `initialize`. */
  initializeMeta?(options: AcpSessionOptions): Record<string, unknown> | undefined;
  /** Optional `_meta` for `session/new`. */
  sessionMeta?(options: AcpSessionOptions): Record<string, unknown> | undefined;
  /** Optional `_meta` for `session/cancel`. */
  cancelMeta?(options: AcpSessionOptions): Record<string, unknown> | undefined;
  /**
   * The session mode for these options (e.g. from the lane permission), set
   * through `session/set_mode` when the session advertises it, else through a
   * `mode` config option. A mode the agent does not offer is skipped with an
   * `info`.
   */
  modeFor?(options: AcpSessionOptions): string | undefined;
  /**
   * Config to apply after session setup and before the first prompt. Entries
   * whose `configId` the session did not advertise are skipped with an `info`.
   */
  sessionConfig?(options: AcpSessionOptions): readonly AcpSessionConfigEntry[];
  /** Vendor extension hooks. Omit to report every unknown notification once. */
  readonly extensions?: AcpExtensionHooks;
  /** Exit code of a completed `execute` tool call, read from its `rawOutput`. */
  extractExitCode?(rawOutput: unknown): number | undefined;
  /**
   * A user-facing message for a JSON-RPC error answer, e.g. a sign-in or
   * model hint. Return `undefined` to use the runner's generic message.
   */
  describeError?(failure: AcpRequestFailure): string | undefined;
}

/**
 * The human-readable detail of a JSON-RPC error `data` field: the string
 * itself, or the `message` of an object. An agent may use both shapes for the
 * same error.
 */
export function readAcpErrorDetail(data: unknown): string | undefined {
  if (typeof data === 'string') {
    return data.trim() || undefined;
  }
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const message = (data as Record<string, unknown>)['message'];
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  return undefined;
}
