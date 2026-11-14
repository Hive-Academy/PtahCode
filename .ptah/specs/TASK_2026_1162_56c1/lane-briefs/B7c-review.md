# Lane brief: B7c backend re-review (kind: review)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use another
checkout. Write only the deliverable. Do not edit source files. The implementer was codex; you are
grok. Check on disk. Earlier "Pass" reports were wrong before.

## Scope

Commit `e96e2fc72` (`git show e96e2fc72`) fixes the Blocker of
`.ptah/specs/TASK_2026_1162_56c1/code-logic-review-2.md` (consent hash checked after provider
propagation). Files:
`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (method
`registerInstallSkillsWithConsent`), `handlers/skills-sh-rpc.handlers.ts` (`install`),
`skills-sh/skills-sh-source-root.service.ts` (`verifyStaged`), their specs, and
`.ptah/specs/TASK_2026_1162_56c1/decisions.md` (section "B7b consent preview binding").

## Check (Pass or Fail with file:line evidence)

1. Unapproved bytes never become active: `verifyStaged` runs after the hash and before every
   mkdir, rm, move, metadata write, and propagation. A throw leaves the old slug and metadata intact.
2. A hash mismatch, a script skill without consent, and a staged slug that differs from the request
   are all rejected. The submitted hash is compared with the hash of the bytes that move.
3. `RpcUserError` reaches the wizard unflattened. `reason` is the `RpcUserError` text, else the
   fixed text `Skill install failed.`. No local path reaches the client.
4. Partial progress: earlier installed skills stay, selection and propagation run for them, result
   has `failedSkill` and `reason`. First failure returns `success: false, installed: []`.
   `logger.error` gets a real `Error`.
5. The public `skillsSh:install` RPC contract is unchanged. The wizard reaches the pipeline through
   `this.container.resolve(SkillsShRpcHandlers)`: that pattern exists at `resolveService` in the
   same file. Say whether it is acceptable or needs constructor injection.
6. Tests: do they prove 1-4 (mismatch leaves an existing copy byte-identical, no consent record,
   no propagation)? Is any earlier test weaker than before (`git diff e96e2fc72~1 e96e2fc72 --
   '*.spec.ts'`)?
7. Other risks you find (race between two installs, `result.success` false path loses the
   installer's own error text, stale caches, an unused import).

## Verify (real run, mandatory)

`npm run verify -- -t test -p @ptah-extension/rpc-handlers 2>&1 | tail -40`
Confirm "Running target test for 1 projects" (a cache hit is acceptable, say so). If Nx fails with
`spawn EPERM`: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand
--coverage=false --runTestsByPath <3 changed specs>`.

## Mandatory rules

- Work only in the task worktree. Scoped verification only. No `build`, `serve`, `dev`, `e2e`,
  `package`. Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`,
  `git clean`, commit, push. No personal data or home paths with a user name in the deliverable.
- Short Simplified Technical English.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/code-logic-review-3.md`: score 0-100, verdict (Pass, Pass with
notes, Blocker), table of checks 1-7, findings with severity, the test command and its real result.

## Reply format

One short message: verdict, score, Blocker and Serious findings, test result.
