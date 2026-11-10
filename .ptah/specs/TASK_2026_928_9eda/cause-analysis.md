## Codex false AT LIMIT

### Cause

The observed Weekly 7%, LIMIT REACHED, provider-api is consistent with older provider-API exhaustion carried onto the new reading. Codex reader `toWindow` adds exhaustion only if used >=100% AND rateLimitReachedType exists (`libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts:135-167`). Ledger `recordWindowEvidence` replaces the window through `carryExhaustion` (`libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts:202-224`; `plan-limit-ledger.rules.ts:105-113`). `readingClears` explicitly refuses to clear known-reset hits even on later authoritative 7% (`plan-limit-ledger.rules.ts:151-164`): Decision 4 is unknown-reset-only. A reset-less exhaustion can borrow its window reset (`libs/shared/src/lib/utils/plan-limits/window-state.ts:117-127`), and persists until expiry (`plan-limit-ledger.rules.ts:234-245`). An early reset with falling usage and moving reset time is not handled; changed reset alone may be a rolling-window update, so clearing requires proof of a new allowance boundary.

This is a source-backed hypothesis, not proof of the earlier hit: the active ledger/response was unavailable. Observed `provider-api` points toward old reader evidence, whereas failure-derived evidence uses typed `error-derived` (`libs/shared/src/lib/types/plan-limit.types.ts:24-37`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts:125-140`). `classifyWindow` checks exhaustion before 7% (`libs/shared/src/lib/utils/plan-limits/window-state.ts:203-214`); `classifyLaneState` promotes any applicable exhausted window (`lane-state.ts:326-348`); formatter shows the named window (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts:301-318`). Observed Grok Weekly 100% with state near limit demonstrates that percent alone does not create window exhaustion; full-window lane blocking is separate (`agent-limit.formatter.ts:185-246`).

Codex account service copies only present primary/secondary fields from selected App Server bucket (`libs/backend/auth-providers/src/lib/providers/codex/codex-account-usage.service.ts:529-557`); reader maps present fields only (`codex-plan-usage.reader.ts:78-87,128-135`). The observed one Weekly row means selected parsed response exposed one window. A hidden exhausted 5-hour gate is possible but unevidenced. Capture redacted response shape to determine whether primary or secondary was absent.

### Evidence

Persistence key is `ptah.planLimits.exhaustion.v1` (`libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.persistence.ts:21-22`) via `IStateStorage` (`plan-limit-ledger.service.ts:589-604`). Electron stores it at `<USER_DATA>/global-state.json` (`libs/backend/platform-electron/src/registration.ts:138-140`; `apps/ptah-electron/src/activation/bootstrap.ts:377`). Known-reset entries retain window key/kind/label, optional model scope, exhaustion, and observation time (`plan-limit-ledger.persistence.ts:140-155`). Read-only machine check 2026-11-10: accessible `<HOME>/.ptah/global-state.json` had no ledger key; it may differ from active Electron user data. No identifiers were copied.

### Fix

Change `carryExhaustion`/`readingClears` in `plan-limit-ledger.rules.ts`: a fresh authoritative below-limit reading of the **same allowance**, observed after the hit, clears its held window exhaustion even when its reset is known. A real independent gate must have its own named window/evidence, and a partial table cannot establish room. This also handles early provider reset when the lower reading arrives. In `codex-plan-usage.reader.ts`/`codex-account-usage.service.ts`, distinguish complete gating-window set from partial/malformed response; attach ambiguous reached type only to a proven exhausted gate, otherwise return unknown with reason. Keep named-window blocking in shared `lane-state.ts:326-348`; no CLI branch in formatter or `agent-spawn-limit-gate.ts`.

### Tests

Add ledger tests for old 100% hit then 7% after proven early reset, same-window 7%, stale/estimated read, and expiry. Add Codex reader tests for primary absent, secondary present, malformed response, ambiguous reached type, and genuine 5-hour exhaustion. Add shared lane-state test: 7% without another named exhausted gate cannot block (`plan-limit-ledger.rules.ts:105-164`; `codex-plan-usage.reader.ts:78-87,135-167`; `lane-state.ts:326-348`).

## Antigravity reader failure

### Cause

For cli-store/unknown owners order is OAuth ACP, local language server, headless CLI (`libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:72-93,103-115`). Account-identified owners skip OAuth/CLI because those sources cannot prove identity (`antigravity-plan-usage.reader.ts:77-83`). OAuth reads ACP token, tries quota summary before available models across two endpoints (`antigravity-oauth-plan-usage.reader.ts:90-110,163-220`). LS discovers process, requests provisional protocol, validates schema/owner, maps model windows (`antigravity-plan-usage.reader.ts:115-193`; `antigravity-ls.provisional.ts`). CLI runs candidates with `-p /usage`, parses windows or returns typed failure (`antigravity-cli-usage.adapter.ts:74-106,114-132,194-225`). Normal all-source failure returns `service-unavailable` with CLI statusReason (`antigravity-plan-usage.reader.ts:84-93,372-377`).

Observed `[PlanUsage] reader failed` specifically means uncaught reader rejection: service logs `errorKind(error)` only, then returns `service-unavailable` (`libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:315-370,513-515`). Formatter renders `unknown (reader failed)` (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts:267-282`). LS request/discovery and OAuth outer fetch/parse are caught internally (`antigravity-plan-usage.reader.ts:120-193`; `antigravity-oauth-plan-usage.reader.ts:115-227`); exact uncaught operation is unproved.

### Evidence

Read-only 2026-11-10 search found no matching line in `<HOME>/.ptah/logs/Ptah CLI.log`; broader home log search found no match before it was stopped. Supplied observation gives no error class. Current logger discards message and keeps only class (`plan-usage.service.ts:363-370,513-515`), so actual class/message was not recoverable. No identifying log text was exported.

### Fix

Capture sanitized class and stage at Antigravity outer boundary, reproduce, then catch the exact thrown operation and return typed `statusReason`/`service-unavailable`. Preserve service safety catch (`plan-usage.service.ts:363-370`). No specific network/parse fix can be justified without exception.

### Tests

Add injected-throw tests for OAuth, LS runner/request, CLI, and account observer in `antigravity-plan-usage.reader.spec.ts`; each must settle to safe unknown reason, never at-limit (`antigravity-plan-usage.reader.ts:63-93,96-198`; `plan-usage.service.ts:363-370`).

## Per-model limit state

LS and CLI windows carry `modelScope` (`antigravity-plan-usage.reader.ts:342-369`; `antigravity-cli-usage.adapter.ts:168-178`). OAuth model windows encode model in key/label but omit `modelScope` (`antigravity-oauth-plan-usage.reader.ts:280-307,229-250`). Shared `applicableLimits` filters scoped windows to selected model and marks unresolved scope unknown (`libs/shared/src/lib/utils/plan-limits/lane-state.ts:83-153`); any applicable exhausted window blocks (`lane-state.ts:296-309,326-348`). Thus OAuth can make one model's 429 global. Add `modelScope` to OAuth model windows, leave global summary buckets unscoped (`antigravity-oauth-plan-usage.reader.ts:253-307`). Resolve selected lane model to catalog ID before `applicableLimits` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts:299-303`); unknown selection stays unknown. Expose optional per-model states and alternatives; scope failure-derived 429 to failed model. Test one exhausted/one available, global exhaustion, unknown selection (`lane-state.spec.ts:274-359`).

## Untracked lanes

| Lane | Label origin | Reader requirement |
|---|---|---|
| copilot, cursor, pi | No owner rule: `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-owner.resolver.ts:117-132`; `no-owner` lookup: `lane-limit-lookup.service.ts:219-220,299-303`; label: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts:267-270` | Account owner and real gating windows. |
| claude CLI | No direct owner rule: `lane-owner.resolver.ts:117-132`; may use remembered run owner: `lane-limit-lookup.service.ts:247-266`; label: `agent-limit.formatter.ts:267-270` | Bind CLI subscription account to owner/session route. |
| anthropic-api ptah-cli | Key owner: `lane-limit-lookup.service.ts:256-266`; Anthropic credential is `unsupported-auth`: `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.ts:135-151`; observed limits-not-tracked fallback: `agent-limit.formatter.ts:267-287` | Separate API-key quota reader, if exposed. |
| opencode | Forced `no-usage-source`: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:355-361`; label: `agent-limit.formatter.ts:104-105,253-254` | Plan allowance source beyond local accounting. |

Claude reader exists and is registered as `anthropic` (`plan-usage.service.ts:161-163`), but needs resolved subscription owner/session route (`plan-owner-read.ts:135-151`); registration alone cannot identify external Claude CLI. New readers implement `PlanUsageReader(request): Promise<PlanUsageReading>` (`libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts:44-87`), register in `plan-usage.service.ts:161-175`, and provide status, windowSetEstablished, windows, typed provenance (`libs/shared/src/lib/types/plan-limit.types.ts:24-37`).

## Decisions

- Codex held exhaustion is strongest code-backed hypothesis pending active ledger/redacted response (observed 7%/provider-api; `codex-plan-usage.reader.ts:135-167`; `plan-limit-ledger.rules.ts:105-164`).
- AT LIMIT requires named applicable gating window or unambiguous owner plan exhaustion; parse failure is unknown with reason (`lane-state.ts:296-309,326-348`; `plan-usage-reader.types.ts:84-87`).
- Antigravity error class/message remains unverified (machine search above; `plan-usage.service.ts:363-370`).
- No tests or app launch; only this requested report was written (user instruction).
