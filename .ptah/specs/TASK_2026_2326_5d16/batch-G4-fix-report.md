# G4 review fixes, round 1

Addressed findings 1–9 on top of B13. The focused check set passed 157 tests across 8 suites and both TypeScript projects. ESLint exited successfully with one `max-lines` warning in `pipeline/gather.ts`.

## Findings

| Finding | Change | Regression coverage |
| --- | --- | --- |
| 1. Attribute unavailable rows to their own read | `pipeline/gather.ts:75` records rows, roles, and per-phase definition deadline outcomes. `pipeline/candidate-tools.ts:88` preserves the candidate IDs whose tool reads timed out. `route-decide.service.ts:375` and `:641` use the relevant read and pin or capability context when adding the note to both `reason` and `explanation`. | `route-decide.gate.spec.ts:355` covers a 2-second gather timeout inside the 8-second gate. `:380` confirms that a separate model deadline leaves a known missing-capability row alone. `:403`, `:421`, and `:442` cover role, phase-definition, and candidate-specific tool timeouts. |
| 2. Classify route-capped model aborts | `route-decide.service.ts:457` uses the final System One cap and the capped structured signal to report `deadline` while preserving dispatched-request usage. It normalizes abort-triggered structured rejections before request logging. `decision-model/decision-caller.ts:112` filters the System One transport's false `unreachable` warning when the route signal won. | `route-decide.gate.spec.ts:515` exercises the actual System One client with the inner and outer timers winning in turn. `:555` exercises a capped structured abort that reports a disconnect. The existing earlier provider-timeout assertion still passes. |
| 3. Release the rotation write queue | `route-decide.service.ts:398` builds minimal rotation picks before enqueueing. `:590` skips expired jobs, serializes active writes, and releases the queue after failure or a timeout capped at 1 second and the call’s remaining hard deadline. Late rejections are observed without another warning. | `route-decide.gate.spec.ts:971` checks ordering, an expired queued job, recovery from a hung save and a rejected save, and one warning per failure. |
| 4. Keep the ranked runner-up in tied trace compaction | `pipeline/assemble-gate.ts:460` puts ranked alternatives ahead of tied pruned alternatives for the MCP compactor’s first-on-tie behavior. | `pipeline/assemble-gate.trace.spec.ts:8` pins the trace order and explanation. `mcp-core/route-tool-handlers.compaction.spec.ts:69` checks which alternative survives compaction. |
| 5. Validate the deadline and report probe failures | `route-decide.service.ts:173` uses the default deadline when input is non-finite. `:424` guards the request floor, classifies and logs probe rejection, non-OK status or timeout, and cancels the body of an unsuccessful probe when available. | `route-decide.gate.spec.ts:473` covers NaN and Infinity. `:480` covers rejection, HTTP error with body cancellation, and timeout. |
| 6. Reuse a pre-flight result inside the reserve | `route-decide.service.ts:185` checks the in-memory reuse cache independently of the I/O budget. | `route-decide.preflight.spec.ts:201` runs the original cache assertions both outside and inside the return reserve. |
| 7. Clamp invalid dispatch budgets | `decision-model/decision-caller.ts:87`, `:129`, and `:177` clamp invalid or negative caps to zero, including at the lazy System One boundary. | `decision-model/decision-caller.spec.ts:10` covers negative, NaN, and infinite budgets for both transports. |
| 8. Keep compacted explanations well-formed | `mcp-core/route-tool-handlers.ts:102` omits empty candidate arrays during compaction. `:124` and `:176` shorten explanations without splitting a surrogate pair at the cutoff. | `mcp-core/route-tool-handlers.compaction.spec.ts:40` checks empty-array omission at the character limit, and `:45` checks an emoji spanning the cutoff. |
| 9. Pin failure paths and boundary contracts | Added the route, transport, and compaction tests above. Added caller-open expiry and rejected live-recheck regressions. The route namespace already forwarded context and propagated rejected limit reads, so its changes are test-only. | `route-decide.gate.spec.ts:587` and `:1005` cover caller open and live recheck. `mcp-core/route-tool-handlers.compaction.spec.ts:56` and `:62` cover hard-only exclusions and counts-only compaction. `namespace-builders/route-namespace.builder.spec.ts:355` and `:367` cover forwarding and errors. |

### Changed assertions

None. The pre-flight reuse test now runs its existing assertions with a second deadline fixture inside the return reserve. Existing gate, gather, assembly, and namespace assertions remain intact. The new specs cover the changed behavior directly.

## Checks

- 6 suites and 137 tests passed, 0 failed. Log `.ptah/tmp/g4-fix-lane-jest.log`.
  ```sh
  npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts libs/backend/lane-routing/src/lib/route-decide.preflight.spec.ts libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.trace.spec.ts
  ```
- 2 suites and 20 tests passed, 0 failed. Jest emitted the config module-loading warning. Log `.ptah/tmp/g4-fix-mcp-jest.log`.
  ```sh
  npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.compaction.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.spec.ts
  ```
- Exit 0, zero errors. Log `.ptah/tmp/g4-fix-lane-tsc.log`.
  ```sh
  npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json
  ```
- Exit 0, zero errors. Log `.ptah/tmp/g4-fix-mcp-tsc.log`.
  ```sh
  npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json
  ```
- Exit 0, 0 errors and 1 warning. `pipeline/gather.ts` exceeds the 700-line threshold. Log `.ptah/tmp/g4-fix-eslint.log`.
  ```sh
  npx eslint libs/backend/lane-routing/src/lib/route-decide.service.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts libs/backend/lane-routing/src/lib/pipeline/gather.ts libs/backend/lane-routing/src/lib/pipeline/candidate-tools.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts libs/backend/lane-routing/src/lib/route-decide.preflight.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.trace.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.compaction.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.spec.ts
  ```
- Scoped Ptah diagnostics reported zero lane-routing issues. The vscode-lm-tools diagnostic call did not finish within 45 seconds, and the mandatory project TypeScript command passed.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Preserve and consume per-read deadline metadata | Propagate typed outcomes or infer from the global remaining time or diagnostic text | The coordinator transferred ownership of gather and approved the additive candidate-tool field. Gather already distinguishes each read’s outcome before joining it. Unknown limit state does not disqualify an executor. The existing early tool proofs and late-failure observers remain in place. | Yes |
| Order the tied candidates at assembly | Order the trace before compaction or add a ranking rule to the transport | The coordinator approved the assembly-only fix for finding 4. The compactor already keeps the first alternative on ties. | Yes |
| Normalize deadline aborts at the router boundary | Classify and filter in the router or edit the protected client | The public outcome depends on which budget supplied the timer. The protected transport still owns its own timeout and the router has the route signal. Both timer orderings are pinned. | Yes |
| Bound serialized saves to the remaining call deadline and one second | Use only the remaining call deadline or apply a per-save ceiling too | A fixed per-save ceiling releases later writes even when the first gate still has most of its budget. The queue retains only the rotation state and deadline it needs. | Yes |

## Outstanding

No numbered findings remain. The rotation save port has no cancellation contract. The queue releases on timeout and observes late failures, while the underlying adapter can still finish a timed-out write. ESLint’s gather file-length warning remains.

