# Code Logic Review — TASK_2026_2259_f0db

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 6/10 |
| Verdict | CHANGES |
| Assessment | NEEDS_REVISION |
| Blocking / serious / moderate / minor | 0 / 0 / 2 / 1 |
| Failure modes found | 2 |

The requested orchestration-array normalization and full-order swap work for the covered inputs. Two remaining partial-data failures prevent a sound 7–8 rating; the implementation and passing focused regressions place it above the 3–4 band.

Paths below are relative to this worktree.

## Findings / failure modes

### 1. Moderate — malformed instance data still crashes the whole matrix

Evidence: `libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts:493`; ingress: `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:715`; companion consumer: `libs/frontend/chat/src/lib/settings/providers/connection-usage.ts:112`.

A successful `ptahCli:list` result containing `{ agents: {} }` enters state unchanged. `(sources.cliAgents ?? []).map(...)` then throws before even valid system rows are returned. `{ agents: [null] }` also throws while constructing an instance. Connection usage independently iterates the same unvalidated list and dereferences `providerId`.

This is a remaining pre-existing coverage gap in the requested partial-data hardening, rather than a regression introduced by the swap. Validate this boundary, retain valid instance elements, and report the missing instance source through the single message row. Test non-array and mixed-validity instance lists alongside readable system lanes.

### 2. Moderate — malformed optional detection metadata removes a readable lane

Evidence: `libs/frontend/core/src/lib/services/providers-orchestration-schema.ts:27`, `:31`, `:40`; rendering needs only the optional manifest at `libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts:378`.

For example, `{ cli: 'codex', installed: true, messagingMode: 'none', manifest: {} }` fails the detection schema and is discarded entirely by `validElements`. Before this parser, its base row could render; the optional manifest was not needed for that row. A malformed optional `version` has the same whole-row failure.

The generic missing-data message appears, but the installed lane disappears and cannot be managed. Parse essential identity/status separately from optional display/capability fields; discard malformed optional metadata while retaining the row and missing-field warning. Reject entries whose essential identity cannot be established. Add a boundary-to-row regression for partial optional metadata.

### 3. Minor — requested regression cases remain untested

`libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts:412` says “with undo” but only asserts the forward write; it does not invoke Undo. `move-preferred-agent-order.spec.ts:13` covers absent installed IDs but has no duplicate saved IDs. `libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts:48` checks invalid redetection but not a subsequent fully valid response clearing `missingFields`.

Add assertions for the exact original Undo snapshot after state refresh, duplicate-order moves in both directions, and invalid→valid recovery. These are coverage gaps, not demonstrated defects in those paths.

## Five logic questions

1. **How does this fail silently?** Optional metadata can remove a readable lane; the warning does not identify which lane was dropped (finding 2).
2. **What user action produces unexpected behaviour?** Opening Providers after malformed instance data can throw despite readable orchestration data (finding 1).
3. **What input produces a wrong answer?** The concrete malformed payloads above. No current valid `CliDetectionResult` or selected `AgentOrchestrationConfig` field was found incompatible with the schema; compare `libs/shared/src/lib/types/agent-process.types.ts:547` and `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:351`.
4. **What happens when a dependency fails?** Section read failures reach the existing error input (`cli-orchestration-matrix.component.ts:271`). Successful malformed instance responses bypass that protection. Null detection envelopes throw during destructuring inside the section read and return detection failure (`providers-settings-state.service.ts:814`).
5. **What is missing from the requirements?** Explicit salvage rules for optional row metadata and validation of the independent Ptah instance source. Both are required for a general partial-data guarantee.

## Data flow and edge cases

RPC → parser → ready state → row builder → existing table error/message path. Orchestration arrays are normalized and missing fields propagated; the independent instance ingress remains unvalidated.

| Requirement / edge | Assessment |
| --- | --- |
| Missing/non-array orchestration arrays | Covered; `providers-orchestration-schema.ts:70` and `cli-matrix-rows.ts:487` |
| Preserve uninstalled saved-order slots | Covered by index replacement; `move-preferred-agent-order.ts:13` |
| Missing installed ID / edge move | Append before swap / return null; helper lines 9–13 |
| Duplicate saved IDs | First occurrences determine rank and swaps; no defect identified by tracing, no focused test |
| Undo snapshot | Copies prior array before saving; `preferred-agent-order-save.ts:13`; callback untested here |
| Missing-field recovery | New refresh recomputes metadata; `providers-settings-state.service.ts:798`; recovery test absent |
| Backend order round trip | Verbatim storage/read already present; `agent-rpc.handlers.ts:461`, `:1034` |
| Screenshot RPC shapes | Typed fixtures match inspected contracts; `settings-lanes.fixtures.ts:91`; runtime unverified |

## Verification and limits

- Independently ran permitted focused Jest commands: chat rows/moves/writes, **3 suites / 71 tests passed**; core orchestration/state, **2 suites / 116 tests passed**.
- Forbidden-pattern search across changed tracked and untracked source files: no matches for the supplied prohibitions.
- No build, Nx, e2e, Playwright, commits, pushes, merges, or source edits.
- Ptah diagnostics returned **unchecked** after compiler timeout; not a clean result. Symbol search returned zero hits and AST transport failed; native reads supplied fallback evidence.
- Skill discovery/loading was unavailable in the exposed catalogue. Task context and repository instructions were used. No implementation-plan or code-style-review document exists in the task folder.
- Screenshot execution and visual quality remain unverified as required by the command restriction.

## Decisions

Keep backend order persistence unchanged: existing verbatim storage meets the stated contract. Normalizing it would change persisted semantics. Evidence: handler lines 461 and 1034. Reversible if the contract changes.

## Verdict

**CHANGES — medium confidence.** Close the two partial-data gaps and add the focused regressions above. No blocking or serious defect established.
