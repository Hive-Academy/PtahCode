# Phase F correction review — TASK_2026_858_f7b9

Review family: codex (implementer: claude)

## Scope and evidence

Read the round-2 logic and style reports, both correction diffs (`8d73cc440`, `4ccf9b5fd`), and the affected implementation, regression tests, stream contracts, and Electron navigation code. This verdict covers only the correction commits and the stated defect-2 dispute. The supplied scoped `npm run verify -- -p @ptah-extension/remote-machines` and `-p @ptah-extension/machines-ui` runs passed lint, typecheck, and tests. I ran no new verify command. Scoped `ptah_get_diagnostics` returned **unavailable** after its TypeScript check exceeded 45 seconds, so it adds no independent pass evidence. No source file was changed. No skill catalogue or skill-loading tool was available to this lane.

## Correction outcomes

1. **Logic defect 1 — FIXED.** An initial `attach()` places an attempt cursor before the RPC (`libs/backend/remote-machines/src/lib/machine-connection.ts:463-472`). A delivered frame replaces it with an observed cursor (`:219-229`); the catch now preserves that cursor (`:479-484`). The new test forces a frame followed by RPC rejection, then checks the reconnect sends `afterSeq: 3` (`machine-connection.regressions.spec.ts:559-579`). The no-frame failure case confirms that an unsuccessful first attach is removed (`:581-596`).
2. **Style finding 1 — PARTLY.** The parser rejects event types outside the union (`libs/frontend/machines-ui/src/lib/services/transcript-events.ts:111-146,169-177`) and now checks the required `role`, `toolName`, `isTaskTool`, `isError`, and `agentType` for selected variants (`:179-207`). However, the `default` branch accepts several listed variants without validating their required fields before the whole-object assertion (`:208-211`). For example, `{id:'x',messageId:'m',timestamp:1,eventType:'message_delta'}` passes despite mandatory `tokenUsage` (`libs/shared/src/lib/types/execution/stream.ts:247-250`); `compaction_start` passes without `trigger` or `preTokens` (`:271-280`). Likewise `background_agent_started` lacks mandatory `toolCallId` and `agentType` (`stream-background.ts:36-42`). The new tests cover selected variants but not these (`transcript-events.spec.ts:83-126`). The boundary still promises `FlatStreamEventUnion` for incomplete data.

## New defects introduced by the correction

None found in the bounded correction. The incomplete per-variant validation above is the **residual of round-2 style finding 1**, not a separate new defect. Its severity remains **Serious** because untrusted worker data can enter consumers under a false typed contract. **Fix:** validate every required field for each admitted variant (including nested required shapes), then construct or narrowly assert only the checked variant; add malformed cases for the variants currently handled by `default`.

The round-2 S3 session-view size concern remains **open and unchanged**; `remote-session-view.component.ts:101-314,316-632` still combines the large pane template with session coordination. It is outside these correction commits.

## Defect 2 dispute

**The dispute holds for the Electron main window.** Its installed context menu offers edit and copy/select items only; it never adds an “open link” action (`apps/ptah-electron/src/windows/main-window.ts:74-98`). If navigation is requested through another route, `will-navigate` prevents the in-window transition and passes only safe external schemes to `shell.openExternal` (`apps/ptah-electron/src/windows/window-guards.ts:48-51,81-87`); window-open requests receive the same filter and are denied in Electron (`:89-92`). Thus the specific browser context-menu bypass claimed in round 2 is not demonstrated in this host. The rendered-link hardening proposal remains a future enhancement, not a verified correction defect.

## Five logic questions

1. **Silent failure:** A malformed listed event can be accepted as a complete union member without an error (`transcript-events.ts:208-211`), leaving downstream behavior to depend on missing fields.
2. **Unexpected user action:** The alleged context-menu link opening is absent from this Electron menu (`main-window.ts:74-98`); attempted navigation is guarded (`window-guards.ts:81-92`).
3. **Wrong-answer input:** A `message_delta` without `tokenUsage` is returned as `FlatStreamEventUnion` even though the contract requires it (`transcript-events.ts:208-211`; `stream.ts:247-250`).
4. **Dependency failure:** A first attach RPC can reject after forwarding a frame; the observed cursor now survives for reconnect (`machine-connection.ts:219-229,473-489`).
5. **Unstated requirement:** The event allowlist is exhaustive over discriminants but is not a runtime validator for each variant's payload (`transcript-events.ts:111-146,179-211`). The type claim requires both.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Mark logic defect 1 fixed. | Fixed / partly / not fixed | Cursor preservation and both regression paths at `machine-connection.ts:479-484` and `machine-connection.regressions.spec.ts:559-596`. | Yes |
| Mark style finding 1 partly fixed, Serious residual. | Fixed / partly / not fixed | Allowlist and selected checks added, but required `message_delta` and `compaction_start` fields still pass unchecked at `transcript-events.ts:208-211`. | Yes |
| Accept the defect-2 dispute for Electron. | Dispute holds / does not hold | Custom menu has no link action (`main-window.ts:74-98`); navigation is guarded (`window-guards.ts:81-92`). | Yes |
| Require another correction. | Approve / revise | The typed ingestion boundary still accepts incomplete union variants; S3 is separately open and unchanged. | Yes |

## Score and verdict

**Score: 7/10. Verdict: REVISE.** The backend race is corrected and the Electron-specific dispute is supported, which places this above the 5–6 band. The remaining serious runtime contract gap prevents an 8/10 approval. Confidence is high for the cited code paths, with the limit that diagnostics were unavailable and no Electron interaction check was run in this read-only review.
