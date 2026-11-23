import picomatch from 'picomatch';
import {
  NESTED_WORKSPACE_PATH_RULES,
  toWorkspaceExcludeGlobs,
} from '@ptah-extension/shared';

/**
 * Glob excludes shared by every workspace walk and glob-based watcher: the
 * file index and its watcher, the indexer, context gathering, TypeScript
 * diagnostics and the MCP `findFiles` builders.
 *
 * The nested-checkout rules (agent worktrees) are DERIVED from
 * `NESTED_WORKSPACE_PATH_RULES` rather than hand-listed, so the segment
 * predicate and these globs cannot drift apart (TASK_2026_437 INV-2, pinned by
 * `workspace-default-excludes.spec.ts`).
 */
export const DEFAULT_WORKSPACE_EXCLUDES: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.ptah/specs/**',
  '**/.svn/**',
  '**/.hg/**',
  '**/out/**',
  '**/target/**',
  '**/.nx/**',
  '**/.angular/**',
  '**/.cache/**',
  '**/.vite/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.turbo/**',
  '**/.output/**',
  '**/.vscode-test/**',
  '**/coverage/**',
  '**/.nyc_output/**',
  '**/tmp/**',
  '**/.DS_Store',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  ...toWorkspaceExcludeGlobs(NESTED_WORKSPACE_PATH_RULES),
];

/** Agent-harness and Ptah folders: shown by the `@` picker, never in the code symbol index. */
export const CODE_INDEX_EXTRA_EXCLUDES: readonly string[] = [
  '**/.ptah/**',
  '**/.claude/**',
  '**/.agents/**',
  '**/.codex/**',
  '**/.github/skills/**',
  '**/.github/agents/**',
  '**/.opencode/**',
  '**/.cursor/**',
  '**/.augment/**',
  '**/.bob/**',
  '**/.qwen/**',
  '**/.roo/**',
  '**/.trae/**',
  '**/.vibe/**',
  '**/.windsurf/**',
  '**/.zencoder/**',
];

export const CODE_INDEX_EXCLUDES: readonly string[] = [
  ...DEFAULT_WORKSPACE_EXCLUDES,
  ...CODE_INDEX_EXTRA_EXCLUDES,
];

let matchesCodeIndexExclude: ReturnType<typeof picomatch> | undefined;

/** Tests a workspace-relative path using the ignore resolver's dot and case rules. */
export function isCodeIndexExcluded(relativePath: string): boolean {
  const normalized = relativePath
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/|\/)+/, '');
  if (!normalized) return false;
  matchesCodeIndexExclude ??= picomatch([...CODE_INDEX_EXCLUDES], {
    dot: true,
    nocase: process.platform === 'win32',
  });
  return matchesCodeIndexExclude(normalized);
}
