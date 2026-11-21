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
import type { McpServer } from '@agentclientprotocol/sdk';
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

/** Whether the lane runs unattended: every tool approval is granted. */
function skipsPermissions(options: AcpSessionOptions): boolean {
  if (options.permission === 'yolo') return true;
  return options.permission === undefined && options.autoApprove !== false;
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
      args: skipsPermissions(options)
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
   * bearer); agy takes it as an ACP `http` entry (D9).
   */
  buildMcpServers(options: AcpSessionOptions): readonly McpServer[] {
    return (options.mcp ?? []).map((attachment) => ({
      type: 'http' as const,
      name: attachment.name,
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

  describeError: describeAntigravityError,
};
