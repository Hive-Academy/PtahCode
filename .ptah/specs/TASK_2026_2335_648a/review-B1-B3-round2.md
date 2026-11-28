# Re-Review (Round 2) — TASK_2026_2335_648a (Batches B1 & B3)

## Verdicts

- **B1**: **REVISE**
- **B3**: **APPROVED**

---

## Defect Disposition (Original 9 Defects)

| Defect | Fixed? | Evidence (`file:line`) |
| --- | --- | --- |
| **B1 #1** (Blocking) — Stale flag-settings expectations in `agent-sdk` specs | **Yes** (in `agent-sdk`; see new B1 defect #1 below for `cli-agent-runtime`) | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts:167-168,304`, `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts:307-313`, `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.subagent-ttl.spec.ts:231-234,258-262`, `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.auto-compact-argv.spec.ts:374-380`, `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts:1550` — all 24 `agent-sdk` suites pass. |
| **B1 #2** (Serious) — Unverified policy leaked `skillOverrides` on bundled opt-in | **Yes** | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1717-1733` gates `bundledSkillDiscovery` and `safeDeniedBundledSkills` on `policy.status === 'verified'`; regression test at `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts:430` passes. |
| **B1 #3** (Serious) — RPC opt-in reader/writer dropped `CLAUDE_BUNDLED_SKILL_IDS` | **Yes** | `libs/backend/agent-sdk/src/index.ts:472` exports `CLAUDE_BUNDLED_SKILL_IDS`; `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:49,724-728,759-765` includes it in `getClaudeBuiltinOptIns()` and `knownClaudeSkillIds()` (`agent:getConfig`, `agent:setConfig`, `agent:getClaudeBuiltins`, `agent:setClaudeBuiltin`). See new B1 defect #2 for missing RPC spec coverage. |
| **B1 #4** (Moderate) — Ptah CLI / Claude SDK lanes lacked bundled-skill suppression | **Partial** (production code fixed; broke sibling argv spec) | `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:257-266` passes `true` for `disableBundledSkills` on the shared Claude/Ptah-CLI lane builder (`claude-cli.adapter.ts:265`, `ptah-cli-registry.ts:1001`) and `claude-sdk-lane-runner.spec.ts:182-191` passes, but `ptah-cli-registry-auto-compact-argv.spec.ts` fails 5/10 tests against the emitted `Settings` keys (new B1 defect #1). |
| **B1 #5** (Minor) — Cached default settings clones not frozen | **Yes** | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:448-456` wraps both `PTAH_DISABLE_SDK_AUTO_MEMORY_WITH_SKILL_CAP` and `PTAH_DISABLE_SDK_AUTO_MEMORY_WITH_BUNDLED_SKILLS_DISABLED` in `Object.freeze(...)`; asserted at `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts:167-168`. |
| **B3 #1** (Blocking) — Three `vscode-lm-tools` spec suites failed | **Yes** | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.spec.ts:366-367,397-399,418-424`, `agent-spawn-surface-parity.spec.ts:108-124`, `agent-spawn-args.schema.spec.ts:405-420,454-460` — all 5 `vscode-lm-tools` suites pass (`277/277`). |
| **B3 #2** (Serious) — `force` dropped warning that it is only for a limit known to be wrong | **Yes** | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:930-933` (`'Override a reported limit only when known to be wrong; always starts a new lane.'`) and both identical `agent-lanes/SKILL.md` files at `:141`. |
| **B3 #3** (Serious) — `accountSelection` & `effort` semantics missing from tool & `agent-lanes/SKILL.md` | **Yes** | `tool-description.builder.ts:865,898` keeps concise call-time rules; `.claude/skills/agent-lanes/SKILL.md:54-55,60-61,139-144` and `plugins/ptah-core/skills/agent-lanes/SKILL.md:54-55,60-61,139-144` are byte-identical (`37,896` bytes) and document full `accountSelection` refusal rules, `effort` levels (`minimal..max`), and `force`/45 s HTTP wait/recovery controls. |
| **B3 #4** (Moderate) — Stdio `buildAgentSpawnTool` mixed `agent_wait` with `ptah_agent_read` | **Yes** | `tool-description.builder.ts:808-810` switches `agent_list` / `agent_wait` / `agent_read` vs `ptah_agent_*` by `transport`, while preserving `stdio.inputSchema === http.inputSchema` (`agent-spawn-surface-parity.spec.ts:114,119-123`). |

---

## New Defects (B1)

1. **[Blocking] `ptah-cli-registry-auto-compact-argv.spec.ts` fails 5 of 10 tests after `buildClaudeSdkLaneOptions` enabled `disableBundledSkills: true`**
   - **Location**: `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-auto-compact-argv.spec.ts:471,481,502,515`
   - **Severity**: Blocking
   - **Impact**: `buildClaudeSdkLaneOptions` (`libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:257-266`) now passes `disableBundledSkills: true` to `buildFlagSettingsArg(...)`, so `PtahCliRegistry.spawnAgent` emits `disableBundledSkills: true` and `skillListingMaxDescChars: 200` in the `--settings` JSON on the real SDK argv. Five assertions across four `.toEqual(...)` tests (`enabled-unset`, `disabled`, `invalid-low`, `invalid-high`, `style-and-window`) fail because they still assert the pre-change 3–5 key object without `disableBundledSkills: true` and `skillListingMaxDescChars: 200`. (Note: `batch-B1-report.md:82-86` did not include `ptah-cli-registry-auto-compact-argv.spec.ts` in its focused run.)
   - **Fix**: Update the expected `--settings` objects at `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-auto-compact-argv.spec.ts:471-521` to include `disableBundledSkills: true` and `skillListingMaxDescChars: 200`, and re-run `ptah-cli-registry-auto-compact-argv.spec.ts` to confirm 10/10 pass.

2. **[Minor] No unit test covers `CLAUDE_BUNDLED_SKILL_IDS` preservation in `agent-rpc.handlers.spec.ts`**
   - **Location**: `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.spec.ts:1031-1109` (and `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:724-728,759-765`)
   - **Severity**: Minor
   - **Impact**: `agent-rpc.handlers.spec.ts` passes all 87 existing tests, but none exercise a `CLAUDE_BUNDLED_SKILL_IDS` value (e.g. `'dataviz'`) through `agent:getConfig`, `agent:setConfig`, `agent:getClaudeBuiltins`, or `agent:setClaudeBuiltin`, leaving the round-2 RPC opt-in fix unpinned against future regression.
   - **Fix**: Add tests in `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.spec.ts` verifying that a bundled skill ID such as `'dataviz'` is preserved across `agent:getConfig`, `agent:setConfig`, and `agent:getClaudeBuiltins`.

---

## New Defects (B3)

None.

---

## Checks run

- **B1 Focused Jest — `agent-sdk` (all 24 suites listed in `batch-B1-report.md`)**:
  - Command: `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath ...` (24 spec files)
  - **Result**: **24 passed, 0 failed** (`634 passed, 22 skipped, 656 total`).
- **B1 Focused Jest — `cli-agent-runtime` (5 lane/spawn suites)**:
  - Command: `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.spec.ts libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.spec.ts libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-inbound-peer.spec.ts libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-output-style.spec.ts libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-spawn-options.builtins.spec.ts`
  - **Result**: **5 passed, 0 failed** (`181 passed, 0 failed`).
- **B1 Focused Jest — `cli-agent-runtime` (`ptah-cli-registry-auto-compact-argv.spec.ts`)**:
  - Command: `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-auto-compact-argv.spec.ts`
  - **Result**: **1 failed** (`5 passed, 5 failed, 10 total`) — failures at `:471`, `:481`, `:502` (2 cases), and `:515` for missing `disableBundledSkills: true` and `skillListingMaxDescChars: 200`.
- **B1 Focused Jest — `rpc-handlers` (`agent-rpc.handlers.spec.ts`)**:
  - Command: `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.spec.ts`
  - **Result**: **1 passed, 0 failed** (`87 passed, 0 failed`).
- **B3 Focused Jest — `vscode-lm-tools` (all 5 suites listed in `batch-B3-report.md`)**:
  - Command: `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-surface-parity.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/eager-tool-definitions.budget.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/vendor-roster-drift.spec.ts`
  - **Result**: **5 passed, 0 failed** (`277 passed, 0 failed`).
- **TypeScript (`tsc --noEmit`)**:
  - `node D:\projects\PtahCode\node_modules\typescript\bin\tsc --noEmit --project` sequentially on `libs/backend/agent-sdk/tsconfig.lib.json`, `libs/backend/cli-agent-runtime/tsconfig.lib.json`, `libs/backend/rpc-handlers/tsconfig.lib.json`, `libs/backend/vscode-lm-tools/tsconfig.lib.json`: **passed** (exit `0`).
- **ESLint**:
  - `node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js` on `libs/backend/agent-sdk/src/index.ts`, `claude-builtin-catalog.ts`, `sdk-query-options-builder.ts`, `claude-sdk-lane-options.ts`, `agent-rpc.handlers.ts`, `tool-description.builder.ts`: **passed** (`0` errors; `3` pre-existing `max-lines` warnings on `sdk-query-options-builder.ts`, `agent-rpc.handlers.ts`, and `tool-description.builder.ts`).
- **Skill parity check**:
  - Node exact Buffer equality between `.claude/skills/agent-lanes/SKILL.md` and `plugins/ptah-core/skills/agent-lanes/SKILL.md`: **identical (`true`), 37,896 bytes each**.
