/**
 * SubagentBudgetMonitor — hands a Task subagent off before it grows too large
 * (TASK_2026_597 A5, component 19; addendum component 10 parts 10.1 and 10.2).
 *
 * Fed with the subagent assistant messages the parent stream forwards (each
 * carries the spawning Task `parent_tool_use_id` and the request `usage`,
 * AS10), it keeps per subagent:
 *
 * - `contextTokens`: the last request's input + cache read + cache write.
 * - `weightedUsed`: the running total evaluated by the shared AgentBudgetPolicy,
 *   including its raw-token floor and catalog pricing when available.
 *
 * Cooperative admission, latched per subagent and moving only forward
 * (`running` -> `asked-handoff` -> `paused`), decided by
 * `AgentBudgetPolicy.assessAdmission` after each counted request, on a missing
 * telemetry turn, and from the duration timer:
 *
 * - `asked-handoff`: the subagent is asked once, on its own next tool result
 *   (`SubagentNoticeQueue`, keyed by the SDK agent id of its registry record),
 *   to write its handoff notes (writable role) or return its report (read-only
 *   role), and then to return normally.
 * - `paused`: the notes gate denies new work tools and the parent gets one notice.
 *
 * A successful Agent result paired with its stop hook, or a completed SDK task
 * notification, confirms normal return and allows the monitor to publish the handoff.
 *
 * Handoff record ({@link SubagentHandoffRecords}): `.ptah/subagent-handoffs/` in
 * the session workspace, `status: pending` until the parent resolves it.
 * The finalizer retries record writes up to {@link MAX_RECORD_ATTEMPTS} times.
 *
 * Admission uses the registry's agent id or the task id correlated to a
 * held foreground start in the same session. Tool admission reconciles a
 * pending phase when the id arrives after the budget signal.
 */
import { SubagentContextLimits, effectiveBudgetReached, type SubagentContextState } from './subagent-context-limit';
import { guardSuccessor, readPredecessor, successorLineage, renderLineage, moveLineageWarning } from './subagent-successor-lineage';
import type { ContextCapacityRoute } from '@ptah-extension/shared';
import type {
  Logger,
  SubagentRegistryService,
} from '@ptah-extension/vscode-core';
import {
  AgentBudgetPolicy,
  formatBudgetAskReadOnly,
  formatBudgetAskWritable,
  formatBudgetPauseNotice,
  formatBudgetAskNotice,
  formatHandoffNormalReturn,
  formatHandoffNotesDelay,
  formatHandoffRecordFailure,
  initialAgentBudgetSnapshot,
  type AgentActionNotice,
  type AgentAdmissionAssessment,
  type AgentAdmissionPhase,
  type AgentBudgetSnapshot,
  type AgentBudgetSettings,
} from '@ptah-extension/shared';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import type { SubagentBudgetStopCallbackRegistry } from '../subagent-budget-stop-callback-registry';
import type { CompactionConfigProvider } from '../compaction-config-provider';
import {
  prepareHandoffFiles,
  type SubagentHandoffFiles,
  type SubagentHandoffPaths,
} from './subagent-handoff-files';
import {
  handoffMessage,
  type HandoffSubject,
  type HandoffUsage,
  type HandoffProgress,
  type StopReason,
} from './subagent-handoff-message';
import {
  SubagentHandoffDelivery,
  type Handoff,
  type HandoffDeliveryPort,
} from './subagent-handoff-delivery';
import {
  ownerHash,
  type SubagentHandoffRecords,
} from './subagent-handoff-record';
import type { SubagentHandoffIndex } from './subagent-handoff-index';
import { SubagentStopNotices } from './subagent-stop-notices';
import { countSubagentUsage, trackSubagentRequest } from './subagent-request-accounting';
import type { SubagentStopCause } from './subagent-stop-cause';
import { parseSubagentDeliverables, SubagentDeliverables } from './subagent-deliverables';
import { SubagentNotesWarnings } from './subagent-notes-warnings';
import { SubagentNotesGate } from './subagent-notes-gate';
import { scopedAgentKey, scopedKeysOfAgent } from './subagent-scope-key';

/** The handoff file operations the monitor uses. */
export type SubagentHandoffFilesPort = Pick<
  SubagentHandoffFiles,
  'paths' | 'saveTask' | 'notesExist' | 'redactNotes'
> & Partial<Pick<SubagentHandoffFiles, 'ensureFallbackNotes'>>;

/** The handoff record operations the monitor uses. */
export type SubagentHandoffRecordsPort = Pick<
  SubagentHandoffRecords,
  | 'workspaceOf'
  | 'writeOnce'
  | 'markInvoked'
  | 'withdraw'
  | 'disposeUnsafe'
  | 'markScrubbed'
  | 'publishIfOwned'
  | 'forget'
  | 'writeStub'
>;

/** The handoff record index operations the monitor uses. */
export type SubagentHandoffIndexPort = Pick<
  SubagentHandoffIndex,
  'publish' | 'forgetCursor' | 'pointerFor'
>;

/** Token usage of one model request, as the subagent message reports it. */
export interface SubagentRequestUsage {
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  readonly providerCostUsd?: number;
}

/** What the monitor knows about one subagent. */
export interface SubagentBudgetSnapshot {
  readonly contextTokens: number;
  readonly weightedUsed: number;
  /** The monitor stopped this subagent (handoff or safety stop). */
  readonly stopped: boolean;
  /** Raw or weighted usage reached the configured budget stop. */
  readonly budgetReached: boolean;
}

/** Read-only stop identity for the parent and direct SendMessage gate. */
export interface AgentBudgetState {
  readonly contextTokens: number | null;
  readonly handoffTokens: number;
  readonly warningRatio: number;
  readonly warned?: boolean;
  /** A live agent may receive steering messages even near the limit. */
  readonly running?: boolean;
  readonly stopState: 'none' | 'pending' | 'stopped';
  readonly sdkOutcome?: 'stopped' | 'failed';
  readonly stopped: boolean;
  readonly stopReason?: StopReason;
  readonly recordPath?: string;
  /** Latched admission phase of a live agent; `paused` never reads as `stopped`. */
  readonly admission?: AgentAdmissionPhase;
  readonly lifecycle?: 'running' | 'asked' | 'paused' | 'finalizing' | 'settled' | 'stopped';
  readonly pauseNotice?: AgentActionNotice;
}

/** Handoff record writes per returning subagent before the handoff travels in memory only. */
export const MAX_RECORD_ATTEMPTS = 3;
/** Backoff unit between record-write attempts of a returning agent's handoff. */
const RECORD_RETRY_DELAY_MS = 200;
/** The overdue-handoff check runs this often while an agent is gated (one timer in total). */
const GATE_NOTICE_POLL_MS = 30_000;
const TRANSCRIPT_MISS_TTL_MS = 5_000;
/** Tools that spawn a subagent (`Task` is the SDK's earlier name for `Agent`). */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['Agent', 'Task']);
/**
 * Roles known to run without write tools. A role that is absent from the registry
 * and `task_started` is treated as read-only too: recovery never adds write rights.
 */
const READ_ONLY_AGENT_TYPES: ReadonlySet<string> = new Set(['explore', 'plan', 'web-fetch']);
const ADMISSION_RANK: Readonly<Record<AgentAdmissionPhase, number>> = { running: 0, 'asked-handoff': 1, paused: 2 };
/** Longest delay `setTimeout` accepts. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;
/** Prompt characters the handoff restates; the full prompt is in the transcript. */
const TASK_PROMPT_EXCERPT_CHARS = 300;

type JsonObject = Record<string, unknown>;

function stoppedIdentityKey(sessionId: string, identity: string): string {
  return JSON.stringify([sessionId, identity]);
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function credentialNameStrength(name: string): 'strong' | 'weak' | undefined {
  if (/^(?:key|token)$/i.test(name)) return 'weak';
  const segments = name.split(/[_.-]/);
  const lastSegment = segments.at(-1);
  const envSuffix = /^[A-Z0-9_]+$/.test(name) && /^(?:BASE|VALUE|PROD)$/.test(lastSegment ?? '')
    && /^(?:KEY|SECRET|TOKEN|PASSWORD)$/.test(segments.at(-2) ?? '');
  if (/^(?:password|passwd|secret|api[_-]?key|client_secret|access_token|refresh_token|private_key|credentials?)$/i.test(name)
    || (name.includes('_') || name.includes('-') || name.includes('.'))
      && /^(?:KEY|SECRET|TOKEN|PASSWORD)$/i.test(lastSegment ?? '')
    || envSuffix
    || /(?:Token|Secret|Password|Credential|Credentials)$/.test(name)
    || /^(?:api|access|private|secret|encryption|signing|auth|master)Key$/.test(name)
    || /^(?:SECRETKEY|ACCESSKEY|PRIVATEKEY|DBPASSWORD)$/.test(name)) return 'strong';
  return undefined;
}

function redactedAssignment(name: string, token: string): boolean {
  const strength = credentialNameStrength(name);
  if (!strength) return false;
  const quoted = /^["']/.test(token);
  return strength === 'strong'
    ? quoted || token.length >= 6
    : quoted || (token.length >= 6 && /[0-9._~+/-]/.test(token));
}

/** Match assignment names without consuming the next assignment as a prose value. */
function redactNamedAssignments(value: string): string {
  const names = /(?<![A-Za-z0-9_.-])([A-Za-z][A-Za-z0-9_.-]*)[ \t]*[:=][ \t]*/gm;
  const values = /"[^"]*"|'[^']*'|[^\s,;]+/y;
  let result = '';
  let cursor = 0;
  for (const match of value.matchAll(names)) {
    const start = match.index;
    if (start < cursor || !credentialNameStrength(match[1])) continue;
    const valueStart = start + match[0].length;
    values.lastIndex = valueStart;
    const token = values.exec(value)?.[0];
    if (!token || !redactedAssignment(match[1], token)) continue;
    const quote = /^["']/.test(token) ? token[0] : '';
    result += value.slice(cursor, valueStart) + `${quote}[redacted]${quote}`;
    cursor = valueStart + token.length;
  }
  return result + value.slice(cursor);
}

function redactCliFlags(value: string): string {
  return value.replace(/(^|[ \t(])(--)(?:([a-z0-9][a-z0-9_-]*(?:password|token|secret|auth[-_]?token|api[-_]?key|private[-_]?key|secret[-_]?key|access[-_]?key|encryption[-_]?key|signing[-_]?key|auth[-_]?key|master[-_]?key))|(password|token|secret|api[-_]?key|private[-_]?key|secret[-_]?key|access[-_]?key|encryption[-_]?key|signing[-_]?key|auth[-_]?key|master[-_]?key|pass))(=[ \t]*|[ \t]+)("[^"]*"|'[^']*'|[^\s,;]+)/gim,
    (match, prefix: string, dashes: string, compound: string | undefined, simple: string | undefined, separator: string, token: string) => {
      const quote = /^["']/.test(token) ? token[0] : '';
      return `${prefix}${dashes}${compound ?? simple}${separator}${quote}[redacted]${quote}`;
    });
}

function redactMarkdownLabels(value: string): string {
  return value.replace(/(?<![A-Za-z0-9_])(\*{1,2}|_{1,2})(password|passwd|secret|token|key|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)(:?)\1(:?)([ \t]*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    (match, marker: string, name: string, innerColon: string, outerColon: string, space: string, token: string) => {
      if ((!innerColon && !outerColon) ||
        !(redactedAssignment(name, token) || (name.toLowerCase() === 'token' && token.length >= 6))) return match;
      const quote = /^["']/.test(token) ? token[0] : '';
      return `${marker}${name}${innerColon}${marker}${outerColon}${space}${quote}[redacted]${quote}`;
    });
}

/** Keep a useful excerpt while removing common credential forms from persisted prose. */
export function redactBudgetSecrets(value: string): string {
  const redacted = value
    .replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g, '[redacted private key]')
    .replace(/(Authorization["']?\s*:\s*["']?\s*Basic\s+)([A-Za-z0-9._~+/-]+={0,2})(?![A-Za-z0-9._~+/=-])/gi, '$1[redacted]')
    .replace(/(\b(?:Bearer|Basic)\s+)([A-Za-z0-9._~+/-]+={0,2})(?![A-Za-z0-9._~+/=-])/gi,
      (match, prefix: string, token: string) =>
        token.length >= 20 || /[0-9+/=._~-]/.test(token) ? `${prefix}[redacted]` : match)
    .replace(/(:\/\/[^\s:/@]+:)[^\s@]+(@)/g, '$1[redacted]$2')
    .replace(/(["'])([A-Za-z][A-Za-z0-9_.-]*)\1\s*:\s*(["'])([^"']+)\3/g,
      (match, quote: string, name: string, valueQuote: string, token: string) =>
        redactedAssignment(name, `${valueQuote}${token}${valueQuote}`)
          ? `${quote}${name}${quote}: ${valueQuote}[redacted]${valueQuote}` : match)
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[bp]-[A-Za-z0-9-]{12,})\b/g, '[redacted]');
  return redactNamedAssignments(redactMarkdownLabels(redactCliFlags(redacted)));
}

function safeProgressText(value: string): string {
  return redactBudgetSecrets(value).slice(-2000);
}

/** Accept only an existing agent JSONL under the expected SDK session directory. */
export async function resolveSubagentTranscriptPath(
  homeDir: string, workspace: string, sessionId: string, agentId: string,
  supplied?: string,
): Promise<string | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId) || !/^[A-Za-z0-9_-]+$/.test(agentId)) return undefined;
  const slug = path.resolve(workspace).replace(/[^A-Za-z0-9]/g, '-');
  const expected = path.join(homeDir, '.claude', 'projects', slug, sessionId, 'subagents');
  const fileName = `agent-${agentId}.jsonl`;
  let allowedRoot: string;
  try {
    allowedRoot = await fs.realpath(path.join(homeDir, '.claude', 'projects'));
  } catch {
    // degradation-audit: optional-capability - an unavailable transcript is represented as unknown.
    return undefined;
  }
  const validFile = async (candidate: string): Promise<{ path: string; mtimeMs: number } | undefined> => {
    if (candidate.split(/[\\/]/).includes('..') || path.basename(candidate) !== fileName) return undefined;
    try {
      const realDirectory = await fs.realpath(path.dirname(candidate));
      if (!realDirectory.startsWith(`${allowedRoot}${path.sep}`)) return undefined;
      const realFile = await fs.realpath(candidate);
      if (path.dirname(realFile) !== realDirectory) return undefined;
      const stat = await fs.stat(realFile);
      return stat.isFile() ? { path: realFile, mtimeMs: stat.mtimeMs } : undefined;
    } catch {
      // degradation-audit: optional-capability - a missing transcript is represented as unknown.
      return undefined;
    }
  };
  if (supplied) return (await validFile(supplied))?.path;
  const current = await validFile(path.join(expected, fileName));
  if (current) return current.path;
  let projects: string[];
  try {
    projects = (await fs.readdir(allowedRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== slug)
      .map((entry) => entry.name);
  } catch {
    // degradation-audit: optional-capability - the current-project path was already checked.
    return undefined;
  }
  let newest: { path: string; mtimeMs: number } | undefined;
  for (const project of projects) {
    const candidate = await validFile(path.join(allowedRoot, project, sessionId, 'subagents', fileName));
    if (candidate && (!newest || candidate.mtimeMs > newest.mtimeMs ||
      (candidate.mtimeMs === newest.mtimeMs && candidate.path < newest.path))) newest = candidate;
  }
  return newest?.path;
}

/**
 * Read the request usage from a subagent assistant message (the SDK stream
 * message or a persisted transcript line: both carry `message.usage`).
 * Returns `undefined` when the message has no usable usage block.
 */
export function readSubagentRequestUsage(
  raw: unknown,
): SubagentRequestUsage | undefined {
  const usage = asObject(asObject(asObject(raw)?.['message'])?.['usage']);
  if (!usage) {
    return undefined;
  }
  const inputTokens = tokenCount(usage['input_tokens']);
  const outputTokens = tokenCount(usage['output_tokens']);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  const cacheReadTokens = tokenCount(usage['cache_read_input_tokens']) ?? 0;
  const cacheWriteTokens =
    tokenCount(usage['cache_creation_input_tokens']) ?? 0;
  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    ...(typeof usage['cost_usd'] === 'number' && Number.isFinite(usage['cost_usd']) && usage['cost_usd'] >= 0
      ? { providerCostUsd: usage['cost_usd'] } : {}),
  };
}

/** Context size of one request: input + cache read + cache write. */
export function requestContextTokens(usage: SubagentRequestUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}


/**
 * The task a spawning `Agent`/`Task` `tool_use` input describes: its
 * `description`, then the first {@link TASK_PROMPT_EXCERPT_CHARS} characters
 * of its `prompt`. `undefined` when the input carries neither.
 */
export function readSubagentTaskText(input: unknown): string | undefined {
  const fields = asObject(input);
  const rawDescription = fields?.['description'];
  const rawPrompt = fields?.['prompt'];
  const description =
    typeof rawDescription === 'string' ? rawDescription.trim() : '';
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  const excerpt =
    prompt.length > TASK_PROMPT_EXCERPT_CHARS
      ? `${prompt.slice(0, TASK_PROMPT_EXCERPT_CHARS)}...`
      : prompt;
  if (description && excerpt) {
    return `${description}: ${excerpt}`;
  }
  return description || excerpt || undefined;
}

interface SubagentState extends SubagentContextState {
  generation: number;
  contextTokens: number;
  weightedUsed: number;
  policySnapshot: AgentBudgetSnapshot;
  startedAt: number;
  deadlineTimer?: ReturnType<typeof setTimeout>;
  costUnavailableLogged: boolean;
  telemetryUnavailableLogged: boolean;
  /** First-seen positions of SDK requests, including requests without usage. */
  requestOrder: Map<string, number>;
  lastResolvedRequest: number;
  /** API message id of the last request counted, and its weighted share. */
  lastMessageId?: string;
  lastWeighted: number;
  lastRaw: number;
  /**
   * Legacy names kept for the shared usage accounting: `stopFired` is set once the
   * handoff finalization finished and `stopInFlight` while it runs (nothing is stopped).
   */
  stopFired: boolean;
  progressCaptureErrorLogged?: boolean;
  stopInFlight: boolean;
  stopHookSeen?: boolean;
  foregroundReturned?: boolean;
  sdkOutcome?: AgentBudgetState['sdkOutcome'];
  stopState: 'none' | 'pending' | 'stopped';
  /** Latched admission phase; only moves forward. */
  admission: AgentAdmissionPhase;
  /** The assessments that moved the phase (`asked` is also set on a jump to `paused`). */
  admissionReasons: { asked?: AgentAdmissionAssessment; paused?: AgentAdmissionAssessment };
  /** Highest phase already enacted (gate entered, notices posted). */
  admissionEnacted: AgentAdmissionPhase;
  admissionDeferredLogged: boolean;
  /** API message id of the request whose record write last failed; its other blocks do not retry. */
  failedAttemptMessageId?: string;
  /** Handoff records that could not be saved for a handoff stop. */
  recordFailures: number;
  /** {@link MAX_RECORD_ATTEMPTS} record writes failed: no handoff stop, only the safety stop. */
  recordGaveUp: boolean;
  /** The handoff built for a stop that was invoked; a stop retry reuses it (no second write). */
  prepared?: PreparedHandoff;
  stopped: boolean;
  /** The handoff waiting in the notice queue for the spawning tool result. */
  pendingNotice?: { readonly sessionId: string; readonly handoff: Handoff };
  handoffDelivered?: boolean;
  /** SDK agent id the handoff ask was enacted for; set at most once. */
  warnedAgentId?: string;
  /** One ask per running invocation; reset when a new task starts. */
  warnedTaskId?: string;
  stopReason?: StopReason;
  stopCause?: SubagentStopCause;
  stoppedTaskId?: string;
  stoppedAgentId?: string;
  stoppedTeammateName?: string;
  stoppedUsage?: HandoffUsage;
  stoppedRecordPath?: string;
  lastAssistantText?: string;
  readonly filePaths: string[];
  readonly toolCalls: Array<{ name: string; targetPath?: string; outcome: 'started' | 'completed' | 'failed'; id?: string }>;
  transcriptPath?: string;
  terminalOutputFile?: string;
  /** Handoff paths the warning named; the stop names the same ones. */
  handoffPaths?: SubagentHandoffPaths;
}

/** A handoff record on disk. */
interface SavedRecord {
  readonly path: string;
  readonly workspace: string;
  readonly name: string;
}

/** The handoff of a stop and its record (absent: a safety stop whose write failed). */
interface PreparedHandoff {
  readonly record?: SavedRecord;
  readonly handoff: Handoff;
  readonly notesPathToRedact?: SubagentHandoffPaths;
  readonly usage?: HandoffUsage;
}

/** What the SDK's `task_started` message reported for one spawning tool_use. */
interface StartedTask {
  readonly taskId: string;
  readonly runId?: string;
  readonly background?: boolean;
  readonly subagentType?: string;
}

/** What a spawning `Agent`/`Task` tool_use input says about its subagent. */
interface SpawnTask {
  readonly deliverables?: readonly string[];
  readonly startedAt?: number;
  /** Description and prompt excerpt ({@link readSubagentTaskText}). */
  readonly text?: string;
  /** The full prompt, saved to the task file at a stop. */
  readonly prompt?: string;
  /** The `name` input: the teammate name a fresh subagent reuses. */
  readonly name?: string;
  /** The `output_file:` its spawning tool result named (background subagent). */
  readonly outputFile?: string;
  readonly background?: boolean;
}

interface SessionState {
  /** Current id of the session; moves on {@link SubagentBudgetMonitor.rekey}. */
  sessionId: string;
  readonly subagents: Map<string, SubagentState>;
  /** Task per spawning `Agent`/`Task` tool_use id. */
  readonly tasks: Map<string, SpawnTask>;
  /** SDK task per spawning tool_use id, from `task_started`. */
  readonly startedTasks: Map<string, StartedTask>;
  /**
   * Per spawning tool_use id (an `Agent`/`Task` tool_use or a `task_started`):
   * whether its tool result has reached the main thread.
   */
  readonly spawnReturned: Map<string, boolean>;
  /** Set when a rekey merged this record into another; a stop in flight follows it. */
  mergedInto?: SessionState;
}

/**
 * The dispatcher and main-thread notice queue operations the monitor uses.
 * `pushParentMessage` streams a user turn; the two main-thread notice
 * operations bind to `MainThreadNoticeQueue.post` and `.withdraw`.
 */
export interface SubagentBudgetDispatcherPort
  extends HandoffDeliveryPort {
  /** Take back a queued notice; `true` when it was still pending. */
  withdrawMainThreadNotice(sessionId: string, text: string): boolean;
  /** Queue a notice for the subagent's own next tool result (`SubagentNoticeQueue`). */
  postSubagentNotice(agentId: string, text: string): void;
  /** Drop the subagent's pending notice. */
  withdrawSubagentNotice(agentId: string): void;
  /**
   * Show the subagent's current ask or pause to the person (TASK_2026_2310); `null` clears it.
   * Informational only: it never stops the subagent. Optional so a host without a UI omits it.
   */
  announceSubagentNotice?(sessionId: string, agentId: string, notice: AgentActionNotice | null, text: string): void;
}

/**
 * A plain class built by a factory in `registerSdkServices`, not `useClass`:
 * `SessionLifecycleManager` injects this monitor, and the dispatcher depends
 * back on `SessionLifecycleManager`. The factory hands in a narrow dispatcher
 * port resolved on first use, which breaks that construction cycle.
 *
 * The monitor never stops a subagent. Crossing a threshold asks the agent to
 * write handoff notes; at twice the ceiling the monitor pauses new tool calls.
 * The agent ends only by returning normally (SDK `SubagentStop`), which runs
 * {@link SubagentBudgetMonitor.finishWarnedAgent}. When the record write
 * fails, the handoff travels only through the in-memory send, so it is lost
 * only if both the disk write and that send fail.
 */
export class SubagentBudgetMonitor {
  private readonly contextLimits = new SubagentContextLimits();
  private readonly notesGate = new SubagentNotesGate();
  private readonly notesWarnings = new SubagentNotesWarnings();
  private readonly deliverables = new SubagentDeliverables();
  private gateTimer?: ReturnType<typeof setTimeout>;
  private readonly sessions = new Map<string, SessionState>();
  /** Bounded stop identities survive registry removal and session release. */
  private readonly stoppedByIdentity = new Map<string, AgentBudgetState>();
  private readonly transcriptLookup = new Map<string, { path?: string; expiresAt: number }>();
  /** Old id → new id, one entry per PostCompact rekey; cleared on release. */
  private readonly aliases = new Map<string, string>();
  private readonly delivery: SubagentHandoffDelivery;

  constructor(
    private readonly logger: Logger,
    private readonly config: CompactionConfigProvider,
    private readonly dispatcher: SubagentBudgetDispatcherPort,
    private readonly registry: SubagentRegistryService,
    private readonly handoffFiles: SubagentHandoffFilesPort,
    private readonly records: SubagentHandoffRecordsPort,
    private readonly index: SubagentHandoffIndexPort,
    private readonly budgetStopCallbacks: SubagentBudgetStopCallbackRegistry,
    private readonly stopNotices: SubagentStopNotices,
    private readonly lookupTranscript: typeof resolveSubagentTranscriptPath = resolveSubagentTranscriptPath,
  ) {
    this.delivery = new SubagentHandoffDelivery(logger, dispatcher, (id) => {
      const current = this.currentSessionId(id);
      return this.sessions.has(current) ? current : undefined;
    });
  }

  /**
   * Observe one forwarded stream message of `sessionId`. An assistant message
   * that spawns a subagent (an `Agent`/`Task` `tool_use`) records the task
   * text for the handoff. A main-thread user message with `tool_result`
   * blocks marks the spawning calls it answers as returned, and delivers a
   * handoff still waiting in the notice queue for such a result. Only
   * subagent assistant messages (a string `parent_tool_use_id`) are counted.
   * Resolves once any stop or delivery it triggered has finished; never
   * rejects.
   *
   */
  async observe(sessionId: string, message: unknown, route?: ContextCapacityRoute): Promise<void> {
    this.contextLimits.observe(message, route);
    const msg = asObject(message);
    if (msg?.['type'] === 'user' && typeof msg['parent_tool_use_id'] === 'string') {
      const state = this.sessions.get(this.currentSessionId(sessionId))?.subagents.get(msg['parent_tool_use_id']);
      if (state) this.captureToolResults(state, msg);
      return;
    }
    if (
      msg?.['type'] === 'user' &&
      typeof msg['parent_tool_use_id'] !== 'string'
    ) {
      await this.recordToolResults(sessionId, msg);
      return;
    }
    if (msg?.['type'] !== 'assistant') {
      return;
    }
    this.recordTaskTexts(sessionId, msg);
    const toolCallId = msg['parent_tool_use_id'];
    if (typeof toolCallId !== 'string') {
      return;
    }
    const session = this.sessionState(sessionId);
    const usage = readSubagentRequestUsage(msg);
    const configured = this.config.getAgentBudgetSettings();
    const state = this.subagentState(session, toolCallId, configured);
    if (state.sdkOutcome) return;
    try {
      this.captureProgress(state, msg);
    } catch (error: unknown) {
      if (!state.progressCaptureErrorLogged) {
        state.progressCaptureErrorLogged = true;
        this.logger.error('[SubagentBudgetMonitor] Progress capture failed', {
          error: error instanceof Error ? error : new Error(String(error)),
          sessionId,
          toolCallId,
        });
      }
    }
    const settings = this.contextLimits.settings(configured, state, message, route);
    this.contextLimits.warnUnknown(this.currentSessionId(sessionId), state, this.logger);
    const policy = new AgentBudgetPolicy(settings);
    if (!usage) {
      trackSubagentRequest(state, invocationKey(toolCallId, state), asObject(msg['message'])?.['id']);
      if (state.admission === 'paused') {
        this.enactAdmission(session, toolCallId, state);
        return;
      }
      if (!state.telemetryUnavailableLogged) {
        state.telemetryUnavailableLogged = true;
        this.logger.warn('[SubagentBudgetMonitor] Subagent turn telemetry unavailable; asking for a handoff', { sessionId, toolCallId });
      }
      this.applyAdmission(session, toolCallId, state, policy);
      return;
    }

    this.count(session, toolCallId, state, msg, usage, settings, policy);
    this.applyAdmission(session, toolCallId, state, policy);
  }

  /**
   * Latch the admission phase from the shared policy. It only moves forward; a
   * jump from `running` to `paused` records both transitions. The effect (gate,
   * notices) is enacted by {@link enactAdmission} once the agent id is known.
   * Nothing here ends the subagent.
   */
  private applyAdmission(
    session: SessionState,
    toolCallId: string,
    state: SubagentState,
    policy: AgentBudgetPolicy,
  ): void {
    if (isFinalized(state)) return;
    const assessment = policy.assessAdmission(
      { ...state.policySnapshot, unavailableTurns: state.requestOrder.size - state.lastResolvedRequest },
      Date.now() - state.startedAt,
      state.contextTokens,
    );
    this.latchAdmission(session, toolCallId, state, assessment);
    this.enactAdmission(session, toolCallId, state);
  }

  private latchAdmission(
    session: SessionState,
    toolCallId: string,
    state: SubagentState,
    assessment: AgentAdmissionAssessment,
  ): void {
    if (ADMISSION_RANK[assessment.phase] <= ADMISSION_RANK[state.admission]) return;
    if (state.admission === 'running') state.admissionReasons.asked = assessment;
    if (assessment.phase === 'paused') state.admissionReasons.paused = assessment;
    this.logger.info('[SubagentBudgetMonitor] Subagent admission phase changed', {
      sessionId: session.sessionId,
      toolCallId,
      from: state.admission,
      to: assessment.phase,
      reason: assessment.reason,
      contextTokens: state.contextTokens,
    });
    state.admission = assessment.phase;
  }

  /** Whether the subagent runs with write tools. An unknown role is read-only. */
  private isReadOnlyRole(session: SessionState, toolCallId: string): boolean {
    const { record } = this.resolveRegistryRecord(session, toolCallId);
    const role = (record?.agentType ?? session.startedTasks.get(toolCallId)?.subagentType)?.trim().toLowerCase();
    return !role || READ_ONLY_AGENT_TYPES.has(role);
  }

  /**
   * Apply the latched phase once the SDK agent id of the registry record is known:
   * enter the notes gate and ask for the handoff, then (when paused) pause the gate and
   * queue one parent notice. A jump to `paused` asks first, so the agent sees one
   * instruction. Without the agent id this is retried on the next message and on
   * {@link recordTaskStarted}.
   */
  private enactAdmission(session: SessionState, toolCallId: string, state: SubagentState): void {
    if (isFinalized(state) || ADMISSION_RANK[state.admissionEnacted] >= ADMISSION_RANK[state.admission]) return;
    const { record } = this.resolveRegistryRecord(session, toolCallId);
    const taskId = session.startedTasks.get(toolCallId)?.taskId;
    const agentId = record?.agentId ??
      (taskId && this.registry.hasHeldUnboundStart?.(taskId, session.sessionId) ? taskId : undefined);
    if (!agentId) {
      if (!state.admissionDeferredLogged) {
        state.admissionDeferredLogged = true;
        this.logger.debug('[SubagentBudgetMonitor] Admission phase deferred until the agent id is known', {
          sessionId: session.sessionId, toolCallId, phase: state.admission,
        });
      }
      return;
    }
    const asked = state.admissionReasons.asked;
    const nextStep = this.enterAdmissionGate(session, toolCallId, state, agentId);
    if (state.admissionEnacted === 'running' && asked) {
      this.postAsk(session, toolCallId, state, agentId, asked, nextStep);
      state.admissionEnacted = 'asked-handoff';
    }
    const paused = state.admissionReasons.paused;
    if (state.admission === 'paused' && paused) {
      const notice = admissionNotice('paused', paused, nextStep);
      if (this.notesGate.pause(scopedAgentKey(session.sessionId, agentId), notice)) {
        this.dispatcher.postMainThreadNotice(session.sessionId, redactBudgetSecrets(formatBudgetPauseNotice(notice, agentId)));
        this.announce(session.sessionId, agentId, notice, redactBudgetSecrets(formatBudgetPauseNotice(notice, agentId)));
        this.logger.info('[SubagentBudgetMonitor] Subagent paused; new tool calls are denied until it returns', {
          sessionId: session.sessionId, toolCallId, reason: paused.reason,
        });
      }
      state.admissionEnacted = 'paused';
    }
  }

  /** Enter the notes gate (idempotent) and return the next step the agent is asked to take. */
  private enterAdmissionGate(
    session: SessionState,
    toolCallId: string,
    state: SubagentState,
    agentId: string,
  ): AgentActionNotice['nextStep'] {
    const readOnly = this.isReadOnlyRole(session, toolCallId);
    const paths = readOnly ? undefined : this.handoffFiles.paths(session.sessionId, invocationKey(toolCallId, state));
    const workspace = this.records.workspaceOf(session.sessionId);
    const gateKey = scopedAgentKey(session.sessionId, agentId);
    const invocation = invocationKey(toolCallId, state);
    // A gate of another invocation (a reused agent id) is stale: this invocation enters its own.
    if (!state.warnedAgentId || !this.notesGate.has(gateKey) || this.notesGate.owner(gateKey) !== invocation) {
      state.warnedAgentId = agentId;
      state.warnedTaskId = session.startedTasks.get(toolCallId)?.taskId ?? this.resolveRegistryRecord(session, toolCallId).record?.taskId;
      const writable = !readOnly && !!paths && !!workspace;
      const entered = this.notesWarnings.run(session.sessionId, gateKey, this.logger, () => {
        this.notesGate.enter(gateKey, writable
          ? {
            invocation, readOnly: false, workspace, notesPath: paths.notes,
            deliverablePaths: this.deliverables.permitted(gateKey, session.tasks.get(toolCallId)?.deliverables ?? [], workspace),
          }
          : { invocation, readOnly: true });
      });
      // A gate that cannot hold the notes paths falls back to the read-only rights.
      if (!entered) this.notesGate.enter(gateKey, { invocation, readOnly: true });
      if (entered && writable) state.handoffPaths = paths;
      this.scheduleGateTimeout();
    }
    return state.handoffPaths && this.notesGate.paths(gateKey).length > 0 ? 'write-notes-and-return' : 'return-report';
  }

  private postAsk(
    session: SessionState,
    toolCallId: string,
    state: SubagentState,
    agentId: string,
    asked: AgentAdmissionAssessment,
    nextStep: AgentActionNotice['nextStep'],
  ): void {
    const notice = admissionNotice('asked-handoff', asked, nextStep);
    const text = nextStep === 'write-notes-and-return' && state.handoffPaths
      ? formatBudgetAskWritable(notice, state.handoffPaths.notes)
      : formatBudgetAskReadOnly(notice);
    this.dispatcher.postSubagentNotice(agentId, redactBudgetSecrets(text));
    this.announce(session.sessionId, agentId, notice, redactBudgetSecrets(formatBudgetAskNotice(notice, agentId)));
    this.logger.info('[SubagentBudgetMonitor] Handoff ask queued', {
      sessionId: session.sessionId, toolCallId, reason: asked.reason, contextTokens: state.contextTokens,
    });
  }

  /**
   * The paused phase denies new work tools for the admitted agent only; an absent
   * agent id is the parent. Never stops anything: the agent returns on its own.
   */
  async checkNotesTool(
    sessionId: string | undefined,
    agentId: string | undefined,
    toolName: string,
    toolInput: unknown,
  ): Promise<string | undefined> {
    if (sessionId && SUBAGENT_TOOL_NAMES.has(toolName)) {
      const denied = await guardSuccessor(this.records.workspaceOf(this.currentSessionId(sessionId)), toolInput, this.logger, this.currentSessionId(sessionId));
      if (denied) return denied;
    }
    if (!agentId) return undefined;
    if (sessionId && !this.notesGate.has(scopedAgentKey(this.currentSessionId(sessionId), agentId))) {
      const session = this.sessions.get(this.currentSessionId(sessionId));
      if (session) {
        for (const [toolCallId, state] of session.subagents) {
          if (state.admission === 'running' || isFinalized(state)) continue;
          if (session.startedTasks.get(toolCallId)?.taskId === agentId ||
              this.resolveRegistryRecord(session, toolCallId).record?.agentId === agentId) {
            this.enactAdmission(session, toolCallId, state);
          }
        }
      }
    }
    const gateKey = this.findGateKey(sessionId, agentId);
    if (!gateKey) return undefined;
    const decision = this.notesGate.check(gateKey, toolName, toolInput);
    return decision.reason ? redactBudgetSecrets(decision.reason) : undefined;
  }

  /** The permission handler's `canUseTool` uses the same deny logic as the PreToolUse hook. */
  checkPausedTool(
    sessionId: string | undefined,
    agentId: string | undefined,
    toolName: string,
    input: unknown,
  ): Promise<string | undefined> {
    return this.checkNotesTool(sessionId, agentId, toolName, input);
  }

  /** The admitted agent's gate phase, `undefined` when it has no gate. */
  notesGatePhase(agentId: string | undefined, sessionId?: string): 'asked' | 'paused' | undefined {
    const key = agentId ? this.findGateKey(sessionId, agentId) : undefined;
    return key ? this.notesGate.phase(key) : undefined;
  }

  /**
   * The gate key of `agentId`: scoped by the parent session when it is known. Without a session
   * (a hook that carries none) the agent id must name exactly one gate; two gates are ambiguous
   * and match none, so a reused agent id never reads another session's gate.
   */
  private findGateKey(sessionId: string | undefined, agentId: string | undefined): string | undefined {
    if (!agentId) return undefined;
    if (sessionId) {
      const current = this.currentSessionId(sessionId);
      const key = scopedAgentKey(current, agentId);
      if (this.notesGate.has(key)) return key;
      // A session the monitor tracks is authoritative: another session's gate never applies.
      // An id the monitor does not know (a tab id before the SDK id is known) falls back to the
      // unique gate of the agent, so the pause is not lost to an id mismatch.
      if (this.sessions.has(current)) return undefined;
    }
    const keys = scopedKeysOfAgent(this.notesGate.keys(), agentId);
    return keys.length === 1 ? keys[0] : undefined;
  }

  /**
   * Records deliverables and marks the notes ready on a successful notes write.
   * Nothing is stopped: the agent ends its turn and the SDK `SubagentStop` finishes it.
   */
  recordNotesToolResult(sessionId: string, agentId: string, toolName: string, input: unknown): Promise<void> {
    const current = this.currentSessionId(sessionId);
    // The same lookup as the check: a session id the monitor does not know falls back to the unique gate.
    const key = this.findGateKey(sessionId, agentId) ?? scopedAgentKey(current, agentId);
    this.deliverables.record(current, key, toolName, input, this.records.workspaceOf(current), this.logger);
    this.notesGate.recordWrite(key, toolName, input);
    return Promise.resolve();
  }

  hasNotesGate(agentId: string | undefined, sessionId?: string): boolean {
    return !!this.findGateKey(sessionId, agentId);
  }

  /**
   * One monitor-owned timer. At 10 minutes of an unreturned handoff the parent gets
   * exactly one notice; the gate and its phase stay unchanged and the agent stays live.
   */
  private scheduleGateTimeout(): void {
    if (this.gateTimer) return;
    this.gateTimer = setTimeout(() => {
      this.gateTimer = undefined;
      let pending = false;
      for (const session of this.sessions.values()) {
        for (const [toolCallId, state] of session.subagents) {
          const agentId = state.warnedAgentId;
          const gateKey = agentId ? scopedAgentKey(session.sessionId, agentId) : undefined;
          if (!agentId || !gateKey || isFinalized(state) || this.notesGate.owner(gateKey) !== invocationKey(toolCallId, state)) continue;
          if (!this.notesGate.expired(gateKey)) { pending = true; continue; }
          if (this.notesGate.markOverdueNotified(gateKey)) {
            this.dispatcher.postMainThreadNotice(session.sessionId, redactBudgetSecrets(formatHandoffNotesDelay(agentId)));
            this.logger.warn('[SubagentBudgetMonitor] Handoff still outstanding after 10 minutes; parent notified', {
              sessionId: session.sessionId, agentId,
            });
          }
        }
      }
      if (pending) this.scheduleGateTimeout();
    }, GATE_NOTICE_POLL_MS);
    this.gateTimer.unref?.();
  }

  private clearIdleGateTimer(): void {
    if (!this.gateTimer) return;
    const active = [...this.sessions.values()].some((session) =>
      [...session.subagents.values()].some((state) => !isFinalized(state) && !!state.warnedAgentId &&
        this.notesGate.has(scopedAgentKey(session.sessionId, state.warnedAgentId))));
    if (!active) {
      clearTimeout(this.gateTimer);
      this.gateTimer = undefined;
    }
  }

  /**
   * A successful foreground result or a completed SDK task notification
   * confirms a normal return. The stop hook itself carries no outcome.
   */
  async finishWarnedAgent(sessionId: string, agentId: string, outcome?: 'completed'): Promise<void> {
    const session = this.sessions.get(this.currentSessionId(sessionId));
    if (!session) return;
    for (const [toolCallId, state] of session.subagents) {
      if (state.warnedAgentId !== agentId || isFinalized(state)) continue;
      state.stopHookSeen = true;
      if (outcome === 'completed' || state.foregroundReturned) {
        await this.finishWarnedInvocation(session, toolCallId, state, agentId);
      }
      return;
    }
  }

  private async finishWarnedInvocation(session: SessionState, toolCallId: string, state: SubagentState, agentId: string): Promise<void> {
    if (isFinalized(state) || this.notesGate.owner(scopedAgentKey(session.sessionId, agentId)) !== invocationKey(toolCallId, state)) return;
    const generation = state.generation;
    state.stopInFlight = true;
    if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
    state.deadlineTimer = undefined;
    try {
      await this.completeHandoff(session, toolCallId, state, agentId);
    } finally {
      if (state.generation === generation &&
          this.liveSession(session)?.subagents.get(toolCallId) === state &&
          state.warnedAgentId === agentId) {
        state.stopInFlight = false;
        // Terminal notifications already release the old invocation's gate.
        if (state.stopState === 'none' && !state.sdkOutcome) this.releaseAdmission(session.sessionId, agentId, invocationKey(toolCallId, state));
        this.clearIdleGateTimer();
      }
    }
  }

  /** Ends the gate of `invocation` only; a newer invocation of a reused agent id keeps its own gate. */
  private releaseAdmission(sessionId: string, agentId: string, invocation: string): void {
    const key = scopedAgentKey(sessionId, agentId);
    const owner = this.notesGate.owner(key);
    if (owner !== undefined && owner !== invocation) return;
    this.notesGate.finish(key);
    this.deliverables.finish(key);
    this.notesWarnings.finish(key);
    // The notice queue is keyed by agent id only: withdraw it only for a gate this call ended.
    if (owner !== undefined) this.dispatcher.withdrawSubagentNotice(agentId);
    this.announce(sessionId, agentId, null, '');
  }

  /** Show the agent's notice in the host UI. A failing sink never changes the agent's run. */
  private announce(sessionId: string, agentId: string, notice: AgentActionNotice | null, text: string): void {
    try {
      this.dispatcher.announceSubagentNotice?.(sessionId, agentId, notice, text);
    } catch (error) {
      this.logger.warn('[SubagentBudgetMonitor] Subagent notice could not reach the UI', {
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  /** Build, publish and deliver the handoff of an agent that returned after the request. */
  private async completeHandoff(session: SessionState, toolCallId: string, state: SubagentState, agentId: string): Promise<void> {
    const generation = state.generation;
    const recordKey = invocationKey(toolCallId, state);
    const invalidated = () => state.generation !== generation || state.stopState !== 'none' || state.sdkOutcome !== undefined;
    const ownsInvocation = () => {
      const live = this.liveSession(session);
      return !invalidated() && (!live || live.subagents.get(toolCallId) === state);
    };
    const started = session.startedTasks.get(toolCallId);
    const resolved = this.resolveRegistryRecord(session, toolCallId);
    const hookToolCallId = this.registry.getToolCallIdByAgentId(agentId);
    const hookRecord = hookToolCallId ? this.registry.get(hookToolCallId) : null;
    const record = resolved.record ?? (hookRecord?.parentSessionId === session.sessionId ? hookRecord : null);
    // An explicit user stop is not a Ptah handoff: never manufacture a completed record for it.
    if (invalidated() || record?.status === 'interrupted') {
      this.logger.info('[SubagentBudgetMonitor] Normal exit skipped: the subagent was stopped externally', { sessionId: session.sessionId, toolCallId, agentId });
      return;
    }
    const taskId = started?.taskId ?? record?.taskId;
    if (!taskId) {
      this.logger.warn('[SubagentBudgetMonitor] Normal exit has no task id; preparing an in-memory handoff', { sessionId: session.sessionId, toolCallId, agentId });
    }
    const config = this.config.getAgentBudgetSettings();
    const limits = { handoffTokens: this.contextLimits.settings(config, state).handoffContextTokens, stopWeightedTokens: config.stopWeightedTokens };
    const who = { agentId, agentType: record?.agentType ?? started?.subagentType ?? 'subagent', teammateName: record?.teammateName, taskId: taskId ?? 'unknown' };
    state.stopCause = { kind: 'handoff-complete', quantity: 'context-tokens', measured: state.contextTokens, limit: limits.handoffTokens, forced: false };
    let prepared: PreparedHandoff | undefined;
    try {
      // Bounded retry of the idempotent record write; the last attempt falls back to an in-memory handoff.
      for (let attempt = 1; attempt <= MAX_RECORD_ATTEMPTS && !prepared; attempt++) {
        if (!ownsInvocation()) return;
        prepared = await this.prepareHandoff(session, toolCallId, recordKey, state, limits, who, ownsInvocation, attempt === MAX_RECORD_ATTEMPTS);
        if (!ownsInvocation()) {
          if (prepared?.record && invalidated()) await this.records.withdraw(recordKey, prepared.record.path);
          return;
        }
        if (!prepared && attempt < MAX_RECORD_ATTEMPTS && this.liveSession(session)) await delay(RECORD_RETRY_DELAY_MS * attempt);
      }
    } catch (error: unknown) {
      if (!ownsInvocation()) return;
      this.logger.error('[SubagentBudgetMonitor] Normal exit handoff preparation failed', {
        error: error instanceof Error ? error : new Error(String(error)),
        sessionId: session.sessionId, toolCallId,
      });
      const fallback = handoffMessage(
        { ...who, outputFile: state.terminalOutputFile },
        { reason: 'handoff', cause: state.stopCause, contextTokens: state.contextTokens, weightedUsed: state.weightedUsed, ...limits },
        session.tasks.get(toolCallId)?.text,
        { paths: undefined, taskSaved: false, notesWritten: false, notesInferred: false, unavailable: true },
        undefined,
        { lastAssistantText: state.lastAssistantText, filePaths: [...state.filePaths], toolCalls: [], transcriptPath: state.transcriptPath },
      );
      prepared = { handoff: { text: redactBudgetSecrets(withLead(fallback, formatHandoffRecordFailure(agentId))), subject: who } };
    }
    if (!prepared) {
      this.logger.info('[SubagentBudgetMonitor] Normal exit skipped: handoff unavailable', { sessionId: session.sessionId, toolCallId, agentId });
      return;
    }
    const scrubbed = await this.finalizeNotes(prepared, recordKey, ownsInvocation);
    if (!ownsInvocation()) {
      if (prepared.record && invalidated()) await this.records.withdraw(recordKey, prepared.record.path);
      return;
    }
    // Publish a safe record even if the parent session was released during preparation.
    const handoffRecord = prepared.record;
    const published = scrubbed && (!handoffRecord || this.records.publishIfOwned(recordKey, handoffRecord.path,
      () => this.index.publish(handoffRecord.workspace, handoffRecord.name)));
    if (!published) {
      if (scrubbed && handoffRecord) {
        await this.records.disposeUnsafe(recordKey, handoffRecord.path);
        if (!ownsInvocation()) return;
      }
      const notesPath = prepared.notesPathToRedact?.notes ?? state.handoffPaths?.notes;
      const report = state.lastAssistantText;
      const safeReport = report && notesPath
        ? report.replaceAll(notesPath, '[handoff notes unavailable]')
                .replaceAll(path.basename(notesPath), '[handoff notes unavailable]')
        : report;
      const text = [
        formatHandoffRecordFailure(agentId),
        safeReport && `Last observed assistant report: ${safeReport}`,
        state.transcriptPath
          ? `Subagent transcript: ${state.transcriptPath}`
          : state.terminalOutputFile && `Subagent output file: ${state.terminalOutputFile}`,
      ].filter(Boolean).join('\n');
      prepared = { handoff: { subject: who, text: redactBudgetSecrets(text) } };
    }
    const live = this.liveSession(session);
    if (!live) {
      this.logger.info('[SubagentBudgetMonitor] Normal exit skipped: session released', { sessionId: session.sessionId, agentId, toolCallId });
      return;
    }
    const liveState = state;
    if (liveState.stopFired) return;
    liveState.prepared = prepared;
    liveState.stopFired = true;
    liveState.stopped = true;
    liveState.stopReason = 'handoff';
    liveState.stoppedTaskId = taskId;
    liveState.stoppedAgentId = agentId;
    liveState.stoppedTeammateName = record?.teammateName;
    liveState.stoppedRecordPath = prepared.record?.path;
    if (prepared.record) this.records.markInvoked(recordKey);
    this.rememberFinalized(live.sessionId, toolCallId, liveState);
    // A completed record is dropped from the registry, so it is never offered for resume.
    const registryToolCallId = resolved.registryToolCallId ?? hookToolCallId ?? undefined;
    if (record && record.status !== 'completed') {
      this.registry.update(registryToolCallId ?? toolCallId, { status: 'completed', completedAt: Date.now() });
    }
    if (liveState.handoffDelivered) return;
    if (live.spawnReturned.get(toolCallId)) {
      liveState.handoffDelivered = true;
      void this.delivery.send(live.sessionId, toolCallId, prepared.handoff).catch((error: unknown) => {
        this.logger.error('[SubagentBudgetMonitor] Normal exit handoff delivery failed', { error: error instanceof Error ? error : new Error(String(error)), sessionId: live.sessionId, toolCallId, agentId });
      });
    } else {
      liveState.pendingNotice = { sessionId: live.sessionId, handoff: prepared.handoff };
    }
    const prompt = live.tasks.get(toolCallId)?.prompt;
    if (prepared.record && prompt) await this.records.writeStub(prompt, prepared.handoff.subject.agentType, prepared.record.path);
  }

  /** Bounded finalized identities answer budget-state lookups after the registry drops the record. */
  private rememberFinalized(sessionId: string, toolCallId: string, state: SubagentState): void {
    const snapshot = this.getAgentBudgetState(toolCallId, sessionId);
    if (!snapshot) return;
    for (const identity of [toolCallId, state.stoppedTaskId, state.stoppedAgentId, state.stoppedTeammateName]) {
      if (!identity) continue;
      const key = stoppedIdentityKey(sessionId, identity);
      this.stoppedByIdentity.delete(key);
      this.stoppedByIdentity.set(key, { ...snapshot, running: false, stopped: true });
    }
    while (this.stoppedByIdentity.size > 256) {
      const oldest = this.stoppedByIdentity.keys().next().value;
      if (oldest === undefined) break;
      this.stoppedByIdentity.delete(oldest);
    }
  }

  /** Consumed by the parent's Agent/Task PostToolUse hook in the same turn. */
  takeNormalHandoff(sessionId: string, toolCallId: string): string | undefined {
    const state = this.sessions.get(this.currentSessionId(sessionId))?.subagents.get(toolCallId);
    if (!state?.pendingNotice || !state.stopFired || state.stopState !== 'none' || state.handoffDelivered) return undefined;
    const text = state.pendingNotice.handoff.text;
    state.pendingNotice = undefined;
    state.handoffDelivered = true;
    return text;
  }

  /** Legacy: the monitor never interrupts a subagent, so nothing needs its wording repaired. */
  takeInterruptedHandoff(): undefined {
    return undefined;
  }

  /**
   * Remember the SDK task id the `task_started` message reports for the
   * subagent spawned by `toolUseId`, so a stop does not wait for the registry.
   * Tasks that spawn no subagent (bash, workflow) are recorded too; their
   * tool_use id never parents a subagent message, so they never stop anything.
   * A blank id is ignored. A resumed run can start without a tool_use_id: it then belongs to
   * the one spawn that already carries the same task id, and is ignored when none or several do.
   */
  recordTaskStarted(
    sessionId: string,
    spawnToolUseId: string | undefined,
    taskId: string,
    subagentType?: string,
    runId?: string,
    background?: boolean,
  ): void {
    if (!sessionId || !taskId) {
      return;
    }
    const toolUseId = spawnToolUseId || this.toolUseOfTask(sessionId, taskId);
    if (!toolUseId) {
      this.logger.warn('[SubagentBudgetMonitor] Task start without a tool use id matches no single spawn', { sessionId, taskId, runId });
      return;
    }
    const session = this.sessionState(sessionId);
    const state = session.subagents.get(toolUseId);
    const previousStart = session.startedTasks.get(toolUseId);
    const previousTaskId = previousStart?.taskId ?? state?.warnedTaskId;
    const previousRunId = previousStart?.taskId === taskId ? previousStart?.runId : undefined;
    // SDK run ids sort in opening order within a task.
    if (runId && previousRunId && runId < previousRunId) return;
    const newRun = !!runId && !!previousRunId && runId > previousRunId;
    let generation = state?.generation ?? 0;
    if (state && ((previousTaskId && previousTaskId !== taskId) || newRun)) {
      const previousInvocation = invocationKey(toolUseId, state);
      generation = ++state.generation;
      if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
      if (state.warnedAgentId) {
        this.releaseAdmission(session.sessionId, state.warnedAgentId, previousInvocation);
        this.transcriptLookup.delete(stoppedIdentityKey(session.sessionId, state.warnedAgentId));
      }
      session.subagents.delete(toolUseId);
      if (!newRun) session.spawnReturned.set(toolUseId, false);
      const task = session.tasks.get(toolUseId);
      if (task) session.tasks.set(toolUseId, { ...task, outputFile: undefined, startedAt: Date.now() });
      this.clearIdleGateTimer();
    } else if (state?.warnedAgentId && !state.warnedTaskId) {
      // The late id names the same invocation and keeps its existing ask and gate.
      state.warnedTaskId = taskId;
    }
    session.startedTasks.set(toolUseId, {
      taskId,
      subagentType: subagentType || undefined,
      runId: runId ?? previousRunId,
      background: background ?? (newRun || previousTaskId !== taskId ? undefined : previousStart?.background),
    });
    trackSpawn(session, toolUseId);
    if (state || session.tasks.has(toolUseId)) {
      const known = this.subagentState(session, toolUseId, undefined, generation);
      this.armDeadline(session, toolUseId, known);
      // The registry agent id may have arrived with this task: enact a phase that waited for it.
      this.enactAdmission(session, toolUseId, known);
    }
  }

  /** The tool_use id of the only spawn of `sessionId` that already carries `taskId`. */
  private toolUseOfTask(sessionId: string, taskId: string): string | undefined {
    const session = this.sessions.get(this.currentSessionId(sessionId));
    if (!session) return undefined;
    const matches = new Set<string>();
    for (const [toolUseId, started] of session.startedTasks) if (started.taskId === taskId) matches.add(toolUseId);
    for (const [toolUseId, state] of session.subagents) if (state.warnedTaskId === taskId) matches.add(toolUseId);
    return matches.size === 1 ? [...matches][0] : undefined;
  }

  /** Apply the SDK outcome to the execution identified by its task id. */
  async recordTaskTerminal(
    sessionId: string,
    taskId: string,
    status: 'completed' | 'stopped' | 'failed',
    runId?: string,
    toolUseId?: string,
    outputFile?: string,
  ): Promise<void> {
    const session = this.sessions.get(this.currentSessionId(sessionId));
    if (!session || !taskId) return;
    for (const [toolCallId, state] of session.subagents) {
      if (toolUseId && toolUseId !== toolCallId) continue;
      const started = session.startedTasks.get(toolCallId);
      if (runId && started?.runId && runId !== started.runId) continue;
      const knownTaskId = started?.taskId ?? this.resolveRegistryRecord(session, toolCallId).record?.taskId;
      if (knownTaskId ? knownTaskId !== taskId : !toolUseId) continue;
      const agentId = state.warnedAgentId;
      if (status === 'completed') {
        if (outputFile && path.isAbsolute(outputFile) && !/[\r\n]/.test(outputFile) &&
            !outputFile.includes('\0') && !outputFile.split(/[\\/]/).includes('..')) {
          state.terminalOutputFile = outputFile;
        }
        if (agentId) await this.finishWarnedInvocation(session, toolCallId, state, agentId);
      } else {
        if (state.stopFired || state.sdkOutcome) return;
        state.sdkOutcome = status;
        state.pendingNotice = undefined;
        if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
        state.deadlineTimer = undefined;
        if (agentId && this.notesGate.has(scopedAgentKey(session.sessionId, agentId))) this.releaseAdmission(session.sessionId, agentId, invocationKey(toolCallId, state));
        this.clearIdleGateTimer();
      }
      return;
    }
  }

  /** What the monitor knows about a subagent, or `undefined` when it saw none of its usage. */
  getSnapshot(
    sessionId: string,
    toolCallId: string,
  ): SubagentBudgetSnapshot | undefined {
    const state = this.sessions.get(sessionId)?.subagents.get(toolCallId);
    if (!state) {
      return undefined;
    }
    return {
      contextTokens: state.contextTokens,
      weightedUsed: state.weightedUsed,
      stopped: state.stopped,
      budgetReached: effectiveBudgetReached(this.contextLimits.settings(this.config.getAgentBudgetSettings(), state),
        state.policySnapshot, state.contextTokens,
      ),
    };
  }

  /** Look up by SDK agent id or spawning tool call id. */
  getAgentBudgetState(agentId: string, sessionId: string): AgentBudgetState | undefined {
    const currentId = this.currentSessionId(sessionId);
    let idleMatch: AgentBudgetState | undefined;
    const session = this.sessions.get(currentId);
    if (session) {
      for (const [toolCallId, state] of session.subagents) {
        const { record } = this.resolveRegistryRecord(session, toolCallId);
        if (toolCallId !== agentId && session.startedTasks.get(toolCallId)?.taskId !== agentId && record?.taskId !== agentId && state.stoppedTaskId !== agentId && state.stoppedAgentId !== agentId && state.stoppedTeammateName !== agentId && state.warnedAgentId !== agentId && record?.agentId !== agentId && !(state.stopState === 'none' && (record?.teammateName === agentId || session.tasks.get(toolCallId)?.name === agentId))) continue;
        const lifecycle = budgetLifecycle(state);
        const paused = state.admissionReasons.paused;
        const match: AgentBudgetState = {
          contextTokens: state.lastMessageId === undefined ? null : state.contextTokens,
          handoffTokens: this.contextLimits.settings(this.config.getAgentBudgetSettings(), state).handoffContextTokens,
          warningRatio: this.config.getAgentBudgetSettings().warnRatio,
          warned: state.policySnapshot.warned || state.warnedAgentId !== undefined,
          running: lifecycle === 'running' || lifecycle === 'asked' || lifecycle === 'paused',
          stopState: lifecycle === 'finalizing' ? 'pending' : state.stopState,
          ...(state.sdkOutcome ? { sdkOutcome: state.sdkOutcome } : {}),
          stopped: state.stopState !== 'none' || state.stopFired || lifecycle === 'finalizing',
          lifecycle,
          admission: state.admission,
          ...(paused ? { pauseNotice: admissionNotice('paused', paused, 'review-live-agent') } : {}),
          ...(state.stopReason ? { stopReason: state.stopReason } : {}),
          ...(state.stoppedRecordPath ? { recordPath: state.stoppedRecordPath } : {}),
        };
        idleMatch = match;
      }
    }
    return idleMatch ?? this.stoppedByIdentity.get(stoppedIdentityKey(currentId, agentId));
  }

  private cacheTranscript(sessionId: string, agentId: string, found?: string): void {
    const key = stoppedIdentityKey(this.currentSessionId(sessionId), agentId);
    this.transcriptLookup.delete(key);
    this.transcriptLookup.set(key, {
      path: found,
      expiresAt: found ? Number.POSITIVE_INFINITY : Date.now() + TRANSCRIPT_MISS_TTL_MS,
    });
    while (this.transcriptLookup.size > 256) {
      const oldest = this.transcriptLookup.keys().next().value;
      if (oldest === undefined) break;
      this.transcriptLookup.delete(oldest);
    }
  }

  async recordTranscriptPath(sessionId: string, agentId: string, supplied: string): Promise<void> {
    const workspace = this.records.workspaceOf(sessionId);
    if (!workspace) return;
    const validated = await this.lookupTranscript(os.homedir(), workspace, sessionId, agentId, supplied);
    if (!validated) return;
    this.cacheTranscript(sessionId, agentId, validated);
    for (const session of this.sessions.values()) {
      if (session.sessionId !== this.currentSessionId(sessionId)) continue;
      for (const [toolCallId, state] of session.subagents)
        if (
          this.resolveRegistryRecord(session, toolCallId).record?.agentId === agentId ||
          state.stoppedAgentId === agentId
        )
          state.transcriptPath = validated;
    }
  }

  /**
   * Move what the monitor knows about `fromSessionId` to `toSessionId` (a
   * PostCompact that reports a new session id). Subagents already seen under
   * `toSessionId` are kept unless `fromSessionId` holds the same one; then the
   * state with a stop in flight or done is kept. A stop in flight on either
   * record finishes on the merged record and hands off to the new id.
   */
  rekey(fromSessionId: string, toSessionId: string): void {
    if (!toSessionId || fromSessionId === toSessionId) {
      return;
    }
    // Messages still queued under the old id resolve to the new one. The new
    // id is current again, so an alias it had is dropped (no alias cycle).
    moveLineageWarning(this.logger, fromSessionId, toSessionId); this.contextLimits.rekey(fromSessionId, toSessionId); this.deliverables.rekey(fromSessionId, toSessionId); this.notesWarnings.rekey(fromSessionId, toSessionId); this.notesGate.rekey(fromSessionId, toSessionId);
    this.aliases.delete(toSessionId);
    this.aliases.set(fromSessionId, toSessionId);
    const session = this.sessions.get(fromSessionId);
    if (!session) {
      return;
    }
    this.sessions.delete(fromSessionId);
    const existing = this.sessions.get(toSessionId);
    if (existing) {
      for (const [toolCallId, state] of existing.subagents) {
        const kept = session.subagents.get(toolCallId);
        if (!kept || (!isFinalized(kept) && isFinalized(state))) {
          if (kept?.deadlineTimer) clearTimeout(kept.deadlineTimer);
          session.subagents.set(toolCallId, state);
        } else if (state.deadlineTimer) {
          clearTimeout(state.deadlineTimer);
        }
      }
      for (const [toolUseId, task] of existing.tasks) {
        if (!session.tasks.has(toolUseId)) {
          session.tasks.set(toolUseId, task);
        }
      }
      for (const [toolUseId, started] of existing.startedTasks) {
        if (!session.startedTasks.has(toolUseId)) {
          session.startedTasks.set(toolUseId, started);
        }
      }
      for (const [toolUseId, returned] of existing.spawnReturned) {
        if (returned || !session.spawnReturned.has(toolUseId)) {
          session.spawnReturned.set(toolUseId, returned);
        }
      }
      existing.mergedInto = session;
    }
    for (const [toolCallId, state] of session.subagents) {
      if (state.stopState !== 'stopped') continue;
      for (const identity of [toolCallId, state.stoppedTaskId, state.stoppedAgentId, state.stoppedTeammateName]) {
        if (!identity) continue;
        const oldKey = stoppedIdentityKey(fromSessionId, identity);
        const stopped = this.stoppedByIdentity.get(oldKey);
        if (stopped) {
          this.stoppedByIdentity.delete(oldKey);
          this.stoppedByIdentity.set(stoppedIdentityKey(toSessionId, identity), stopped);
        }
      }
    }
    session.sessionId = toSessionId;
    this.sessions.set(toSessionId, session);
  }

  /**
   * The id `sessionId` lives on as after the rekeys seen so far: itself when
   * no rekey moved it, else the id at the end of its alias chain.
   */
  currentSessionId(sessionId: string): string {
    const chain = this.aliasChain(sessionId);
    return chain[chain.length - 1];
  }

  /**
   * Forget everything about `sessionId` (session end), including every alias
   * that resolves through it, so a later message under an old id starts no
   * state on the released record.
   */
  release(sessionId: string): void {
    moveLineageWarning(this.logger, sessionId); this.contextLimits.release(sessionId); this.deliverables.release(sessionId); this.notesWarnings.release(sessionId);
    const stale = [...this.aliases.keys()].filter((from) =>
      this.aliasChain(from).includes(sessionId),
    );
    for (const from of stale) {
      this.aliases.delete(from);
    }
    // A near-budget warning no tool result drained ends with the session.
    for (const [toolCallId, state] of this.sessions.get(sessionId)?.subagents ?? []) {
      if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
      if (state.warnedAgentId) this.releaseAdmission(sessionId, state.warnedAgentId, invocationKey(toolCallId, state));
    }
    this.notesGate.release(sessionId);
    this.sessions.delete(sessionId);
    this.clearIdleGateTimer();
    this.records.forget(new Set([...stale, sessionId]));
    for (const id of [...stale, sessionId]) this.stopNotices.forgetSession(id);
    this.index.forgetCursor(ownerHash(sessionId));
  }

  /**
   * The pending-handoff pointer for a main-thread prompt of `sessionId`, or
   * `undefined` when none is pending. Records owned by the session (its id
   * or an alias that resolves to it) are listed plainly; records of another
   * live session of this process are hidden; any other owner's records (an
   * ended session, or another process) carry takeover text. The workspace is
   * the session's, else `hookCwd`. Never rejects.
   */
  async handoffPointer(
    sessionId: string,
    hookCwd: string | undefined,
  ): Promise<string | undefined> {
    const current = this.currentSessionId(sessionId);
    const workspace = this.records.workspaceOf(current) ?? hookCwd;
    if (!workspace) {
      return undefined;
    }
    const hidden = new Set<string>();
    for (const id of this.sessions.keys()) {
      if (id !== current) {
        for (const alias of this.idsOf(id)) {
          hidden.add(ownerHash(alias));
        }
      }
    }
    return this.index.pointerFor(workspace, {
      own: new Set(this.idsOf(current).map(ownerHash)),
      hidden,
      cursorKey: ownerHash(current),
    });
  }

  /** `sessionId` and every old id that resolves to it. */
  private idsOf(sessionId: string): string[] {
    return [
      sessionId,
      ...[...this.aliases.keys()].filter(
        (from) => this.currentSessionId(from) === sessionId,
      ),
    ];
  }

  /** `sessionId` followed by each id a rekey moved it to, in order. */
  private aliasChain(sessionId: string): string[] {
    const chain = [sessionId];
    let next = this.aliases.get(sessionId);
    // rekey() never forms a cycle; the bound only guards against one.
    while (next !== undefined && chain.length <= this.aliases.size) {
      chain.push(next);
      next = this.aliases.get(next);
    }
    return chain;
  }

  private sessionState(rawSessionId: string): SessionState {
    const sessionId = this.currentSessionId(rawSessionId);
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        subagents: new Map(),
        tasks: new Map(),
        startedTasks: new Map(),
        spawnReturned: new Map(),
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * The record `session` lives on as: itself, or the record a rekey merged it
   * into. `undefined` once that record was released.
   */
  private liveSession(session: SessionState): SessionState | undefined {
    let current = session;
    while (current.mergedInto) {
      current = current.mergedInto;
    }
    return this.sessions.get(current.sessionId) === current
      ? current
      : undefined;
  }

  private subagentState(
    session: SessionState,
    toolCallId: string,
    settings?: AgentBudgetSettings,
    generation = 0,
  ): SubagentState {
    let state = session.subagents.get(toolCallId);
    if (!state) {
      const recordedStart = this.registry.get?.(toolCallId)?.startedAt;
      state = {
        generation,
        contextTokens: 0,
        weightedUsed: 0,
        policySnapshot: initialAgentBudgetSnapshot,
        startedAt: generation === 0 && recordedStart && recordedStart > 0
          ? recordedStart : session.tasks.get(toolCallId)?.startedAt ?? Date.now(),
        costUnavailableLogged: false,
        telemetryUnavailableLogged: false,
        requestOrder: new Map(),
        lastResolvedRequest: 0,
        lastWeighted: 0,
        lastRaw: 0,
        stopFired: false,
        stopInFlight: false,
        stopState: 'none',
        admission: 'running',
        admissionReasons: {},
        admissionEnacted: 'running',
        admissionDeferredLogged: false,
        recordFailures: 0,
        recordGaveUp: false,
        stopped: false,
        filePaths: [],
        toolCalls: [],
      };
      session.subagents.set(toolCallId, state);
      this.armDeadline(session, toolCallId, state, settings);
    }
    return state;
  }

  /**
   * Arm the duration timer of one subagent: it asks for a handoff at warnRatio of
   * maxDurationMin and pauses at twice that, counted from the original start (across
   * resumes). The timer only latches admission; nothing is stopped. It is cleared once
   * the subagent is finalized or released, and re-armed on a live settings change.
   */
  private armDeadline(session: SessionState, toolCallId: string, state: SubagentState, liveSettings?: AgentBudgetSettings): void {
    if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
    state.deadlineTimer = undefined;
    if (isFinalized(state) || state.admission === 'paused') return;
    const settings = liveSettings ?? this.config.getAgentBudgetSettings();
    const { askAt, pauseAt } = new AgentBudgetPolicy(settings).admissionLimits().duration;
    const elapsed = Date.now() - state.startedAt;
    const nextAt = state.admission === 'running' ? askAt : pauseAt;
    const delay = Math.max(1, Math.min(nextAt - elapsed, MAX_TIMER_DELAY_MS));
    state.deadlineTimer = setTimeout(() => {
      state.deadlineTimer = undefined;
      const live = this.liveSession(session);
      if (!live || live.subagents.get(toolCallId) !== state || isFinalized(state)) return;
      const { record } = this.resolveRegistryRecord(live, toolCallId);
      if (record && record.status !== 'running') return;
      const current = this.config.getAgentBudgetSettings();
      this.applyAdmission(live, toolCallId, state, new AgentBudgetPolicy(this.contextLimits.settings(current, state)));
      this.armDeadline(live, toolCallId, state, current);
    }, delay);
    state.deadlineTimer.unref?.();
  }

  private captureProgress(state: SubagentState, msg: JsonObject): void {
    const message = asObject(msg['message']);
    const content = message?.['content'];
    if (Array.isArray(content)) {
      for (const raw of content) {
        const block = asObject(raw);
        if (block?.['type'] === 'text' && typeof block['text'] === 'string') {
          state.lastAssistantText = safeProgressText(block['text']);
        }
        if (block?.['type'] !== 'tool_use' || typeof block['name'] !== 'string') continue;
        const name = block['name'];
        const input = asObject(block['input']);
        const rawPath = input?.['file_path'] ?? input?.['path'] ?? input?.['notebook_path'];
        const targetPath = typeof rawPath === 'string' && rawPath.length <= 500 && !/[\r\n]/.test(rawPath) ? rawPath : undefined;
        if (targetPath && ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(name) && !state.filePaths.includes(targetPath) && state.filePaths.length < 50) state.filePaths.push(targetPath);
        state.toolCalls.push({ name: name.slice(0, 80), targetPath, outcome: 'started', id: typeof block['id'] === 'string' ? block['id'] : undefined });
        if (state.toolCalls.length > 10) state.toolCalls.shift();
      }
    }
  }

  private captureToolResults(state: SubagentState, msg: JsonObject): void {
    const content = asObject(msg['message'])?.['content'];
    if (!Array.isArray(content)) return;
    for (const raw of content) {
      const block = asObject(raw);
      if (block?.['type'] !== 'tool_result' || typeof block['tool_use_id'] !== 'string') continue;
      const call = [...state.toolCalls].reverse().find((entry) => entry.id === block['tool_use_id']);
      if (call) call.outcome = block['is_error'] === true ? 'failed' : 'completed';
    }
  }

  /** Remember the task of every subagent this assistant message spawns. */
  private recordTaskTexts(sessionId: string, msg: JsonObject): void {
    const content = asObject(msg['message'])?.['content'];
    if (!Array.isArray(content)) {
      return;
    }
    for (const item of content) {
      const block = asObject(item);
      const id = block?.['id'];
      const name = block?.['name'];
      if (
        block?.['type'] !== 'tool_use' ||
        typeof id !== 'string' ||
        typeof name !== 'string' ||
        !SUBAGENT_TOOL_NAMES.has(name)
      ) {
        continue;
      }
      const session = this.sessionState(sessionId);
      trackSpawn(session, id);
      const input = asObject(block['input']);
      const prompt = input?.['prompt'];
      const teammate = input?.['name'];
      if (typeof teammate === 'string' && teammate.trim()) {
        this.stoppedByIdentity.delete(stoppedIdentityKey(session.sessionId, teammate.trim()));
        for (const old of session.subagents.values()) {
          if (old.stoppedTeammateName === teammate.trim()) old.stoppedTeammateName = undefined;
        }
      }
      session.tasks.set(id, {
        startedAt: session.tasks.get(id)?.startedAt ?? Date.now(),
        text: readSubagentTaskText(input),
        deliverables: parseSubagentDeliverables(prompt),
        background: input?.['run_in_background'] === true,
        prompt:
          typeof prompt === 'string' && prompt.trim() ? prompt : undefined,
        name:
          typeof teammate === 'string' && teammate.trim()
            ? teammate.trim()
            : undefined,
      });
    }
  }

  /**
   * Mark each spawning call this main-thread user message answers with a
   * `tool_result` as returned. A handoff still pending in the notice queue
   * for one of them was not drained by its PostToolUse, so it is withdrawn
   * and streamed as a user turn instead (never both).
   */
  private async recordToolResults(
    sessionId: string,
    msg: JsonObject,
  ): Promise<void> {
    const content = asObject(msg['message'])?.['content'];
    if (!Array.isArray(content)) {
      return;
    }
    const session = this.sessions.get(this.currentSessionId(sessionId));
    if (!session) {
      return;
    }
    for (const item of content) {
      const block = asObject(item);
      const id = block?.['tool_use_id'];
      if (
        block?.['type'] !== 'tool_result' ||
        typeof id !== 'string' ||
        !session.spawnReturned.has(id)
      ) {
        continue;
      }
      session.spawnReturned.set(id, true);
      const resultText = toolResultText(block['content']);
      const background = this.resolveRegistryRecord(session, id).record?.isBackground ||
        (session.startedTasks.get(id)?.background ??
          (session.tasks.get(id)?.background || /^Async agent launched\b/i.test(resultText.trimStart())));
      const outputFile = background ? readOutputFile(resultText) : undefined;
      if (outputFile) {
        session.tasks.set(id, { ...session.tasks.get(id), outputFile });
      }
      const state = session.subagents.get(id);
      if (state && resultText.trim() && block['is_error'] !== true && !background) {
        state.foregroundReturned = true;
        if (state.stopHookSeen && state.warnedAgentId) {
          await this.finishWarnedInvocation(session, id, state, state.warnedAgentId);
        }
      }
      const pending = state?.pendingNotice;
      if (!state || !pending || this.liveSession(session)?.subagents.get(id) !== state) {
        continue;
      }
      state.pendingNotice = undefined;
      if (state.handoffDelivered) continue;
      if (
        (state.stopFired && state.stopState === 'none') ||
        this.dispatcher.withdrawMainThreadNotice(
          pending.sessionId,
          pending.handoff.text,
        )
      ) {
        state.handoffDelivered = true;
        await this.delivery.send(session.sessionId, id, pending.handoff);
      } else {
        // The queued notice already reached the parent. The hook must not repeat it.
        state.handoffDelivered = true;
      }
    }
  }

  private count(session: SessionState, toolCallId: string, state: SubagentState, msg: JsonObject,
    usage: SubagentRequestUsage, settings: AgentBudgetSettings, policy: AgentBudgetPolicy): void {
    const taskId = session.startedTasks.get(toolCallId)?.taskId ?? this.resolveRegistryRecord(session, toolCallId).record?.taskId ?? toolCallId;
    countSubagentUsage(state, asObject(msg['message']), usage, settings, policy,
      invocationKey(toolCallId, state), session.sessionId, taskId, this.logger);
  }

  private resolveRegistryRecord(session: SessionState, toolCallId: string) {
    const directRecord = this.registry.get(toolCallId);
    if (directRecord) return { record: directRecord, registryToolCallId: toolCallId };
    const taskId = session.startedTasks.get(toolCallId)?.taskId;
    const hookToolCallId = taskId ? this.registry.getToolCallIdByAgentId(taskId) : null;
    const hookRecord = hookToolCallId ? this.registry.get(hookToolCallId) : null;
    const record = hookRecord?.parentSessionId === session.sessionId
      && hookRecord.status === 'running' && hookRecord.agentId === taskId
      ? hookRecord : null;
    return { record, registryToolCallId: record?.toolCallId };
  }

  private async finalizeNotes(prepared: PreparedHandoff, recordKey: string, ownsInvocation: () => boolean): Promise<boolean> {
    try {
      if (!prepared.notesPathToRedact ||
          await this.handoffFiles.redactNotes(prepared.notesPathToRedact, redactBudgetSecrets)) {
        if (!ownsInvocation()) return false;
        if (!prepared.record || await this.records.markScrubbed(recordKey, prepared.record.path)) return true;
        throw new Error('Handoff scrub proof could not be persisted');
      }
      throw new Error(`Could not redact handoff notes for agent ${prepared.handoff.subject.agentId ?? recordKey}`);
    } catch (error: unknown) {
      this.logger.error('[SubagentBudgetMonitor] Handoff notes redaction failed; record withheld',
        error instanceof Error ? error : new Error(String(error)));
      if (prepared.record) {
        await this.records.disposeUnsafe(recordKey, prepared.record.path);
      }
      return false;
    }
  }

  /**
   * Build the handoff of a stop and write its record. `undefined` when the
   * stop does not run now: the session was released, or a handoff stop's
   * record was not saved (counted; the next request retries). A safety stop
   * whose record was not saved goes on without one.
   */
  private async prepareHandoff(
    session: SessionState,
    toolCallId: string,
    recordKey: string,
    state: SubagentState,
    limits: {
      readonly handoffTokens: number;
      readonly stopWeightedTokens: number;
    },
    who: Omit<HandoffSubject, 'outputFile'>,
    ownsInvocation: () => boolean,
    allowInMemoryOnFailure: boolean,
  ): Promise<PreparedHandoff | undefined> {
    let files = await prepareHandoffFiles(
      this.handoffFiles,
      state.handoffPaths ??
        this.handoffFiles.paths(session.sessionId, recordKey),
      session.tasks.get(toolCallId)?.prompt,
    );
    if (!ownsInvocation()) return undefined;
    if (files.unavailable) {
      this.logger.warn(
        '[SubagentBudgetMonitor] Handoff files not ready in time; handing off without them',
        { sessionId: session.sessionId, toolCallId },
      );
    }
    // Released while the files were written: the session is over.
    const live = this.liveSession(session);
    if (!live && !allowInMemoryOnFailure) {
      return undefined;
    }
    // Read after the wait: a background tool result may have named the output file.
    const durableSession = live ?? session;
    const task = durableSession.tasks.get(toolCallId);
    const subject: HandoffSubject = {
      ...who,
      teammateName: who.teammateName ?? task?.name,
      outputFile: state.terminalOutputFile ?? task?.outputFile,
    };
    const usage: HandoffUsage = {
      reason: 'handoff', cause: state.stopCause,
      contextTokens: state.contextTokens,
      weightedUsed: state.weightedUsed,
      handoffTokens: limits.handoffTokens,
      stopWeightedTokens: limits.stopWeightedTokens,
    };
    if (who.agentId && !state.transcriptPath) {
      const workspace = this.records.workspaceOf(durableSession.sessionId);
      if (workspace) {
        const cached = this.transcriptLookup.get(stoppedIdentityKey(durableSession.sessionId, who.agentId));
        if (cached && cached.expiresAt > Date.now()) {
          state.transcriptPath = cached.path;
        } else {
          const transcript = await this.lookupTranscript(os.homedir(), workspace, durableSession.sessionId, who.agentId);
          if (!ownsInvocation()) return undefined;
          state.transcriptPath = transcript;
          this.cacheTranscript(durableSession.sessionId, who.agentId, transcript);
        }
      }
    }
    const progress: HandoffProgress = {
      lastAssistantText: state.lastAssistantText,
      filePaths: [...state.filePaths],
      permittedPaths: who.agentId ? this.notesGate.paths(scopedAgentKey(durableSession.sessionId, who.agentId)) : [],
      toolCalls: state.toolCalls.map(({ name, targetPath, outcome }) => ({ name, targetPath, outcome })),
      transcriptPath: state.transcriptPath,
    };
    if (files.paths && !files.notesWritten && !files.unavailable) {
      const inferred = [
        '# Subagent progress (host-generated, inferred)',
        'This snapshot may be incomplete. Verify before continuing.',
        `Task: ${task?.text ?? 'unknown'}`,
        `Last assistant text: ${progress.lastAssistantText ?? 'unknown'}`,
        `Files targeted: ${progress.filePaths.join(', ') || 'unknown'}`,
        `Recent tools: ${progress.toolCalls.map((call) => `${call.name} (${call.targetPath ?? 'unknown'}): ${call.outcome}`).join('; ') || 'unknown'}`,
        `Transcript: ${progress.transcriptPath ?? 'unknown'}`,
      ].join('\n').slice(0, 16_000);
      const written = await this.handoffFiles.ensureFallbackNotes?.(files.paths, inferred, redactBudgetSecrets);
      if (!ownsInvocation()) return undefined;
      if (written) files = { ...files, notesWritten: true, notesInferred: true };
    }
    if (files.paths && files.notesWritten && !await this.handoffFiles.redactNotes(files.paths, redactBudgetSecrets)) {
      this.logger.error('[SubagentBudgetMonitor] Handoff notes redaction failed; notes omitted',
        new Error(`Could not redact handoff notes for agent ${who.agentId ?? toolCallId}`));
      files = { taskSaved: files.taskSaved, notesWritten: false, unavailable: true };
    }
    if (!ownsInvocation()) return undefined;
    const previous = await readPredecessor(this.records.workspaceOf(durableSession.sessionId), { prompt: task?.prompt }, this.logger, durableSession.sessionId);
    if (!ownsInvocation()) return undefined;
    const lineage = successorLineage(previous, { predecessor: task?.prompt?.match(/^Ptah predecessor handoff: (.+)$/m)?.[1], notes: files.paths?.notes,
      warningReached: state.warningRequestCount !== undefined, requestCount: state.warningRequestCount ?? state.requestOrder.size, initialContext: state.initialContext ?? state.contextTokens,
      effectiveH: limits.handoffTokens, completedDeliverable: !!who.agentId && this.deliverables.completed(scopedAgentKey(durableSession.sessionId, who.agentId), task?.deliverables ?? [], this.records.workspaceOf(durableSession.sessionId) ?? '.', files.paths?.notes) });
    const cooperative = state.stopCause?.forced === false;
    const recordText = redactBudgetSecrets(handoffMessage(subject, usage, task?.text, files, undefined, progress) + '\n' + renderLineage(lineage));
    const write = await this.records.writeOnce(
      durableSession.sessionId,
      recordKey,
      recordText,
    );
    if (write.ok) {
      return {
        usage,
        notesPathToRedact: files.notesWritten ? files.paths : undefined,
        record: {
          path: write.path,
          workspace: write.workspace,
          name: write.name,
        },
        handoff: {
          text: redactBudgetSecrets(cooperative
            ? withLead(handoffMessage(subject, usage, task?.text, files, write.path, progress) + '\n' + renderLineage(lineage), formatHandoffNormalReturn(subject.agentId ?? subject.taskId, write.path))
            : handoffMessage(subject, usage, task?.text, files, write.path, progress) + '\n' + renderLineage(lineage)),
          subject,
          recordPath: write.path,
        },
      };
    }
    if (!ownsInvocation()) return undefined;
    const current = this.liveSession(session);
    if (allowInMemoryOnFailure) {
      this.logger.warn('[SubagentBudgetMonitor] Handoff record unavailable; delivering in-memory handoff', {
        sessionId: current?.sessionId ?? durableSession.sessionId, toolCallId,
        errorType: write.errorType, errorCode: write.errorCode,
      });
      return { usage, handoff: { text: redactBudgetSecrets(withLead(recordText, formatHandoffRecordFailure(subject.agentId ?? subject.taskId))), subject }, notesPathToRedact: files.notesWritten ? files.paths : undefined };
    }
    if (current) this.onRecordFailed(current.sessionId, toolCallId, state, write, state.lastMessageId);
    return undefined;
  }

  /**
   * A handoff record was not saved: the write is retried, until
   * {@link MAX_RECORD_ATTEMPTS} writes failed; then the handoff is delivered
   * in memory with the record-failure notice.
   */
  private onRecordFailed(
    sessionId: string,
    toolCallId: string,
    state: SubagentState,
    failure: { readonly errorType: string; readonly errorCode?: string },
    attemptMessageId: string | undefined,
  ): void {
    state.recordFailures += 1;
    state.failedAttemptMessageId = attemptMessageId;
    if (state.recordFailures < MAX_RECORD_ATTEMPTS) {
      this.logger.debug(
        '[SubagentBudgetMonitor] Handoff record not saved; the returning agent retries the write',
        { sessionId, toolCallId, attempt: state.recordFailures },
      );
      return;
    }
    state.recordGaveUp = true;
    this.logger.warn(
      '[SubagentBudgetMonitor] Handoff record not saved after 3 attempts; the handoff travels in memory only',
      {
        sessionId,
        toolCallId,
        attempts: state.recordFailures,
        errorType: failure.errorType,
        errorCode: failure.errorCode,
      },
    );
  }

  /**
   * Hand the parent the handoff once: as a user turn when the spawning tool
   * result already returned, else through the notice queue.
   */
  private async deliverHandoff(
    live: SessionState,
    toolCallId: string,
    stoppedState: SubagentState,
    handoff: Handoff,
    releaseAfterPush = false,
  ): Promise<void> {
    const sessionId = live.sessionId;
    if (stoppedState.handoffDelivered) return;
    stoppedState.handoffDelivered = true;
    const delivery = this.delivery.send(sessionId, toolCallId, handoff);
    if (releaseAfterPush) {
      // The SDK can acknowledge streamInput only while the output iterator
      // continues. The call above starts the full parent push in order; let
      // its bounded acceptance check finish without holding that iterator.
      void delivery.catch((error: unknown) => this.logger.error(
        '[SubagentBudgetMonitor] Parent handoff delivery failed',
        { error: error instanceof Error ? error : new Error(String(error)), sessionId, toolCallId },
      ));
      return;
    }
    await delivery;
  }
}

/** The `output_file:` line of a spawning tool result (string or text blocks), if any. */
function readOutputFile(text: string): string | undefined {
  return text.match(/^[ \t]*output_file:[ \t]*(\S[^\n]*?)[ \t]*(?:\n|$)/im)?.[1];
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((block) => asObject(block)?.['text'] ?? '').join('\n') : '';
}

/** Track `toolUseId` as a call that may spawn a subagent; a known result stays known. */
function trackSpawn(session: SessionState, toolUseId: string): void {
  if (!session.spawnReturned.has(toolUseId)) {
    session.spawnReturned.set(toolUseId, false);
  }
}

/** The trusted notice for one admission transition; copy comes from the shared builders. */
function admissionNotice(
  action: 'asked-handoff' | 'paused',
  assessment: AgentAdmissionAssessment,
  nextStep: AgentActionNotice['nextStep'],
): AgentActionNotice {
  return {
    actor: 'ptah-budget',
    action,
    reason: assessment.reason ?? 'weighted-budget',
    nextStep,
    ...(assessment.measured !== undefined ? { measured: assessment.measured } : {}),
    ...(assessment.limit !== undefined ? { limit: assessment.limit } : {}),
    ...(assessment.unit ? { unit: assessment.unit } : {}),
  };
}

function budgetLifecycle(state: SubagentState): NonNullable<AgentBudgetState['lifecycle']> {
  if (state.stopState === 'stopped' || state.sdkOutcome) return 'stopped';
  if (state.stopFired) return 'settled';
  if (state.stopInFlight) return 'finalizing';
  return state.admission === 'asked-handoff' ? 'asked' : state.admission;
}

/** Reused spawn ids get separate notes paths and record writers. */
function invocationKey(toolCallId: string, state: SubagentState): string {
  return state.generation === 0 ? toolCallId : `${toolCallId}-g${state.generation}`;
}

/** The subagent's handoff finalization is running or has finished (legacy field names stopInFlight / stopFired). */
function isFinalized(state: SubagentState): boolean {
  return state.stopState !== 'none' || state.sdkOutcome !== undefined || state.stopInFlight || state.stopFired;
}

/** Swap the first (summary) line of a handoff message for the shared cooperative-return copy. */
function withLead(message: string, lead: string): string {
  const newline = message.indexOf('\n');
  return newline < 0 ? lead : `${lead}${message.slice(newline)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
