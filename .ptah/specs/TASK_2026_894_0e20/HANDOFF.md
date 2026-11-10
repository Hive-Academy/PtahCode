# HANDOFF — TASK_2026_894 Settings design fix

## Goal
Fix the broken Settings design in the Ptah Electron app (functionality worked; layout regressed).
User decisions already made:
- Remove `agentOrchestration.codexAutoCompactTokens` / `codexToolOutputTokenLimit`; use the global values everywhere.
- Keep the Context management design; only remove its "Codex agents" group (Codex sandbox moves to the Codex provider).
- Replace the CLI matrix table with provider cards in a responsive grid, identical width and height, **max 3 per row**.
- Duplicate lane messages are handled by child session "Lane report double wake" (`00225f3e-b405-4153-ba1a-47ed70d4f911`), not this task.

## Done
Worktree `D:\projects\ptah-extension\.claude-worktrees\settings-design`, branch `fix/settings-design` (base `c30174fca`), pushed.
**PR: https://github.com/Hive-Academy/PtahCode/pull/1014** — OPEN, head `612e0860b`, review decision REVIEW_REQUIRED.

| Commit | Subject |
| --- | --- |
| 183079e0a | fix(shared,cli-agent-runtime): derive Codex lane budgets from globals |
| 6218807f6 | fix(chat): add Ptah CLI shared defaults card and instance cards |
| 492cc9e08 | fix(chat): show friendly routing names and a capability evidence grid |
| f91548e4e | fix(chat,shared): move Codex agent behavior to Codex Credentials |
| 1befa8b17 | fix(chat,e2e): replace the CLI matrix table with provider cards |
| 51fec6936 | fix(chat,e2e): open Codex Credentials from the Codex provider card |
| 6f544ebea | fix(chat): fix provider card layout and settings visual QA defects |
| 612e0860b | fix(chat): give each full-access dialog title a unique id |

Verification (local):
- `npm run verify -- -t lint,typecheck -p chat` passed at `612e0860b`.
- `npm run verify -- -t test -p chat`: 352/353 suites passed before the spec fix; the failing spec (cli-provider-card "Credentials") was fixed; settings tests (`--testPathPatterns=settings/`) passed at `612e0860b`.
- Electron visual QA rounds 1+2 passed (`visual-qa.md`, screenshots in `qa/`). Electron dev app is stopped.
- Final code-logic review of `main...HEAD`: APPROVED (`final-review.md`). Minor #1 fixed; Minor #2, #3, #5 recorded for later.
- e2e not run locally (project rule); CI runs it.

CI at handoff time (`gh pr checks 1014`): 11 pass, 4 skipping (incl. CodeRabbit), 5 pending:
`test (shard 2/4)`, `test (shard 3/4)`, `test (shard 4/4)`, `electron-e2e (shard 2/4)`, `webview-e2e`.

## In progress
Nothing partly edited. Worktree has no uncommitted tracked changes. Task folder `.ptah/specs/TASK_2026_894_0e20/` is untracked by design (not committed).

## Open problems and decisions
- CI still pending (above). No failures seen yet.
- No human or bot code review yet (CodeRabbit check is "skipping").
- Recorded Minor follow-ups (not in this PR): Test button on other cards is a silent no-op while one test runs; "Codex settings" only switches tab outside Electron; `RoutingDisplayNamesStore.route()` ignores a third `|` segment.
- Sentry MCP needs user authorization via `/mcp` (not needed for this task).

## Key files
- `D:\projects\ptah-extension\.claude-worktrees\settings-design\.ptah\specs\TASK_2026_894_0e20\decisions.md` — all 25 decisions with evidence.
- `...\TASK_2026_894_0e20\final-review.md` — final review findings.
- `...\TASK_2026_894_0e20\visual-qa.md` — Electron QA results (V1–V7).
- `...\TASK_2026_894_0e20\pr-body.md` — PR body as submitted.
- `...\libs\frontend\chat\src\lib\settings\ptah-ai\cli-provider-card.component.ts` — provider card.
- `...\libs\frontend\chat\src\lib\settings\ptah-ai\cli-orchestration-matrix.component.ts` — grid host (e2e asserts "Uninstalled CLI agents (2)" text).
- `...\libs\frontend\chat\src\lib\settings\ptah-ai\cli-lane-default-cell.component.ts` — lane defaults + full-access dialog.

## Background work
- No CLI lanes or subagents running for this task. The CI watcher shell from the old session is gone.
- Child session "Lane report double wake" (`00225f3e-b405-4153-ba1a-47ed70d4f911`, fix lane `646bece7`) — separate PR for duplicate lane messages; relay its PR link to the user when it arrives.

## Next steps
1. Watch CI: run in the background `gh pr checks 1014 --watch --interval 60` (from the worktree). On failure: `gh run view <run-id> --log-failed | tail -80`.
2. Fix any task-related failure in the worktree; verify with `npm run verify -- -t lint,typecheck -p chat` and `npm run verify -- -t test -p chat -- --testPathPatterns=<pattern>` (run lint/typecheck and test separately — Jest flags break lint/typecheck). Commit in the foreground, push in the background.
3. Read reviews: `gh pr view 1014 --comments` and `gh api repos/Hive-Academy/PtahCode/pulls/1014/comments`. Address confirmed defects; explain disputed ones.
4. Report to the user: PR URL, head, CI results, review state, child session PR link.
