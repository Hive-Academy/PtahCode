import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { AGENT_WORKTREE_DIR } from '@ptah-extension/shared';
import type { GitWindowCandidate, GitWindowScope } from '@ptah-extension/shared';
import { absoluteTarget, isInside, isPhysicallyInside, keys, rootKey } from './git-window-scope-paths';

/**
 * Host-side scope check of the detached Git window (PR #1038 review, finding 1).
 *
 * The IPC allowlist authorizes only a method name. This guard binds the root
 * of each call to the scope the host acknowledged for the child:
 *
 * - A write runs only in `repoRoot`. Worktree add and remove can also name
 *   `workspaceRoot`, because they need a registered workspace folder.
 * - A read runs in `repoRoot`, `workspaceRoot`, or a worktree that the host
 *   listed for one of them (`git:worktrees`), so the worktree viewer works.
 * - `git:watchRoots` can also lease the roots of the published sessions.
 * - A method that takes a root must name it: an omitted root means "the
 *   active folder" to the host, which is not the scope of the child.
 * - A method that is not in a list below is a write.
 * - A file or editor path is checked again after symbolic links are resolved,
 *   so a link in the repository cannot name a file of another repository.
 * - A worktree is created only inside a scope root, and removed only there or
 *   when the host listed it. Both targets are checked after links are resolved.
 * - `git:cancelOperation` and the operation pushes work only for an operation
 *   that the child started itself in the current scope roots. Only a method
 *   that starts an operation records one. A change of the roots, a closed
 *   child and the end of the operation remove the record.
 * - A mirrored push is reduced to the roots of the scope ({@link filterPush}).
 *
 * The main window is not restricted: it never passes through this guard.
 */

const UNSCOPED_METHODS: ReadonlySet<string> = new Set([
  'gitWindow:getScope', 'gitWindow:close', 'gitWindow:setMode',
  'editor:detectTargets', 'settings:get', 'settings:set',
]);
const READ_METHODS: ReadonlySet<string> = new Set([
  'git:info', 'git:reviewChanges', 'git:reviewFile', 'git:diffFile', 'git:log',
  'git:lastCommit', 'git:branches', 'git:remotes', 'git:worktrees',
  'git:stashList', 'git:stashShow', 'git:prStatus',
]);
const WORKTREE_WRITE_METHODS: ReadonlySet<string> = new Set(['git:addWorktree', 'git:removeWorktree']);
const PATH_READ_METHODS: ReadonlySet<string> = new Set(['file:viewContent', 'editor:openFile', 'editor:openMerge']);
/** The methods that start an operation with the `operationId` of the caller. */
const OPERATION_METHODS: ReadonlySet<string> = new Set(['git:commit', 'git:addWorktree', 'git:removeWorktree']);
const MAX_LISTED_WORKTREES = 256;
const MAX_OWN_OPERATIONS = 256;

const RootParamsSchema = z.object({ workspaceRoot: z.string().min(1) });
const WatchRootsParamsSchema = z.object({ roots: z.array(z.string().min(1)).max(64) });
const OpenWorkspaceParamsSchema = z.object({ root: z.string().min(1) });
const PathParamsSchema = z.object({
  path: z.string().min(1),
  workspaceRoot: z.string().min(1).optional(),
  documentPath: z.string().min(1).optional(),
});
const OperationParamsSchema = z.object({ operationId: z.string().min(1).max(256) });
const AddWorktreeParamsSchema = z.object({ path: z.string().min(1).optional() });
const RemoveWorktreeParamsSchema = z.object({ path: z.string().min(1) });
const PendingResultSchema = z.object({ pending: z.literal(true) });
const StatusPushSchema = z.object({ payload: z.object({ workspaceRoot: z.string().min(1) }) });
const FilePushSchema = z.object({
  payload: z.object({ filePaths: z.array(z.string()), truncated: z.boolean() }),
});
const OperationPushSchema = z.object({ payload: OperationParamsSchema });
const WorktreePushSchema = z.object({
  payload: z.object({
    operationId: z.string().optional(),
    path: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
  }),
});
const WorktreesResultSchema = z.object({
  worktrees: z.array(z.object({ path: z.string().min(1) })),
});

function candidateRoots(candidate: GitWindowCandidate | null): (string | null)[] {
  return candidate === null ? [] : [
    candidate.organizationWorktreePath, candidate.agentOriginWorktreePath, candidate.sessionCwd,
  ];
}

export class GitWindowScopeGuard {
  /** The scope roots that own `listed` and `operations`. `null`: no open child. */
  private owner: string | null = null;
  /** Worktrees the host listed for a scope root, by root key. */
  private listed = new Set<string>();
  /** Operations the child started in the roots of `owner`, and that did not end. */
  private readonly operations = new Set<string>();

  constructor(private readonly scope: () => GitWindowScope | null) {}

  /** `true` when the Git child may run `method` with `params` in its acknowledged scope. */
  authorize(method: string, params: unknown): boolean {
    const scope = this.current();
    if (UNSCOPED_METHODS.has(method)) return true;
    const operation = OperationParamsSchema.safeParse(params);
    if (method === 'git:cancelOperation') {
      return operation.success && this.operations.has(operation.data.operationId);
    }
    if (scope === null || !this.authorizeScoped(scope, method, params)) return false;
    if (operation.success && OPERATION_METHODS.has(method)) this.rememberOperation(operation.data.operationId);
    return true;
  }

  /** The child closed: its listed worktrees and its operations are not for the next child. */
  reset(): void {
    this.owner = null;
    this.listed = new Set<string>();
    this.operations.clear();
  }

  /** The current scope. A change of its roots drops the listed worktrees and the operations. */
  private current(): GitWindowScope | null {
    const scope = this.scope();
    const owner = scope === null ? null : [...keys([scope.repoRoot, scope.workspaceRoot])].sort().join('\n');
    if (owner !== this.owner) {
      this.owner = owner;
      this.listed = new Set<string>();
      this.operations.clear();
    }
    return scope;
  }

  /**
   * The copy of a mirrored host push that the child may see, or `null`.
   * A push that names no root of the scope, or an operation of another
   * window, is dropped.
   */
  filterPush(message: { readonly type: string }): unknown {
    const scope = this.current();
    if (scope === null) return null;
    const readRoots = new Set([...keys([scope.repoRoot, scope.workspaceRoot]), ...this.listed]);
    if (message.type === 'git:status-update') {
      const parsed = StatusPushSchema.safeParse(message);
      const leaseRoots = new Set([
        ...readRoots,
        ...keys([...candidateRoots(scope.active), ...scope.open.flatMap(candidateRoots)]),
      ]);
      return parsed.success && leaseRoots.has(rootKey(parsed.data.payload.workspaceRoot)) ? message : null;
    }
    if (message.type === 'file:content-changed') {
      const parsed = FilePushSchema.safeParse(message);
      if (!parsed.success) return null;
      const filePaths = parsed.data.payload.filePaths.filter((file) => isInside(file, readRoots));
      const { truncated } = parsed.data.payload;
      return filePaths.length === 0 && !truncated ? null : { type: message.type, payload: { filePaths, truncated } };
    }
    if (message.type === 'git:operationOutput') {
      const parsed = OperationPushSchema.safeParse(message);
      return parsed.success && this.operations.has(parsed.data.payload.operationId) ? message : null;
    }
    if (message.type === 'git:worktreeChanged') {
      const parsed = WorktreePushSchema.safeParse(message);
      if (!parsed.success) return null;
      const { operationId, path: worktree, sessionId } = parsed.data.payload;
      // This push is the end of a worktree operation: the record is removed.
      if (operationId !== undefined) return this.operations.delete(operationId) ? message : null;
      if (worktree !== undefined && isInside(worktree, readRoots)) return message;
      // A new worktree is usually adjacent to the repository and not listed yet: its session decides.
      return sessionId !== undefined && this.scopeSessions(scope, readRoots).has(sessionId) ? message : null;
    }
    return null;
  }

  /** The sessions of the published scope that run in a root the child can read. */
  private scopeSessions(scope: GitWindowScope, readRoots: ReadonlySet<string>): ReadonlySet<string> {
    const sessions = new Set<string>();
    for (const candidate of [scope.active, ...scope.open]) {
      if (candidate === null || candidate.sessionId === null) continue;
      const roots = candidateRoots(candidate).filter((root): root is string => root !== null);
      if (roots.some((root) => isInside(root, readRoots))) sessions.add(candidate.sessionId);
    }
    return sessions;
  }

  private rememberOperation(operationId: string): void {
    if (this.operations.size >= MAX_OWN_OPERATIONS) {
      for (const oldest of this.operations) {
        this.operations.delete(oldest);
        break;
      }
    }
    this.operations.add(operationId);
  }

  private authorizeScoped(scope: GitWindowScope, method: string, params: unknown): boolean {
    const writeRoots = keys([scope.repoRoot]);
    const scopeRoots = keys([scope.repoRoot, scope.workspaceRoot]);
    const readRoots = new Set([...scopeRoots, ...this.listed]);

    if (method === 'git:watchRoots') {
      const parsed = WatchRootsParamsSchema.safeParse(params);
      if (!parsed.success) return false;
      const leaseRoots = new Set([
        ...readRoots,
        ...keys([...candidateRoots(scope.active), ...scope.open.flatMap(candidateRoots)]),
      ]);
      return parsed.data.roots.every((root) => leaseRoots.has(rootKey(root)));
    }
    if (method === 'editor:openWorkspace') {
      const parsed = OpenWorkspaceParamsSchema.safeParse(params);
      return parsed.success && readRoots.has(rootKey(parsed.data.root));
    }
    if (PATH_READ_METHODS.has(method) || method === 'file:saveContent') {
      return this.authorizePath(params, method === 'file:saveContent' ? writeRoots : readRoots);
    }
    const parsed = RootParamsSchema.safeParse(params);
    if (!parsed.success) return false;
    const root = rootKey(parsed.data.workspaceRoot);
    if (READ_METHODS.has(method)) return readRoots.has(root);
    if (method === 'git:addWorktree') {
      // With no target the host makes the worktree in its own folder of the named root.
      const target = AddWorktreeParamsSchema.safeParse(params);
      if (!target.success) return false;
      const requested = target.data.path ?? join(AGENT_WORKTREE_DIR, 'new');
      if (!isPhysicallyInside(absoluteTarget(parsed.data.workspaceRoot, requested), scopeRoots)) return false;
    }
    if (method === 'git:removeWorktree') {
      const target = RemoveWorktreeParamsSchema.safeParse(params);
      if (!target.success) return false;
      const requested = absoluteTarget(parsed.data.workspaceRoot, target.data.path);
      if (!this.listed.has(rootKey(requested)) && !isPhysicallyInside(requested, scopeRoots)) return false;
    }
    if (WORKTREE_WRITE_METHODS.has(method)) return scopeRoots.has(root);
    return writeRoots.has(root);
  }

  /** Remember the worktrees the host listed for a scope root, and the end of an operation. */
  observeResult(method: string, params: unknown, data: unknown): void {
    const scope = this.current();
    if (OPERATION_METHODS.has(method)) {
      // A result that is not `pending` is the end of the operation.
      const operation = OperationParamsSchema.safeParse(params);
      if (operation.success && !PendingResultSchema.safeParse(data).success) {
        this.operations.delete(operation.data.operationId);
      }
      return;
    }
    if (method !== 'git:worktrees') return;
    const request = RootParamsSchema.safeParse(params);
    const result = WorktreesResultSchema.safeParse(data);
    if (scope === null || !request.success || !result.success) return;
    if (!keys([scope.repoRoot, scope.workspaceRoot]).has(rootKey(request.data.workspaceRoot))) return;
    for (const worktree of result.data.worktrees.slice(0, MAX_LISTED_WORKTREES)) {
      if (this.listed.size >= MAX_LISTED_WORKTREES) break;
      this.listed.add(rootKey(worktree.path));
    }
  }

  private authorizePath(params: unknown, roots: ReadonlySet<string>): boolean {
    const parsed = PathParamsSchema.safeParse(params);
    if (!parsed.success) return false;
    const { workspaceRoot, documentPath } = parsed.data;
    if (workspaceRoot !== undefined && !roots.has(rootKey(workspaceRoot))) return false;
    if (documentPath !== undefined && !isPhysicallyInside(documentPath, roots)) return false;
    // A relative path resolves against the named root; with no root the host uses the active folder.
    if (workspaceRoot === undefined && !isAbsolute(parsed.data.path)) return false;
    return isPhysicallyInside(absoluteTarget(workspaceRoot ?? '', parsed.data.path), roots);
  }
}
