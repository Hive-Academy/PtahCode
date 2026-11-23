/**
 * AntigravityAcpProfile — the vendor data the ACP runner needs to drive
 * `agy acp` (Antigravity CLI >= 1.5.1), TASK_2026_2291 (P3).
 *
 * Measured against agy 1.5.13 (preflight PF-3/PF-4, the `antigravity-*`
 * fixtures and the P3 live run):
 * - argv is `acp`. No isolation flag (D10): the lane runs on the user's
 *   shared, signed-in profile (default `--app-data-dir`). An unattended lane
 *   (resolved yolo, or no permission with auto-approve on) adds
 *   `--dangerously-skip-permissions`, and every lane adds
 *   `--add-dir <workingDirectory>`, as the stream-json lane does
 *   (`agy acp --help` 1.5.14 lists both).
 * - Windows: `NODE_PTY_USE_CONPTY=0` and a hidden console, the same as the
 *   stream-json lane; agy's shell tool runs through a pty.
 * - Instructions: `session/new` `_meta.antigravity.systemPrompt.append`
 *   when `initialize` advertises that hook ({@link antigravityInstructionsMeta});
 *   not re-sent on restore (`instructionsOnRestore: 'none'`): agy stores the
 *   append with the conversation and keeps it across a process restart and
 *   `session/resume` or `session/load` (TASK_2026_2301 S2 live probe, 1.5.14).
 * - Ptah MCP (D9): an ACP `http` entry with the lane bearer. agy advertises no
 *   `mcpCapabilities`, yet it connects to the entry, sends the header, lists
 *   the tools (`mcp_<server>_<tool>`) and calls them; it writes nothing to
 *   `~/.gemini/config/mcp_config.json` (P3 live run).
 * - No `authenticate` on the shared profile (PF-4: `session/new` succeeds
 *   without it); a signed-out profile gets the sign-in hint.
 * - Modes (`session/new.modes`): plan -> `plan`, auto-edit -> `accept-edits`,
 *   ask -> `default` (lane) or `plan` (chat, see {@link ANTIGRAVITY_CHAT_ASK_MODE};
 *   re-set before every chat prompt), yolo -> `auto`.
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
  InitializeResponse,
  McpServer,
  RequestPermissionRequest,
} from '@agentclientprotocol/sdk';
import { toAcpMcpServer } from '../acp-mcp-servers';
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
 * The agy mode of a chat session whose Ptah permission is `ask` ("Manual").
 *
 * Ptah's Manual means no file write and no command runs without the user's
 * approval, as Claude's `ask` does. agy 1.5.14 has no ACP mode or config
 * option for that: `session/new` advertises only `default`, `accept-edits`,
 * `auto` and `plan` (plus the `model`, `thought_level` and `mode` config
 * options), and `default` is "Ask before edits and commands, per your
 * permission settings", i.e. the user's global agy Tool Permission
 * (`always-proceed`, `request-review`, `strict`, `proceed-in-sandbox` in
 * `settings.json` `toolPermission`). Under the stock setting `default` wrote a
 * workspace file with no `session/request_permission` (live test, 2026-11-21),
 * and only `strict` makes agy ask before every edit. The `_meta.antigravity`
 * hook takes only `systemPrompt`, so Ptah cannot set `strict` per session
 * without writing the user's global agy settings.
 *
 * So a Manual chat runs in `plan`, agy's read-only mode: it researches and
 * plans, and changes nothing unless the user approves its request to leave
 * plan mode (a `switch_mode` permission request, shown as an approval card
 * titled {@link ANTIGRAVITY_PLAN_EXIT_TITLE}). After that approval agy runs in
 * `default` and its in-workspace edits are no longer asked one by one, so the
 * approval covers only the turn it was given in: every prompt starts in
 * `plan` again ({@link AcpVendorProfile.turnStartMode}), and a prompt is not
 * sent when agy refuses the switch back. Auto-edit and yolo keep their modes.
 * A lane keeps `default` (headless; it has no user to ask).
 */
export const ANTIGRAVITY_CHAT_ASK_MODE = 'plan';

/** The approval card title of agy's request to leave plan mode in a Manual chat. */
export const ANTIGRAVITY_PLAN_EXIT_TITLE =
  'Leave plan mode and carry out the plan. Approving lets Antigravity edit files ' +
  'and run commands for the rest of this turn without asking for each one. ' +
  'Your next message starts in plan mode again.';

/** Whether these options are a Manual chat, which runs agy in plan mode. */
function isManualChat(
  options: Pick<AcpSessionOptions, 'permission' | 'consumer'>,
): boolean {
  return options.consumer === 'chat' && options.permission === 'ask';
}

/**
 * The ACP server name of the Ptah MCP attachment. agy also loads the shared
 * `~/.gemini/config/mcp_config.json`. Ptah no longer keeps a persistent `ptah`
 * entry there (TASK_2026_2297), but a user's own server or an older Ptah's
 * leftover may still use that key; a distinct name keeps the lane's own
 * server from clashing with or being shadowed by it. agy names the tools
 * `mcp_ptah_lane_<tool>`.
 */
export const ANTIGRAVITY_ACP_PTAH_MCP_NAME = 'ptah_lane';

/** What agy puts in front of each Ptah MCP tool name (`mcp_<server>_<tool>`). */
export const ANTIGRAVITY_ACP_PTAH_MCP_TOOL_PREFIX = `mcp_${ANTIGRAVITY_ACP_PTAH_MCP_NAME}_`;

/**
 * Whether the session runs unattended: resolved yolo, or no permission with
 * auto-approve on. Only then does `agy acp` get
 * `--dangerously-skip-permissions`, and only then may the lane's headless
 * sink grant a `session/request_permission` (`plan` and `auto-edit` lanes
 * pass `autoApprove: false` from this rule, so they are refused, as the
 * stream-json lane never granted them).
 */
export function antigravitySkipsPermissions(
  options: Pick<AcpSessionOptions, 'permission' | 'autoApprove' | 'consumer'>,
): boolean {
  // A chat runs yolo as agy's `auto` mode and asks the rest through its sink.
  if (options.consumer === 'chat') return false;
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
const PTAH_LANE_TOOL = new RegExp(`^${ANTIGRAVITY_ACP_PTAH_MCP_TOOL_PREFIX}\\w+$`);
/** agy titles an MCP call `Run <tool name>`. */
const PTAH_LANE_TITLE = new RegExp(`^Run ${ANTIGRAVITY_ACP_PTAH_MCP_TOOL_PREFIX}\\w+$`);

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

/** The name the caller gives Ptah's own MCP attachment. */
const PTAH_MCP_ATTACHMENT_NAME = 'ptah';

/**
 * agy's system-prompt hook: `initialize` advertises
 * `agentCapabilities._meta.antigravity.systemPrompt.append: true`
 * (`antigravity-p2-handshake.ndjson`), and `session/new` then takes
 * `_meta.antigravity.systemPrompt.append: "<text>"`, appended to agy's own
 * system prompt. agy 1.5.14 logs "Ignoring invalid systemPrompt in
 * _meta.antigravity: 'append' key must be a string" for any other shape, so
 * the value is always the string. Without the advertisement the runtime
 * falls back to the prompt prefix.
 */
export function antigravityInstructionsMeta(
  instructions: string,
  init: InitializeResponse,
): Record<string, unknown> | undefined {
  const vendor = recordField(init.agentCapabilities?._meta, 'antigravity');
  const systemPrompt = recordField(vendor, 'systemPrompt');
  if (recordField(systemPrompt, 'append') !== true) return undefined;
  return { antigravity: { systemPrompt: { append: instructions } } };
}

export const antigravityAcpProfile: AcpVendorProfile = {
  vendor: 'antigravity',
  displayName: 'Antigravity',
  signInHint: SIGN_IN_HINT,
  cancelBehavior: 'await-reply',

  buildSpawn(options: AcpSessionOptions): AcpSpawnSpec {
    const windows = process.platform === 'win32';
    return {
      args: [
        'acp',
        ...(antigravitySkipsPermissions(options)
          ? ['--dangerously-skip-permissions']
          : []),
        ...(options.workingDirectory
          ? ['--add-dir', options.workingDirectory]
          : []),
      ],
      ...(windows
        ? {
            env: { mode: 'merge' as const, set: { NODE_PTY_USE_CONPTY: '0' } },
            needsConsole: true,
          }
        : {}),
    };
  },

  /**
   * The caller builds the attachments: Ptah's own server (scoped URL plus the
   * session bearer, name `ptah`), which agy takes as an ACP `http` entry (D9)
   * named {@link ANTIGRAVITY_ACP_PTAH_MCP_NAME}, and the user's servers
   * (`http`, `sse` or `stdio`), which keep their configured names. A user
   * server named {@link ANTIGRAVITY_ACP_PTAH_MCP_NAME} is dropped: it would
   * collide with Ptah's own entry and take over its `mcp_ptah_lane_` tools,
   * which the plan and auto-edit grants trust.
   */
  buildMcpServers(options: AcpSessionOptions): readonly McpServer[] {
    return (options.mcp ?? [])
      .filter((attachment) => attachment.name !== ANTIGRAVITY_ACP_PTAH_MCP_NAME)
      .map((attachment) =>
        toAcpMcpServer(
          attachment,
          attachment.name === PTAH_MCP_ATTACHMENT_NAME
            ? ANTIGRAVITY_ACP_PTAH_MCP_NAME
            : attachment.name,
        ),
      );
  },

  instructionsMeta: antigravityInstructionsMeta,
  // agy keeps the `session/new` append across a restart with
  // `session/resume` or `session/load` (TASK_2026_2301 S2 live probe,
  // 1.5.14); 'meta' would append the instructions a second time.
  instructionsOnRestore: 'none',

  modeFor(options: AcpSessionOptions): string | undefined {
    if (!options.permission) return undefined;
    if (isManualChat(options)) return ANTIGRAVITY_CHAT_ASK_MODE;
    return MODES[options.permission];
  },

  turnStartMode(options: AcpSessionOptions): string | undefined {
    return isManualChat(options) ? ANTIGRAVITY_CHAT_ASK_MODE : undefined;
  },

  approvalTitle(
    request: RequestPermissionRequest,
    options: AcpSessionOptions,
  ): string | undefined {
    if (!isManualChat(options)) return undefined;
    const kind = recordField(recordField(request, 'toolCall'), 'kind');
    return kind === 'switch_mode' ? ANTIGRAVITY_PLAN_EXIT_TITLE : undefined;
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
