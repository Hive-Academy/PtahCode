# Phase F code style review — round 2

Review family: codex (implementer: claude)

Score: 7/10
Verdict: REVISE

## Round-1 findings

1. **S1 — FIXED.** `libs/frontend/machines-ui/src/lib/services/session-event-reducer.ts:370-380` admits permission requests only through `parsePermissionRequest`. That parser checks and constructs all required fields at `:411-446`, including finite `timestamp` and `timeoutAt` and string `description`; malformed-field cases are covered at `session-event-reducer.spec.ts:288-299`. The former whole-payload assertion is gone.
2. **S2 — FIXED.** `libs/frontend/machines-ui/src/lib/services/countdown-clock.ts:15-41` holds one interval regardless of the number of active countdowns. Each block acquires and releases it through an Angular effect cleanup at `remote-approval-block.component.ts:310-324`; the service stops the interval after the last release.
3. **S3 — PARTLY.** The composer and its draft/send behavior moved to `libs/frontend/machines-ui/src/lib/components/remote-composer/remote-composer.component.ts:79-192`, and the empty state moved to `machines-intro.component.ts:19-72`. `machines-view.component.ts:318-319` now composes the latter. However, `remote-session-view.component.ts:101-314` still holds a 214-line template for header, banners, transcript, approvals and composer, followed by session state and lifecycle coordination at `:316-632`. The split removes two responsibilities but leaves the original scan and change cost for the remaining session view. Extract the transcript/approval pane with typed inputs and outputs so the view coordinates the panes.

## New findings

1. **Serious — The new transcript ingestion boundary asserts a complete event union after only partial checks.** `libs/frontend/machines-ui/src/lib/services/transcript-events.ts:123-158` accepts any string `eventType` and checks only selected fields before casting the sanitized object to `FlatStreamEventUnion`. For example, a `message_start` lacking `role`, or a `tool_start` lacking `toolName` and `isTaskTool`, passes; those fields are required by `libs/shared/src/lib/types/execution/stream.ts:97-101` and `:152-160`. The remote tree builder then uses `start.role` as a typed user/assistant value at `libs/frontend/machines-ui/src/lib/utils/remote-transcript.ts:56-62`. This recreates S1's contract looseness in the new transcript boundary. **Fix:** discriminate the supported event types and validate their required fields before constructing a typed value; reject unknown types and malformed required fields. Keep the display sanitization after validation and add malformed-event cases.

## Five style questions

1. **What breaks when requirements change?** Adding a stream event variant can silently pass through the default branch of `transcript-events.ts:138-158`; its consumer then receives a value asserted to the full union.
2. **What might a new team member misread?** The parser's documentation at `transcript-events.ts:111-121` calls it an ingestion boundary, but `:155-158` allows unknown variants and a whole-object cast.
3. **What costs more to maintain?** The session view still combines a long pane template (`remote-session-view.component.ts:101-314`) with lifecycle and answer coordination (`:480-613`), so unrelated changes require reading both.
4. **Where is it inconsistent?** The adjacent permission boundary constructs checked fields individually at `session-event-reducer.ts:411-446`; the new transcript boundary asserts the whole value at `transcript-events.ts:158`.
5. **What would be better?** A per-variant parser at `transcript-events.ts:138-158` would make each event's required fields explicit, and a focused transcript/approval pane would narrow the session view's template responsibility at `remote-session-view.component.ts:258-303`.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Count S3 as partly fixed. | Fixed because the requested composer moved; partly fixed because the session view remains broad. | `remote-composer.component.ts:79-192` owns draft and send; `remote-session-view.component.ts:101-314` still owns the transcript/approval template and `:316-632` owns coordination. | Yes |
| Classify the transcript cast as serious and keep REVISE. | Serious contract looseness; blocking type-safety violation. | `transcript-events.ts:123-158` can admit incomplete values; the round-1 permission defect was classified serious, and this has the same boundary failure. | Yes |
| Do not rerun checks. | Repeat scoped verify; rely on supplied passing results and read-only inspection. | The task states `remote-machines`, `worker-host`, `worker-runtime`, and `machines-ui` lint, typecheck and tests already passed. | Yes |

Scope: read-only inspection of commits `117da8a8e` and `4025abc99`, the round-1 review, and affected source and contracts. No checks were run. New defects: 0 blocking, 1 serious, 0 minor. Residual S3 remains serious. Verdict contract: REVISE while a serious contract defect and a serious structural concern remain.
