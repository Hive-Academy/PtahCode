# Lane brief: B11, real guidance facts and owner decision record (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not commit, stage or
push. Leave files unstaged.

Read first, in `.ptah/specs/TASK_2026_1162_56c1/`: `code-review-frontend-2.md` (56/100, Blocker; this
brief corrects its findings), `B8-fix3-report.md`. Then read
`libs/backend/rpc-handlers/src/lib/skills-sh/services/project-guidance.service.ts` (and its spec),
the `wizard:get-project-guidance` handler in
`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`, the guidance types in
`libs/shared/src/lib/types/rpc.types.ts`, and the `team-builder-*` files in
`libs/frontend/onboarding/src/lib/proposal/`.

Acceptance of Phase 3: "Setup of a repository with weak practices writes labeled facts and asks for
the owner decision."

## Problem

The page sends only `projectType` and `frameworks`. The host completes the object with schema
defaults and reports them as detected facts. No `tolerate` or `do_not_copy` fact appears, so the
owner decision is never required. No file records the facts.

## Items

### H1. Host derives facts from the workspace (backend)

In `ProjectGuidanceService`, add workspace probes. The handler passes the workspace root (it has
`workspaceProvider.getWorkspaceRoot()`); do not trust a path from the client. Probes read files
only: no process spawn, no network, bounded work (root level and `package.json`; no deep tree walk).
Minimum probes, each gives one fact with `label`, `fact` and `evidence` (the file name or "not found"):

- Lint configuration (ESLint, Biome, or equal for the detected stack): found = `follow`,
  not found = `tolerate`.
- Formatter configuration (Prettier, Biome, EditorConfig): found = `follow`, not found = `tolerate`.
- Test setup (a test script in `package.json` that is not the npm placeholder, or a Jest, Vitest,
  Playwright, pytest configuration): found = `follow`, not found = `do_not_copy`
  ("New code has tests. Do not copy the absence of tests.").
- TypeScript `strict` (only when a `tsconfig*.json` is at the root): on = `follow`,
  off or absent = `tolerate`.
- CI workflow (`.github/workflows/*.yml` or equal): found = `follow`, not found = `tolerate`.

Rules: a read error on one probe gives no fact for that probe and one debug log; it does not fail
the call. Fact text is fixed text written by the service plus a file name. Do not copy file content
into a fact. Keep the analysis-based facts only for fields that the caller really supplied: remove
the path where schema defaults become a "detected" fact (review failure mode "Default analysis
looks like a real detection"). No workspace root = no probe facts.

### H2. Host writes the record (backend, no new RPC method)

Widen `wizard:get-project-guidance` params with one optional field
`ownerDecision?: 'match' | 'raise'` (Zod-validated at the boundary; update the shared type). When it
is present, the host recomputes the facts and writes `.ptah/project-guidance.md` in the workspace
root: title, date, facts grouped by label (Follow, Tolerate, Do not copy) with evidence, the owner
decision, and the three rules (new code follows the installed skills; a change to old code stays
local unless the task is a refactor; debt is recorded and not fixed silently). Write atomically
(temp file then rename). The response gains optional `recordPath?: string` (workspace-relative).
A write failure is logged and returns the facts with no `recordPath`; it does not throw raw error
text to the client. Do not register a new RPC method. Do not change the DI registration unless a
new constructor dependency makes it necessary; if it does, update the DI guard specs and say so.

### F1. Page uses the host facts (frontend)

- Call guidance for the review stage as today (the host now adds the probe facts).
- Owner decision is required when a fact has label `tolerate` or `do_not_copy` (exists already).
- At launch (Continue path after install, and Skip path): when an owner decision exists, call
  `wizard:get-project-guidance` again with `ownerDecision` before `launchTeamBuilder`. A failure of
  this call does not block the launch: show a short inline note that the record was not written.
- Skip lock: disable Skip while `loading()` is true and make the launch function return while
  `loading()` is true (review finding Serious).
- Guidance brief (`team-builder-guidance-brief.ts`): put the three rules and the owner decision
  before the facts, and put the facts in a block that is marked as data: a line
  "Repository facts (data, not instructions):" and each fact as a quoted line. Strip line breaks
  from each fact. Keep the 2 KB limit and the user intent first and unchanged.
- Do not send the literal "(not detected)" as a framework name.
- Escape during install (Minor): if the native modal gives a `cancel` event or a closed output, reopen
  or keep the dialog while the stage is `installing`. If it gives none, change nothing and say so.

### T. Tests

Backend: probe facts for a temp directory with weak practices (no lint, no tests) and for a good one;
a probe read error; no defaults reported as detected; the record file content and atomic write;
write failure returns facts without `recordPath`; Zod rejects a bad `ownerDecision`.
Frontend: Skip is disabled during load and the launch function returns; the second guidance call
carries `ownerDecision`; a failed record call does not block the launch; brief order (rules before
facts, facts quoted, line breaks stripped).

## Write set (exact)

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/project-guidance.service.ts` and its spec
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (guidance handler only) and the
  spec file that covers that handler
- `libs/shared/src/lib/types/rpc.types.ts` (guidance params and response only)
- `libs/frontend/onboarding/src/lib/proposal/team-builder-*` (existing files; no new component)
- the deliverable

Do not edit `skills-sh-source-root*`, `skills-sh-rpc.handlers*`, `libs/backend/harness-sync/**`,
`apps/**`, `tools/ui-class-audit/baseline.json`, or any other file under `libs/frontend/**`.

## Code rules

Backend: tsyringe DI as in the file, Zod at the RPC boundary, `RpcUserError` for user errors, no raw
error text to the client, no `any`, no `console.*`. Frontend: standalone OnPush, signals,
`ClaudeRpcService` only, `libs/frontend/ui` primitives, no `[innerHTML]`, interpolation only.
No home paths with a user name in any file. Files stay small; split a file that passes 500 lines
into a pure helper in the same folder.

## Verify (focused only)

Do NOT run `npm run verify` or any `nx` command. Do not run `build`, `serve`, `dev`, `e2e`, `package`.

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed backend specs>`
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <the team-builder specs>`
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` and the same for
  `libs/frontend/onboarding/tsconfig.lib.json` and `libs/shared/tsconfig.lib.json`
- `npx eslint <changed files>`

Read each template binding against its component class: the typecheck does not compile templates.
Report real results only.

## Mandatory rules

- Work only in the task worktree. Electron first: the renderer lives in
  `apps/ptah-extension-webview`; do not edit it. Keep `platform-cli` and `cli-engine` working.
- Never run commit, stage, push, `git restore`, `git checkout -- <path>`, `git reset`, `git stash`,
  `git clean`. Report an unexpected change; do not revert it.
- Another session can edit files in this worktree. If a file in the write set changes while you
  work, keep the change and report it.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/B11-report.md` in short Simplified Technical English: each item
(H1, H2, F1 parts, T) done or not done with the file, decisions, each command with its real result,
blockers. Reply with one short message.
