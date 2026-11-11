# HANDOFF: TASK_2026_933_f1f9 (written 2026-11-11, about 17:15 UTC)

Predecessor session: `714dc536-7163-49d0-a5ce-2b533b0f6014`

## Goal

The user's current request: address the review comments on PR #1067 and PR #1084 and make both
ready to merge. Earlier requests in the same task, already done: route the setup hub flows "New
project" and "AI team builder" to the normal chat, keep Codex async questions answerable, separate
the two flows clearly (New project = a product the user ships to their own users; AI team builder =
a team that Ptah itself runs, for example a social media team), and have another session fix the
Codex "AT LIMIT" state and the plan limits card title.

User decisions and rules:

- No merge by an agent without the user's explicit go-ahead. No force push, history rewrite, branch
  deletion or worktree removal. No `gh pr merge --admin`.
- Delegate to CLI lanes first; keep the main session thin. Subagents are allowed.
- Electron first. Never write the real home path into tracked files (use `<user>`). Do not send the
  user's name, email or project details to outside services.
- Open question to the user, not answered: rename the flows themselves ("New product" / "Ptah team
  builder") or keep the titles. Titles are unchanged for now.

## Worktrees, branches, PRs

| PR | Branch | Worktree |
| --- | --- | --- |
| [#1084](https://github.com/Hive-Academy/PtahCode/pull/1084) | `fix/setup-hub-codex-question-and-session` | `D:\projects\ptah-extension\.claude-worktrees\fix-setup-hub-codex-question-and-session-e9171924332f` |
| [#1067](https://github.com/Hive-Academy/PtahCode/pull/1067) | `fix/skill-delivery-and-routing` | `D:\projects\ptah-extension\.claude-worktrees\fix-skill-delivery-and-routing-c99a71c64e9f` |
| [#1093](https://github.com/Hive-Academy/PtahCode/pull/1093) | `fix/codex-limit-state-and-plan-limits-provider` | `D:\projects\ptah-extension\.claude-worktrees\fix-codex-limit-state-and-plan-limits-provider-f5b87e9f682a` (owned by the child session) |

## Done

PR #1084 (pushed head `0ef2b5b87`):

- `099ceb86d docs(specs): record the team builder Electron trial for TASK_2026_933`
- `0ef2b5b87 fix(rpc-handlers,onboarding): separate product builds from Ptah teams`. Verified before
  the push: lint and typecheck for `rpc-handlers,onboarding` and `typecheck-templates` for
  `ptah-extension-webview` exit 0. One rpc-handlers test failed, was fixed, and that spec passed;
  the full rpc-handlers suite was NOT re-run after the fix.
- Electron trials of both flows on Codex are recorded in `context.md` (same folder).

PR #1067:

- `3fdffeec4 chore(deps): merge main into fix/skill-delivery-and-routing`: local merge commit, NOT
  pushed. The only conflict was `content-manifest.json`; resolved by taking main's side and running
  `node scripts/generate-content-manifest.js` (`--check` reports up to date). No verify run yet
  after the merge.

PR #1093 (child session report): 3 commits pushed (`f233ffde4`, `c50fd58d5`, `f0830e839`), task
TASK_2026_951_0539 `in_review`. Codex "AT LIMIT": the ledger rule is already fixed on `main`
(`d91f6b2a8`); the PR adds a regression test only; the installed app is older than that commit.
Plan limits card: the hardcoded "Claude" row label now follows the session owner's provider. CI on
`f0830e839` was pending at the last report. The `gpt-6.1-sol` vs `gpt-6.1-terra` observation was
not examined.

## In progress

PR #1084 worktree, uncommitted (written by codex lane `7f73844a`, still running, not reviewed):

- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts` + spec,
  `codex-chat-turn-stream.ts`
- `libs/frontend/chat-types/src/lib/chat-types.ts`
- `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts` + spec
- `libs/frontend/chat/src/lib/services/message-sender.service.ts` + spec
- `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts` + spec
- untracked: `review-round-3-findings.md`, `review-round-3-fix-report.md` (was still a skeleton at
  the last read), `review-round-4-findings.md`

PR #1067 worktree: untracked `review-open-threads.md` (the three open threads, verbatim) and
`review-open-threads-fix-report.md` (lane skeleton) under `.ptah/specs/TASK_2026_927_144e/`.

## Open problems and decisions

- PR #1084 is `CONFLICTING` with `main`, so CI did not run on `099ceb86d` or `0ef2b5b87`. A
  `git merge-tree` preview showed: modify/delete conflicts on files this branch deletes (six under
  `libs/frontend/harness-builder/src/lib/components/**`, and under
  `libs/frontend/onboarding/src/lib/proposal/`: `answer-dock`, `apply-result`, `proposal-panel`,
  `proposal-status-card`, `proposal-workspace.page`, `review-apply.page`, `revision-history`) —
  keep them deleted; content conflicts in `new-project-intake.page.ts`,
  `team-builder-start.page.ts` (main adopted `ptahButton`; keep this branch's wording and take
  main's button directive) and `tools/ui-class-audit/baseline.json` (generated; find its
  generator script and regenerate). Merge only after lane `7f73844a` has finished, because it
  edits the same worktree. Merge with a merge commit, never rebase.
- PR #1084 open review threads (6):
  - Round 3 (lane `7f73844a` works on them): `codex-chat-adapter.ts:826` check cancellation before
    the fallback answer turn (minor); `harness-chat-proposal.store.ts:342` an older in-flight push
    must not override a newer hydration result (major); `harness-chat-launcher.service.ts:193` pin
    the first chat turn to the captured workspace (major).
  - Round 4 (nobody works on them yet; text in `review-round-4-findings.md`): A
    `codex-chat-adapter.ts:758` publish the failure notice without settling the live turn (major);
    B same file, thread marked outdated, fall back to a new turn only for
    `codexTurnNoLongerActive` (may already be fixed; verify); C
    `harness-chat-launcher.service.ts:226` restore attachments after a failed first send.
  - `ptah_agent_message` to lane `7f73844a` returned `unsupported` / `lane-at-limit`: the round 4
    message was NOT delivered.
- PR #1067 open review threads (3, minor, all in
  `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts` about lines 819-828):
  workspace-only plugin/skill resolution ignores global capability-layer disables (two threads);
  unnormalized `workspaceRoot` passed to `SkillSyncGate.resolve`. Lane `64cac37c` works on them.
- The two PRs touch the same handler area (`harness:start-new-project`). After one merges, the
  other will probably need another merge of `main`.
- Both PRs are `REVIEW_REQUIRED`: no approving human review. An agent must not merge.
- The PR #1084 body does not yet mention `0ef2b5b87` or review rounds 3 and 4.
- Lane limits: the codex row reads "AT LIMIT" while its weekly usage is 12% (the stale state that
  PR #1093 covers). The user confirmed Codex works, so `force: true` on `cli: "codex"` is
  justified. grok, Glm and kimi are at 100%; antigravity's reader failed; "Claude Api"
  (`ptahCliId: pc-99497850-8bc4-4a7c-b7c3-230167513f92`) is untracked and uses Claude usage.
- Not fixed, recorded only: `harness:apply` takes 25 to 44 s; the collapsed stats rail cuts the
  cost note; neither flow was re-run in the Electron app with the new wording.

## Key files

- `D:\projects\ptah-extension\.claude-worktrees\fix-setup-hub-codex-question-and-session-e9171924332f\.ptah\specs\TASK_2026_933_f1f9\context.md`: task history and trial results.
- `...\TASK_2026_933_f1f9\review-round-3-findings.md`, `review-round-4-findings.md`: verbatim review text.
- `...\TASK_2026_933_f1f9\review-round-3-fix-report.md`: deliverable of lane `7f73844a`.
- `D:\projects\ptah-extension\.claude-worktrees\fix-skill-delivery-and-routing-c99a71c64e9f\.ptah\specs\TASK_2026_927_144e\review-open-threads.md` and `review-open-threads-fix-report.md`: PR #1067 threads and the deliverable of lane `64cac37c`.
- Trial evidence, outside the repository: the `ptah-trial` folder in the user's temp directory (videos `setup-hub-trial-*.mp4`, screenshots, helper scripts `cdp.cjs`, `record5.cjs`).

## Background work

- CLI lane `7f73844a-721d-4178-8805-0d7d63d50b28` (codex, CLI Session ID
  `01a1cb8b-1783-77d1-8322-836ebccf1315`): PR #1084 review round 3. State: running. Deliverable
  `review-round-3-fix-report.md`. Verify it was told to run: `npm run verify -- -p agent-sdk,chat,onboarding`.
- CLI lane `64cac37c-5221-4c50-b7b4-9b421232fde3` (codex, CLI Session ID
  `01a1cb94-35e1-74d0-a4f6-358502b9b526`): PR #1067 three threads. State: running. Deliverable
  `review-open-threads-fix-report.md`. Verify: `npm run verify -- -p rpc-handlers`.
- Child session `9427d845-3a3f-48d1-9afb-86a2109d77ec` ("codex limit state + plan limits"):
  state `waiting`; it watches CI and reviews on PR #1093.
- Lane `09be9c1e-974a-4309-924e-d3cb1e48e1bc` (Claude Api, button adoption) is running too. It
  is not part of this task; this session did not start it. Do not act on it.

## Next steps

1. PR #1067: when lane `64cac37c` signals, read its report and review `git diff` in the #1067
   worktree. Run `npm run verify -- -p rpc-handlers` if the report shows no clean run on the
   final state. Commit the fix and the two spec files by explicit path (foreground), then push in
   the background. Watch `gh pr checks 1067`; reply on each of the three threads with the fix
   commit or the reason for no change.
2. PR #1084: when lane `7f73844a` signals, read its report and review the diff. Then start round 4:
   spawn `cli: "codex"`, `force: true`, `resume_session_id: "01a1cb8b-1783-77d1-8322-836ebccf1315"`,
   same worktree, with the three findings from `review-round-4-findings.md` (write scope
   `libs/backend/agent-sdk/**`, `libs/frontend/chat/**`, `libs/frontend/chat-types/**`,
   `libs/frontend/onboarding/**`, and `libs/backend/rpc-handlers/**` only if A needs it; no git;
   append `## Round 4` to the fix report).
3. PR #1084: after round 4, commit the review fixes, then `git fetch origin main` and
   `git merge origin/main` (resolution notes above). Then run
   `npm run verify -- -p agent-sdk,chat,chat-types,onboarding,rpc-handlers` and
   `npm run verify -- -t typecheck-templates -p ptah-extension-webview`, and
   `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`. Commit, push in the
   background, and confirm that CI starts on the new head.
4. Update the PR #1084 body (`gh pr edit` from inside the worktree): flow separation commit,
   review rounds 3 and 4, the merge of `main`, real verify results. Reply on each of the six
   threads.
5. Watch CI and new CodeRabbit reviews on #1067, #1084 and (through the child) #1093. Fix
   confirmed findings; repeat.
6. Report to the user: PR URLs, heads, CI results, review state, and that each PR still needs an
   approving review or the user's explicit instruction before a merge. Ask in which order to merge
   #1067 and #1084, since the second will need `main` merged in again.
