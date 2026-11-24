# Context — nav follow-ups (grep ignored root, Code Mode discoverability)

Source: benchmark report PR #1493 (TASK_2026_2320_15a6), findings (c)2 and (d).

## Plan
1. grep-engine: `isRootIgnoredByGit` (`git check-ignore -q -- .` in the root; exit 0 = ignored).
   grep.ts: skip `git grep` when the root is ignored, so the Node walk runs.
2. Node walk: replace NODE_SKIPPED_DIRS by `isCodeIndexExcluded` (workspace-intelligence public entry,
   already imported by grep.ts). Applied only when includeIgnored is false and the scoped target is not
   itself excluded. rg and git grep paths unchanged.
3. Code Mode: `ptah.code.grep(args)` and `ptah.code.readSymbol(args)` wrap handleGrep/handleReadSymbol.
   `workspaceRoot` is refused (no containment check in execute_code); the root is the session root.
   Help: overview lists CODE; HELP_DOCS.code topic. Guard spec: every built namespace is in the overview.

## Status
- plan done
