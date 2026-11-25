/**
 * GrokAcpProfile — the vendor data the ACP runner needs to drive
 * `grok agent --no-leader stdio` (TASK_2026_617).
 *
 * Measured against grok 1.0.46 (`acp-batch0-probe.md`, `grok-probe.md`):
 * - argv is `agent --no-leader stdio`. Options precede the `stdio` subcommand,
 *   and `--no-leader` is mandatory: without it the child attaches to a shared
 *   leader process (`~/.grok/leader.sock`) that outlives the lane.
 * - `-m` is silently ignored by `grok agent stdio`, and `--reasoning-effort`
 *   belongs to the same subcommand and was never probed. The model and the
 *   effort therefore travel through `session/set_config_option`
 *   (`configId` `model` and `reasoning_effort`), which the runner applies only
 *   when the session advertises that option.
 * - Permissions: resolved yolo inserts `--always-approve` before `stdio`.
 *   Other modes retain the explicit ACP permission response policy; they are
 *   not advertised as enforceable per-lane permission modes.
 * - No per-lane environment: Grok reads the login `grok login` writes to
 *   `~/.grok/auth.json`, so the host environment is passed through unchanged.
 * - The effort arrives already mapped by the lane spawn policy and is forwarded
 *   as-is; the runner skips it when the active model does not advertise it.
 * - `_x.ai/*` (and `x.ai/*`) notifications are vendor extensions, e.g. the
 *   `retry_state` notices before a rate-limit error; they are ignored, and
 *   `_x.ai/mcp/servers_updated` is logged (MCP attachment diagnostics).
 * - Live usage: Grok sends `_x.ai/session_notification` with
 *   `update.sessionUpdate: 'response_completed'` once per model call, its
 *   `usage` the call's counters (`grok-p1-ptah-mcp-search-use-tool.ndjson`:
 *   three calls). Σ(input + cache read) and Σ output equal the prompt
 *   response's `_meta.usage` turn total, so each call is a usage increment
 *   and the turn total stays the correction.
 * - Interrupt: `session/cancel` mid-shell answers the prompt `cancelled` and
 *   the process keeps running (`grok-p2-cancel-mid-shell.ndjson`), so the
 *   cancel behaviour is `await-reply`.
 * - Resume keeps the stored model: with the `grokModel` setting cleared no
 *   `model` entry is sent, so a resumed session (`session/resume`) stays on
 *   the model it last ran on rather than resetting to Grok's CLI default.
 *   Set the model explicitly to switch a resumed session.
 */
import type { McpServer } from '@agentclientprotocol/sdk';
import { z } from 'zod';
import { toAcpMcpServer } from '../acp-mcp-servers';
import { readAcpErrorDetail } from '../acp-vendor-profile';
import type {
  ProviderSessionLogger,
  ProviderUsage,
} from '@ptah-extension/provider-session-contracts';
import type {
  AcpModelSource,
  AcpRequestFailure,
  AcpSessionConfigEntry,
  AcpSessionConfigInput,
  AcpSessionOptions,
  AcpSpawnSpec,
  AcpVendorProfile,
} from '../acp-vendor-profile';

/** JSON-RPC codes Grok answers with, as captured in the `grok-p3-*` fixtures. */
const GROK_RATE_LIMITED = -32003;
const GROK_AUTH_REQUIRED = -32000;
const JSONRPC_INVALID_PARAMS = -32602;

const GROK_ARGS: readonly string[] = ['agent', '--no-leader', 'stdio'];

const EXTENSION_NOTIFICATION = /^_?x\.ai\//;
const MCP_SERVERS_UPDATED = '_x.ai/mcp/servers_updated';
const SIGN_IN_HINT = 'run `grok login`';
const EFFORT_CONFIG_ID = 'reasoning_effort';
const SESSION_NOTIFICATION = '_x.ai/session_notification';

const tokenCount = z.number().int().nonnegative();

/** One model call's counters on a `response_completed` notification. */
const grokCallUsageSchema = z.object({
  update: z.object({
    sessionUpdate: z.literal('response_completed'),
    usage: z.object({
      input_tokens: tokenCount,
      output_tokens: tokenCount,
      cache_read_input_tokens: tokenCount.optional(),
      cache_creation_input_tokens: tokenCount.optional(),
    }),
  }),
});

/**
 * One model call's usage, in the shape of Grok's turn total: its
 * `inputTokens` include the cached input (the fixtures' Σ matches the turn
 * `_meta.usage.inputTokens`). No cache, context or cost field is set, since
 * the turn total carries none under these names.
 */
function readGrokCallUsage(
  method: string,
  params: Record<string, unknown>,
  malformed?: (fieldPaths: readonly string[]) => void,
): ProviderUsage | undefined {
  if (method !== SESSION_NOTIFICATION) return undefined;
  const parsed = grokCallUsageSchema.safeParse(params);
  if (!parsed.success) {
    // A frame without valid counters adds no increment; the turn-end total
    // still lands and corrects the card. Only a `response_completed` frame
    // is a usage frame, so only its failure is reported as shape drift.
    if (isResponseCompleted(params))
      malformed?.(parsed.error.issues.map((issue) => issue.path.join('.')));
    return undefined;
  }
  const usage = parsed.data.update.usage;
  return {
    inputTokens:
      usage.input_tokens +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
  };
}

function isResponseCompleted(params: Record<string, unknown>): boolean {
  const update = params['update'];
  return (
    typeof update === 'object' &&
    update !== null &&
    (update as Record<string, unknown>)['sessionUpdate'] === 'response_completed'
  );
}

/** Grok's -32000 auth failures say "Authentication required" / "no auth method id provided". */
const AUTH_WORDING = /authenticat|auth method/i;

/** Where a rejected model came from, worded for the user. */
function describeModelSource(source: AcpModelSource | undefined): string {
  switch (source) {
    case 'request':
      return 'the spawn request';
    case 'setting':
      return 'the `agentOrchestration.grokModel` setting';
    case 'ptah-default':
      return "Ptah's lane default";
    case 'cli-default':
      return "Grok's own default";
    default:
      return 'the `agentOrchestration.grokModel` setting or the spawn request';
  }
}

function describeGrokError(failure: AcpRequestFailure): string | undefined {
  const detail = readAcpErrorDetail(failure.data);

  if (
    failure.code === GROK_RATE_LIMITED &&
    failure.method === 'session/prompt'
  ) {
    return `Grok is rate limited: ${detail ?? failure.message}`;
  }

  // -32000 is JSON-RPC's generic server error; only an auth wording means a
  // missing or expired login, on any method (a token can expire mid-lane).
  if (
    failure.code === GROK_AUTH_REQUIRED &&
    AUTH_WORDING.test(`${failure.message} ${detail ?? ''}`)
  ) {
    return `Grok is not signed in: ${SIGN_IN_HINT}`;
  }

  if (
    failure.code === JSONRPC_INVALID_PARAMS &&
    failure.method === 'session/set_config_option' &&
    failure.configId === 'model'
  ) {
    const model = String(failure.configValue ?? failure.options.model ?? '');
    const rejected = `Grok rejected model '${model}' (from ${describeModelSource(failure.options.modelSource)})`;
    const available = failure.advertisedValues ?? [];
    return available.length > 0
      ? `${rejected}; available models: ${available.join(', ')}`
      : `${rejected}; run \`grok models\` to see the available models`;
  }

  return undefined;
}

export const grokAcpProfile: AcpVendorProfile = {
  vendor: 'grok',
  displayName: 'Grok',
  signInHint: SIGN_IN_HINT,
  cancelBehavior: 'await-reply',
  effortConfigId: EFFORT_CONFIG_ID,
  // `/always-approve` toggles "skip all permission prompts" (grok-plain-turn
  // fixture); a lane's approval mode is set at spawn, so lanes hide it.
  hiddenLaneCommands: ['always-approve'],

  buildSpawn(options: AcpSessionOptions): AcpSpawnSpec {
    // A chat never gets `--always-approve` (`AcpSessionOptions.consumer`).
    return { args: options.permission === 'yolo' && options.consumer !== 'chat'
      ? ['agent', '--always-approve', '--no-leader', 'stdio'] : GROK_ARGS };
  },

  /**
   * The caller builds the attachments (Ptah's scoped URL plus the lane's
   * bearer, `buildLaneMcpAttachments` in `cli-agent-runtime`, and any user
   * server); Grok takes each as the matching ACP entry, names kept.
   */
  buildMcpServers(options: AcpSessionOptions): readonly McpServer[] {
    return (options.mcp ?? []).map((attachment) => toAcpMcpServer(attachment));
  },

  sessionConfig(options: AcpSessionConfigInput): readonly AcpSessionConfigEntry[] {
    const entries: AcpSessionConfigEntry[] = [];
    if (options.model) {
      // Binding: a model Grok rejects fails the turn instead of silently
      // running the lane on another model.
      entries.push({ configId: 'model', value: options.model, binding: true });
    }
    if (options.reasoningEffort) {
      entries.push({
        configId: EFFORT_CONFIG_ID,
        value: options.reasoningEffort,
      });
    }
    return entries;
  },

  extensions: {
    notification(
      method: string,
      params: Record<string, unknown>,
      logger: ProviderSessionLogger | undefined,
    ): boolean {
      if (method === MCP_SERVERS_UPDATED) {
        const servers: unknown = params['mcpServers'];
        logger?.info('[AcpSessionHandle] MCP servers updated notification', {
          vendor: 'grok',
          method,
          serverCount: Array.isArray(servers) ? servers.length : undefined,
          paramsAvailable: true,
        });
      }
      return EXTENSION_NOTIFICATION.test(method);
    },
    usage: readGrokCallUsage,
  },

  /**
   * Informational only: the probe found Grok does not preserve the real exit
   * code of a shell tool call in `rawOutput`.
   */
  extractExitCode(rawOutput: unknown): number | undefined {
    if (typeof rawOutput !== 'object' || rawOutput === null) return undefined;
    const code = (rawOutput as Record<string, unknown>)['exit_code'];
    return typeof code === 'number' && Number.isFinite(code) ? code : undefined;
  },

  describeError: describeGrokError,
};
