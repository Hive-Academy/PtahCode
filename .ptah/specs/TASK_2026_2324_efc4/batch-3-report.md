# Batch 3 report: Grok live usage (Component 4)

## Files (W = `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups`)

Only Batch 3 edits these files:
- W/libs/backend/provider-session-contracts/src/lib/provider-session-events.ts: new `usageProgress` ProviderEvent ("one model call inside a running turn; never completes the turn").
- W/libs/backend/provider-session-contracts/src/lib/cli-segment-projector.ts (+ `.spec.ts`): `usageProgress` becomes an `info` segment with `usageScope: 'message'` and `usage` (model fallback `<provider>/unknown`), with no `turnTelemetry`.
- W/libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts (+ `.spec.ts`): `usageProgress` returns `[]`, so main chat does not change.
- W/libs/backend/acp-runtime/src/lib/acp-session-runtime.ts (+ `.spec.ts`): `extNotification` calls `profile.extensions.usage` only while a prompt is in flight, a `currentTurnId` is set, and `params.sessionId` equals the session id. It emits `usageProgress`; usage without a model takes `sessionModel()`. The existing `notification` hook (Grok's swallow) still runs afterwards. The spec's `start()` gained an optional profile parameter.
- W/libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.spec.ts
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/usage-scope-adapters.spec.ts
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/grok-cli.adapter.spec.ts: the manifest usage is now `{ timing: 'live' }`. Batch 4 also adds a `laneEfforts` case to this file.

Batches 3 and 4 both edit these files, so they cannot be split by path. Commit them with Batch 3, or commit Batches 3 and 4 together:
- W/libs/backend/acp-runtime/src/lib/acp-vendor-profile.ts. Batch 3: the `AcpExtensionHooks.usage?` hook. Batch 4: `AcpSessionConfigInput`.
- W/libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.ts. Batch 3: the zod-checked `readGrokCallUsage` for `_x.ai/session_notification` `response_completed`, which maps `inputTokens = input + cache_read + cache_creation` and `outputTokens = output`. Batch 4: the `sessionConfig` parameter type.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts (+ `.spec.ts`). Batch 3: `acpLaneManifestSections` gives `{ timing: 'live' }` when the profile has a `usage` hook, plus the "Grok live usage" replay spec. Batch 4: `acpProfileEfforts` and its specs.

## Assumptions checked
- A1: holds. Every Grok fixture's per-call Σ equals its `_meta.usage` turn totals. The `it.each` over all `grok-*.ndjson` files in `grok-acp-profile.spec.ts` proves it. `cache_creation_input_tokens` is 0 in every fixture.
- A2: holds. `currentTurnId` is already a closure variable (set in `runPromptTurn`, cleared in its `finally`). No new variable was added.
- A3: the only exhaustive switches are `cli-segment-projector.ts` and `flat-stream-projector.ts`. `provider-session-turn-stream.ts` (agent-sdk), `acp-replay-collector.ts` and the lane handle use `if` checks or non-exhaustive switches and ignore the new event. `tsc` is clean on the three libs.

## Evidence
- Fixture replay (`provider-session-lane-handle.spec.ts`, "Grok live usage"): p1 gives three `message` segments and then one turn segment. Through `LaneUsageNormalizer`, the running totals are 18267/168, 43359/395 and 69024/473. The turn correction adds 0 input and 0 output, and the card sums are 69024 and 473, so nothing is counted twice.
- Runtime (`acp-session-runtime.spec.ts`): three `usageProgress` events come before the single `usage`. A frame from another session or from outside a prompt is dropped. Without a usage hook (agy, the default profile) no event is emitted.
- agy is unchanged: its manifest stays `turn-end` with its reason (`antigravity-acp-lane.spec.ts` passes, and the lane-handle spec asserts it).

## Checks
- Focused jest, all passing:
  - acp-runtime `grok-acp-profile.spec.ts`: 42 tests.
  - acp-runtime `acp-session-runtime.spec.ts`: 15 tests.
  - provider-session-contracts, both projector specs: 23 tests.
  - cli-agent-runtime `provider-session-lane-handle.spec.ts` + `grok-cli.adapter.spec.ts`: 126 tests.
  - cli-agent-runtime `usage-scope-adapters.spec.ts` + `antigravity-acp-lane.spec.ts`: 10 tests.
- cli-agent-runtime jest ran through a scratchpad copy of its config that maps `marked` to `D:\projects\PtahCode\node_modules`, because the worktree has none. Repo config is unchanged.
- `npx tsc --noEmit --project` on `tsconfig.lib.json` for provider-session-contracts, acp-runtime and cli-agent-runtime, one at a time: all exit 0.
- `npx eslint` on the changed files: 0 errors. One warning is old: `max-lines` in `acp-session-runtime.ts`.
- The orchestrator flagged two problems, both now fixed: the `no-fallthrough` error in `flat-stream-projector.ts` (the comment now sits inside the case body) and the orphaned degradation marker in `grok-acp-profile.ts` (replaced with a plain comment).
- `check-degradation.ts`: TOTAL 0 unsuppressed sites.

## Decisions and open items
- Per-call usage carries no `totalTokens`, because `ProviderUsage` has no such field and the plan sets none. Grok's turn total does carry `totalTokens` through the schema's passthrough. As a result, the turn-end `turn` increment for `totalTokens` is Grok's own total (69497 = Σ input + Σ output). The input and output corrections are 0.
- The full fixture replay through the normalizer lives in `provider-session-lane-handle.spec.ts`, where the fake-agent harness and `LaneUsageNormalizer` already meet. `usage-scope-adapters.spec.ts` got a smaller normalizer case built from the recorded numbers.
- `agent-effective-capabilities.spec.ts` uses a hand-written Grok-like manifest with `turn-end` usage. It does not assert the real adapter, so it was left alone.
- No `libs/shared` change was needed.
