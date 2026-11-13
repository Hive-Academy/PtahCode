# Lane brief: B7c consent check before activation (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use any other
checkout. Do not commit, push, or stage. Leave files unstaged.

## Problem (from `.ptah/specs/TASK_2026_1162_56c1/code-logic-review-2.md`, read it first)

`wizard:install-skills-with-consent` in
`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` stages a copy, hashes it, removes
it, then calls `skillsSh:install`. That call fetches a SECOND copy, replaces the existing slug
(`skills-sh/skills-sh-source-root.service.ts:328-334`), writes metadata, and propagates to the
providers (`handlers/skills-sh-rpc.handlers.ts:431-448`). Only then does the wizard compare hashes.

- Blocker: bytes that the user did not approve can be active in provider folders.
- Serious: on a mismatch the old installed copy of the skill is lost and metadata is stale.
- Minor: the result returns raw `error.message` to the client (can contain local paths).

## Required design: one fetch, verify staged bytes before any move

1. `SkillsShSourceRootService.install(request, location, options?)`: add an optional
   `options.verifyStaged?: (staged: { slug: string; dir: string }[]) => Promise<void> | void`.
   Call it after the staged slugs are listed and hashed and BEFORE line 328 (before `mkdir`, `rm`,
   `movePath`, metadata write). If it throws, nothing in the root changes, the staging folder is
   removed by the existing `finally`, and the error goes to the caller (keep `RpcUserError`
   intact; do not flatten it). With no option the behaviour does not change.
2. Give the wizard handler a typed way to run the same install pipeline as `skillsSh:install`
   (schema parse, `rejectUnsafeInstallRequest`, workspace check, `adoptLegacyInstalls`,
   `sourceRoots.install`, cache invalidation, propagation) with a `verifyStaged` callback. Share
   the code with the RPC method: do not duplicate the pipeline. A public method on the class that
   owns `skillsSh:install` is acceptable if the wizard handler can get that instance by its
   existing injection (`this.skillsShApi` or DI). Read how `setup-rpc.handlers.ts` gets
   `skillsShApi` before you choose. A callback cannot cross `rpcHandler.handleMessage`, so call the
   method directly. Do not change the public `skillsSh:install` RPC contract.
3. In the wizard install loop, the callback does all consent checks on the staged directory of
   the requested skill: `consent.computeContentHash(dir)`, compare with the submitted
   `consentRecords` hash (mismatch -> `RpcUserError('Skill content changed since preview. Preview it again.', 'INVALID_PARAMS')`),
   and the script consent rule (`hasScripts` and no record and not `canInstall` -> the existing
   `RpcUserError`). If the staged result has a slug that is not the requested skill, reject.
   The callback returns the verified hash to the loop (closure variable).
4. Remove from the install loop: the separate `stageConsentSkill` pre-stage, the hash compare of
   the installed path, and the `fs.rm(installedPath)` cleanup. They are not necessary when the
   check runs on the bytes that are moved. Keep `stageConsentSkill` for the preview method.
   After a successful install: `recordConsent(skillName, verifiedHash)` when the skill has scripts,
   push to `installed`, invalidate caches. Keep the partial-progress result
   (`installed`, `failedSkill`, `reason`), the per-skill `logger.error` with a real `Error`, and
   the selection plus propagation for the installed skills.
5. `reason` sent to the client: the `RpcUserError` message when the error is an `RpcUserError`,
   else the fixed text `Skill install failed.`. Details stay in the log.
6. Update `.ptah/specs/TASK_2026_1162_56c1/decisions.md`, section "B7b consent preview binding":
   replace the text with the new design in 4 to 6 short sentences (Simplified Technical English):
   one fetch, staged bytes are hashed and checked before they move, nothing is active before the
   check, no server-held preview record is necessary because the submitted hash must equal the
   hash of the bytes that are installed.

## Tests (mandatory)

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`: update the fixture
  to the new call path. Cases: (a) staged content differs from the submitted hash -> result
  failure, nothing moved into the plugins folder, an EXISTING installed copy of the same slug is
  byte-identical after the call, no consent record, skill not in selection, no propagation for it;
  (b) script skill without record and without stored consent -> rejected before any move;
  (c) first skill fails -> `success: false`, `installed: []`; (d) later skill fails -> earlier
  skill kept, selection and propagation run, logger got an `Error`; (e) non-`RpcUserError`
  failure -> `reason` is `Skill install failed.` and has no path text.
- Spec of `SkillsShSourceRootService` (find the existing spec beside the service): `verifyStaged`
  that throws leaves the existing slug directory and metadata unchanged; without the option the
  existing tests pass unchanged.
- Do not weaken or delete an existing test. If an existing test must change, say why in the report.

## Write set (nothing else)

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts` and its spec
- `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.ts` and its spec
- `.ptah/specs/TASK_2026_1162_56c1/decisions.md` (the one section)
- The deliverable.

If you need another file (for example a DI token or a type file), stop and say which and why in
the report; edit it only if the change is under 10 lines and is in `libs/backend/rpc-handlers`.
Nothing under `libs/frontend/**`, `apps/**`, `libs/backend/harness-sync/**`.

## Rules for code

No `any`, no `@ts-ignore`, no `as unknown as X`. Injected `Logger`, never `console.*`. Do not
swallow errors. Zod at RPC boundaries. Keep the change small. Keep `platform-cli` and `cli-engine`
in operation (the RPC surface does not change).

## Verify (scoped only)

`npm run verify -- -t typecheck,test -p @ptah-extension/rpc-handlers 2>&1 | tail -40`

If Nx fails with `spawn EPERM`, say so and run instead:
`npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` and
`npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath <each changed spec>`.
Report the real result. Do not claim a pass that you did not see.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Verification is scoped only. No workspace-wide checks. No `build`, `serve`, `dev`, `e2e` or
  `package` target.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`,
  commit, push, force push or history rewrite. Report an unexpected change; do not revert it.
- No personal data or home paths with a user name in files or in the report.
- Electron first.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/B7c-fixes.md` (UTF-8, short Simplified Technical English): what
changed per file (one line each), how the wizard reaches the install pipeline, the real test
results (command, suites, tests, pass or fail), and anything unexpected.

## Reply format

One short message: done or blocked, files changed, test results.
