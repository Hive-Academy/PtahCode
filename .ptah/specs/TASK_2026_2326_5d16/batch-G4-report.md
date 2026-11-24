# G4 implementation report

## B09 — Route decision service

Files: `route-decide.service.ts`, `di/register.ts`, `decision-model/decision-caller.ts`, `route-decide.gate.spec.ts`, and `route-decide.preflight.spec.ts` in lane-routing.

Exports: `RouteDecideService.decide` accepts optional `deadlineAtMs` in context. `RouteDecideDependencies` accepts optional `routingRulesSetting`. `RouteDecideSeams` accepts optional `monotonicNow` and `residencyFetch`. `DecisionCaller.dispatchFor` accepts an optional per-call signal and timeout cap.

Changed coverage:
- Checks the exact request floor at and one millisecond below the boundary.
- Skips the review pass when the first pass consumes its remaining budget.
- Returns an assembled gate result when the rows port hangs.
- Explains the deadline on an unavailable row with a null fallback cause.
- Skips a local daemon without positive residency (cold and unknown fixtures).
- Dispatches a loopback custom target without checking residency.
- Reads the DI routing rules once and applies them in both plans.
- Returns the gate result while live recheck and rotation save are pending.
- Caps the configured timeout at the remaining pre-flight budget.
- Returns null skill-table answers when a dispatched pre-flight request hangs.
- Existing direct calls without context and background live recheck completion remain covered.

Checks: The B09 run passed 89 tests across 2 suites before the concurrent G3 gather refactor landed. ESLint passed for all 5 B09 files. The integrated library typecheck passed after the G3 refactor replaced the missing gather helper reference. The subsequent integrated Jest run passed 88 tests and failed 1 across 2 suites. The existing `logs one error summary and rethrows a gate failure unchanged` test exposed an unhandled rejection after the G3 refactor. Ptah diagnostics identified zero issues in the B09 files. Its intermediate run reported two sibling gather errors that the integrated CLI typecheck subsequently cleared.

Deviation: The lane has no skill-loading catalogue for `resilient-nestjs-patterns`. The repository instructions and approved plan governed the change.

## B10 — MCP route adapter

Files: `namespace-builders/route-namespace.builder.ts`, `namespace-builders/route-namespace.builder.spec.ts`, `mcp-core/route-tool-handlers.ts`, and `mcp-core/route-tool-handlers.spec.ts` in vscode-lm-tools.

Exports: `RouteNamespace.decide` accepts optional `deadlineAtMs` in context. `buildRouteCandidateSource` implements the existing optional `limitEvidence` port. `handleRouteToolCall` retains its signature and forwards the deadline derived at entry.

Changed coverage:
- Passes parsed pre-flight arguments through, forwards its four-second deadline, and returns result JSON.
- Forwards both matching and different session keys with a deadline, and forwards a deadline without a session key.
- Projects only state, lookup status, snapshot status and readAt into limit evidence.
- Forwards the eight-second gate deadline.
- Keeps the chosen candidate and strongest eligible alternative when the shortlist fits.
- Fits a dense 100-phase trace by dropping candidate details without changing legacy fields.
- Keeps omission counts and shortens explanations after removing candidate details.
- Returns the legacy roster when even the omission counts cannot fit.
- Existing character and token overflow specs still require the tool error.

Checks: 2 Jest suites, 33 passing tests. Jest emitted one Node module-loader warning for the project's TypeScript config. Ptah diagnostics reported zero errors and zero warnings after the first check timed out. The vscode-lm-tools library typecheck and ESLint for all 4 B10 files passed.

Deviations: None.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use the shared 1,000 ms configured-timeout minimum for dispatch admission | Minimum floor or require the saved timeout in full | AM7 makes the saved value an upper bound. The existing setting constant defines its minimum. | Yes |
| Admit local Ollama via the existing `GET /api/ps` parser and probe allowance on each pass | Read current residency or use a cached snapshot | The client probe is private and tied to its cold-load allowance. The router bounds the same check and passes the existing keep-alive while clearing the cold timeout for route calls. | Yes |
| Count model-pruned eligible candidates when finding the strongest alternative | Include eligible pruned entries or use ranked entries alone | G3 marks offered-pool pruning separately from hard exclusion. The eligible runner-up may be absent from the offer. | Yes |
| Attempt compaction in batches of at most four fit checks per round | Check after each removal or batch removals | One removal per phase per round spreads omissions and bounds repeated serialization and tokenization. If omission counts themselves exceed the budget, the existing legacy payload wins. | Yes |

## Open questions

The integrated G3 gather refactor needs a follow-up in `pipeline/gather.ts`. When a source-row rejection triggers the throwing test logger, the early `await rowsPromise` exits before the derived incremental tool promise is observed. The existing gate test fails with the unhandled rejection. Preserve the test and ensure gather observes all started work on this path. The G4 write set excludes pipeline changes.

The G3 resolver suppresses `model-cold` on alternates-only rows even when B09 skips their pass for local residency. It already preserves `deadline` for those rows. This is outside G4's write set and is raised for the parent’s G3 review if row-level cold visibility is required.

## Handoff to B13

- `requestWithinDeadline` gates residency for local Ollama and uses the post-reserve monotonic budget. Hook prefill cost admission into the fitted request and keep the outer deadline race and transport cap.
- Both gate passes and pre-flight share the same path. Collect dispatch/usage figures at that boundary so expired in-flight work still increments request count and leaves unread token figures null.
- B09 preserves the existing gate question cap. B13 owns the System One cap, cost estimate, EWMA and per-target overlap guard.
- MCP compaction preserves legacy reasons and roster fields. Keep new metrics optional and account for the current serialized result budget.
