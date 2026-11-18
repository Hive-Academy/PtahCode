# Implementation batch 1

Implemented fix-plan items **1, 2, 3 and 6** in `fix/subagent-budget-handoff`, starting from `40ab857a2`. No commit, push or branch change. All source changes are confined to `agent-sdk`; shared policy/defaults, settings descriptors, CLAUDE.md, Codex budgets, Electron/CLI composition roots are unchanged.

## 1. Permitted notes and explicit deliverables

**Old:** `subagent-notes-gate.ts:58-80` allowed only Write/Edit of the one notes path, rejected Read of that file, and instructed immediate end-turn after a denial. No explicit deliverable path reached this gate.

**New:** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:29` accepts an optional explicit `readonly string[]` of deliverables (default empty), validates nonempty paths and workspace containment, canonicalizes/deduplicates permitted files. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:66` permits Write/Edit of all permitted files and Read of the notes file only. Warning and denial name every permitted path and say **"write these files, then end your turn"**. Other paths/tools remain denied. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-path.ts:24` also checks existing ancestors through realpath, rejects symlink/junction escapes and rechecks paths when the tool runs. This is containment validation, not an atomic filesystem sandbox against concurrent path replacement.

**Structured-source finding:** Current SDK subagent spawn state and registry have no deliverable declaration. `libs/shared/src/lib/types/subagent-registry.types.ts:126` documents `outputFilePath` as background SDK output, not a user deliverable. CLI spawn contracts have `deliverables` (`libs/shared/src/lib/types/agent-process.types.ts:284,433`), but they describe separate CLI lanes and are not joined to these SDK Agent calls. SDK completion helper accepts checked deliverables (`helpers/sdk-subagent-completion.ts:15`), but its SubagentStop caller supplies no deliverables (`libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.ts:552`). No prompt prose is parsed.

**Current wiring:** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:703` intentionally passes no deliverables, so the current runtime permission set is the notes path only. The optional list is exercised by tests, not inferred from an arbitrary Agent input field.

**Smallest additive follow-up to supply SDK declarations:** parent Agent/Task `tool_use.input` is observed at `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1358`. Add a validated optional deliverable list to an actual parent/task contract and persist it on `SpawnTask` keyed by spawning tool-use ID there; pass that list as the fifth argument of gate.warn and expose it on warning replay. Do not adopt an unknown SDK tool input field unless the owning Agent contract actually supports it. Resolve explicit task-worktree-relative paths against a validated task worktree; notes and deliverables can live in different descendants of the session root. For disjoint roots, add explicit allowed-root metadata rather than a blanket outside-workspace exception.

## 2. Completion phase and single watchdog

**Old:** denial limit 3, 2-second burst counter, 45-second first-decision timer and 120-second undecided grace (`subagent-notes-gate.ts:4-7,50-81`). A successful Write did not complete the phase.

**New:** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:7` is the sole bound: **10 minutes from gate entry**. No denial/call/decision quota remains and no first-decision timestamp is stored. Repeated warn, writes, reads and denials never restart the watchdog. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:58` counts only successful Write/Edit results for required paths in the current gate; all notes + explicit deliverables must be written, with duplicate paths deduplicated. PreToolUse permission, preexisting files, unrelated results and Read do not count. Successful Edit is a successful update. No content-quality claim is made solely from a successful write.

`libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-hooks.ts:77` forwards successful results; PostToolUseFailure and embedded `is_error: true` do not count. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:737` completes via `warning-notes-complete` or `notes-timeout`. It returns the SDK hook before asynchronously requesting task termination to avoid waiting on the task that is servicing that hook. Errors are handled and logged by the callee. The existing monitor watchdog checks the one entry deadline, with up to its one-second polling delay; inline tool checks also enforce it. The normal SubagentStop route remains a completion alternative even if files were not written, with honest inferred/missing notes.

**Independent safety is retained:** cumulative weighted/raw, duration and missing telemetry can override a notes turn; the message explicitly says so. Successful completion still uses existing durable-record, retry, redaction and stop mechanisms. At the ten-minute notes-timeout, exhausted record retries no longer disable the watchdog: the monitor attempts the record, then stops with an explicitly in-memory handoff if persistence fails. No nonexistent record is indexed or claimed as saved. Actual SDK stop failures still use the existing bounded stop/retry machinery; a failed external stop cannot be presented as successful. Gate expiry/denial text is redacted before returning to the SDK.

## 3. First high-context request gets notes

**Old:** shared policy marked a request at >=2*handoffContextTokens stopped; monitor queued a warning and immediately invoked a safety stop for the same context trigger (`subagent-budget-monitor.ts:654-664`). Crossing just H already used the warning/gate path.

**New:** per-request accounting is extracted to `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-request-accounting.ts:12`. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-request-accounting.ts:42` classifies independent safety before setting the monitor's stopped snapshot. Context-only H/2H crossings enter one cooperative notes phase and do not stop it on another tool/request count; stream blocks still replace their original request share. Missing registry metadata defers the warning as before. Missing model ID and unsafe/fractional counts rejected by completed-turn normalization remain telemetry-unavailable safety stops; only context-only stopped snapshots are cleared. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:662` avoids posting a misleading promise of a notes turn when independent safety requires an immediate stop.

A first request at warning, at H, or beyond 2H gets one warning/gate; independent safety is still allowed to override. Model capacity and remaining provider capacity are **not** guessed here: the window-relative limit belongs to batch 2.

## 6. Real stop evidence and honest messages

**Old:** `handoff|safety` collapsed normal exit, gate expiry, context ceiling, cumulative tokens, duration and unavailable telemetry; stop text could claim weighted exhaustion for duration or label a below-limit normal return as an interruption.

**New:** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-stop-cause.ts:9` adds optional cause evidence to `HandoffUsage`: kind, measured quantity, measured value, limit, forced flag and optional independent-safety override flag. Legacy reason is retained and old records/messages without cause still render. Supported cause vocabulary: `warning-notes-complete`, `warning-turn-ended`, `notes-timeout`, `context-handoff`, `context-ceiling`, `weighted-budget`, `raw-budget`, `duration`, `telemetry-unavailable`.

`libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-stop-cause.ts:19` prioritizes duration, then weighted, then raw (weighted wins a tie). Context-only crossings are cooperative in this batch, so `context-handoff`/`context-ceiling` remain additive vocabulary, not fabricated forced-stop events. Gate completion/turn-end measure files, timeout measures elapsed milliseconds, cumulative stops measure their respective totals, duration measures elapsed milliseconds, unavailable telemetry measures one missing usage observation against one.

`libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts:30` carries optional cause. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts:122` writes explicit cause evidence into the durable record and parent handoff text. The same formatter supplies SDK stop notices. Prepared handoffs retain their usage snapshot so retries do not rewrite cause/measurements in notices while reusing an older record. Normal end-turn sets `forced: false` (`libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:843`); the 129970 regression verifies "cooperative return", no forced-stop claim, and no SDK stop invocation. `redactBudgetSecrets` remains on warning, gate response, record and outgoing notice paths.

## Files

Changed production files (relative to `libs/backend/agent-sdk/src/lib/helpers/`):

- `compaction/subagent-budget-monitor.ts`: delegates accounting, connects completion and cause evidence; **2001 physical lines vs 2035 before** (final count checked below).
- `compaction/subagent-notes-gate.ts`: optional deliverables, permitted-path policy, completion tracking, one watchdog.
- `compaction/subagent-budget-hooks.ts`: successful write-result handling.
- `compaction/subagent-handoff-message.ts`: permitted paths and cause-based language, legacy fallback.
- `subagent-hook-handler.ts`: optional completion callback binding; old narrow test/host adapters remain compatible.

New production modules: `compaction/subagent-notes-path.ts`, `compaction/subagent-request-accounting.ts`, `compaction/subagent-stop-cause.ts`; each is below 700 lines. No new injectable or host-specific dependency.

Changed specs: `compaction/subagent-notes-gate.spec.ts`, `compaction/subagent-budget-hooks.spec.ts`, `compaction/subagent-budget-monitor.spec.ts`. New spec: `compaction/subagent-stop-cause.spec.ts`. Existing `subagent-hook-handler.spec.ts` is run as a related consumer, not edited.

## Changed expectations and why

| Existing test / group | Changed expectation or trigger | Reason |
|---|---|---|
| Gate scope/canonical-path test | Read of notes is now allowed; other Read paths still denied; denied tools do not stop | Explicit coordinator decision |
| Gate three-denial-bursts test | Replaced with >3 denials and many edits remaining active | Remove count expiry completely |
| Gate first-decision/grace/expired-write tests | Replaced by one entry-based 600000ms deadline; no 45s/120s expiry; repeated warn does not reset it | One generous safety bound |
| Gate Windows normalization test | Retained normalization; extended to deliverable and traversal behavior | Same canonical-path rule now applies to all permitted files |
| Stop/delivery/identity/rekey/retry/record fixtures using input310000 or300000 | Add output600000 to create a genuine independent weighted stop; assertions about delivery, ownership, retries, redaction and cleanup stay | Context-only ceiling is no longer an immediate stop; do not weaken those regression assertions |
| "at the handoff size stops..." | Renamed independent-safety-override test; cache-read fixture adds output600000 | Honest trigger for the stop being tested |
| "weighted safety stop fires once" | Expect `weighted-budget reached its limit` rather than generic `safety limit 3000000` | Message identifies real trigger |
| "records the $reason notice before the stop settles" | Input fixture300000 ->3000000; reason weighted-budget; evidence unit weighted-tokens | Real cumulative stop and exact quantity/limit |
| "retries a rejected stop ... cap" | Stop notice contains weighted-budget instead of generic safety limit | Real cause preserved on retries |
| "a stop that rejects after release ..." | No deferred-near-warning log expected during an independent immediate stop | Do not promise/defer a notes turn already overridden by safety |
| Foreground full handoff message test | Expect cause weighted-budget instead of2x context ceiling | Stop fixture is genuine weighted safety; context ceiling is soft during notes |
| "forces one policy stop ... warning and stop together" | No subagent warning queued; forced safety handoff still once | Independent safety overrides notes honestly |
| "goes once to ... registry record, naming notes path" | Warning includes `Permitted paths:` and plain `handoff limit is 150000 tokens` | Explicit writable paths and corrected wording |
| "caches a missing transcript across stop preparation retries" | Successful notes Write results trigger completion attempts, not denial count; transcript lookup still once | Completion retains durable-record preparation retries |
| Gate missing-task-ID, rejected-stop, denial-before-stop-settles tests | Trigger at entry+600000ms; expiry assertions say notes-timeout; retain gate on failed/deferred stop | Preserve retry/lifecycle tests after deleting count expiry |
| Record helper / late record publish / record retry exhaustion tests | Successful notes Write results trigger completion instead of three denials | Completion retains record-before-stop and late-publish cleanup; timeout separately guarantees the time bound via an in-memory fallback |
| Final scrub failure test's normal-exit fixture | Give mock notes paths their matching workspace | New path validation correctly rejects inconsistent mock roots |

New regression cases cover all-files completion, deduplication, no pre-tool/existing-file proof, phase reset, outside paths, symlink swaps, no prose inference, initial threshold/2H crossing and repeated stream blocks, actual below-limit cooperative return, ten-minute fake-timer watchdog, successful-only post-tool events, missing-usage override, every cause's notice/record agreement, and legacy no-cause rendering. The new rules fail against the old implementation (old notes Read denial, old3-denial/45s/120s expiry, missing completion/cause APIs, initial2H forced stop). Additional cases retain normalized missing-telemetry safety and ensure the timeout survives both an immediate record failure and exhausted completion-record retries.

## Checks and results

Only the explicitly allowed commands were run, one heavy process at a time. Read-only git/source searches are not test commands. No Nx/verify/build/serve/dev/e2e/package targets were run.

1. Initial `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: exit0.
2. Initial three-spec Jest run (gate/hooks/monitor): manually interrupted without a result while adapting old context-stop fixtures. No pass claim.
3. Gate + hooks Jest: **2 suites,16 tests passed**.
4. Monitor + cause Jest: **242 passed,8 failed /250**, then corrected old trigger/message expectations, mock root, and fake-timer I/O settling.
5. Five-spec Jest (monitor/cause/gate/hooks/hook-handler): **259 passed,40 failed /299**, traced to realm-sensitive ENOENT detection in new realpath validation; fixed with Zod error-code validation while retaining instanceof Error handling for thrown errors.
6. Full agent-sdk lib typecheck after fixes: exit0.
7. `npx eslint <all changed/new TS files>`: exit0,0 errors,2 warnings: existing oversized monitor and existing unused captureProgress parameter.
8. Five-spec Jest after path fixes: **5 suites,301 tests passed**.
9. Follow-up agent-sdk lib typecheck: exit0.
10. Five-spec Jest with normalized unavailable-telemetry regressions: **5 suites,304 tests passed**.
11. Five-spec Jest while adding persistence-failure watchdog coverage: **4 suites passed (61 tests), monitor suite failed to compile** because a fixture omitted the session argument/undefined guard for workspaceOf. Both fixture errors fixed; no production type error was reported.
12. Final five-spec Jest including timeout/persistence failure: **5 suites,306 tests passed**,56.387s, exit0.
13. Final `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **exit0**. Final `npx eslint <all 12 changed/new TS files>`: **exit0,0 errors,2 existing warnings** (monitor max-lines and unused captureProgress toolCallId).
14. Final read-only `git diff --check`: exit0; added-text/new-file scan found no Windows home paths. Branch/HEAD remain fix/subagent-budget-handoff /40ab857a2. Monitor physical line count is2001; new production modules are each under700 lines.

Commands for the successful targeted checks use `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the listed spec paths. Jest emits the existing TypeScript-config ESM load warning; it does not prevent execution. Shared was not touched, so no shared check was needed. Full Electron runtime execution is outside the permitted checks; related host-neutral hook tests cover the existing shared composition surface.

## Remaining scope

Batch 2: real per-subagent model/route window evidence, a window-relative cap and unknown-capacity policy; successor lineage/rate guard and restart persistence. No window or lineage fields are required/nonadditive here. Structured SDK deliverable plumbing remains the smallest explicit parent-contract extension described above, per coordinator fallback; runtime SDK gates currently have empty deliverable lists. Item7 imports/defaults remains a user decision. No CLAUDE.md/default/settings/Codex derivation change was made.

Tool availability: Ptah workspace/dependents tools were used; dependents returned graph-building, so native rg inspected callers. No CLI-native skill loader was exposed; inspected filesystem skills did not match this backend fix, so no skill workflow was applied.
