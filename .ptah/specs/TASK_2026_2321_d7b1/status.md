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
- impl done; related tests, lint, typecheck of vscode-lm-tools pass (local)
- review round 1 (code-logic-review.md): 1 serious + 3 moderate fixed:
  pruned folders named in skippedNote; list applies from an excluded target; probe fails closed
  (canGitGrepSearchRoot); Code Mode checks the root against the host roots; args read once.
- live test (isolated HOME, ports 51821/51991, own PIDs only, no model run), build of the review-fix commit:
  - ptah_grep in a workspace under an ignored dir of a parent repo: `git grep` gives silent 0 (reproduced);
    the fixed app answers `1 match in 1 file (engine: node)` and names the pruned `build` folder.
  - execute_code: ptah.help() lists CODE, SESSION, ROUTE, BROWSER, SKILL, WEBSEARCH; ptah.help('code') works;
    ptah.code.grep, ptah.code.readSymbol, searchSymbols work; workspaceRoot refused; errors thrown.
  - Setting mcp.externalCallerAccess=full was set only in the isolated settings (a direct call is read-only by default).
- gate: `npm run verify -- -p vscode-lm-tools` (lint, typecheck, test) passed, head 521445f1c
- next: push, PR, watch CI and reviews
- PR #1494 head e5e07fc8da01bc831b5ad36a780c2786ea756ae3: CI 17 pass (macOS git-real-git rerun after a cancelled
  runner), 0 open review threads. CodeRabbit 2 findings fixed in e5e07fc8d. Waiting for the parent to merge.
