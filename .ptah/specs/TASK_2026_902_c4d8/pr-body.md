## Summary

Interactive review findings in the Electron renderer (`libs/frontend/review-runs-ui`), TASK_2026_902.

- **Findings panel** replaces the plain table in the run detail: run summary (counts per severity and triage state), filters (severity, lens, triage), sort (severity, lens, location, confidence), empty and filtered-empty states.
- **Finding card**: severity badge, lens, confidence, impact, evidence list that opens `file:line` in the app (`file:open`), collapsible details, Accept / Dismiss (optional reason) / Reply, and "Copy fix prompt". All finding text renders as plain text (no `[innerHTML]`).
- **New RPC `review:respondToFinding`** (Zod params: action enum, body max 4000, safe path). The handler finds the GitHub thread on path + line and requires the escaped finding title as the published heading (exact compare). No match returns `no-thread`; several matches or a scan truncated at 5 pages return `ambiguous-thread`. It never posts to a guessed thread. GitHub errors return `github-error` with fixed text; no raw error or reply body is logged.
- Accept / dismiss replies carry a hidden marker (`<!-- ptah-review-triage:accepted|dismissed -->`) so a later task can derive state from the thread.
- Buttons are inactive while a request is pending; accept / dismiss post one time for each finding; the reply draft stays until GitHub accepts it.
- RPC guard specs updated (Electron `rpc-surface.spec.ts`, CLI `rpc-surface.spec.ts`). `review-findings-table.component.ts` stays exported (no removal).

### Known limits and follow-ups

- **Triage state is session-local.** The UI says so. Persistent state needs the thread reply list from `review-github`, which TASK_2026_901 edits. Follow-up after TASK_2026_901 merges.
- **"Send to lane" is "Copy fix prompt"** (clipboard). No renderer path spawns a lane with a prompt; a lane-spawn RPC is a follow-up.
- Thread resolved state is not touched (TASK_2026_901 owns it).
- `file:open` resolves the path against the open workspace; the error text tells the user to open the reviewed repository.
- Not adopted from the review: `logger.warn` (the handler logger type has only `info`), a discriminated union for the RPC result (Minor).
- No rendered visual check was done. A screenshot review in Electron against the PR #1018 prototypes is still necessary.

## Test plan

- [x] `npm run verify -- -p review-runs-ui`: lint, typecheck and test passed (run at head of the frontend commit).
- [x] `npm run verify -- -p review-contracts,rpc-handlers,shared,cli-engine,ptah-electron`: lint + typecheck passed (10 tasks); tests of `review-contracts` and `shared` passed.
- [x] `rpc-handlers` test with `--testPathPatterns="review-rpc|rpc-surface"`: passed (includes the new thread-match specs).
- [x] `npm run verify -- -t test -p rpc-handlers,cli-engine,ptah-electron` (header: 3 projects), run at `e65a852ab` after a `node_modules` junction was added to the worktree: `rpc-handlers` 240 suites / 6377 tests passed; `ptah-electron` 108 suites / 1800 tests passed; `cli-engine` 27 suites passed and 1 failed (`rpc-surface.spec.ts`: the new method was not in alphabetical position in the absent list). The earlier failures had one cause: no `node_modules` in the worktree.
- [x] Fix commit: the `cli-engine` list order is corrected. Targeted run of `review-markdown`, `review-rpc` and `rpc-surface` specs in `review-core`, `rpc-handlers`, `cli-engine`: 3 suites, 8 + 48 + 18 tests passed. `npm run verify -- -t lint,typecheck -p review-core,rpc-handlers,cli-engine`: 6 tasks succeeded.
- [x] Independent code-logic review (Claude subagent; code by Codex lanes): REVISE with 2 Serious defects, fixed in this branch (`.ptah/specs/TASK_2026_902_c4d8/code-logic-review.md`).
- [x] Re-review of the fix round (second Claude subagent, `code-logic-rereview.md`): REVISE. The title compare used the raw title against the escaped published heading, so a title with markdown characters never matched. Fixed: the handler compares `escapeText(title)` with the full heading, exact. This last correction has spec coverage but no third review.
- [ ] Visual review in Electron (dark + light).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
