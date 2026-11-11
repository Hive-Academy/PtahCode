# HANDOFF: TASK_2026_933_f1f9 (setup hub flows route to the normal chat)

Predecessor session: `55386f11-6d8b-49a6-9fed-54ba8da2c8da`. Written 2026-11-11.

## Goal

The setup hub "New project" and "AI team builder" flows did not work on Codex (recorded Electron
trial: the first question could not be answered, the session was not reachable).

User decisions (all final):

- Both flows become thin launcher pages that open a **normal main chat tab**. The agent proposes
  and applies the harness from chat. "Analyze workspace" (`/onboarding/analyze/**`) stays in the
  setup hub.
- The plan in `implementation-plan.md` is approved. The apply step is a **button** (banner in the
  chat view, "Apply to workspace", calls RPC `harness:apply`).
- Delete `libs/frontend/harness-builder` **if nothing uses it**.
- Screenshots and video in **desktop mode**: size the Electron window to about 1440 x 900.
- Delegate to CLI lanes first. Subagents are allowed again (the user reset the limit).
- Merge PR #1067 only when it is reviewed, green, with no comments and no failing CI jobs.

## Done (all uncommitted, in this worktree, branch `fix/setup-hub-codex-question-and-session`)

Nothing is committed. 56 changed or new paths. No PR exists for this branch.

| Batch | Content | Verified |
| --- | --- | --- |
| 1a | Codex `request_user_input_async` question stays answerable after turn end (`libs/backend/codex-runtime`, `libs/backend/agent-sdk` codex-app-server + permission) | `codex-runtime` lint, typecheck, test passed. `agent-sdk`: only `codex-chat-adapter.spec.ts` rerun passed. **Full `agent-sdk` verify not rerun** (see Open problems) |
| 1b | Provider-neutral seed prompts (`libs/backend/rpc-handlers/src/lib/harness/`) | `npm run verify -- -p @ptah-extension/rpc-handlers` passed |
| 2 | Proposal banner + store in `libs/frontend/chat` | `@ptah-extension/chat` lint, typecheck, test passed |
| 3 | Launcher service, flat routes, intake pages (`onboarding`, `core`, `chat-routing`, webview app) | `npm run verify -- -p @ptah-extension/onboarding,@ptah-extension/chat-routing` passed after the fixes. `@ptah-extension/core` and `ptah-extension-webview` passed in the run before the fixes (the fixes did not touch them) |

Fix details are in `f4-fix-2-report.md` (test fixture sequence number) and `batch-3-fix-report.md`
(`**` fallback now redirects to a clean `/onboarding`; test used a wrong accumulator key).

Other:

- Created the missing `node_modules` junction in this worktree (points to the main checkout).
  Never run `npm install` here. Remove it with `cmd /c rmdir <worktree>\node_modules` before any
  `git worktree remove`.
- PR #1067 (`fix/skill-delivery-and-routing`, head `61d3e1165`): CI is green (18 success,
  3 skipped, 1 neutral). `reviewDecision` is `REVIEW_REQUIRED`, so a normal merge is refused.
- PR #1059 was merged by the user.

## In progress

Nothing is half-edited. Batch 4 (deletion) is not started.

## Open problems and decisions

- Full `agent-sdk` lint, typecheck and test must run once. The earlier full test run failed on
  6 suites only because `node_modules` was missing; that cause is fixed but not re-proven.
- `content-manifest.json` was not checked after the seed prompt changes.
- `typecheck-templates` was not run after the template changes.
- `HarnessChatProposalStore` (chat lib) calls `HarnessHealthStore` from the marketplace lib. Lint
  passed, so the module boundary is accepted.
- PR #1067 merge needs an approving review on GitHub or the user's permission for
  `gh pr merge --admin`. Do not use `--admin` without that permission.
- Lanes: `antigravity` works only with built-in file tools (briefs must say: no shell, no MCP,
  no git, coordinator runs verify). `codex`, `grok`, `Glm`, `kimi code` are at limit.
  `cli: "claude"` spawn is refused. Claude Api ptah-cli lane
  `pc-99497850-8bc4-4a7c-b7c3-230167513f92` is available for the independent review.
- The verify lock is shared machine-wide; checks often wait 10 to 25 minutes for a slot.

## Key files

Worktree root: `D:\projects\ptah-extension\.claude-worktrees\fix-setup-hub-codex-question-and-session-e9171924332f`

- `.ptah/specs/TASK_2026_933_f1f9/implementation-plan.md`: approved plan, Batch 1 to 4, decisions D1/D2.
- `.ptah/specs/TASK_2026_933_f1f9/context.md`: trial findings and the direction change.
- `.ptah/specs/TASK_2026_933_f1f9/batch-3-report.md`: which dead proposal files still import `@ptah-extension/harness-builder`.
- `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts`: new launcher.
- `libs/frontend/onboarding/src/lib/onboarding.routes.ts`: flat routes, clean fallback redirect.
- `libs/frontend/onboarding/src/lib/proposal/`: dead pages and `ProposalFlowStore` to delete in Batch 4 (keep `new-project-intake.page.ts`, `team-builder-start.page.ts`, `new-project-intake.model.ts`).
- `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts` and `components/molecules/harness-proposal-banner/`: the apply banner.
- `libs/backend/codex-runtime/src/lib/codex-context.ts`: Codex question lifecycle fix.
- `C:\Users\abdal\AppData\Local\Temp\ptah-trial\` (`cdp.cjs`, `record.cjs`, `provider.cjs`): trial scripts, connect to `http://127.0.0.1:9334`.

## Background work

None. No lane, subagent, child session or check is running.

## Next steps

1. Batch 4, pure deletion (delegate to a lane or a `frontend-developer` subagent): delete the dead
   proposal pages and `ProposalFlowStore`; search for consumers of `@ptah-extension/harness-builder`
   and delete `libs/frontend/harness-builder` if none remain (also `tsconfig.base.json` path, guard
   specs, e2e fixtures). List anything removed that still had a consumer instead of deleting it.
2. Verify, from the worktree root, one run at a time:
   - `npm run verify -- -p @ptah-extension/agent-sdk`
   - `npm run verify -- -p @ptah-extension/onboarding,@ptah-extension/chat,@ptah-extension/core,@ptah-extension/chat-routing,ptah-extension-webview`
   - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
   - `npm run manifest:check` (regenerate with `npm run manifest:generate` if it fails) and the
     `tools/degradation-audit` gate.
3. Independent review of the full diff (Claude Api lane or `code-logic-reviewer`). Fix confirmed
   findings.
4. Read `.commitlintrc.json`, inspect `git status` and the full diff, stage by explicit path,
   commit in the foreground. Push and `gh pr create` against `main` as one background command.
   Set `task.md` to `in_review`. Watch CI and reviews.
5. Repeat the recorded Electron trial on the new flow: Codex + `gpt-6.1-terra`, empty folder,
   window about 1440 x 900, video. Starting the dev app needs the user's request for a `serve`
   target; the user asked for this trial, so it is in scope.
6. PR #1067: merge only after an approving review exists (see Open problems).
