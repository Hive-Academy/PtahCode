# Batch C report

Status: complete; final four-project verification passed.

## Files changed

- `libs/shared/src/lib/types/agent-turn-usage.types.ts`: Zod completed-turn and explicit unavailable telemetry contracts.
- `libs/shared/src/lib/types/agent-turn-usage.types.spec.ts`: schema boundary tests.
- `libs/shared/src/lib/utils/agent-budget-policy.ts`: pure settings validation, weighted token accounting, cost resolution, duration and telemetry stops.
- `libs/shared/src/lib/utils/agent-budget-policy.spec.ts`: weighted classes, raw floor, deduplication, provider-cost priority and duration tests.
- `libs/shared/src/index.ts`: exports the contract and policy.
- `libs/shared/src/lib/types/agent-process.types.ts`: additive optional `CliOutputSegment.turnTelemetry` field.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.ts`: rejects terminal usage missing required totals.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.spec.ts`: expects fail-closed terminal behavior.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts`: reports last-request tokens as request context only.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.spec.ts`: checks request-context provenance.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts`: removes synthetic zero totals and emits missing-total error.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts`: completed and missing usage regressions.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`: retains cache-read tokens and rejects incomplete step totals.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.spec.ts`: rejects incomplete step fixtures.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts`: rejects usage events missing either total.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts`: complete and missing totals regressions.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.ts`: ACP/Grok prompt-result `_meta.usage` parsing.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.spec.ts`: reported, invalid, and absent usage regressions.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/grok-cli.adapter.spec.ts`: integration assertion through the ACP handle.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.ts`: one settled-turn record from message or turn completion usage.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.spec.ts`: reported and absent usage regressions.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts`: final SDK usage snapshot or explicit missing-event record.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.spec.ts`: reported, repeated, and missing-event regressions.
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts`: caller-side telemetry mapping after `turnUsage()`.
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.spec.ts`: new telemetry coverage outside the protected block.

`libs/shared/src/lib/types/messages/schemas.ts` has no segment schema or `CliOutputSegment` boundary, so no schema change was needed there. Grok delegates to the changed ACP handle; its adapter file did not need a direct edit.

## Public API

- `agentTurnUsageSchema`, `AgentTurnUsage`: required `turnId`, `modelId`, `scope`, `source`, complete input/output totals, four discriminated optional metrics and cache semantics.
- `agentTurnTelemetrySchema`, `AgentTurnTelemetry`: reported usage or explicit unavailable record.
- `completedTurnTelemetry(input): AgentTurnTelemetry`: normalizes a completed turn without inventing missing counters.
- `CliOutputSegment.turnTelemetry?: AgentTurnTelemetry`: additive transport; the existing `usage` field remains for the UI.
- `agentBudgetSettingsSchema`, `AgentBudgetSettings`: validated four settings.
- `new AgentBudgetPolicy(settings).evaluate(snapshot, telemetry, elapsedMs, pricing): AgentBudgetTransition`.
- `resolveAgentTurnCost(usage, pricing): AgentBudgetCost`; provider cost precedes complete catalog rates, otherwise explicit unavailable.
- `initialAgentBudgetSnapshot`, `REFERENCE_INPUT_USD_PER_TOKEN = 0.000003` ($3 per million input tokens).

## Per-adapter result

- Codex: the final snapshot emits one reported turn with known model and full totals; no event, incomplete totals, or missing model emits explicit unavailable. Rollout `lastRequestInputTokens` is request context, not spend.
- OpenCode: complete final tokens emit a record; missing or malformed totals emit unavailable, with no synthetic zero.
- Antigravity: result-only and step usage reconcile to one turn record; cache read is retained; missing valid totals emit unavailable.
- Copilot SDK: complete `assistant.usage` totals emit a record; missing totals or event emit unavailable.
- Grok/ACP: successful `session/prompt` parses `_meta.usage`; absent or invalid usage emits unavailable. `usage_update` remains separate.
- Pi: message-end usage is summed at agent-settled; turn-end is a fallback, never an additional count. No event emits unavailable.
- Cursor: the final SDK usage snapshot emits one record; no event emits `no-usage-event`.
- Ptah CLI: caller maps `turnUsage()` deltas; the sole billed `modelUsage` key supplies the model, mixed-model usage is unavailable, and missing usage is explicit. The protected method and spec block were not edited.

## Verification

- First four-project `npm run verify -- -p shared,cli-agent-runtime,ptah-electron,cli-engine`: lint/typecheck 8/8 passed; tests 13/14 project tasks passed, with 3 cli-agent-runtime suites failing due new reader field and an extra stream segment. Both causes were fixed without touching excluded files.
- Focused rerun of `codex-lane-activation`, `lane-resume-gate`, and both Ptah stream-loop spec files: 1/1 project test task passed (93 tests).
- Focused Codex lane events: 1/1 project test task passed. Focused ACP/Pi: 91 tests in 2 suites passed. Focused OpenCode/Antigravity/Copilot: 182 tests in 3 suites passed; Antigravity reconciliation rerun: 61 tests passed.
- Final `npm run verify -- -p shared,cli-agent-runtime,ptah-electron,cli-engine`: lint/typecheck 8/8 tasks passed; tests 14/14 tasks passed; 0 failures; exit code 0.
- Final scoped `ptah_get_diagnostics` on Pi, Ptah stream loop, and shared contract: 0 errors, 0 warnings, clean coverage. Earlier calls timed out during concurrent checks.
- `captures/*/capture.json` numeric summaries informed the negative usage fixtures; they omit full provider payloads, so adapter specs use typed synthetic events for the recorded absent and zero-counter cases.
- Pre-existing on main `807a6a93a`: 26 `@nx/enforce-module-boundaries` errors in `ptah-extension-webview:lint`, seen in the earlier webview-inclusive run. No webview file was changed; webview is outside the final four-project command.

## Follow-ups

- After task 1, update `claude-cli.adapter.ts` and its spec.
- The coordinator owns `PtahCliStreamLoop.turnUsage()` and its protected spec block. Batch C mapped its output at the caller site and retained the sole-billed-model label rule. Any future edit to those lines belongs to that owner.
- Batch D must consume `CliOutputSegment.turnTelemetry`, apply the stop policy, and log catalog-cost unavailability once per caller; this batch provides the pure contract, policy, and adapter records.
- Negative probes in `captures/*/capture.json` do not establish zero usage. Successful live captures are still needed where provider evidence is missing.

## Decisions

- Use `status: reported | unavailable` for optional metrics and an explicit unavailable turn variant. Evidence: implementation plan section 4 and telemetry evidence. Reversible: yes.
- Reject incomplete terminal counters in the adapters changed here. Evidence: telemetry evidence; a failed or usage-free probe is not a zero-token turn. Reversible: yes.
- Preserve the existing UI `usage` field and add optional `turnTelemetry`. Evidence: coordinator transport decision; additive fields keep current consumers compatible. Reversible: yes.
- Place Ptah telemetry on the existing completion segment when totals exist, and use a separate unavailable segment when they do not. Evidence: protected existing stream-loop assertions and inbound-peer regression. Reversible: yes.


