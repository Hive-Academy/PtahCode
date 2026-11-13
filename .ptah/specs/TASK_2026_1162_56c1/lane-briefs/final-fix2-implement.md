# Lane brief: final fix round 2 (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not commit, stage or
push. Leave files unstaged.

Read first: `.ptah/specs/TASK_2026_1162_56c1/code-review-final.md` (82/100, Pass with notes). Item
names F1-F8 and Q5 refer to it. Its "diff" line numbers refer to `.ptah/tmp/full-src.diff`.

## Items

1. **F1.** `skill-recommendation.service.ts` (and the recommend handler if the loop is there):
   search at most 25 keywords, with a concurrency of at most 4, and write one debug log when the
   list is cut. Keep the result order deterministic (order of the keyword list).
2. **F3 and F7.** In the install handler of `setup-rpc.handlers.ts`, apply the same
   `owner/repo/skill` name check that the preview uses, before any other work on that skill and
   before any log that contains the name. A bad name gives a fixed user error for that skill.
3. **F5.** The recommend handler treats a parsed `package.json` that is not an object as empty,
   and reads `dependencies` and `devDependencies` only when each is a plain object.
4. **F4.** `skill-consent.service.ts`: cap the hashed and listed package at 500 files and 10 MB
   in total. Above the cap, refuse the skill with a fixed user error (fail closed).
5. **F6b.** `libs/backend/agent-generation/src/lib/di/tokens.ts` and `register.ts`: the branch
   added four skill tokens and added their names to the "registered" log list, but the services
   are registered in `rpc-handlers`. First search every import of those four tokens from
   `agent-generation`. If nothing uses them, remove the additions (restore the two files to their
   content on `main`: use `git show main:<path>` to read the old content and write it with your
   edit tool; do not use `git checkout` or `git restore`). If something uses them, change nothing
   in these two files and report the users.
6. **F8.** `team-builder-skill-consent.component.html`: when a skill is flagged for scripts and
   its script list is empty, show the line "Also contains hooks or executable files. Review all
   files." (interpolation and control flow only).
7. **Q5.** `team-builder-start.page.ts` and `.html`: add a `launched` signal. Set it to true after
   `launchTeamBuilder` resolves. Reset it at the start of `launchChat` and in `back()`. When it is
   true, show "Chat opened. Use Back to leave this page." in place of "Launching chat…". Keep the
   file under 500 lines.

Do not reformat lines that you do not change. Do not correct F2 (the coordinator records it).

## Tests (add)

F1: 60 keywords give at most 25 searches. F3: a 2-part and a 4-part name are refused and nothing
is installed for them. F5: `package.json` equal to `null`, and `dependencies` equal to a string.
F4: a package above the cap is refused. F8 and Q5: one spec case each.

## Write set (exact)

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`,
  `skill-consent.service.ts`, and their specs in the same folder (`skill-services.spec.ts` or a
  spec next to the service)
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (recommend and install
  handlers only) and the spec files in that folder that cover them
- `libs/backend/agent-generation/src/lib/di/tokens.ts` and `register.ts` (item 5 only)
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.{ts,html,spec.ts}` and
  `team-builder-skill-consent.component.{html,ts,spec.ts}`
- the deliverable

Do not edit any other file. No file under `apps/**`.

## Verify (focused only)

Do NOT run `npm run verify` or any `nx` command. Do not run `build`, `serve`, `dev`, `e2e`, `package`.

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath <all specs under src/lib/skills-sh/services/ and all setup-rpc*.spec.ts>`
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <all team-builder specs>`
- `npx tsc --noEmit --project` for: `libs/backend/rpc-handlers/tsconfig.lib.json`,
  `libs/backend/rpc-handlers/tsconfig.spec.json`, `libs/backend/agent-generation/tsconfig.lib.json`,
  `libs/frontend/onboarding/tsconfig.lib.json`, `apps/ptah-electron/tsconfig.spec.json`
- `npx eslint <changed files>`

Report real results only.

## Mandatory rules

- Work only in the task worktree. Electron first: the renderer lives in
  `apps/ptah-extension-webview`; do not edit it. Keep `platform-cli` and `cli-engine` working.
- Never run commit, stage, push, `git restore`, `git checkout -- <path>`, `git reset`, `git stash`,
  `git clean`. Report an unexpected change; do not revert it.
- Backend: tsyringe DI as in the files, Zod at the RPC boundary, `RpcUserError` for user errors, no
  raw error text to the client, no `any`, no `console.*`. Frontend: standalone OnPush, signals,
  `ClaudeRpcService` only, no `[innerHTML]`. No home paths with a user name in any file.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/final-fix2-report.md` in short Simplified Technical English: each
item done or not done with the file, each command with its real result, blockers. Reply with one
short message.
