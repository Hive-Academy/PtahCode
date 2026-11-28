# Batch B1 report

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts`: places query/session-dependent prompt blocks after the static prefix; places bundled skill controls and the 200-character listing cap in SDK `Settings`.
- `libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.ts`: records the eight SDK bundled skill IDs and lets collision filtering protect bundled names alongside terminal catalog names.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder*.spec.ts`, `sdk-query-options-builder.capabilities.spec.ts`, and `sdk-query-options-builder.auto-compact-argv.spec.ts`: cover stable prompt ordering, bundled skill Settings, unverified policy, frozen defaults, and the 200-character cap.
- `libs/backend/agent-sdk/src/lib/helpers/assemble-system-prompt.output-style.spec.ts` and `claude-builtin-catalog.spec.ts`: assert byte-identical static prompt prefix and collision protection.
- `libs/backend/agent-sdk/src/index.ts`: exports the bundled skill ID catalog through the public library API for RPC normalization.
- `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts` and `claude-sdk-lane-runner.spec.ts`: suppress bundled skills on spawned Claude SDK lanes.
- `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts`: preserves bundled IDs in opt-in reads and config writes.

## System prompt order

Static prefix: model identity, Ptah core prompt, optional UI hint, user system prompt, output-style body, enhanced prompt. Query/session-dependent suffix: session-start memory snapshot, corpus, recalled memory, relevant workspace symbols. Dynamic block strings are unchanged and retain their existing relative order.

## SDK semantics

Verified in `D:\projects\PtahCode\node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts`: `Settings` begins at line 7448; `skillListingMaxDescChars` is a `Settings` field at line 7521; `disableBundledSkills` is a `Settings` field at line 7734. The declaration says disabling bundled skills does not affect `.claude/skills/` and `.claude/commands/`. For partial opt-in, `skillOverrides` turns off the remaining bundled names; same-name discovery omits overrides that could hide a workspace, user, or plugin skill.

## Focused checks

- Jest, three changed specs: **3 suites passed, 0 failed; 167 tests passed, 0 failed**. The first run exposed five stale exact-settings expectations after adding the two required Settings keys; those expectations were updated and the rerun passed.
- TypeScript: `node D:\projects\PtahCode\node_modules\typescript\bin\tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` — **passed** (exit 0).
- ESLint on all five changed TypeScript files — **0 errors, 0 failed files; 1 warning** for the existing 1,804-line `sdk-query-options-builder.ts` exceeding the 700-line rule. Nx also warned that uncached project graph boundary checks were skipped.
- `git diff --check` — **passed**.

## Decisions

- `disableBundledSkills` is emitted in flag `Settings` only when no SDK bundled skill is opted in, never on `Options`. A separate cached clone of the shared auto-memory settings carries the disable flag and description cap; the original shared constant is not mutated.
- `skillListingMaxDescChars: 200` is present in both shared and fresh flag settings.
- For partial bundled opt-in, remaining bundled names receive `off` overrides only after same-name discovery confirms that doing so will not hide a loaded user, project, or plugin skill.
- Claude SDK CLI lanes suppress all bundled skills because their spawn input has no bundled-skill opt-in setting; the main chat route remains the route that reads those opt-ins.

## Unknown

- The focused checks verify Ptah's built settings and prompt assembly. They do not launch an external Claude CLI process to observe SDK runtime skill-list behavior.

## Revise round 1

Moved `disableBundledSkills` from the SDK `Options` object into `buildFlagSettings`, added a final optional builder argument, and threaded it through settings serialization. The no-additional-settings path now selects a separate cached settings clone containing both `disableBundledSkills: true` and `skillListingMaxDescChars: 200`; the shared `PTAH_DISABLE_SDK_AUTO_MEMORY` object remains untouched. Removed the custom `Settings` intersections because both keys are declared by the SDK.

Final focused checks: **Jest 3/3 suites and 167/167 tests passed; TypeScript passed; ESLint 0 errors (1 max-lines warning); diff check passed.** The first Jest run had five failures from assertions that expected the pre-change Settings shape; the assertions were updated to include the two new keys and the rerun passed.

## Revise round 2

1. **Defect 1 — stale flag-settings expectations.** Updated expected `skillListingMaxDescChars: 200`, `disableBundledSkills: true` for default opt-ins, and the `buildFlagSettingsArg` source-wiring assertion; renamed the stale prompt-order test description. Files: `sdk-query-options-builder.output-style.spec.ts:36,90,97,111,144,152,296`, `sdk-query-options-builder.capabilities.spec.ts:306`, `sdk-query-options-builder.auto-compact-argv.spec.ts:374`, `sdk-query-options-builder.subagent-ttl.spec.ts:231`, `sdk-query-options-builder.spec.ts:1550`.
2. **Defect 2 — unverified policy leaked bundled overrides.** Gate bundled-name discovery on `policy.status === 'verified'` and use no safe denials otherwise; added a regression spec with `dataviz` opted in that confirms `skillOverrides` stays absent. Files: `sdk-query-options-builder.ts:1717-1725`, `sdk-query-options-builder.capabilities.spec.ts:430`.
3. **Defect 3 — RPC dropped bundled opt-ins.** Export `CLAUDE_BUNDLED_SKILL_IDS` through the agent-sdk public entry point and include it in both the RPC read normalizer and the accepted IDs for config writes. Files: `agent-sdk/src/index.ts:472`, `rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:49,725,761`.
4. **Defect 4 — CLI lanes did not suppress bundled skills.** Pass `disableBundledSkills: true` through the shared flag-settings builder for Claude SDK lanes; Ptah CLI spawns use this lane builder and expose no bundled-skill opt-in input, so all eight SDK bundles remain default-off there. Files: `claude-sdk-lane-options.ts:257-267`, `claude-sdk-lane-runner.spec.ts:182-191`.
5. **Defect 5 — cached settings were mutable.** Freeze both cached default shapes before the builder returns them and assert both defaults are frozen. Files: `sdk-query-options-builder.ts:448-456`, `sdk-query-options-builder.output-style.spec.ts:166-168`.

### Exact specs run

Agent SDK — **24 suites passed, 0 failed; 634 passed, 22 skipped, 656 total**:

- `libs/backend/agent-sdk/src/lib/helpers/assemble-system-prompt.output-style.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/claude-account-route-env.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/claude-md-dedup.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/model-identity-prompt.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.auto-compact-argv.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.betas.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.cli-notice.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.host-data.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ptah-ui-hint.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.subagent-ttl.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.mcp-delivery.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager-dispose.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.idle-signals.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.input-channel-failure.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.overdue-notice.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.slash-persistence.spec.ts`

CLI agent runtime — **3 suites passed, 0 failed; 124 passed, 0 failed**:

- `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-inbound-peer.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-output-style.spec.ts`

TypeScript `tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed. ESLint on all changed TypeScript files: **0 errors**, two existing `max-lines` warnings (the 1,804-line options builder and 1,625-line RPC handler). No RPC-handler spec was run; the requested discovery and execution scope was agent-sdk and cli-agent-runtime.
