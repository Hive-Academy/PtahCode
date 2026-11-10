import { z } from 'zod';

/** The main renderer chooses the session; the Electron host assigns sequence. */
export type GitWindowMode = 'follow-session' | 'pinned';

export const GitWindowCandidateSchema = z.strictObject({
  tabId: z.string().min(1).max(256),
  sessionId: z.string().min(1).max(512).nullable(),
  sessionName: z.string().max(512),
  organizationWorktreePath: z.string().min(1).max(4096).nullable(),
  organizationResolved: z.boolean(),
  agentOriginWorktreePath: z.string().min(1).max(4096).nullable(),
  sessionCwd: z.string().min(1).max(4096).nullable(),
});
export type GitWindowCandidate = z.infer<typeof GitWindowCandidateSchema>;

export const GitWindowScopeSchema = z.strictObject({
  version: z.literal(1),
  sequence: z.number().int().nonnegative(),
  workspaceRoot: z.string().min(1).max(4096).nullable(),
  repoRoot: z.string().min(1).max(4096).nullable(),
  mode: z.enum(['follow-session', 'pinned']),
  active: GitWindowCandidateSchema.nullable(),
  pinnedTabId: z.string().min(1).max(256).nullable(),
  open: z.array(GitWindowCandidateSchema).max(100),
  unresolved: z.boolean(),
  /** Theme of the main window. The Git window follows it, as the Display window does. */
  themeName: z.string().min(1).max(64).optional(),
});
export type GitWindowScope = Omit<z.infer<typeof GitWindowScopeSchema>, 'open'> & {
  readonly open: readonly GitWindowCandidate[];
};

export const GitWindowEmptyParamsSchema = z.strictObject({});
export type GitWindowEmptyParams = Record<string, never>;
export type GitWindowOpenParams = GitWindowEmptyParams;
export type GitWindowCloseParams = GitWindowEmptyParams;
export type GitWindowStatusParams = GitWindowEmptyParams;
export type GitWindowGetScopeParams = GitWindowEmptyParams;

export const GitWindowPublishScopeParamsSchema = z.strictObject({
  scope: GitWindowScopeSchema,
});
export type GitWindowPublishScopeParams = { readonly scope: GitWindowScope };

export const GitWindowSetModeParamsSchema = z.strictObject({
  mode: z.enum(['follow-session', 'pinned']),
  tabId: z.string().min(1).max(256).nullable(),
});
export type GitWindowSetModeParams = z.infer<typeof GitWindowSetModeParamsSchema>;

export type GitWindowOpenResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not-ready' };
export type GitWindowCloseResult = { readonly closed: boolean };
export type GitWindowStatusResult = { readonly open: boolean };
/** The host returns its accepted scope with a host-assigned sequence. */
export type GitWindowPublishScopeResult = {
  readonly accepted: boolean;
  readonly scope: GitWindowScope | null;
};
export type GitWindowGetScopeResult = GitWindowScope | null;
export type GitWindowSetModeResult = { readonly accepted: boolean };

export const GIT_WINDOW_PUSH_TYPES = {
  scope: 'gitWindow:scope',
  closed: 'gitWindow:closed',
  setMode: 'gitWindow:setMode',
} as const;
export type GitWindowPushType =
  (typeof GIT_WINDOW_PUSH_TYPES)[keyof typeof GIT_WINDOW_PUSH_TYPES];
export type GitWindowScopePushPayload = GitWindowScope;
export type GitWindowSetModePushPayload = GitWindowSetModeParams;
