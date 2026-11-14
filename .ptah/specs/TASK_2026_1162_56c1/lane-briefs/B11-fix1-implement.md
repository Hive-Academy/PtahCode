# Lane brief: B11 fix round 1 (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not commit, stage or
push. Leave files unstaged.

Read first, in `.ptah/specs/TASK_2026_1162_56c1/`: `code-review-B11-frontend.md` (78/100, Pass with
notes; item names S1, S2, M1-M9 below refer to it) and `lane-briefs/B11-guidance-facts-implement.md`
(the original requirement and code rules, which still apply).

## Items

0. **Gate failure (must fix).** `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-services.spec.ts:103-104`
   does not compile: `getGuidance` is now async. Add the `await` (make the test async). Search the
   repository for every other caller of `ProjectGuidanceService.getGuidance` (specs included, also
   `apps/**` and `libs/backend/**`) and report each. Fix a caller only if it is in the write set;
   report the others.
1. **S1.** Before each probe read: `lstat`, require a regular file (not a symlink), size at most
   1 MB. Otherwise skip that probe (no fact, one debug log).
2. **S2.** One sanitizer for fact and evidence text, used for the record and the RPC result:
   replace all control characters and Unicode line separators (`/[\p{Cc}  ]+/gu`) with a
   space, cap the length of a file name (80 characters). Put file names in `evidence` only: `fact`
   is fixed service text. In the record, write evidence as inline code and remove backticks from
   it. In `team-builder-guidance-brief.ts` apply the same character rule to each fact before the
   quote (the frontend cannot import backend code: write a small local function).
3. **M2.** `team-builder-start.page.ts`: assign `guidanceAnalysis` after the stale check.
4. **M4.** When `launchChat(true)` returns at a guard, set the stage to `review`.
5. **M6.** A `package.json` that parses to a non-object (for example `null`) gives an empty object.
6. **M7.** Prefer the exact name `tsconfig.json`, then `tsconfig.base.json`, then the first other
   match. Do not count `pyproject.toml` as a test configuration.
7. **M8.** `loadReview` clears `selectedIds` and `ownerDecision` (or keeps only ids still listed).
8. **M9.** In the brief, put `do_not_copy` first, then `tolerate`, then `follow`. When the cut
   removes facts, end that line with " (more omitted)" inside the limit.
9. **M1.** Send `this.intent().trim()` to the launch, and restore the spec expectation to the
   trimmed text. If the earlier change to untrimmed text has a reason in the code, keep it and
   state the reason in the report.
10. **M5.** Read how `launchTeamBuilder` ends (navigation or not). If the page stays mounted after
    a successful launch, keep the stage `launching` so that Skip cannot launch a second chat.
    Report what you found.
11. **Accessibility.** When no owner decision is required, the legend text says that the choice is
    optional. Do not change the control type.

## Tests (add)

Backend: symlink or oversize probe file is skipped; `package.json` containing `null`; a file name
with control characters and backticks is neutralised in the result and in the record; handler test
that `codeConventions: {}` produces no "detected" fact. Frontend: fact with U+2028 and control
characters in the brief; `do_not_copy` first and the omitted marker; double click on Skip and on
Install launches or installs one time; `loadReview` clears selection and decision; consent dialog
opens again when it closes during install (only if the spec does not have it).

## Write set (exact)

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/project-guidance.service.ts` and its spec
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-services.spec.ts` (item 0 only)
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (guidance handler only) and
  `setup-rpc.handlers.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-*` (existing files; no new component)
- the deliverable

Do not edit any other file. Keep `team-builder-start.page.ts` under 500 lines: move pure logic to
a `team-builder-*.ts` helper in the same folder if needed.

## Verify (focused only)

Do NOT run `npm run verify` or any `nx` command. Do not run `build`, `serve`, `dev`, `e2e`, `package`.

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath <ALL specs under libs/backend/rpc-handlers/src/lib/skills-sh/services/ plus setup-rpc.handlers.spec.ts>`
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <all team-builder specs>`
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` (specs must compile),
  and `tsconfig.lib.json` for rpc-handlers and for `libs/frontend/onboarding`
- `npx eslint <changed files>`

Read each changed template binding against its component class. Report real results only.

## Mandatory rules

- Work only in the task worktree. Electron first: the renderer lives in
  `apps/ptah-extension-webview`; do not edit it. Keep `platform-cli` and `cli-engine` working.
- Never run commit, stage, push, `git restore`, `git checkout -- <path>`, `git reset`, `git stash`,
  `git clean`. Report an unexpected change; do not revert it.
- Backend: tsyringe DI as in the file, Zod at the RPC boundary, no raw error text to the client, no
  `any`, no `console.*`. Frontend: standalone OnPush, signals, `ClaudeRpcService` only,
  `libs/frontend/ui` primitives, no `[innerHTML]`. No home paths with a user name in any file.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/B11-fix1-report.md` in short Simplified Technical English: each
item done or not done with the file, each command with its real result, blockers. Reply with one
short message.
