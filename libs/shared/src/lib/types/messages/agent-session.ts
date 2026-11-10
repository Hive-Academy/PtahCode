import type { EffortLevel } from '../ai-provider.types';

/**
 * How a child session got its model or effort: `pin` is an explicit value from
 * the parent call, `model` is a valid answer of the decision model, `ranking`
 * is the deterministic rule, and `default` is the host default.
 */
export const CHILD_SETTING_SOURCES = ['pin', 'model', 'ranking', 'default'] as const;
export type ChildSettingSource = (typeof CHILD_SETTING_SOURCES)[number];

/**
 * Payload describing a child chat session started by a parent session with
 * `ptah_session_start` (TASK_2026_584).
 *
 * The backend pushes it to the webview when the child's tab should open, and
 * returns it from `chat:agent-sessions` so a (re)loaded webview can adopt the
 * tabs of children that are still live. The webview adopts it into the panel
 * that holds `parentTabId`; every other panel ignores it.
 */
export interface AgentSessionOpenedPayload {
  /** Child tab id: the stream key the child's events are routed by. */
  readonly tabId: string;
  /** Child SDK session id once resolved; `null` in the live push. */
  readonly sessionId: string | null;
  /** The parent's tab id (its MCP routing id). */
  readonly parentTabId: string;
  /** The parent's SDK session id, when it is known. */
  readonly parentSessionId: string | null;
  /** Workspace root the child belongs to: the tab partition and sidebar group. */
  readonly workspaceRoot: string;
  /** The child's git worktree, its working directory. */
  readonly worktreePath: string;
  readonly branch: string;
  readonly label: string;
  readonly taskId?: string;
  /** The task text shown as the first user turn of the child tab. */
  readonly displayPrompt: string;
  /** Epoch milliseconds the child was started at. */
  readonly startedAt: number;
  /** Resolved model id. Absent when the host default applies and its id is unknown. */
  readonly model?: string;
  /** Resolved effort. Absent when the host default applies. */
  readonly effort?: EffortLevel;
  readonly modelSource?: ChildSettingSource;
  readonly effortSource?: ChildSettingSource;
}
