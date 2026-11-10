import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { GitWindowCandidate, GitWindowScope } from '@ptah-extension/shared';

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
 * - A worktree is created only inside a scope root.
 * - `git:cancelOperation` and the operation pushes work only for an operation
 *   that the child started itself.
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
const StatusPushSchema = z.object({ payload: z.object({ workspaceRoot: z.string().min(1) }) });
const FilePushSchema = z.object({
  payload: z.object({ filePaths: z.array(z.string()), truncated: z.boolean() }),
});
const OperationPushSchema = z.object({ payload: OperationParamsSchema });
const WorktreePushSchema = z.object({
  payload: z.object({ operationId: z.string().optional(), path: z.string().min(1).optional() }),
});
const WorktreesResultSchema = z.object({
  worktrees: z.array(z.object({ path: z.string().min(1) })),
});

function rootKey(root: string): string {
  const resolved = path.resolve(root);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * `target` with its symbolic links resolved. A part that does not exist yet
 * (a new file) stays as it is under its resolved parent.
 */
function physicalPath(target: string): string {
  let existing = path.resolve(target);
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(realpathSync.native(existing), ...rest);
    } catch {
      // degradation-audit: optional-capability - this part does not exist (or
      // cannot be read); its parent decides, and the lexical check ran before.
      const parent = path.dirname(existing);
      if (parent === existing) return path.resolve(target);
      rest.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

/** Inside `roots` by name, and also after symbolic links are resolved. */
function isPhysicallyInside(target: string, roots: ReadonlySet<string>): boolean {
  if (!isInside(target, roots)) return false;
  const physicalRoots = new Set([...roots].map((root) => rootKey(physicalPath(root))));
  return isInside(physicalPath(target), physicalRoots);
}

function isInside(target: string, roots: ReadonlySet<string>): boolean {
  const key = rootKey(target);
  for (const root of roots) {
    if (key === root) return true;
    const relative = path.relative(root, key);
    if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) return true;
  }
  return false;
}

function keys(roots: readonly (string | null)[]): Set<string> {
  return new Set(roots.filter((root): root is string => root !== null).map(rootKey));
}

function candidateRoots(candidate: GitWindowCandidate | null): (string | null)[] {
  return candidate === null ? [] : [
    candidate.organizationWorktreePath, candidate.agentOriginWorktreePath, candidate.sessionCwd,
  ];
}

export class GitWindowScopeGuard {
  /** Worktrees the host listed for a scope root, by root key. */
  private listed = new Set<string>();
  private listedFor: string | null = null;
  /** Operations the child started with an authorized call. */
  private readonly ownOperations = new Set<string>();

  constructor(private readonly scope: () => GitWindowScope | null) {}

  /** `true` when the Git child may run `method` with `params` in its acknowledged scope. */
  authorize(method: string, params: unknown): boolean {
    if (UNSCOPED_METHODS.has(method)) return true;
    const operation = OperationParamsSchema.safeParse(params);
    if (method === 'git:cancelOperation') {
      return operation.success && this.ownOperations.has(operation.data.operationId);
    }
    if (!this.authorizeScoped(method, params)) return false;
    if (operation.success) this.rememberOperation(operation.data.operationId);
    return true;
  }

  /**
   * The copy of a mirrored host push that the child may see, or `null`.
   * A push that names no root of the scope, or an operation of another
   * window, is dropped.
   */
  filterPush(message: { readonly type: string }): unknown {
    const scope = this.scope();
    if (scope === null) return null;
    const readRoots = new Set([...keys([scope.repoRoot, scope.workspaceRoot]), ...this.listedWorktrees(scope)]);
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
      return parsed.success && this.ownOperations.has(parsed.data.payload.operationId) ? message : null;
    }
    if (message.type === 'git:worktreeChanged') {
      const parsed = WorktreePushSchema.safeParse(message);
      if (!parsed.success) return null;
      const { operationId, path: worktree } = parsed.data.payload;
      if (operationId !== undefined) return this.ownOperations.has(operationId) ? message : null;
      return worktree !== undefined && isInside(worktree, readRoots) ? message : null;
    }
    return null;
  }

  private rememberOperation(operationId: string): void {
    if (this.ownOperations.size >= MAX_OWN_OPERATIONS) {
      for (const oldest of this.ownOperations) {
        this.ownOperations.delete(oldest);
        break;
      }
    }
    this.ownOperations.add(operationId);
  }

  private authorizeScoped(method: string, params: unknown): boolean {
    const scope = this.scope();
    if (scope === null) return false;
    const writeRoots = keys([scope.repoRoot]);
    const scopeRoots = keys([scope.repoRoot, scope.workspaceRoot]);
    const readRoots = new Set([...scopeRoots, ...this.listedWorktrees(scope)]);

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
      // A relative target stays in the named root (the host checks it); an absolute one must be in the scope.
      const target = AddWorktreeParamsSchema.safeParse(params);
      if (!target.success) return false;
      const requested = target.data.path;
      if (requested !== undefined && (path.isAbsolute(requested) || path.win32.isAbsolute(requested)) &&
          !isInside(requested, scopeRoots)) return false;
    }
    if (WORKTREE_WRITE_METHODS.has(method)) return scopeRoots.has(root);
    return writeRoots.has(root);
  }

  /** Remember the worktrees the host listed for a scope root. */
  observeResult(method: string, params: unknown, data: unknown): void {
    if (method !== 'git:worktrees') return;
    const scope = this.scope();
    const request = RootParamsSchema.safeParse(params);
    const result = WorktreesResultSchema.safeParse(data);
    if (scope === null || !request.success || !result.success) return;
    if (!keys([scope.repoRoot, scope.workspaceRoot]).has(rootKey(request.data.workspaceRoot))) return;
    this.listedWorktrees(scope);
    for (const worktree of result.data.worktrees.slice(0, MAX_LISTED_WORKTREES)) {
      if (this.listed.size >= MAX_LISTED_WORKTREES) break;
      this.listed.add(rootKey(worktree.path));
    }
  }

  /** The listed worktrees of the current scope roots; a change of the roots drops them. */
  private listedWorktrees(scope: GitWindowScope): ReadonlySet<string> {
    const owner = [...keys([scope.repoRoot, scope.workspaceRoot])].sort().join('\n');
    if (owner !== this.listedFor) {
      this.listedFor = owner;
      this.listed = new Set<string>();
    }
    return this.listed;
  }

  private authorizePath(params: unknown, roots: ReadonlySet<string>): boolean {
    const parsed = PathParamsSchema.safeParse(params);
    if (!parsed.success) return false;
    const { workspaceRoot, documentPath } = parsed.data;
    if (workspaceRoot !== undefined && !roots.has(rootKey(workspaceRoot))) return false;
    if (documentPath !== undefined && !isPhysicallyInside(documentPath, roots)) return false;
    if (path.isAbsolute(parsed.data.path)) return isPhysicallyInside(parsed.data.path, roots);
    // A relative path resolves against the named root; with no root the host uses the active folder.
    return workspaceRoot !== undefined && isPhysicallyInside(path.resolve(workspaceRoot, parsed.data.path), roots);
  }
}
