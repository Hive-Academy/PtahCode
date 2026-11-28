# Batch 6 round-two fixes

Source and spec references are relative to `libs/frontend/setup-wizard/src/lib/services/`.

## Findings

| Item | Fix | Regression test |
| --- | --- | --- |
| P5 | Both stream routes require a known kind, string content, and a finite timestamp before adoption. Tool kinds also require a name and call ID. A supplied tool-result error flag must be boolean. `generation-run-event-adapter.ts:36`, `:68` | “requires a known stream kind and its fields before adoption or delivery” at `generation-run-event-adapter.spec.ts:700`. Covers binding-only, unknown, and incomplete payloads on both routes, continued polling of an existing record, and each accepted kind. |
| P4 / N2 | Initial starts, retries, and reruns resolve owners through the same store method. A same-ID owner gets a fresh lookup by binding, and the view uses that verified result to enter the owner's state. `setup-run.store.ts:1007`, `:1063`, `generation-workflow.store.ts:313` | “attaches the same-ID owner after an initial %s start is blocked” at `setup-run.store.spec.ts:1323`. Covers agents and guidance, one fresh lookup each, and one record per owner. |
| N1 | Verified view reports can update the record. Only `reportStream` marks push delivery. `setup-run.store.ts:387`, `:395`, `:400` | “completes through the shared poll after the bound view reads and closes without a push” at `setup-run.store.spec.ts:1300`. Binds the real workflow view, reads running, unbinds, and observes unseen completion through the shared poll. |
| N3 | A missing reply for a live run starts a five-second grace and enables fallback. Valid evidence clears the missing timer. A null reply after the grace interrupts the matching attempt and ends its polling. `setup-run.store.ts:122`, `:797`, `setup-run-attempt.ts:255` | “interrupts an initial same-ID blocked owner after two poll intervals of null lookups” and “restarts the orphan grace after valid stream evidence and stops polling after interruption” at `setup-run.store.spec.ts:1358`, `:1384`. |
| N4 | The workflow and record share the proof for a finalization correction. The record requires the same attempt and run ID, prior verified failure with `finalizationFailed`, and a completed lookup with counts and agent outcomes. The view captures the attempt before dispatching the lookup. `setup-run-attempt.ts:128`, `:281`, `setup-run.store.ts:395`, `generation-workflow.store.ts:415`, `:506` | “corrects only a proved finalization failure for the same run in the real record” and “ignores an earlier view lookup with finalization proof after retry reuses the checkpoint” at `setup-run.store.spec.ts:1407`, `:1468`. |
| N5 | The view and record share the guidance commit rule. A completed lifecycle without a committed or unchanged result becomes failed with fixed guidance copy. `setup-run-attempt.ts:119`, `:142`, `:281`, `guidance-generation.store.ts:170` | “settles a guidance trace-write failure as failed via %s” at `setup-run.store.spec.ts:1524`. Covers the real guidance view, shared poll, and terminal push verification. |
| N6 | Retry and rerun map both binding rejection reasons to “This run belongs to another workspace.” A coded Setup model failure receives fixed copy directing the user to Background models. `setup-run.store.ts:1007`, `setup-run-attempt.ts:111`, `:374` | “uses workspace mismatch copy for retry and rerun rejected with %s” and “uses fixed actionable copy for a coded guidance start error” at `setup-run.store.spec.ts:1559`, `:1592`. |
| N7 | Terminal settlement clears delivery and orphan tracking and releases ordinary attempts. Cap eviction and dismissal use the same cleanup for attempts, redirects, and session state. `setup-run-attempt.ts:214`, `:230`, `setup-run.store.ts:1127`, `:1156`, `:1167` | “clears settled delivery and attempt state and drops redirects on cap eviction” at `setup-run.store.spec.ts:1611`. |

## Checks

- Focused Jest passed **4 suites and 191 tests** with **0 failures and 0 snapshots**, including the Electron transcript routing harness. `.ptah/tmp/fix-batch6-round2-jest.log`
- Library TypeScript passed with **0 diagnostics**. `.ptah/tmp/fix-batch6-round2-tsc.log`
- ESLint passed on **8 files** with **0 errors and 53 existing warnings**. The warnings cover member accessibility, an unused assignment, non-null assertions, and the store's line limit. `.ptah/tmp/fix-batch6-round2-eslint.log`
- Scoped Ptah diagnostics returned **0 errors in the 9 requested files**. Its compiler target produced **8 BigInt target errors** in three sibling files. The library TypeScript check passed using the project configuration. `.ptah/tmp/fix-batch6-round2-ptah-diagnostics.log`
- Prettier passed on **8 files**. `git diff --check` passed.
- `setup-run.store.ts` is **1,208 physical lines**, down from 1,221. The existing max-lines warning remains at 1,020 counted lines against the limit of 700.

## Decisions

- Set the orphan grace to two shared-poll intervals beginning with the first null reply. Valid evidence resets the grace. A missing run during fresh hydration still follows the plan's restart reconciliation, including the committed-output check for guidance.
- Keep settled owner redirects while the source and owner remain indexed. Keep the finalization proof and its attempt identity until correction, replacement, or eviction. Release other terminal tracking at settlement.
- Keep the existing store entry points and the Electron renderer's two message-handler registrations. Extract shared poll scheduling into the existing attempt helper to reduce the store's line count.
- Applied the in-worktree Angular developer skill because the lane had no native skill invocation. The Ptah dependency graph omitted the changed paths, so Ptah source search supplied the consumer references.
