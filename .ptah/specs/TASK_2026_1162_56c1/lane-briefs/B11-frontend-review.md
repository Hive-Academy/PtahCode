# Lane brief: review of B11 and the frontend batch (kind: review, read-only)

Working directory: the task worktree for branch `feat/setup-stack-skills`. This is a review. Do not
edit source files. Write only the deliverable. Never run commit, stage, push, `git restore`,
`git checkout -- <path>`, `git reset`, `git stash`, `git clean`.

Do not run `npm run verify`, any `nx` command, `build`, `serve`, `dev`, `e2e` or `package`. A
coordinator runs the gate. You can run `git diff`, `git status` and read files. Electron is the
priority host. The renderer lives in `apps/ptah-extension-webview`.

## Scope (uncommitted work against `HEAD`)

Backend:

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/project-guidance.service.ts` and `.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (handler of
  `wizard:get-project-guidance` only) and its spec
- `libs/shared/src/lib/types/rpc.types.ts` (see `git diff`)

Frontend, all in `libs/frontend/onboarding/src/lib/proposal/`:

- `team-builder-start.page.{ts,html,spec.ts}`
- `team-builder-skill.store.ts`
- `team-builder-skill-review.component.{ts,html,spec.ts}`
- `team-builder-skill-consent.component.{ts,html,spec.ts}`
- `team-builder-guidance-brief.{ts,spec.ts}`

Read first, in `.ptah/specs/TASK_2026_1162_56c1/`: `lane-briefs/B11-guidance-facts-implement.md`
(the requirement), `B11-report.md` (the claim), `code-review-frontend-2.md` (the earlier review,
56/100 Blocker). Do not trust the report. Read the code.

## Questions

1. Is each finding of `code-review-frontend-2.md` corrected? Give one line for each: corrected,
   partly corrected, or not corrected, with `file:line`.
2. Host probes: do they read files only, with bounded work, and only below the workspace root that
   the host supplies? Can a client-supplied value select a path? Can a symlink or a very large
   file cause a problem? Does one read error stop the call?
3. Fact text: is it fixed text plus a file name only? Can file content or a file name with control
   characters or Markdown reach `.ptah/project-guidance.md` or the launch intent as instructions?
4. Record write: is it atomic (temp file then rename)? What occurs when `.ptah/` does not exist,
   when the rename fails, when two calls run at the same time? Does a leftover temp file stay? Is
   raw error text returned to the client?
5. Schema defaults: can a default value still appear as a detected fact?
6. Page state: Skip during load, double click on Continue or Skip, a failed second guidance call,
   a failed install, a closed dialog during install, stale responses after the user changes the
   selection. Find each path where the page can lock or launch two times.
7. Untrusted text: skill names, descriptions and fact text are untrusted. Find each place where
   they reach a template without interpolation, a URL, or the launch intent without quoting.
8. Guidance brief: rules before facts, facts quoted and marked as data, line breaks stripped,
   2 KB limit, user intent first and unchanged. Can a fact close the quote and add an instruction?
9. Tests: which claimed behaviors have no test, or a test that cannot fail?
10. Conventions: standalone OnPush signal components, `ClaudeRpcService` only, `libs/frontend/ui`
    primitives, no `[innerHTML]`, Zod at the RPC boundary, `RpcUserError` for user errors, no `any`,
    no `console.*`. Accessibility of the dialog and the owner decision control (labels, focus,
    keyboard).

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/code-review-B11-frontend.md`, short Simplified Technical English:

- Score out of 100 and a verdict: Pass, Pass with notes, or Blocker.
- The answer to each question.
- Findings sorted by severity (Blocker, Serious, Minor), each with `file:line`, the failure
  scenario, and the smallest correction.
- A section "Not a defect" for items that you examined and accepted.

Reply with one short message.
