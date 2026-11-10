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
 *
 * The main window is not restricted: it never passes through this guard.
 */

const UNSCOPED_METHODS: ReadonlySet<string> = new Set([
  'gitWindow:getScope', 'gitWindow:close', 'gitWindow:setMode',
  'git:cancelOperation', 'editor:detectTargets', 'settings:get', 'settings:set',
]);
const READ_METHODS: ReadonlySet<string> = new Set([
  'git:info', 'git:reviewChanges', 'git:reviewFile', 'git:diffFile', 'git:log',
  'git:lastCommit', 'git:branches', 'git:remotes', 'git:worktrees',
  'git:stashList', 'git:stashShow', 'git:prStatus',
]);
const WORKTREE_WRITE_METHODS: ReadonlySet<string> = new Set(['git:addWorktree', 'git:removeWorktree']);
const PATH_READ_METHODS: ReadonlySet<string> = new Set(['file:viewContent', 'editor:openFile', 'editor:openMerge']);
const MAX_LISTED_WORKTREES = 256;

const RootParamsSchema = z.object({ workspaceRoot: z.string().min(1) });
const WatchRootsParamsSchema = z.object({ roots: z.array(z.string().min(1)).max(64) });
const OpenWorkspaceParamsSchema = z.object({ root: z.string().min(1) });
const PathParamsSchema = z.object({
  path: z.string().min(1),
  workspaceRoot: z.string().min(1).optional(),
  documentPath: z.string().min(1).optional(),
});
const WorktreesResultSchema = z.object({
  worktrees: z.array(z.object({ path: z.string().min(1) })),
});

function rootKey(root: string): string {
  const resolved = path.resolve(root);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
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

  constructor(private readonly scope: () => GitWindowScope | null) {}

  /** `true` when the Git child may run `method` with `params` in its acknowledged scope. */
  authorize(method: string, params: unknown): boolean {
    if (UNSCOPED_METHODS.has(method)) return true;
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
    if (documentPath !== undefined && !isInside(documentPath, roots)) return false;
    if (path.isAbsolute(parsed.data.path)) return isInside(parsed.data.path, roots);
    // A relative path resolves against the named root; with no root the host uses the active folder.
    return workspaceRoot !== undefined && isInside(path.resolve(workspaceRoot, parsed.data.path), roots);
  }
}
