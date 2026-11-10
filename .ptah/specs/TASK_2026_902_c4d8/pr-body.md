## Summary

Interactive review findings in the Electron renderer (`libs/frontend/review-runs-ui`), TASK_2026_902.

- **Findings panel** replaces the plain table in the run detail: run summary (counts per severity and triage state), filters (severity, lens, triage), sort (severity, lens, location, confidence), empty and filtered-empty states.
- **Finding card**: severity badge, lens, confidence, impact, evidence list that opens `file:line` in the app (`file:open`), collapsible details, Accept / Dismiss (optional reason) / Reply, and "Copy fix prompt". All finding text renders as plain text (no `[innerHTML]`).
- **New RPC `review:respondToFinding`** (Zod params: action enum, body max 4000, safe path). The handler finds the GitHub thread on path + line and requires the finding title in the published body. No match returns `no-thread`; several matches or a scan truncated at 5 pages return `ambiguous-thread`. It never posts to a guessed thread. GitHub errors return `github-error` with fixed text; no raw error or reply body is logged.
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
- [ ] `cli-engine:test` and `ptah-electron:test` did **not** run locally: the suites fail to start in this worktree (`Could not locate module marked`; the worktree has no `node_modules`). The full `rpc-handlers:test` failed in the same run and its cause was not isolated locally. CI must confirm these three projects, including both `rpc-surface.spec.ts` files.
- [x] Independent code-logic review (Claude subagent; code by Codex lanes): REVISE with 2 Serious defects, fixed in this branch (`.ptah/specs/TASK_2026_902_c4d8/code-logic-review.md`). No re-review of the fix round was done.
- [ ] Visual review in Electron (dark + light).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
