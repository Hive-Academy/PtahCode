# Batches - TASK_2026_2322_4ba4

Total tasks: 10 | Batches: 6 | Complete: 0/6

Worktree: `D:\projects\PtahCode\.claude-worktrees\agy-acp-only` (branch `refactor/agy-acp-only`).
`WT` below stands for that worktree. `CA` stands for
`WT\libs\backend\cli-agent-runtime\src\lib\cli-agents`. All paths are absolute once `WT`/`CA` is
expanded.

Inputs: `implementation-plan.md` (r1, Gate 2 approved), `parity-inventory.md` (r1),
`implementation-plan-review.md` (APPROVED r1; R1, R2 carried into Batch 1, R3 into Batch 4),
`decisions.md` (rows 1-5).

## Plan validation

Status: PASSED WITH RISKS

Stress test performed against HEAD `32d76f406` (= main) on 2026-11-23:

- Producer/consumer contracts. `ProviderSessionLaneFallback` is used only by the adapter
  (`antigravity-cli.adapter.ts:906, 938-944`) and by the lane-handle spec (`:37` type import,
  `:113` helper option, `:1680-1872` describe, `:1816/:1832` `mcpConfigWriteFailed` fallback
  handles). The lane-handle `mcpConfigWriteFailed` getter (`:582-583`) only forwards the
  delegate; the manager reads the field generically (`agent-process-manager.service.ts:1994`),
  so D6 holds. The adapter's own `mcpConfigWriteFailed` (`:1863`) is stream-json only.
- The lane handle already has `options` (and so `options.mcpToken`) in scope at
  `provider-session-lane-handle.ts:118`; the diagnostic branch is `:183-187` and emits raw
  `event.line`, as the review states.
- `redactAgyText` is defined at `antigravity-result-diagnostics.ts:7-13` with `INLINE_SECRET` at
  `:5`. Its only production caller is the adapter (`:146, :1690`). The diagnostics spec has no
  `redactAgyText` case (R1 confirmed).
- `provider-session/` has no barrel and `cli-adapters/index.ts` does not export it, so the new
  `lane-stderr-redaction.ts` is internal: no new public API, no style review needed.
- `removeRetiredPtahEntry` returns `true` only at `retired-ptah-mcp-slots.ts:153`; its log line
  is `:190`. Matches the review's caller list.
- Nx project names verified from `project.json`: `@ptah-extension/cli-agent-runtime`,
  `@ptah-extension/vscode-lm-tools`, `@ptah-extension/acp-runtime`,
  `@ptah-extension/harness-sync`, `@ptah-extension/cli-engine`, `ptah-electron`.
- Every spec named by the plan exists on disk.
- A1: `git log main` shows no TASK_2026_2320 commit at decomposition time.

Ordering found by the stress test (stricter than the plan's "A before or with B"):

1. Batch 1 (redaction, component 6) must land before Batch 2, because Batch 2 deletes
   `antigravity-result-diagnostics.ts` and the rules must move, not vanish.
2. Batch 3 (fallback removal, component 3) must land after Batch 2, because until Batch 2 the
   adapter still passes `fallback` (`antigravity-cli.adapter.ts:938-944`) and removing the
   option first fails typecheck.

So the plan's Group B is split around Group A: Batch 1 (component 6) -> Batch 2 (Group A) ->
Batch 3 (component 3). All three are in `@ptah-extension/cli-agent-runtime` and run strictly
sequentially.

Assumptions:

- A1: TASK_2026_2320 has not merged into main — verified at decomposition; re-checked by Task
  1.1 step 0 and before Batch 2 and Batch 3 start (`git log main --oneline -30`). If it merged,
  stop and return to the team-leader (rebase per plan A1).
- A2: the lane-handle spec `:1745` asserts the sign-in hint — unverified; Task 3.2 checks it and
  keeps the assertion as a plain setup-failure test.
- A3: no acp-runtime error path echoes `session/new` headers — verified by the review
  (`acp-session-runtime.ts:338-350`); Task 1.2 re-greps.
- A4: `limit-reader-manifest.spec.ts:12` and `cli-detection.service.spec.ts` compile with the D8
  constructor unchanged — unverified; Batch 2 typecheck confirms.

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Batch 2 exceeds the 6-file cap (11 entries: 8 edits, 3 deletes) | MEDIUM | Decision TL-1 below. Deleting stream-json breaks 7 specs at compile time, so any split leaves a batch that cannot pass its own check. Two ordered tasks, one executor, one verify, one commit |
| Over-redaction hides classifier keywords on Grok and agy stderr (review R2) | MEDIUM | Task 1.1/1.2: spec cases that `HTTP 401 Unauthorized`, `RESOURCE_EXHAUSTED`, `429 Too Many Requests` survive redaction and classify the same as raw |
| Regex rules ship untested if "move the cases" is read literally (review R1) | MEDIUM | Task 1.1: one spec case per rule, written new |
| Empty `mcpToken` turns the scrub into a per-character insert | MEDIUM | Task 1.1: guard on non-empty token; spec "empty token is a no-op" |
| Overlap with TASK_2026_2320 on the shared files | MEDIUM | A1 check before Batches 1-3; no edit to the ACP manifest `antigravity-acp-lane.ts:92-139` (Task 2.1 acceptance: byte-identical) |
| Lane-handle spec helper keeps a `fallback?` option and type import after Batch 3 | LOW | Task 3.2 removes `:37` import and `:113` helper option |
| D5 accepted risk: an older Ptah's live stream-json lane entry is swept | LOW | Task 4.1: header states the risk; the log names the removed shape (R3) |
| `removeRetiredPtahEntry` return type change | LOW | Task 4.1/4.2: union `'lane' \| 'persistent' \| false`, all spec assertions updated |
| D8 constructor change on a barrel-exported class | LOW | Batch 2 also typechecks `@ptah-extension/cli-engine,ptah-electron` |

Edge cases:

- agy below 1.5.1 -> D2 rejection before any spawn, MCP use or folder write — Task 2.1, 2.2
- unreadable version -> not cached, lane runs ACP — Task 2.1, 2.2
- injected probe answering `undefined` re-runs; one in-flight probe shared — Task 2.2
- ACP `initialize` failure -> one error segment, `done` 1, no stream-json spawn — Task 2.2, 3.2
- unknown resume id -> new session with one info — Task 2.2
- `PTAH_AGY_TRANSPORT=stream-json` set -> ignored, ACP — Task 2.1 (no read of the variable)
- stderr line with no secret -> unchanged — Task 1.1
- user's own `ptah` server (non-localhost URL or with `headers`) -> kept — Task 4.1, 4.2
- lane URL without `/auth/{43}` -> removed — Task 4.2

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| TL-1 | Batch 2 keeps the adapter rewrite and its spec rewrite in one batch despite the 6-file cap | Split production and specs into two batches | Removing stream-json symbols breaks compile of `antigravity-cli.adapter.spec.ts`, `.mcp.spec.ts`, `antigravity-result-diagnostics.spec.ts`, `.acp.spec.ts`, `.acp.live.spec.ts`, `.sign-in.spec.ts`; a production-only batch cannot pass typecheck. 3 of the 11 entries are pure deletes and 3 are constructor-call edits. One project | yes |
| TL-2 | Group B split into Batch 1 (component 6) and Batch 3 (component 3) around Group A | Plan's single Group B before/with A; merge A+B into one batch | Redaction must exist before diagnostics deletion; fallback option removal must follow the adapter change (stress test above). A merged A+B would be ~15 files | yes |
| TL-3 | Executor is a `backend-developer` subagent for every batch, not a CLI lane | CLI lane | No `ptah_*` lane tools in this session (`context.md` "CLI Lanes") | yes |
| TL-4 | Two phases: "Removal" (Batches 1-4, code-logic review) and "Wording" (Batches 5-6, comments only, no review) | One phase; per-component phases | Risk-based review rule: comment-only batches need none | yes |
| TL-5 | Review family: same family (Claude subagent) — exception | Different family | No CLI lanes available. The phase summary must carry the weaker-evidence label | yes |

## Executor rules (repeat in every executor brief)

- Work only in `WT`. Do not commit, push or edit `batches.md`/`task.md`. The team-leader owns git.
- Memory-safe checks (CLAUDE.md): never run workspace-wide checks, `build`, `serve`, `e2e` or
  `package`. Write check output to `WT\.ptah\tmp\<name>.log` and filter the file.
- Inner loop: the batch's `--related` command, then its `-t lint,typecheck` command as a
  separate run. A focused `npx jest --config <project>/jest.config.ts --runInBand
  --coverage=false --runTestsByPath <specs>` is allowed while iterating.
- Do not start a check of a project while another executor edits files of that project.
- Electron first; keep provider CLI lanes, `cli-engine` and `platform-cli` working.
- No stubs, TODO markers or placeholders. Delete unused code; no shims.

## Parallelism

- Sequential chain (one project, `@ptah-extension/cli-agent-runtime`): Batch 1 -> Batch 2 -> Batch 3.
- Parallel group P (different projects, file-disjoint, no dependency): Batch 4
  (`vscode-lm-tools`), Batch 5 (`acp-runtime`), Batch 6 (`harness-sync`). Each may run at the
  same time as any batch of the chain and as each other. Max 3 executors at once.
- Suggested waves: Wave 1 = Batch 1 + Batch 4 + Batch 5; Wave 2 = Batch 2 + Batch 6;
  Wave 3 = Batch 3.

## Batch 1: Lane stderr redaction (component 6) — IN_PROGRESS

- Shape: logic
- Estimated weight (tokens): ~26k (read + write set, chars/4 + 10%; `ptah_count_tokens` not available)
- Actual weight (lane tokens): pending
- Write set:
  - CREATE `CA\cli-adapters\provider-session\lane-stderr-redaction.ts`
  - CREATE `CA\cli-adapters\provider-session\lane-stderr-redaction.spec.ts`
  - MODIFY `CA\cli-adapters\provider-session\provider-session-lane-handle.ts` (diagnostic branch only, `:183-187`)
  - MODIFY `CA\cli-adapters\provider-session\provider-session-lane-handle.spec.ts` (add one test)
- Read set:
  - `CA\cli-adapters\antigravity-result-diagnostics.ts:1-13` (rules to copy verbatim; do NOT delete the file in this batch)
  - `CA\cli-adapters\antigravity-cli.adapter.ts:1685-1700` (old scrub, incl. the `'\u0000'` empty-token guard)
  - `CA\cli-adapters\antigravity-cli.adapter.spec.ts` around `:1570` (old redaction test to port)
  - `CA\cli-adapters\provider-session\provider-session-lane-handle.ts:95-125, 175-195`
  - `CA\cli-adapters\cli-stderr-severity.ts` (`classifyCliStderr`)
  - `CA\cli-adapters\provider-session\lane-mcp-attachments.ts:19-28` (Bearer header with `mcpToken`)
  - `implementation-plan.md:390-440` (component 6), `implementation-plan-review.md:270-294` (R1, R2)
- Contract excerpts:
  - `export function redactLaneStderr(line: string, mcpToken?: string): string` — pure, no I/O,
    only `String.replace`; applies the `redactAgyText` rules verbatim, then replaces every
    occurrence of a non-empty `mcpToken` with `[REDACTED]`.
  - Lane handle: `const safe = redactLaneStderr(event.line, options.mcpToken)` once; use `safe`
    for `output.emit(\`[stderr] ${safe}\n\`)`, `classifyCliStderr(safe)` and the segment `content`.
  - Applies to every provider-session lane (agy and Grok, D9). No other event type changes.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - Specs that must run: `cli-adapters/provider-session/lane-stderr-redaction.spec.ts`,
    `cli-adapters/provider-session/provider-session-lane-handle.spec.ts`,
    `cli-adapters/grok-cli.adapter.spec.ts`
- Acceptance:
  - The new spec has one case per rule (review R1): a quoted secret key (`"api_key":"x"`),
    `Bearer x`, `token=x`, `password: x`; plus the token scrub, an empty/undefined token that is a
    no-op (no marker inserted between characters), and a line with no secret returned unchanged.
  - Review R2: a case (redaction spec or lane-handle spec) shows `HTTP 401 Unauthorized`,
    `RESOURCE_EXHAUSTED` and `429 Too Many Requests` survive `redactLaneStderr` and
    `classifyCliStderr(redacted)` equals `classifyCliStderr(raw)` for each.
  - The redaction module's header comment states it applies to Grok stderr too (the R2 behaviour
    change, replacing plan evidence row 50's "Grok's behaviour does not change").
  - Lane-handle spec "redacts secrets and the lane token from agent stderr": diagnostic line
    `HTTP debug Authorization: Bearer super-secret-token api_key=abc123 <mcpToken>`; output and
    segments contain `[stderr]` and `[REDACTED]`, and none of `super-secret-token`, `abc123`, the token.
  - All existing lane-handle and Grok specs pass unchanged.
- Recommended executor: subagent `backend-developer`; tier/effort: default
- Required Skills: none
- Parallel-safe: yes with Batches 4, 5, 6; no with Batches 2, 3 (same project)
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: no `ptah_*` CLI lane tools in this session (TL-3)
- Review family: exception — same family (TL-5)
- Rationale: small pure function plus one wiring point; must land before Batch 2 deletes the source file.
- Tasks: 2 | Depends on: none
- Phase: Removal | Phase review: code-logic (at end of phase)

### Task 1.1: Create `redactLaneStderr` and its spec — IN_PROGRESS

- File: `CA\cli-adapters\provider-session\lane-stderr-redaction.ts`, `...\lane-stderr-redaction.spec.ts`
- Plan reference: implementation-plan.md:390-440; review R1, R2
- Pattern to follow: `CA\cli-adapters\antigravity-result-diagnostics.ts:3-13` (rules), `antigravity-cli.adapter.ts:1690-1695` (token scrub)
- Quality requirements: pure, cannot throw, linear in line length
- Validation notes: step 0 — confirm A1 (`git log main --oneline -30` has no TASK_2026_2320 commit). Empty-token guard (no `replaceAll('')`). R1 and R2 cases.
- Implementation details: copy `SENSITIVE`-quoted-key regex and `INLINE_SECRET` verbatim; export only `redactLaneStderr`.

### Task 1.2: Route lane-handle stderr through the redaction — IN_PROGRESS

- Depends on: Task 1.1
- File: `CA\cli-adapters\provider-session\provider-session-lane-handle.ts`, `...\provider-session-lane-handle.spec.ts`
- Plan reference: implementation-plan.md:402-405, 434-439
- Pattern to follow: existing diagnostic branch `provider-session-lane-handle.ts:184-187`
- Quality requirements: compute `safe` once per line; no change to other event types
- Validation notes: A3 re-check — grep `libs/backend/acp-runtime/src/lib` for code formatting `mcpServers` or `headers` into an error/info string; report the result. Do not touch the fallback machinery (Batch 3).
- Implementation details: import `redactLaneStderr`; replace the three uses of `event.line`.

### Batch 1 verification

- Both new files exist with real logic; lane-handle diagnostic branch uses the redacted line
- Both verify commands pass; output tailed from `.ptah/tmp/`
- `antigravity-result-diagnostics.ts` still exists (deleted in Batch 2)
- Edge cases: empty token, line without secret

## Batch 2: Adapter ACP-only and its specs (components 1, 2) — PENDING

- Shape: logic
- Estimated weight (tokens): ~56k plus the three deleted files (read only to confirm)
- Actual weight (lane tokens): pending
- Write set:
  - REWRITE `CA\cli-adapters\antigravity-cli.adapter.ts`
  - MODIFY `CA\cli-adapters\antigravity-acp-lane.ts`
  - MODIFY `CA\cli-detection.service.ts` (`:189`)
  - MODIFY `CA\lane-spawn-policy.ts`
  - DELETE `CA\cli-adapters\antigravity-result-diagnostics.ts`
  - DELETE `CA\cli-adapters\antigravity-result-diagnostics.spec.ts`
  - DELETE `CA\cli-adapters\antigravity-cli.adapter.mcp.spec.ts`
  - REWRITE `CA\cli-adapters\antigravity-cli.adapter.spec.ts`
  - MODIFY `CA\cli-adapters\antigravity-cli.adapter.acp.spec.ts`
  - MODIFY `CA\cli-adapters\antigravity-cli.adapter.acp.live.spec.ts` (`:189-194`)
  - MODIFY `CA\cli-adapters\antigravity-cli.adapter.sign-in.spec.ts` (`:10-16`)
- Read set:
  - `implementation-plan.md:40-63` (evidence), `:109-121` (D1-D8), `:125-258` (components 1, 2)
  - `parity-inventory.md` §1-§3 (capability rows to keep)
  - adapter: `:1-160` (header, imports), `:185-502` (stream-json schemas, argv, MCP lock — delete), `:504-510` (`supportsMcp` doc), `:560-610` (`detect`), `:672-978` (manifests, probes, `runAcp`, fallback), `:1020-1080` (model-id cache, keep), `:1188-1300` (MCP writer, `runSdk`), `:1305-2151` (stream-json run body, delete)
  - `antigravity-acp-lane.ts:1-139` (delete `:14-45`, `:47-48`, `:62-65`, seam `transport` `:79-80`; manifest `:92-139` untouched)
  - `lane-spawn-policy.ts:50-62, 150-175, 250-270, 480-490`
  - `antigravity-cli.adapter.spec.ts` describes: `detect()` `:230` (drop `:232-300` help cases), `listModels()` `:302`, argv `:473-884` (delete except the model-id cache cases listed in Task 2.2), role delivery `:885`, parsing `:1001-1664`, session id `:1665`, capabilities/parseOutput `:1727`, `agyModelId` `:1768`
  - `antigravity-cli.adapter.acp.spec.ts` describes: transport choice `:152-362`, ACP lane `:364`, `:516`, quota `:687`, fallback `:727-811`, cooldown `:813-899`
  - `CA\agent-process-manager.service.ts:1556-1570` (rejection revoked and rethrown)
- Contract excerpts:
  - D2 message: `Antigravity lanes need agy ${AGY_ACP_MIN_VERSION} or later (installed: <version>). Update agy and try again.` plus an `info` log with the version.
  - D8 constructor: `(spawner?, logger?, acp: AntigravityAcpSeam = {}, readSignIn = readCachedAgySignIn)`.
  - `capabilities()` returns `antigravityAcpManifest(this.roleChannel)` unconditionally.
  - `runSdk`: `binary = options.binaryPath ?? 'agy'`; `probeAcp(binary)` -> `false` rejects (D2) before any spawn, MCP use or folder write; `true`/`undefined` -> `runAcp(options, binary)` with no `fallBack` parameter and no `fallback` config.
  - `probeAcp`: version check only; keeps per-binary cache of definite answers, `acpProbesInFlight`, the `acp.probe` seam; no `--help`, no cooldown, no spawner check.
  - `lane-spawn-policy`: `'antigravity'` joins the `'cursor' | 'grok' | 'pi'` no-argv branch; `antigravityArgv` deleted; comment `:486` reads "agy ACP `thought_level`".
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t typecheck -p @ptah-extension/cli-engine,ptah-electron` (D8 on a barrel-exported class)
  - Specs that must run: `cli-adapters/antigravity-cli.adapter.spec.ts`,
    `cli-adapters/antigravity-cli.adapter.acp.spec.ts`,
    `cli-adapters/antigravity-cli.adapter.sign-in.spec.ts`,
    `cli-adapters/limit-reader-manifest.spec.ts`, `cli-detection.service.spec.ts`,
    `codex-native-selection.spec.ts`, `lane-spawn-policy.spec.ts`,
    `agent-spawn-environment.service.spec.ts`
- Acceptance:
  - grep over `libs` and `apps` returns zero hits for `startupChildStopDeadlineMs`,
    `PTAH_AGY_TRANSPORT`, `readAgyTransportOverride`, `agyHelpListsAcp`, `agyModelWithEffort`,
    `antigravity-result-diagnostics`, `redactAgyText`, `antigravityArgv`, `streamJsonProbe`.
  - No code path spawns `agy --print`, `--input-format`, `--output-format stream-json` or `--help`.
  - `antigravity-acp-lane.ts:92-139` (manifest) is byte-identical to main (`git diff` shows no hunk there).
  - The adapter no longer imports harness-sync, `zod` or the diagnostics module; no adapter-level `fallback` config remains.
  - `supportsMcp` doc and file header describe the ACP-only adapter.
  - ACP spec: version-floor tests (ACP at/above 1.5.1 from one `--version` read and no `--help`,
    asserting spawn argv; below floor rejects with D2 and spawns no transport; unreadable version
    not cached and runs ACP; injected `undefined` probe re-runs, one in flight shared); "a session
    that never opens fails the lane with one ACP error and no stream-json spawn"; "an unknown resume
    id starts a new session with one info"; the nine ported model-id cache cases (old spec `:556,
    :584, :660, :597, :611, :637, :716, :726, :740`) asserting the ACP `model` value, not argv;
    describe `:687` renamed "ACP quota and rate-limit errors keep their wording" and title `:516`
    reworded without "stream-json"; override, fallback and cooldown describes deleted.
  - Adapter spec: `capabilities()` equals `antigravityAcpManifest('task-prompt')` on a fresh adapter with no probe.
  - All three verify commands pass.
- Recommended executor: subagent `backend-developer`; tier/effort: high (large rewrite)
- Required Skills: none
- Parallel-safe: yes with Batches 4, 5, 6; no with Batches 1, 3
- Execution mode: sequential (Task 2.1 then 2.2, one executor)
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: no `ptah_*` CLI lane tools in this session (TL-3)
- Review family: exception — same family (TL-5)
- Rationale: one atomic compile unit (TL-1); deletion of shared symbols and their specs must land together.
- Tasks: 2 | Depends on: Batch 1
- Phase: Removal | Phase review: code-logic (at end of phase)

### Task 2.1: Adapter, acp-lane, detection and policy to ACP-only — PENDING

- Files: adapter, `antigravity-acp-lane.ts`, `cli-detection.service.ts`, `lane-spawn-policy.ts`; delete `antigravity-result-diagnostics.ts`
- Plan reference: implementation-plan.md:125-195
- Pattern to follow: existing `runAcp` (`antigravity-cli.adapter.ts:903-954`)
- Quality requirements: no `--help` spawn at detection; no write to `~/.gemini/config/mcp_config.json`; no new timers
- Validation notes: re-check A1 before starting. Keep `ensureTokensFresh`, `parseOutput`, `geminiRoot`, `listModels`, `readModels`, `currentModelIds`, `probeModels`, `ensureFolderTrusted`, `parseAgyModels`, `agyModelId`, `AgyEffort`/`isAgyEffort`/`AGY_EFFORT_SUFFIX`, model-id constants, the seam `now`. Keep `buildArgvTaskPrompt`, `resolveDirectSpawn`, `assertCommandLineWithinLimit`, `probeCliVersion` (other adapters use them) — remove only the adapter's imports.
- Implementation details: `runSdk` = floor check -> `runAcp`; `detect()` drops `probeStreamJsonInput`; `cli-detection.service.ts:189` -> `new AntigravityCliAdapter(this.spawner, this.logger)`.

### Task 2.2: Prune and port the adapter specs — PENDING

- Depends on: Task 2.1
- Files: delete `antigravity-result-diagnostics.spec.ts` and `antigravity-cli.adapter.mcp.spec.ts`; rewrite `antigravity-cli.adapter.spec.ts`; modify `.acp.spec.ts`, `.acp.live.spec.ts:189-194`, `.sign-in.spec.ts:10-16`
- Plan reference: implementation-plan.md:197-258
- Pattern to follow: existing ACP spec fake transport via `transportFactory`; old `spawnCli` mock for `agy models`
- Quality requirements: the model-id cache cases move, not disappear (F2)
- Validation notes: no `agyModelWithEffort` spec exists (F8); its argv coverage goes with the argv block.
- Implementation details: see the Acceptance list above.

### Batch 2 verification

- Every listed artifact exists or is deleted as stated; grep list above returns zero hits
- All three verify commands pass; output tailed
- ACP manifest lines unchanged
- Edge cases: below floor, unreadable version, initialize failure, unknown resume id

## Batch 3: Lane handle without fallback (component 3) — PENDING

- Shape: logic
- Estimated weight (tokens): ~25k
- Actual weight (lane tokens): pending
- Write set:
  - MODIFY `CA\cli-adapters\provider-session\provider-session-lane-handle.ts`
  - MODIFY `CA\cli-adapters\provider-session\provider-session-lane-handle.spec.ts`
- Read set:
  - `implementation-plan.md:260-300` (component 3)
  - lane handle: `:1-45` (header), `:80-170` (`MAX_HELD_SETUP_ITEMS`, `ProviderSessionLaneFallback`, `config.fallback`, hold-setup, delegate), `:370-441` (`mayFallBack`/`runFallback`), `:460-607` (`runFirstTurn`, handle getters incl. `mcpConfigWriteFailed` `:582-583`, comment `:600`)
  - lane-handle spec: `:30-40` (type import `:37`), `:105-120` (helper option `:113`), `:1680-1872` (fallback describe), `:1874-1968` (credential revoke, fallback case `:1937`)
  - `CA\cli-adapters\grok-cli.adapter.ts:265-280` (Grok call, no `fallback`)
  - `CA\cli-adapters\cli-adapter.interface.ts:228-290` (`SdkHandle`; `mcpConfigWriteFailed` stays, D6)
- Contract excerpts:
  - Delete `MAX_HELD_SETUP_ITEMS`, `ProviderSessionLaneFallback`, `config.fallback`, `holdingSetup`/`held`/`setupErrors`/`releaseHeld`/`deliver`, `delegate`/`delegating`, `mayFallBack`/`runFallback`, and the handle's `mcpConfigWriteFailed` getter. Events project directly.
  - `supportsContinuation`, `continueTurn`, `interrupt`, `getSessionId`, `supportsInterrupt`, `getPid`, `getObservedNativeThreadId` keep only their ACP branches.
  - `onMcpConfigRestored`: revoke on self-exit or failed setup, never on abort (unchanged).
  - The Batch 1 redaction in the diagnostic branch stays.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - Specs that must run: `cli-adapters/provider-session/provider-session-lane-handle.spec.ts`,
    `cli-adapters/provider-session/provider-session-lane-handle.sdk-unavailable.spec.ts`,
    `cli-adapters/provider-session/provider-session-lane-handle.review-1450.spec.ts`,
    `cli-adapters/provider-session/lane-stderr-redaction.spec.ts`,
    `cli-adapters/grok-cli.adapter.spec.ts`, `cli-adapters/antigravity-cli.adapter.acp.spec.ts`
- Acceptance:
  - grep for `ProviderSessionLaneFallback`, `MAX_HELD_SETUP_ITEMS`, `runFallback`, `holdingSetup` over `libs` returns zero hits; grep `fallback:` in `CA\cli-adapters` shows no lane-handle config.
  - New describe "createProviderSessionLaneHandle — setup failure" holds: "a failed setup ends the lane with one error" (old `:1861`); the sign-in hint assertion (old `:1745`, A2); a failed setup closes the ACP child (`h.agent.closed`, old `:1841`); a refused model after the session opened fails the lane (old `:1760`).
  - Fallback credential case `:1937` and the stand-in stream-json handle helper (`:1681-1698`) deleted; spec helper `fallback?` option and type import removed.
  - Header bullets and the `:600` comment describe one transport.
  - Grok, sdk-unavailable and review-1450 specs pass unchanged.
- Recommended executor: subagent `backend-developer`; tier/effort: default
- Required Skills: none
- Parallel-safe: yes with Batches 4, 5, 6; no with Batches 1, 2
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: no `ptah_*` CLI lane tools in this session (TL-3)
- Review family: exception — same family (TL-5)
- Rationale: shared handle simplification; must follow Batch 2 so the adapter no longer passes `fallback`.
- Tasks: 2 | Depends on: Batch 2
- Phase: Removal | Phase review: code-logic (at end of phase)

### Task 3.1: Remove fallback machinery from the lane handle — PENDING

- File: `CA\cli-adapters\provider-session\provider-session-lane-handle.ts`
- Plan reference: implementation-plan.md:262-282
- Pattern to follow: the existing no-fallback branches of each getter
- Quality requirements: no output buffering on the setup path
- Validation notes: re-check A1 before starting. Keep `releaseCredentialOnExit` and the attachment wait unchanged.
- Implementation details: delete the listed symbols; inline ACP-only branches.

### Task 3.2: Rework the lane-handle spec — PENDING

- Depends on: Task 3.1
- File: `CA\cli-adapters\provider-session\provider-session-lane-handle.spec.ts`
- Plan reference: implementation-plan.md:291-300
- Pattern to follow: existing describes at `:1137` (error rows) and `:1225` (handshake timeout)
- Quality requirements: kept assertions do not depend on a fallback
- Validation notes: A2 — confirm `:1745` asserts the sign-in hint text before moving it; report the finding.
- Implementation details: see Acceptance.

### Batch 3 verification

- Lane handle carries no fallback code; spec keeps the four setup-failure assertions
- Both verify commands pass
- Edge case: ACP `initialize` failure -> one error, `done` 1

## Batch 4: Retired MCP slot sweep takes the lane shape (component 4) — PENDING

- Shape: logic
- Estimated weight (tokens): ~9k (plus concurrency spec `:570-595` and `http-mcp-server.service.ts` comment regions)
- Actual weight (lane tokens): pending
- Write set (root `VM` = `WT\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-http`):
  - MODIFY `VM\retired-ptah-mcp-slots.ts`
  - MODIFY `VM\retired-ptah-mcp-slots.spec.ts`
  - MODIFY `VM\http-mcp-server.service.concurrency.spec.ts` (`:578-590`)
  - MODIFY `VM\ptah-mcp-slots.ts` (comment `:62-65`)
  - MODIFY `VM\http-mcp-server.service.ts` (comments `:842-848`, `:1211`)
- Read set:
  - `implementation-plan.md:117` (D5), `:302-346` (component 4); review `:251-268` (callers), R3 `:295-298`
  - `VM\retired-ptah-mcp-slots.ts:1-200` (header `:9-10, 22-35`, `PTAH_PERSISTENT_URL` `:65-66`, `isPtahPersistentEntry` `:102-110`, `removeRetiredPtahEntry` `:118-153`, sweep `:158-195`, log `:190`)
  - `VM\retired-ptah-mcp-slots.spec.ts:95-195`
  - `CA\cli-adapters\lane-mcp-credentials.ts:112-115`, `CA\cli-adapters\ptah-mcp-url.ts:48-59` (URL grammar to copy; do not import)
- Contract excerpts:
  - Lane URL regex: `^http:\/\/localhost:\d+(?:\/auth\/[A-Za-z0-9_-]{43})?\/agent\/[^/]+(?:\/workspace\/[^/]+)?\/?$`, with a comment citing the cli-agent-runtime source.
  - Guards unchanged: remote, no `command`, no `headers`, only `PTAH_SPAWN_MCP_KEY`, inside `withMcpConfigLock`.
  - `removeRetiredPtahEntry(configPath): Promise<'lane' | 'persistent' | false>`; the sweep's truthiness check stays valid.
  - Log: `[CodeExecutionMCP] Removed retired ptah entry from ${configPath} (lane|persistent)`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`
  - Specs that must run: `code-execution/mcp-http/retired-ptah-mcp-slots.spec.ts`,
    `code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`
- Acceptance:
  - Spec `:169-178` becomes "removes a leftover lane entry" (`'lane'`); new cases: lane shape without `/auth/` removed; lane shape with `headers` kept; `:136, :153` assert `'persistent'`; `toBe(false)` cases unchanged.
  - Concurrency spec: the lane entry is removed and the user's `ptah` server stays.
  - Review R3: the sweep's info log names the removed shape, and a spec asserts `(lane)` in the log text for the lane case (live-test step 9 expects `(lane)`).
  - Header states that no Ptah writer produces the lane shape anymore, plus the D5 accepted risk.
  - `ptah-mcp-slots.ts:62-65` and `http-mcp-server.service.ts:842-848, :1211` comments no longer describe `AntigravityCliAdapter` as a live writer.
  - `vscode-lm-tools` does not import `cli-agent-runtime` (grep).
- Recommended executor: subagent `backend-developer`; tier/effort: default
- Required Skills: none
- Parallel-safe: yes (own project, no dependency)
- Execution mode: sequential (one executor, two tasks)
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: no `ptah_*` CLI lane tools in this session (TL-3)
- Review family: exception — same family (TL-5)
- Rationale: one module and its two specs plus comment-only edits; independent project.
- Tasks: 2 | Depends on: none
- Phase: Removal | Phase review: code-logic (at end of phase)

### Task 4.1: Extend the matcher, return the shape, log it — PENDING

- File: `VM\retired-ptah-mcp-slots.ts`, `VM\ptah-mcp-slots.ts`, `VM\http-mcp-server.service.ts`
- Plan reference: implementation-plan.md:302-334
- Pattern to follow: `isPtahPersistentEntry` (`:102-110`) for a sibling lane predicate
- Quality requirements: a user's own `ptah` server is never removed
- Validation notes: D5 risk text in header; R3 shape in log
- Implementation details: sibling predicate `isPtahLaneEntry`; `removeRetiredPtahEntry` returns which matched.

### Task 4.2: Update the sweep specs — PENDING

- Depends on: Task 4.1
- File: `VM\retired-ptah-mcp-slots.spec.ts`, `VM\http-mcp-server.service.concurrency.spec.ts`
- Plan reference: implementation-plan.md:338-344; review `:260-262`
- Pattern to follow: existing cases at `:136-195`
- Quality requirements: each new guard has a case
- Validation notes: R3 log assertion
- Implementation details: see Acceptance.

### Batch 4 verification

- Files modified as listed; both verify commands pass
- Edge cases: lane URL without auth, lane URL with headers, user server kept

## Batch 5: ACP profile wording (component 5) — PENDING

- Shape: docs
- Estimated weight (tokens): ~10k
- Actual weight (lane tokens): pending
- Write set:
  - MODIFY `WT\libs\backend\acp-runtime\src\lib\profiles\antigravity-acp-profile.ts` (comments `:11`, `:14`, `:136`)
  - MODIFY `WT\libs\backend\acp-runtime\src\lib\profiles\antigravity-acp-profile.spec.ts` (titles `:52`, `:77`)
- Read set: those lines plus 5 lines of context each; `implementation-plan.md:348-363`
- Contract excerpts: comment and test-title text only; no logic change
- Verify:
  - `npm run verify -- --related -p @ptah-extension/acp-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/acp-runtime`
  - Spec that must run: `profiles/antigravity-acp-profile.spec.ts`
- Acceptance: no "stream-json" wording in either file; `git diff` shows only comment/title lines; spec passes.
- Recommended executor: subagent `backend-developer`; tier/effort: low
- Required Skills: none
- Parallel-safe: yes
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: no `ptah_*` CLI lane tools in this session (TL-3)
- Review family: N/A (no phase review)
- Rationale: wording only.
- Tasks: 1 | Depends on: none
- Phase: Wording | Phase review: none — docs/comments only

### Task 5.1: Reword the profile comments and spec titles — PENDING

- File: as in the write set
- Plan reference: implementation-plan.md:350-355
- Pattern to follow: N/A
- Quality requirements: describe the behaviour itself
- Validation notes: no logic change
- Implementation details: edit 3 comments and 2 titles.

### Batch 5 verification

- Diff is comment/title only; both verify commands pass

## Batch 6: harness-sync wording (component 5b) — PENDING

- Shape: docs
- Estimated weight (tokens): ~9k (plus the two spec comment regions)
- Actual weight (lane tokens): pending
- Write set (root `HS` = `WT\libs\backend\harness-sync\src\lib`):
  - MODIFY `HS\targets\mcp\mcp-facet.port.ts` (`:69-73`)
  - MODIFY `HS\targets\mcp\mcp-config-lock.ts` (`:13-16`)
  - MODIFY `HS\lock\file-lock.ts` (`:4-7`, `:286-287`)
  - MODIFY `HS\targets\rival-targets.ts` (`:50-56`)
  - MODIFY `HS\targets\mcp\antigravity-mcp-facet.spec.ts` (`:5`)
  - MODIFY `HS\reconciler\harness-reconciler.antigravity-mcp.spec.ts` (comment `:136`; helper `:136-150` stays)
- Read set: those lines plus context; `implementation-plan.md:365-388`
- Contract excerpts: comment text only. The lock rationale stays (any concurrent writer); the adapter is named only as the former writer (TASK_2026_2322).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/harness-sync`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/harness-sync`
  - Specs that must run: `reconciler/harness-reconciler.antigravity-mcp.spec.ts`, `targets/mcp/antigravity-mcp-facet.spec.ts`
- Acceptance: grep `AntigravityCliAdapter` in `libs/backend/harness-sync` returns only "former writer" wording; diff is comments only; specs pass.
- Recommended executor: subagent `backend-developer`; tier/effort: low
- Required Skills: none
- Parallel-safe: yes
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: no `ptah_*` CLI lane tools in this session (TL-3)
- Review family: N/A (no phase review)
- Rationale: wording only.
- Tasks: 1 | Depends on: none
- Phase: Wording | Phase review: none — docs/comments only

### Task 6.1: Reword the harness-sync comments — PENDING

- File: as in the write set
- Plan reference: implementation-plan.md:367-376
- Pattern to follow: N/A
- Quality requirements: keep the lock rationale accurate
- Validation notes: do not change the spec helper's logic
- Implementation details: comment edits only.

### Batch 6 verification

- Diff is comment-only; both verify commands pass

## Phase review and final gate

- Phase "Removal" (Batches 1-4): after the last of Batches 1-4 commits, one code-logic review on
  the combined diff of `libs/backend/cli-agent-runtime` and `libs/backend/vscode-lm-tools`.
  Same-family exception (TL-5), labelled weaker evidence. No style review: no new public API.
- Phase "Wording" (Batches 5-6): no review.
- Coordinator inner loop after all batches (plan `:604-606`):
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/acp-runtime,@ptah-extension/harness-sync`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/acp-runtime,@ptah-extension/harness-sync,@ptah-extension/cli-engine,ptah-electron`
- Full gate once before push:
  `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/acp-runtime,@ptah-extension/harness-sync,@ptah-extension/cli-engine,ptah-electron`
  (no template change, so no `typecheck-templates`).
- Mode 3 notes: parity is verified row by row against `parity-inventory.md` (a transport is
  removed). P1/P2 are covered by `decisions.md` row 2 and must be reported in the PR. No UI change,
  so no visual evidence. Write-path trace: lanes stop writing `~/.gemini/config/mcp_config.json`;
  the sweep's removal is traced to `sweepRetiredPtahMcpEntries` (Batch 4). The Electron live test
  (plan `:615-650`, Gemini 4 Hydrogen) follows QA.
