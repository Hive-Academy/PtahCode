# Phase F fix round 3 review

Review family: codex (implementer: claude)

## Verdict

**REVISE — 5/10.** The per-variant table closes the former permissive default and the pane preserves the visible transcript markup, but three observable boundary/state failures remain. This is below a sound 7/10 because two accepted inputs violate the promised event contract and one asynchronous answer can contaminate a different session. It is above a 3/10 because the other required shapes, enum checks, and normal pane behavior are implemented and the scoped tests pass.

## Findings

1. **Serious — A required `tool_result.output` may be absent.** `libs/frontend/machines-ui/src/lib/services/transcript-event-validators.ts:187-191` checks `toolCallId` and `isError` but never checks whether `output` is an own property. The contract requires it at `libs/shared/src/lib/types/execution/stream.ts:175-180`. Thus `{id:'e',messageId:'m',timestamp:1,eventType:'tool_result',toolCallId:'t',isError:false}` passes `parseFlatStreamEvent` at `transcript-events.ts:134-146` and is returned as a complete union member. The required-field matrix also omits `output` at `transcript-event-validators.spec.ts:200-202`. **Fix:** require own-property presence for `output` (its declared `unknown` value can be any value), and test a missing property separately from a present value.

2. **Serious — Sanitizing object keys can change a validated event.** `libs/frontend/machines-ui/src/lib/services/transcript-events.ts:134-146` validates the raw object and then casts the result of `displayBlockValue`. That function sanitizes keys and defines them in insertion order at `libs/frontend/machines-ui/src/lib/utils/display-text.ts:92-101`. A valid event with an extra key `eventType\u202e` after `eventType` passes raw validation, then the sanitized extra key overwrites `eventType`; the returned value can have an unknown or different discriminant. The same collision can overwrite `id`, `messageId`, or a checked nested field. The spec tests value sanitization at `transcript-event-validators.spec.ts:382-390`, but no key collision. **Fix:** reject key collisions after sanitization at every object depth, then validate the returned object (or construct checked fields and sanitize extras without allowing their normalized names to replace checked fields). Add a collision test with a required field and with `eventType`.

3. **Serious — An old approval response can write into the next session.** `libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-session-pane.component.ts:128-150` resets the `linkedSignal` maps on session-key changes, but `answer()` at `:198-228` updates whichever maps are current when the awaited `respondPermission` resolves. If session A starts answering request `p1`, the pane switches to B, then A's refusal arrives, B gains A's error for `p1`; the `finally` can also clear B's own in-flight `p1`. The test at `remote-session-pane.component.spec.ts:139-152` switches only *after* the response has settled. **Fix:** capture machine/session identity and the request state before awaiting; apply the outcome and cleanup only if that identity still matches the current pane, or keep request state keyed by session. Test a deferred response resolved after a switch, including reuse of the same request ID.

4. **Minor — The validator coverage table does not guard every required field.** `libs/frontend/machines-ui/src/lib/services/transcript-event-validators.spec.ts:187-237` is a manually maintained list whose type only restricts the event name. It omits `tool_result.output` and could silently omit a future required field while `EVENT_FIELD_CHECKS` remains merely `Record<string, Predicate>` at `transcript-event-validators.ts:31,158`. **Fix:** derive required-property checks from typed per-variant fixtures or add an explicit coverage assertion for every declared field; at minimum add the missing-output case. This is a test-maintenance issue in addition to finding 1.

### Five logic questions

1. **Silent failure:** A missing tool output is accepted and cast to `FlatStreamEventUnion` (`transcript-event-validators.ts:187-191`; `transcript-events.ts:146`).
2. **Unexpected user action:** Switching sessions while an approval answer is in flight can display the old session's refusal on the new session's approval (`remote-session-pane.component.ts:209-228`).
3. **Wrong input data:** A control-character-suffixed key can overwrite a validated event field during sanitization (`display-text.ts:92-101`; `transcript-events.ts:146`).
4. **Dependency failure:** A rejected `MachinesStore.respondPermission` promise reaches `finally` but creates no displayed error because `answer()` has no `catch` (`remote-session-pane.component.ts:209-228`). This behavior was already present in the parent before extraction; the observed store method awaits its API at `machines-store.ts:420-429`.
5. **Unstated requirement:** Session-local async results need identity checks after every await, and a validator that returns a transformed object must ensure that transformed object still meets its own contract (`remote-session-pane.component.ts:209-228`; `transcript-events.ts:134-146`).

## Acceptance criteria check

- **A — FAIL.** The event-type mapped table at `transcript-event-validators.ts:158-335` is exhaustive over the current `FlatStreamEventUnion` discriminants and rejects unknown types at `transcript-events.ts:135-145`. Nested token usage, compaction measurement, snapshot tasks, and turn-state task/cron arrays have checks. Spot-checked actual producers at `libs/backend/agent-sdk/src/lib/message-transform/stream-event.transformer.ts:290-300`, `system-message.transformer.ts:770-792`, and `helpers/session-turn-state.registry.ts:225-244`; their sampled events fit these checks. However, a missing required `tool_result.output` passes and sanitized keys can invalidate the returned object (findings 1-2). Required-field tests are incomplete.
- **B — FAIL.** `remote-session-pane.component.ts:43-49,105-150` is standalone, OnPush, and uses typed signal inputs/output. Its section, test ID, ARIA label, classes and child bindings at `:50-102` match the parent before this commit; parent wiring is at `remote-session-view.component.ts:278-289`. The linked signals reset settled state on a session switch, but an in-flight answer can still mutate the new session's state (finding 3). The inserted `ptah-remote-session-pane` host uses `class: 'contents'`, so the semantic section and visible layout remain, although the literal DOM adds the component host.

## Checks run

- `git show 60e57ea8a --stat` — six changed files, including the new validator and pane specs; `git diff 60e57ea8a^ 60e57ea8a -- libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts` — compared extracted template and state with parent.
- `TMPDIR=/home/amun/.cache/ptah-phase-e-tmp npm run verify -- -t test -p @ptah-extension/machines-ui -- --testPathPatterns='transcript-event|remote-session' 2>&1 | tail -40` — `NX 1 task: 1 succeeded`; verify lock released with exit code 0. Coordinator separately reported full machines-ui verify: 24 suites, 417 tests pass.
- `ptah_get_diagnostics` scoped to the new validator and pane — zero diagnostics in requested files; eight sibling BigInt/target diagnostics in shared and worker-protocol files, unrelated to this commit. The scoped Jest run does not exercise the three failing scenarios above.
- Read the seven focus files, the union's actual declaration in `stream-background.ts:334-355`, nested shared parsers, sanitization helper, relevant producers, and the parent component before extraction. `ptah_code_search_symbols` returned zero hits with an empty index for `FlatStreamEventUnion`; native `rg` was used for that symbol and producer literals. `ptah_search_files` found no `AGENTS.md`; repository guidance was supplied in the task.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Mark both criteria failed and request revision. | Approve with caveats; revise. | Findings 1-3 violate explicit required-field, post-sanitization, and per-session-state behavior. | Yes |
| Treat the missing `output` as a contract defect even though its value type is `unknown`. | Accept absence; require presence. | `ToolResultEvent.output` is required at `stream.ts:178`; `unknown` concerns the value, not property presence. | Yes |
| Report promise rejection as residual uncertainty rather than a separate new defect. | New finding; inherited gap. | The same answer method existed in the parent before extraction, and store/API rejection behavior was not exercised by the supplied tests. | Yes |
