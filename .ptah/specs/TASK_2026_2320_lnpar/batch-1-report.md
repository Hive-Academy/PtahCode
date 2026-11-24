# Backend implementation — `TASK_2026_2320_lnpar`, batch 1

**Tasks completed**: 1.1 (lane turn types, manifest/capability sections, reason codes, record
fields), 1.2 (`UsageScope` moved to shared and re-exported from platform-core; spec assertions).

**Files**:

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\agent-process.types.ts`
  - `CliAdapterManifest` has new optional `turnInput?`, `usage?` and `prompts?` sections.
  - New interfaces `LaneTurnSettingSupport` (`appliesAt?`), `LaneImageInputSupport` (`onSteer?`),
    `LaneFileInputSupport` (`delivery?`), `LaneCommandInputSupport` (`blocked?`),
    `LaneTurnInputCapabilities`, `LaneUsageCapability`, `LanePromptCapabilities` and
    `LaneEffectiveApproval`.
  - `EffectiveLaneCapabilities` has new optional `turnInput?`, `usage?`, `prompts?` and
    `effectiveApproval?` sections (A-TL1).
  - `AgentProcessInfo` has new `reasoningEffort?` and `observedModel?` fields. Both are mutable,
    like `status` and `turnSeq`, because the manager updates them per turn.
  - `UsageScope` is now declared in shared. `CliOutputSegment` has a new `usageScope?` field.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\agent-messaging.types.ts`
  - New types `LaneTurnSettings`, `LaneTurnContent` (images use `InlineImageAttachment`, a
    type-only import from `./rpc/rpc-chat.types`) and `LaneTurnRequest`.
  - New optional field `AgentMessageRequest.turn?`.
  - `AgentMessageReasonCode` gains `turn-options-refused`, `turn-input-unsupported`,
    `attachments-unavailable` and `attachments-capacity`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\backend\platform-core\src\interfaces\session-usage-sink.interface.ts`
  — `export type { UsageScope } from '@ptah-extension/shared'` replaces the local declaration.
  `platform-core/src/index.ts:469` is unchanged and still re-exports it under the same name.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\messages\agent-monitor.spec.ts`
  — two new tests:
  - every new field is optional (the existing literals still compile and the fields read as
    `undefined`);
  - a full manifest and effective capabilities with every new section, a `LaneTurnRequest`
    with images and files, the 4 new reason codes and the 3 `UsageScope` members.

**Stack observed**:
- Types only, no runtime code.
- The shared barrel re-exports the file with `export *` (`libs/shared/src/index.ts:28`).
- The existing platform-core re-export pattern is at `platform-core/src/index.ts:463-474`.
- No `Record<AgentMessageReasonCode, …>` or zod enum mirrors the union (grep over `libs`), so the
  new members break no exhaustive map.

**Verification**:
- `npm run verify -- --related -p @ptah-extension/shared,@ptah-extension/platform-core`
  (log `.ptah/tmp/b1-related.log`): `2 tasks: 2 succeeded`, lock released with exit code 0.
- The required specs were run directly under the verify lock, because the Nx output does not
  show suite names:
  - `libs/shared/src/lib/types/messages/agent-monitor.spec.ts`: `Tests: 15 passed, 15 total`
    (log `.ptah/tmp/b1-spec-shared.log`).
  - `libs/backend/platform-core/src/usage-contracts.spec.ts`: `Tests: 2 passed, 2 total`
    (log `.ptah/tmp/b1-spec-pc.log`).
- `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/platform-core,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/chat-streaming`
  (log `.ptah/tmp/b1-lint-typecheck.log`): `10 tasks: 10 succeeded`, lock released after 86.5 s
  with exit code 0.
- Not run: build, serve and e2e (forbidden), and chat/chat-ui checks (Batch 2 is editing them).

**Risk handling**:
- A-TL1: every new field is optional, so the resolver literal at
  `CA\messaging\agent-effective-capabilities.ts` still compiles (the cli-agent-runtime
  typecheck is clean).
- `UsageScope` keeps the same name and members. cli-agent-runtime imports it from platform-core
  (`cli-adapter.interface.ts:22`, `lane-usage-normalizer.ts:2`) and still compiles.
- shared imports nothing from platform-core.
- No existing literal value was changed.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| `turnInput.model` uses the same `LaneTurnSettingSupport` shape (with `appliesAt?`) as `effort` | plain `LaneCapabilitySupport` for model | plan :209 lists `model; effort: LaneCapabilitySupport & { appliesAt? }` as one entry, and next-spawn adapters (Copilot, OpenCode) apply the model at the next spawn too | yes |
| `LaneTurn*` types live in `agent-messaging.types.ts`, beside `AgentMessageRequest` | agent-process.types | the only consumer field is `AgentMessageRequest.turn`; both files reach the same barrel | yes |
| `reasoningEffort` and `observedModel` are mutable | readonly | they change per turn, like `turnSeq` and `status` | yes |

**Plan deviations**:
- `AgentContinueErrorCode += 'turn-options-refused'` (plan :217) is not in this batch's contract.
  It lives in `rpc/rpc-agents.types.ts:727`, which Batch 3 owns, so it was not added here.

**Out-of-scope observations**: none.
