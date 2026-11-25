# Batch B4 report: lane port seam (TASK_2026_2321_rvusg)

Tasks 4.1-4.5 are done, plus the extra coordinator item M3b. Nothing is committed. The coordinator commits.

## Files changed (the 7-file write set only)

- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane.runner.ts`
  - `IReviewLaneGateway.spawn` now takes `repo: RepoIdentity` and returns `Promise<ReviewLaneSpawnResult>`.
  - Both `ReviewLaneResult` variants gain `run?: ReviewLaneRunUsage`.
  - The new private `laneRunOf` sets `run` right after the spawn catch:
    - resolve: `safeParse(value?.usage)`; a failed parse gives unknown with `partial:false`;
    - a `ReviewLaneSpawnError` with `spawned:false`: no `run`;
    - a `ReviewLaneSpawnError` with `spawned:true`: `usage ?? unknown(true)`;
    - any other error: no `run`.
  - `run` is declared before the outer `try`. It is spread into the four returns after spawn: the abort/deadline return after the checksum, the completed return, the catch abort/deadline return, and the failure return.
  - The runner passes `repo: request.repo`.
- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane.runner.spec.ts`
  - The void fakes now resolve `{ usage: UNKNOWN_LANE_RUN_USAGE(false) }`.
  - The four exact `toEqual` results after spawn now include `run: unknownRun`.
  - New `describe('lane run usage')` with cases (a) to (g) and (e2), plus a few extra cases.
- MODIFIED `libs/backend/review-core/src/lib/stages/lens-stage.runner.spec.ts`: only the gateway `spawn` fake (`:63-66`) and the `:205` option fake now return usage. The `UNKNOWN_LANE_RUN_USAGE` import was added.
- MODIFIED `libs/backend/review-core/src/lib/stages/verification-stage.runner.spec.ts`: only the gateway `spawn` fake (`:170-173`) changed, plus the import.
- MODIFIED `apps/ptah-electron/src/services/review/review-lane-gateway.ts`
  - `spawnInputSchema` gains `repo: RepoIdentitySchema`.
  - Everything up to `manager.spawn` returning an id sits in one try that rethrows `ReviewLaneSpawnError.from(e, false, null)`. That covers the parse, the abort, `buildLanes`, unavailable, the limit lookup, at-limit, mkdtemp/writeFile, the folder lookup and `manager.spawn`.
  - New last constructor argument `resolveUsageWorkspace?`, wrapped by `usageWorkspace()`: a failure logs warn `[ReviewLaneGateway] Review usage folder lookup failed` and gives undefined. The result is spread as `...(folder ? { usageWorkspaceRoot: folder } : {})`.
  - `runLane(agentId, signal)`:
    - one try covers the post-spawn `'Review lane cancelled'` check and the poll loop;
    - `last` is read right after spawn and refreshed at the top of each poll;
    - the poll error is captured, not thrown;
    - `stop` runs in its own try/catch and logs warn `[ReviewLaneGateway] Lane stop failed`;
    - then `usage = readUsage() ?? last ?? all-null`;
    - then the poll error wins, else the stop error, else `{ usage: {...usage, partial:false} }`.
  - `readUsage` maps only the top-level fields, each through `ReviewLaneRunUsageSchema.shape.<field>`. An invalid or missing field becomes null. `models` is never read. A throwing read gives null.
  - The task-file cleanup `finally` is unchanged.
- MODIFIED `apps/ptah-electron/src/services/review/review-lane-gateway.spec.ts`
  - Every existing spawn call gets `repo: reviewRepo`, and the completed case expects `{ usage: … partial:false }`.
  - New `describe('ReviewLaneGateway lane usage')`.
- MODIFIED `apps/ptah-electron/src/di/phase-2-libraries.ts`
  - The gateway factory pulls the existing workspace-provider closure into a local `workspaceProvider`, with the same warn and degradation-audit comment, so it is shared.
  - It passes `(repo, signal) => findRepositoryWorkspaceFolder({ environment: provider.resolve(REVIEW_CORE_TOKENS.ENVIRONMENT), repo, folders: workspaceProvider()?.getWorkspaceFolders() ?? [], realpath: (f) => realpathUntilAborted(f, signal) })`.
  - New module helper `realpathUntilAborted`: `fs.promises.realpath` raced against `signal`, and the listener is removed when it settles.
  - No new token. `expected-resolvable.ts` is unchanged (`git diff --stat` is empty).

All existing error messages are byte-identical. The new code throws no new message texts. The only new texts are the warn log `Review usage folder lookup failed` and the DI abort rejection `Review usage folder lookup aborted`; both are new paths.

## Acceptance mapping

Runner (`review-lane.runner.spec.ts`, `describe('lane run usage')`):

| Case | Test |
|---|---|
| (a) resolved usage on completed | `(a) carries the resolved usage on a completed result` |
| (b) only inputTokens, others null | `(b) keeps unread counters null, never 0` |
| (c) spawned:true with usage leads to partial with lane, `run.inputTokens 10`, partial | `(c) keeps the usage of a started lane that failed` |
| (d) spawned:false gives no run | `(d) records no run for a lane that never started` |
| (e) plain Error gives no run, status/reason unchanged | `(e) records no run and keeps the reason for a plain error` (exact `toEqual`) |
| (e2) wrapped TypeError keeps the reason byte-identical | `(e2) …`: plain and wrapped both give `lane-failed: lane; TypeError; boom` |
| (f) abort mid-spawn gives partial run | `(f) carries partial usage when the caller aborts mid-spawn` |
| (g) old fake resolves undefined gives unknown, not partial | `(g) …`, using an explicit `as unknown as IReviewLaneGateway['spawn']` cast for this case only |
| extra | spawned:true without usage gives `unknown(true)`; a `'Lane mutated source'` failure carries `run`; invalid usage gives unknown; `repo` is passed to the gateway; no `run` before spawn |

Gateway (`review-lane-gateway.spec.ts`, `describe('ReviewLaneGateway lane usage')`):

| Case | Test |
|---|---|
| completed `{inputTokens:10}`: other fields null, partial:false | `resolves a completed lane with its top-level usage…` |
| failed / stopped / timeout keep their original messages, spawned:true, partial | `it.each` "rejects a %s lane as started and partial…" |
| deadline | `rejects a lane past its polling deadline as started` (`Date.now` mocked) |
| abort while polling | `rejects an abort while polling as started and partial` (message `cancelled`) |
| unavailable / at-limit give spawned:false | `rejects an unavailable or at-limit lane as not started` (`manager.spawn` not called) |
| F1: ZodError (prompt over 200000 chars, `name 'ZodError'`), detection rejects, limit lookup rejects; no `manager.spawn` | `rejects every failure before an agent exists as not started (F1)`. It also shows a `manager.spawn` rejection is spawned:false |
| F3: abort during `manager.spawn`, stop once, `'Review lane cancelled'`, spawned:true, carries usage | `stops once and keeps usage when the signal aborts during manager.spawn (F3)` |
| F2: timeout + stop throws gives `'timeout'`, last-read usage, one warn | `keeps the timeout and the last usage when stop throws after it (F2)` |
| F2: completed + stop throws rejects with the stop message, spawned:true | `rejects a completed lane whose stop throws, as started (F2)` |
| A11: 5 then 9, undefined after stop, result carries 9 | `keeps the newest polled usage when the record reads empty after stop (A11)` |
| A12: models only gives all null; invalid fields give null | `reads no counter from per-model rows (A12) and drops invalid fields` |
| a usage read that throws gives unknown | `gives unknown usage when the usage read throws (Req 1.4)` |
| two folders, one is the checkout, gives `usageWorkspaceRoot` | `keys the usage rows by the workspace folder that is the checkout (Req 6.1)` (real `findRepositoryWorkspaceFolder`) |
| **M3b** (coordinator): the raw registered folder string, not its realpath or a normalized form | `sends the registered folder string as returned, not its realpath or a normalized form (M3b)`. The registered folder is `'D:\\Links\\PtahCode\\'`, its realpath is `/repos/ptah`, and the spawn request field is `toBe(registered)` |
| no match, or the lookup fails, gives the field absent | `omits the folder when none matches or the lookup fails (Req 6.5)` (also checks the warn) |

The existing lens and verification stage specs pass with the updated fakes.

## Checks (all under `node scripts/verify.mjs --exec --task b4 -- …`, logs in `.ptah/tmp/b4-*.log`)

- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.spec.json`: exit 0
- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.lib.json`: exit 0
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: exit 0
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.spec.json`: the first run hit a JS heap OOM (exit 134, default 2 GB). Rerun with `NODE_OPTIONS=--max-old-space-size=4096`: exit 0, no errors.
- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the runner, lens and verification specs: 3 suites, 65 tests passed.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the gateway spec: 1 suite, 32 tests passed. These include the M3b case: it was added before the Jest run, and the second spec-tsconfig run covered it.
- `npx eslint` on the 7 files: 0 errors.
  - One warning of mine (`_error` unused) was fixed with an optional catch binding, and eslint on the gateway was rerun clean.
  - Three warnings remain, all already there before this batch: `max-lines` in `phase-2-libraries.ts`, and two `preserve-caught-error` in `review-lane.runner.ts` at the `'output-missing'` and `'output-invalid'` throws. The batch did not touch those lines.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, TOTAL 0 unsuppressed sites. The two new swallowing catches carry `degradation-audit:` markers: `reported` for the folder lookup (warn log) and `optional-capability` for the usage read.

## Deviations and open risks

- Plan case (b) says "resolves `{ inputTokens: 10 }` only". `ReviewLaneRunUsageSchema` is strict and has no defaults, so a bare `{inputTokens:10}` would fail the parse and give all-unknown. The runner test instead resolves the full shape with `inputTokens: 10` and the rest null. Mapping a bare `{inputTokens:10}` to nulls is the gateway's job, and the gateway "completed `{inputTokens:10}`" case asserts it.
- `readUsage` returns null when it throws, without a log, so a read that fails on every 200 ms poll does not flood the log. `findAgentUsage` is documented as never throwing.
- Folder resolution is bounded by `signal` only for the realpath calls. `environment.checkoutRoot` / `resolve` are not raced against the signal; this is the same as the current rpc-handlers behaviour.
- The working tree also has changes I did not make: `.ptah/specs/TASK_2026_2321_rvusg/decisions.md`, `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder{,.spec}.ts`, and an untracked `code-logic-review-P1.md`. I did not touch them; they look like other P1 fix work. Stage the B4 files by explicit path.

## Decisions

- The DI factory extracts the workspace-provider closure into a local `workspaceProvider` so the gateway and the folder resolver share it. The other options were duplicating the closure or resolving the provider directly. Evidence: the closure already exists with its warn log. Reversible.
