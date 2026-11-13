# Lane brief: B7b backend re-review (kind: review)

Worktree (your working directory): the task worktree for branch `feat/setup-stack-skills`.
Do not use any other checkout. Write only the deliverable file.

## Objective

Independent code-logic re-review of the Phase 3 skill install fix (B7b). The first review
(`.ptah/specs/TASK_2026_1162_56c1/code-logic-review.md`) found a Blocker: consent was checked on a
staged copy, then `skillsSh:install` fetched a second copy, so unapproved bytes could be installed.
Check on disk, not from reports. Earlier reports in this folder were wrong before.

## Read set

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (methods `stageConsentSkill`,
  `registerInstallSkillsWithConsent`, the preview method, `isInsideRoot`)
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-consent.service.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts`
- `.ptah/specs/TASK_2026_1162_56c1/decisions.md` (section "B7b consent preview binding")
- `.ptah/specs/TASK_2026_1162_56c1/code-logic-review.md` (first review)

## Acceptance to check (each: Pass or Fail with file:line evidence)

a. After `skillsSh:install`, if the installed content hash differs from the hash that the handler
   computed on the staged bytes, the changed skill must not stay on disk, no consent record is
   written, and the skill is not in the selection. Removal path is checked with `isInsideRoot`
   (inside the plugins folder only, symlinks resolved). Install caches are invalidated. The
   caller gets a typed failure.
b. A failure in the install loop does not lose the list of skills installed earlier. Selection
   (`keepSelected`) and propagation still run for them. The result names the failed skill and
   reason. Check the case where the FIRST skill fails and the case where a LATER skill fails.
c. `result.data` of `skillsSh:install` is parsed with Zod, not cast. `logger.error` receives a real
   `Error`. Report any error path in the loop that is swallowed without a log.
d. `decisions.md` records why a client cannot approve bytes that the server did not hash, or the
   code prevents it. Say if the reasoning holds. Look for a race: bytes between the hash check
   and the install (for example an installed copy that is active before the hash check).
e. Other risks: removal of a skill that the user installed before this call, path escape,
   consent record written for the wrong hash, `consentRecords` trust, error message leak.

## Verify (real test run, mandatory)

Run exactly, from the worktree, with a long timeout, and filter the output:

`npm run verify -- -t test -p @ptah-extension/rpc-handlers 2>&1 | tail -40`

Confirm that the header says "Running target test for 1 projects". If `spawn EPERM` blocks Nx, say
so and run the focused spec instead:
`npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`
Report the real result. Do not claim a pass that you did not see.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Verification is scoped only (commands above). No workspace-wide checks. No `build`, `serve`,
  `dev`, `e2e` or `package` target.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`, commit,
  push, force push or history rewrite. Do not edit source files. You review only.
- No personal data or home paths with a user name in the deliverable.
- Write short Simplified Technical English.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/code-logic-review-2.md`. Contents: score 0-100, verdict
(Pass / Pass with notes / Blocker), a table of a-e with Pass or Fail and file:line evidence, a list
of findings with severity (Blocker, Serious, Minor), the test command and its real result.

## Reply format

One short message: verdict, score, list of Serious and Blocker findings, test result.
