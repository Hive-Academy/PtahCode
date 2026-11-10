import {
  GitWindowCandidateSchema,
  GitWindowEmptyParamsSchema,
  GitWindowPublishScopeParamsSchema,
  GitWindowScopeSchema,
  GitWindowSetModeParamsSchema,
} from './rpc-git-window.types';

const candidate = {
  tabId: 'tab-1',
  sessionId: 'session-1',
  sessionName: 'Session',
  organizationWorktreePath: 'C:/repo',
  organizationResolved: true,
  agentOriginWorktreePath: null,
  sessionCwd: null,
};
const scope = {
  version: 1,
  sequence: 0,
  workspaceRoot: 'C:/repo',
  repoRoot: 'C:/repo',
  mode: 'follow-session',
  active: candidate,
  pinnedTabId: null,
  open: [candidate],
  unresolved: false,
};

describe('Git window wire schemas', () => {
  it('accepts the planned payloads', () => {
    expect(GitWindowCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(GitWindowScopeSchema.safeParse(scope).success).toBe(true);
    expect(GitWindowPublishScopeParamsSchema.safeParse({ scope }).success).toBe(true);
    expect(GitWindowSetModeParamsSchema.safeParse({ mode: 'pinned', tabId: 'tab-1' }).success).toBe(true);
    expect(GitWindowEmptyParamsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects extra keys at each object boundary', () => {
    expect(GitWindowCandidateSchema.safeParse({ ...candidate, extra: true }).success).toBe(false);
    expect(GitWindowScopeSchema.safeParse({ ...scope, extra: true }).success).toBe(false);
    expect(GitWindowScopeSchema.safeParse({ ...scope, active: { ...candidate, extra: true } }).success).toBe(false);
    expect(GitWindowPublishScopeParamsSchema.safeParse({ scope, extra: true }).success).toBe(false);
    expect(GitWindowSetModeParamsSchema.safeParse({ mode: 'pinned', tabId: null, extra: true }).success).toBe(false);
    expect(GitWindowEmptyParamsSchema.safeParse({ extra: true }).success).toBe(false);
  });

  it('rejects oversized strings and arrays', () => {
    expect(GitWindowCandidateSchema.safeParse({ ...candidate, tabId: 'x'.repeat(257) }).success).toBe(false);
    expect(GitWindowCandidateSchema.safeParse({ ...candidate, sessionId: 'x'.repeat(513) }).success).toBe(false);
    expect(GitWindowCandidateSchema.safeParse({ ...candidate, sessionName: 'x'.repeat(513) }).success).toBe(false);
    expect(GitWindowCandidateSchema.safeParse({ ...candidate, sessionCwd: 'x'.repeat(4097) }).success).toBe(false);
    expect(GitWindowScopeSchema.safeParse({ ...scope, workspaceRoot: 'x'.repeat(4097) }).success).toBe(false);
    expect(GitWindowScopeSchema.safeParse({ ...scope, open: Array(101).fill(candidate) }).success).toBe(false);
    expect(GitWindowSetModeParamsSchema.safeParse({ mode: 'pinned', tabId: 'x'.repeat(257) }).success).toBe(false);
  });

  it('rejects wrong version and invalid sequences', () => {
    expect(GitWindowScopeSchema.safeParse({ ...scope, version: 2 }).success).toBe(false);
    expect(GitWindowScopeSchema.safeParse({ ...scope, sequence: -1 }).success).toBe(false);
    expect(GitWindowScopeSchema.safeParse({ ...scope, sequence: 1.5 }).success).toBe(false);
  });
});
