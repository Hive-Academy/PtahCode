# HANDOFF — PtahCode docs media refresh (TASK_2026_892) and follow-ups

## Goal

Refresh the PtahCode docs screenshots and videos from the current Electron app, update the README and GitHub files, and remove stale or private media. The rules are in `D:\projects\ptah-extension\CLAUDE.md`. The task decisions are D1–D15 in `decisions.md` in this folder. Read D8–D15 first.

## Done

| PR | Content | State |
|---|---|---|
| #974 | Docs link, notification title | Merged |
| #979 | Remove the dead VS Code change-set card (TASK_2026_891) | Merged |
| #984 | 35 screenshots as WebP (10.5 MB → 1.5 MB), README feature links | Merged 19:14 UTC |
| #987 | Docs video harness, 4 new videos, capture isolation (temp HOME, settings.json hash guard), `.ptah/tmp/docs-capture` | Merged 19:15 UTC |
| #990 | https://github.com/Hive-Academy/PtahCode/pull/990, branch `docs/docs-followups`, worktree `.claude-worktrees/docs-followups`, head `b45baa1d8` | **OPEN**. CI passed on `bfa8e9154`. CI on `b45baa1d8` was not checked yet |

PR #990 contains these changes:
- `e8b0f3c80`: deletes `install.mp4`, `setup-wizard-analysis.mp4` and `setup-wizard-agent-generation.mp4`, and their `<video>` blocks. All three were old VS Code extension recordings with private folder and client workspace names.
- `bfa8e9154`: deletes `agents-catalog`, `agents-overview`, `agents-custom-editor`, `agents-wizard-step1` and `agents-wizard-step3`, and their image lines. The user chose this.
- `b45baa1d8`: masks the private workspace name "property-hub" as "my-project" in `sessions-tabs.webp`.

Cleanup done:
- The `docs-gap-fill` and `remove-vscode-change-set` worktrees are removed, and their branches are deleted.
- 3.7 GB of `%TEMP%\ptah-docs-*` folders are deleted.
- The old docs server (pid 4636) is stopped.

## Lane result (final, after this handoff was first written)

Lane `a27f9ef2` **finished with a failure.** The D15 database copy run sent 0 prompts and exited 1 after 3 min 8 s for two reasons:

1. The copied dev DB schema is newer than this checkout, so the app reported `PERSISTENCE_UNAVAILABLE`.
2. The click on "Previous sessions" timed out, because the top bar was over the trigger.

None of the 6 images was written. The settings hash did not change. Scoped verify and the reference check pass (exit 0). The user named this the last attempt, so do not run the capture again without a new user decision. A later attempt needs these two fixes: a checkout whose schema matches the dev DB (or a migration of the copy), and a click that the top bar does not block. The six old images stay on `main`. They show old UI. The `sessions-tabs` image is masked in #990.

## In progress (as first written; the lane above is now finished)

| Lane id | CLI | Task | How to read the result |
|---|---|---|---|
| `a27f9ef2-68e8-4a5c-87aa-ff756798fbf1` | codex | Batch 5, last attempt (D15). It makes a read-only file copy of the dev databases `~/.ptah/state/ptah-dev.sqlite` and `sessions-dev.sqlite`, runs the saved-session capture with no AI prompts, and captures 6 images: `chat-execution-tree`, `chat-overview`, `chat-cost-bar`, `sessions-overview`, `sessions-tabs` and `sessions-history` | Wait for `<agent-lane-completed>`. Then read the section "DB copy attempt" in `batch5-live-chat-report.md` in this folder. `ptah_agent_read {agentId}` shows the output. CLI session: `01a1b76f-2939-7eb2-85a7-e95295d30353` |

The lane works in `D:\projects\ptah-extension\.claude-worktrees\docs-media-refresh`. That branch (`docs/docs-media-refresh`) is **already merged** (#987), so its new changes need a new branch from `main`.

## Uncommitted work in `docs-media-refresh` (to ship in a new PR)

- `apps/ptah-electron-e2e/src/docs-screenshots/chat.shot.ts`: live mode (`PTAH_DOCS_LIVE_AI=1`), saved-session mode, lane-tab selectors, and the price mask for the model selector.
- `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts`: the `CLAUDE_CONFIG_DIR` passthrough (the real `~/.claude` is used in place and never copied). It may also get the D15 database copy.
- `apps/ptah-docs/SCREENSHOTS.md`: the live, saved-session and price mask documentation.
- `apps/ptah-docs/public/screenshots/chat-model-selector.webp`: captured again with the prices masked. I inspected it, and it is OK.
- Any of the 6 images that the lane captures. **Do not take this worktree's old `sessions-tabs.webp`, because it still shows the private name.** If the lane did not capture a new one, keep the masked version on `main`/#990.
- `.ptah/specs/TASK_2026_892_7d2e/decisions.md` (D12–D15), `batch5-live-chat-report.md` and this file.
- This worktree also still holds stale uncommitted copies of files that #984 already merged (WebPs, pages and README). Do not commit those. Take only the files listed above.

## Open problems and decisions

- **Privacy in git history:** the deleted videos and the old `sessions-tabs` image stay in git history and in cached copies of docs.ptah.live. A history rewrite needs the user's explicit approval. It was asked, and there is no answer.
- **Your `~/.ptah/settings.json`** was changed once at 16:43 UTC by a capture run before the isolation fix. There is no backup. The user was told to check it.
- **CodeRabbit** was rate-limited on #979, #984 and #987, so it made no reviews. Independent claude reviews were done.
- **Open Low finding F1** (`apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-run-guard.ts:18-20`): when global setup fails, the teardown adds a misleading ENOENT error. It is not fixed, because the revise cap was reached.
- **`sharp`** is loaded by dynamic import, and it is not a declared root dependency.
- **`starlight-links-validator`** is declared in `package.json` but missing from the shared `node_modules`. It was installed only into `docs-media-refresh/apps/ptah-docs/node_modules` (git-ignored). A full `npm install` in the main checkout fixes it, but run it only when no other session uses `node_modules`.
- **The docs dev server** runs from `docs-media-refresh/apps/ptah-docs` (astro daemon, pid 37148, http://127.0.0.1:4321). It shows that worktree, which includes the old videos. To stop it: `cd D:\projects\ptah-extension\.claude-worktrees\docs-media-refresh\apps\ptah-docs && node ../../node_modules/astro/bin/astro.mjs dev stop`.
- Lanes: only codex has confirmed room. claude lanes need `accountSelection: {"kind":"ambient"}`. The reviewer must be a different family from the writer.

## Key files

- `D:\projects\ptah-extension\.claude-worktrees\docs-media-refresh\.ptah\specs\TASK_2026_892_7d2e\` contains `decisions.md`, `batch1..5-*-report.md`, `code-logic-review.md` and `harness-fix-report.md`.
- `apps/ptah-docs/SCREENSHOTS.md`, `apps/ptah-electron-e2e/docs-screenshots.config.ts`, `docs-videos.config.ts` and `src/docs-screenshots/_harness/*`.
- `apps/ptah-docs/scripts/check-screenshot-refs.mjs` and `D:\projects\ptah-extension\.ptah\specs\TASK_2026_889_d57a\_linkcheck.mjs`.

## Next steps

1. **PR #990:** check CI on `b45baa1d8` with `gh pr checks 990`. Read the reviews. Tell the user to merge it soon, because the private videos are live.
2. **When lane `a27f9ef2` ends:**
   1. Read the "DB copy attempt" section of its report.
   2. Inspect every new image for privacy yourself: names, paths, emails and accounts. Make contact sheets with ffmpeg in `%TEMP%`.
   3. Confirm that the report says the `~/.ptah/settings.json` hash did not change.
3. **New PR for the remaining work:**
   ```
   cd D:\projects\ptah-extension
   git fetch origin main
   git worktree add -b docs/docs-chat-shots .claude-worktrees/docs-chat-shots origin/main
   ```
   Copy only the files listed under "Uncommitted work", and confirm each copy with `cmp`. Get an independent claude review of the `chat.shot.ts` and `docs-profile.ts` changes, because codex wrote them. Then run these checks in the new worktree:
   ```
   npm run verify -- -p ptah-electron-e2e        # header must list 1 project
   node apps/ptah-docs/scripts/check-screenshot-refs.mjs
   node D:\projects\ptah-extension\.ptah\specs\TASK_2026_889_d57a\_linkcheck.mjs
   ```
   Commit in the foreground by explicit paths. Use `docs(docs,e2e): ...` (see `.commitlintrc.json`). Push in the background with `gh pr create --base main`. Then watch CI.
4. **Cleanup after the user authorizes it and the PRs merge:**
   - Stop the docs server.
   - Run `git worktree remove` for `.claude-worktrees/docs-media-refresh`, `docs-webp-screenshots`, `docs-followups` and `docs-chat-shots`.
   - Run `git branch -d` for their branches.
   - Delete `.ptah/tmp/docs-capture/*` leftovers, if any exist.
   - Do not touch the other worktrees. They belong to other tasks.
