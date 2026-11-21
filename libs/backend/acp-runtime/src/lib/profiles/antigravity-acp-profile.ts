/**
 * AntigravityAcpProfile — the vendor data the ACP runner needs to drive
 * `agy acp` (Antigravity CLI >= 1.5.1), TASK_2026_2291 (P3).
 *
 * Measured against agy 1.5.13 (preflight PF-3/PF-4, the `antigravity-*`
 * fixtures and the P3 live run):
 * - argv is `acp`. No isolation flag (D10): the lane runs on the user's
 *   shared, signed-in profile (default `--app-data-dir`). An unattended lane
 *   (resolved yolo, or no permission with auto-approve on) adds
 *   `--dangerously-skip-permissions`, as the stream-json lane does.
 * - Windows: `NODE_PTY_USE_CONPTY=0` and a hidden console, the same as the
 *   stream-json lane; agy's shell tool runs through a pty.
 * - Ptah MCP (D9): an ACP `http` entry with the lane bearer. agy advertises no
 *   `mcpCapabilities`, yet it connects to the entry, sends the header, lists
 *   the tools (`mcp_<server>_<tool>`) and calls them; it writes nothing to
 *   `~/.gemini/config/mcp_config.json` (P3 live run).
 * - No `authenticate` on the shared profile (PF-4: `session/new` succeeds
 *   without it); a signed-out profile gets the sign-in hint.
 * - Modes (`session/new.modes`): plan -> `plan`, auto-edit -> `accept-edits`,
 *   ask -> `default`, yolo -> `auto`.
 * - Model: `session/set_config_option` `model` takes the full `agy models` id
 *   (`claude-sonnet-5-5-medium`, the effort in the id) and also the base
 *   (`claude-sonnet-5-5`). The effort travels as the `thought_level` option
 *   (`low|medium|high|xhigh`), only when the model id carries none, so an id
 *   such as `gpt-oss-120b-medium` keeps its own effort; `max` maps to `xhigh`.
 * - Interrupt: `session/cancel` answers the prompt `cancelled` and the
 *   process keeps running (`antigravity-p3-cancel-then-continue.ndjson`), so
 *   the cancel behaviour is `await-reply`.
 */
import type {
  McpServer,
  RequestPermissionRequest,
} from '@agentclientprotocol/sdk';
import { readAcpErrorDetail } from '../acp-vendor-profile';
import type {
  AcpRequestFailure,
  AcpSessionConfigEntry,
  AcpSessionOptions,
  AcpSpawnSpec,
  AcpVendorProfile,
} from '../acp-vendor-profile';

const SIGN_IN_HINT = 'Run agy once in a terminal to sign in.';
const JSONRPC_INVALID_PARAMS = -32602;

/** The effort suffix of an `agy models` id; such an id needs no `thought_level`. */
const MODEL_EFFORT_SUFFIX = /-(?:low|medium|high|xhigh|max)$/;

/** `thought_level` values agy 1.5.13 advertises, keyed by the lane effort. */
const THOUGHT_LEVELS: Readonly<Record<string, string>> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'xhigh',
};

/** Lane permission -> the agy session mode id. */
const MODES: Readonly<Record<string, string>> = {
  plan: 'plan',
  'auto-edit': 'accept-edits',
  ask: 'default',
  yolo: 'auto',
};

/**
 * The ACP server name of the Ptah MCP attachment. agy also loads the shared
 * `~/.gemini/config/mcp_config.json`, where Ptah may keep a persistent `ptah`
 * entry (`PTAH_SPAWN_MCP_KEY`, harness sync) without the lane bearer; a
 * distinct name keeps the lane's own server from clashing with or being
 * shadowed by it. agy names the tools `mcp_ptah_lane_<tool>`.
 */
export const ANTIGRAVITY_ACP_PTAH_MCP_NAME = 'ptah_lane';

/**
 * Whether the session runs unattended: resolved yolo, or no permission with
 * auto-approve on. Only then does `agy acp` get
 * `--dangerously-skip-permissions`, and only then may the lane's headless
 * sink grant a `session/request_permission` (`plan` and `auto-edit` lanes
 * pass `autoApprove: false` from this rule, so they are refused, as the
 * stream-json lane never granted them).
 */
export function antigravitySkipsPermissions(
  options: Pick<AcpSessionOptions, 'permission' | 'autoApprove'>,
): boolean {
  if (options.permission === 'yolo') return true;
  return options.permission === undefined && options.autoApprove !== false;
}

/** ACP tool kinds that change nothing: granted in every narrower mode. */
const READ_ONLY_KINDS: ReadonlySet<string> = new Set([
  'read',
  'search',
  'fetch',
  'think',
]);

/**
 * Kinds each narrower lane permission grants on top of the read-only ones.
 * `plan` adds nothing (edits, deletes, moves, exec and `switch_mode`, which
 * would leave plan, stay refused); `auto-edit` adds file edits, as agy's
 * `accept-edits` mode does, and still refuses exec, deletes and moves.
 */
const EXTRA_KINDS: Readonly<Record<string, ReadonlySet<string>>> = {
  plan: new Set(),
  'auto-edit': new Set(['edit']),
};

/** A tool of the lane's own Ptah MCP server, as agy names it (`mcp_ptah_lane_<tool>`). */
const PTAH_LANE_TOOL = new RegExp(`^mcp_${ANTIGRAVITY_ACP_PTAH_MCP_NAME}_\\w+$`);
/** agy titles an MCP call `Run <tool name>`. */
const PTAH_LANE_TITLE = new RegExp(`^Run mcp_${ANTIGRAVITY_ACP_PTAH_MCP_NAME}_\\w+$`);

function recordField(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Whether the request is a call to the lane's own Ptah MCP server. agy sends
 * MCP calls with kind `other`, its own `name` field (`mcp_ptah_lane_<tool>`)
 * and the title `Run <name>`. A request of any mutating kind never counts.
 */
function isPtahLaneTool(toolCall: unknown): boolean {
  const kind = recordField(toolCall, 'kind');
  if (kind !== undefined && kind !== 'other') return false;
  const name = recordField(toolCall, 'name');
  if (typeof name === 'string') return PTAH_LANE_TOOL.test(name);
  const title = recordField(toolCall, 'title');
  return typeof title === 'string' && PTAH_LANE_TITLE.test(title);
}

/**
 * The headless grant of a `plan` or `auto-edit` lane (live F1). Read-only
 * kinds and the lane's own Ptah MCP tools, which enforce their own access,
 * are granted; `auto-edit` adds file edits. Everything else is refused, so
 * S1 holds: no exec, delete or move without yolo.
 */
export function antigravityGrantsWithoutAutoApprove(
  request: RequestPermissionRequest,
  options: Pick<AcpSessionOptions, 'permission'>,
): boolean {
  const extra = options.permission ? EXTRA_KINDS[options.permission] : undefined;
  if (!extra) return false;
  const toolCall = recordField(request, 'toolCall');
  const kind = recordField(toolCall, 'kind');
  if (typeof kind === 'string' && (READ_ONLY_KINDS.has(kind) || extra.has(kind))) {
    return true;
  }
  return isPtahLaneTool(toolCall);
}

function describeAntigravityError(
  failure: AcpRequestFailure,
): string | undefined {
  if (
    failure.code === JSONRPC_INVALID_PARAMS &&
    failure.method === 'session/set_config_option' &&
    failure.configId === 'model'
  ) {
    const detail = readAcpErrorDetail(failure.data);
    const model = String(failure.configValue ?? failure.options.model ?? '');
    const rejected = `Antigravity rejected model '${model}'${detail ? ` (${detail})` : ''}`;
    const available = failure.advertisedValues ?? [];
    return available.length > 0
      ? `${rejected}; available models: ${available.join(', ')}`
      : `${rejected}; run \`agy models\` to see the available models`;
  }
  return undefined;
}

export const antigravityAcpProfile: AcpVendorProfile = {
  vendor: 'antigravity',
  displayName: 'Antigravity',
  signInHint: SIGN_IN_HINT,
  cancelBehavior: 'await-reply',

  buildSpawn(options: AcpSessionOptions): AcpSpawnSpec {
    const windows = process.platform === 'win32';
    return {
      args: antigravitySkipsPermissions(options)
        ? ['acp', '--dangerously-skip-permissions']
        : ['acp'],
      ...(windows
        ? {
            env: { mode: 'merge' as const, set: { NODE_PTY_USE_CONPTY: '0' } },
            needsConsole: true,
          }
        : {}),
    };
  },

  /**
   * The caller builds the Ptah MCP attachment (scoped URL plus the lane's
   * bearer); agy takes it as an ACP `http` entry (D9), named
   * {@link ANTIGRAVITY_ACP_PTAH_MCP_NAME}.
   */
  buildMcpServers(options: AcpSessionOptions): readonly McpServer[] {
    return (options.mcp ?? []).map((attachment) => ({
      type: 'http' as const,
      // The attachment is always Ptah's (`ProviderMcpAttachment.name: 'ptah'`).
      name: ANTIGRAVITY_ACP_PTAH_MCP_NAME,
      url: attachment.url,
      headers: attachment.headers.map((header) => ({
        name: header.name,
        value: header.value,
      })),
    }));
  },

  modeFor(options: AcpSessionOptions): string | undefined {
    return options.permission ? MODES[options.permission] : undefined;
  },

  sessionConfig(options: AcpSessionOptions): readonly AcpSessionConfigEntry[] {
    const entries: AcpSessionConfigEntry[] = [];
    if (options.model) {
      // Binding: a model agy rejects fails the turn instead of silently
      // running the lane on another model.
      entries.push({ configId: 'model', value: options.model, binding: true });
    }
    const level = options.reasoningEffort
      ? THOUGHT_LEVELS[options.reasoningEffort]
      : undefined;
    if (level && !(options.model && MODEL_EFFORT_SUFFIX.test(options.model))) {
      entries.push({ configId: 'thought_level', value: level });
    }
    return entries;
  },

  grantsWithoutAutoApprove: antigravityGrantsWithoutAutoApprove,

  describeError: describeAntigravityError,
};
