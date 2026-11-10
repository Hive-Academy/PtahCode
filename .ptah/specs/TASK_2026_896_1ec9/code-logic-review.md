# Code Logic Review — TASK_2026_896_1ec9

Reviewer family: Claude (implementer: codex). Verdict: **REVISE**. Score: **7/10**.

Scope: full read of `review-lane-gateway.ts`, the `phase-2-libraries.ts` hunk, the `cli-adapter.utils.ts` and `copilot-sdk.adapter.ts` hunks, and the consumers (`review-lane.runner.ts`, `lens-stage.runner.ts`, `review-lane-files.ts`, `review-worktree.service.ts`). I compared the gateway against the reference `list` (`agent-namespace.builder.ts:664-729`) and the config keys (`ptah-api-builder.service.ts:793-812`). I did not re-run verification, which the task reports as passing.

## Parity with the agent-list rules

- **Config keys match.** `disabledClis` is read as `('ptah','agentOrchestration.disabledClis')` at gateway:34. `preferredAgentOrder` is read as `('ptah.agentOrchestration','preferredAgentOrder')` at gateway:47. Both are identical to the reference.
- **Ranking identifier matches.** The gateway uses `ptahCliId` for ptah-cli rows and `cli` otherwise (gateway:48-49), the same as the reference. The sort is stable, and the unranked fallback (`MAX_SAFE_INTEGER`) is the same.
- **Disabled CLIs are dropped, not marked.** The reference marks them (`disabled: true`), while the gateway drops them (gateway:35). For review admission this is correct, and the decision log is explicit about it. It is a deliberate difference, not a defect.
- **Ptah CLI filter and mapping match.** `enabled && hasApiKey` and the row shape (including `PTAH_CLI_ROLE_DELIVERY`) match the reference. `laneFamilyOf` is applied at gateway:44.
- **PR #1050 stays compatible.** It keeps `hasApiKey` on the summaries and derives it from the shared connection key at read time. The gateway only reads `enabled`, `hasApiKey`, `id`, `name`, `providerName` and `providerId`. A new `credentialSource` field is ignored and breaks nothing.
- **Spawn path.** `manager.spawn({cli:'ptah-cli', ptahCliId})` is the same shape the agent-spawn path uses. Rows go through `LaneLimitLookupService`, which branches on `row.cli !== 'ptah-cli'` (lookup service line ~255). The row carries `ptahCliId`, `providerId` and `family`, so it can be matched.

## DI

`SDK_PTAH_CLI_REGISTRY` is registered in `libs/backend/cli-agent-runtime/src/lib/di/register.ts:291`. `wire-runtime.ts:632` and `register-agent-messaging.ts:134` already resolve it in Electron. The wiring is real and the getter will resolve in production.

## Findings

1. **Serious — symlink-following write of `task/review-task.md`.** `review-lane-gateway.ts:75-77`.
   - `mkdir(join(cwd,'task'))` and `writeFile(taskFile)` follow symlinks. The previous lane runs with file tools in `attemptRoot`, so it can plant `task` or `task/review-task.md` as a symlink. The inputs are untrusted PR content, so prompt injection is a realistic route.
   - The next lane's spawn then overwrites an arbitrary user file with the prompt text. `rm(force)` removes only the link.
   - `review-lane-files.ts:37-41` does the equivalent realpath containment check for `out/`; the new write has no such check.
   - Fix: `lstat` the `task` dir and the file and refuse symlinks, or `realpath` and assert containment in `attemptRoot`. Better, open with `O_NOFOLLOW`/`wx` after removing any existing entry, or write to a fresh `mkdtemp` directory under `attemptRoot`.

2. **Moderate — a DI failure is silently swallowed and fails open.** `phase-2-libraries.ts:500-508`.
   - Both lazy getters catch every error and return `undefined`, with no log.
   - If the workspace provider fails to resolve, `disabledClis` becomes `[]`, so CLIs the user disabled get re-enabled for review. The preferred order is lost too.
   - If the registry fails to resolve, all Ptah CLI lanes vanish quietly. This is the original bug class, and a real wiring defect would be invisible.
   - `buildLanes` also swallows `listAgents()` rejections (gateway:46) with no log.
   - Fix: log a warning, and resolve eagerly where the dependency is always registered. The getters exist only to break a circular or ordering dependency, so at least log.
   - The inline generic cast at phase-2:503 is also unreadable.

3. **Moderate — a prompt over 200_000 characters still fails.** `review-lane-gateway.ts:11`.
   - The zod cap `max(200_000)` is applied before the file-offload path, so the offload only helps prompts between 100 KB and 200 K characters.
   - Intended or not, this is an unlisted ceiling. Document it, or raise it now that large prompts are written to a file.

4. **Moderate — the pointer task names only `out/lane-output.json`.** `review-lane-gateway.ts:79`.
   - Triage also requires `out/walkthrough.md` (`review-lane.runner.ts:118-122`).
   - If the offloaded prompt is a triage prompt, its file content carries that instruction. But the pointer text says "deliver to lane-output.json" and may bias the lane towards skipping the walkthrough.
   - Fix: phrase the pointer as "follow the output instructions in the file".

5. **Moderate — the fixed path `task/review-task.md` can collide if lanes ever run concurrently.**
   - Today the callers run one lane at a time. `lens-stage.runner.ts` loops with `await`, and `review-lane.runner.ts` holds an admission lease per attempt, so there is no collision now.
   - If lanes were parallelised for one `attemptRoot`, lane B would overwrite A's prompt mid-run, and A's `finally` (gateway:~126) would delete B's file.
   - Fix: use a unique name such as `review-task-${randomUUID()}.md`, or `laneId`-keyed.

6. **Minor — cleanup can mask the original error.** `gateway:126`.
   - `rm(force)` ignores only ENOENT. An EPERM/EBUSY in the `finally` replaces the real spawn or timeout error.
   - Fix: wrap the `rm` in try/catch and log.

7. **Minor — the exit-127 rule.**
   - `copilot-sdk.adapter.ts:~219` treats exit 127 as not installed. This is shell semantics for "command not found". For the VS Code shim this is correct.
   - False positives would require a working copilot binary that exits 127 on `--version`, which is unlikely.
   - On Windows the same shim failure gives 9009 via cmd, which is not covered.
   - A timeout or spawn error gives `exitCode: null`, so it keeps the old behaviour.
   - Acceptable; add a note.

8. **Minor — cosmetic.** `review-lane-gateway.ts:78-110` has the extra `try {` unindented and nested around the whole spawn. It is hard to read and needs reformatting (style-review territory). Also, `probeCliVersionDetailed` is exported without a barrel check, and its only caller is copilot. Safe.

## Source checksum and publication

No effect. `review-lane-files.ts:20` sets the source to `attemptRoot/src`. The checksum (`review-worktree.service.ts:112-125`) uses `git ls-files` and `git status` inside `src` only. `task/` is a sibling of `src/`, so it is neither tracked nor dirty. Publication reads `out/` only (`publication-stage.runner.ts:39`).

## Abort and cleanup paths

- **Throw in `manager.spawn`:** the outer `finally` removes the file.
- **Abort after spawn:** `stop` runs and then throws, and the outer `finally` still removes the file.
- **Abort inside the poll loop:** the inner `finally` calls `stop`, and then the outer `finally` removes the file after the process is stopped. OK.
- **Process crash between write and rm:** a stale file remains, but the next run overwrites it (modulo finding 1).

## Five logic questions

1. **Silent failure:** the swallowed registry and workspace failures (finding 2).
2. **Unexpected user action:** disabling a CLI while the provider fails to resolve re-enables it for review.
3. **Wrong-answer input:** a prompt that is exactly at, or just over, the byte or character boundary. Bytes are measured for the threshold and characters for the cap, which is harmless.
4. **Dependency failure:** registry or provider failure degrades silently (finding 2).
5. **Missing:** symlink containment (finding 1), unique task path (finding 5), and logging.

## Verdict

REVISE. Parity with the agent list, the PR #1050 shape, the ranking identifier, the DI registration, the exit-127 rule and the checksum isolation are all sound. The symlink-following overwrite (finding 1) should be fixed before merge, and the silent fail-open (finding 2) should at least be logged.

## Re-review (fix round)

Verdict: **APPROVED** (score 8.5/10). Scope: the fixes only.

- **#1 symlink write: fixed.** `review-lane-gateway.ts:91-93` uses `mkdtemp(join(cwd,'task-'))` and `writeFile` with `flag:'wx'`. The directory name is random and created fresh, so no pre-planted `task` or `task-*` entry can be followed. The old `cwd/task` path is never touched, which the new spec pins. Cleanup uses `rm(taskDir,{recursive,force})` at :102, which removes a swapped-in symlink without following it.
- **#5 shared path: fixed.** The directory is unique per spawn, so concurrent lanes cannot collide.
- **#4 pointer text: fixed** at :94-95.
- **#6 cleanup masking the error: fixed.** `rm` is wrapped in try/catch with `logger.warn` at :101-105.
- **#2 silent fail-open: fixed.** Both DI getters log via `logger.warn` (`phase-2-libraries.ts:500-518`), `listAgents()` rejections are logged (`gateway:53-55`), and the logger is passed in.
- **#8 readability: fixed.** `runLane` is extracted (:110) and the `ReviewPtahCliRegistry` type is exported.
- **Accepted as not fixed:** #3 (the 200_000-char cap is a pre-existing contract) and #7 (Windows 9009).

Remaining findings:

1. **Minor — `mkdtemp` leak on a failed `writeFile`.** `review-lane-gateway.ts:91-93`. `taskDir` is assigned before the `try` at :97, so if `writeFile` throws (for example on a full disk), the empty `task-*` directory is never removed. Move the write inside the `try`, or clean up in a catch. The impact is an empty temp dir inside the attempt folder, which is outside `src/`, so there is no checksum or publication effect.
