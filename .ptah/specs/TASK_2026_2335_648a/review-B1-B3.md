# Review — TASK_2026_2335_648a (Batches B1 & B3)

## Verdicts

- **B1**: **REVISE**
- **B3**: **REVISE**

---

## Batch B1 — `sdk-query-options-builder.ts` & `claude-builtin-catalog.ts`

### Summary
- Static prefix ordering (`assembleSystemPrompt` followed by `appendQueryDependentPromptBlocks`) preserves every block's text and places all four dynamic blocks (`sessionStartBlock`, `corpusPrimeBlock`, `memoryBlock`, `codeSymbolBlock`) after the static prefix across main chat and proxy routes, while `withPhaseDelivery` appends after `finalContent`.
- `PTAH_DISABLE_SDK_AUTO_MEMORY` (`libs/backend/agent-sdk/src/lib/constants.ts:29`) remains frozen and unmutated; `disableBundledSkills: true` (when no bundled skill is opted in) and `skillListingMaxDescChars: 200` ride flag `Settings`, and same-name user/workspace/plugin skills are protected via `withoutCollidingBuiltinSkillDenials`.
- However, B1 breaks 3 existing `agent-sdk` spec suites (17 B1-related test failures), leaks `skillOverrides` on unverified policies when a bundled skill is opted in, and omits `CLAUDE_BUNDLED_SKILL_IDS` from the RPC opt-in normalizer (`agent-rpc.handlers.ts`), which silently strips configured bundled skill IDs on read/save.

### Numbered Defects (B1)

1. **[Blocking] Existing `agent-sdk` flag-settings spec suites fail against the new `Settings` keys and call signature**
   - **Location**:
     - `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts:36,90,97,111,144,152,169,172,212,295`
     - `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts:306,708`
     - `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.subagent-ttl.spec.ts:233,258`
   - **Severity**: Blocking
   - **Impact**: `buildFlagSettings` now always includes `skillListingMaxDescChars: 200` (and returns cached clones instead of `PTAH_DISABLE_SDK_AUTO_MEMORY` by identity), and `SdkQueryOptionsBuilder.build()` passes `enabledBundledSkills.size === 0` plus merged `safeDeniedBundledSkills` to `buildFlagSettingsArg`. All 17 assertions across these 3 suites fail (exact equality against `PTAH_DISABLE_SDK_AUTO_MEMORY` and the source-string wiring check at `sdk-query-options-builder.output-style.spec.ts:295`).
   - **Fix**: Update the stale assertions in all three spec files to expect `skillListingMaxDescChars: 200`, `disableBundledSkills: true` where `build()` runs with default opt-ins, identity against the new no-override settings shape (while keeping `Object.isFrozen(PTAH_DISABLE_SDK_AUTO_MEMORY)` and non-mutation checks), and the updated `buildFlagSettingsArg(...)` wiring signature in `sdk-query-options-builder.output-style.spec.ts:295-297`. Also update the stale test description at `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts:1550` (still says `"before preset content"`).

2. **[Serious] Unverified capability policy still receives `skillOverrides` when a bundled skill is opted in**
   - **Location**: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1717-1733,1859-1865`
   - **Severity**: Serious
   - **Impact**: Under `policy.status !== 'verified'`, `capabilityIsolationOptions` isolates skills with `skills: []`, and `withClaudeBuiltinSkillDenials` (`:636`) intentionally returns `flags` unchanged so `skillOverrides` stays absent on unverified sessions. However, `safeDeniedBundledSkills` is computed and merged into `deniedSkillNames` regardless of `policy.status`. If `agentOrchestration.enabledClaudeBuiltinSkills` enables e.g. `['dataviz']` while capability policy is unverified, `settings.skillOverrides` is populated with the remaining 7 bundled skills instead of staying empty.
   - **Fix**: Gate `bundledSkillDiscovery` and `safeDeniedBundledSkills` on `policy.status === 'verified'` (moving them after `policy` resolution or checking `policy.status === 'verified'` at `:1718` and `:1863`), matching `sessionBuiltinPolicy` at `:1758-1770`.

3. **[Serious] RPC opt-in reader/writer drops `CLAUDE_BUNDLED_SKILL_IDS` from `agentOrchestration.enabledClaudeBuiltinSkills`**
   - **Location**: `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:723-726,757-762,1181-1192`
   - **Severity**: Serious
   - **Impact**: `getClaudeBuiltinOptIns()` (`:723`) and `knownClaudeSkillIds()` (`:757`) only allow `CLAUDE_BUILTIN_TERMINAL_SKILL_IDS` and `anthropic-skills:*` IDs. Any bundled skill ID (e.g. `'dataviz'`) placed in `agentOrchestration.enabledClaudeBuiltinSkills` is hidden from `agent:getClaudeBuiltins` and silently deleted whenever `agent:setConfig` writes `enabledClaudeBuiltinSkills`.
   - **Fix**: Include `CLAUDE_BUNDLED_SKILL_IDS` in `getClaudeBuiltinOptIns()` and `knownClaudeSkillIds()` (or document explicitly if bundled opt-ins are intentionally not RPC-editable yet, though `getClaudeBuiltinOptIns` / `agent:setConfig` must still preserve existing entries rather than silently erasing them).

4. **[Moderate] Ptah CLI / Claude SDK lanes reuse `buildFlagSettingsArg` without bundled-skill suppression**
   - **Location**: `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:257-263`; `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-spawn-options.service.ts:285-321`
   - **Severity**: Moderate
   - **Impact**: Lanes receive valid settings with `skillListingMaxDescChars: 200`, but `disableBundledSkills` defaults to `false` and `PtahCliSpawnOptions` only resolves `CLAUDE_BUILTIN_TERMINAL_SKILL_IDS` + synced skills, so spawned Claude/Ptah-CLI lanes continue loading all 8 SDK bundled skills even when `enabledClaudeBuiltinSkills` is `[]`.
   - **Fix**: Either thread bundled-skill opt-in state (`disableBundledSkills` / `safeDeniedBundledSkills`) through `PtahSpawnAssembly` and `buildClaudeSdkLaneOptions`, or explicitly record in the task/spec that spawned lanes keep bundled skills until a follow-up batch.

5. **[Minor] Cached default settings clones are not frozen**
   - **Location**: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:492-500`
   - **Severity**: Minor
   - **Impact**: Unlike `PTAH_DISABLE_SDK_AUTO_MEMORY` (`constants.ts:29`), `PTAH_DISABLE_SDK_AUTO_MEMORY_WITH_SKILL_CAP` and `PTAH_DISABLE_SDK_AUTO_MEMORY_WITH_BUNDLED_SKILLS_DISABLED` are returned by reference without `Object.freeze(...)`, so any downstream consumer mutating `options.settings` (when passed as an object via `buildFlagSettings`, e.g., `SdkQueryRunner` at `sdk-query-runner.service.ts:748`) would leak across sessions.
   - **Fix**: Wrap both cached objects in `Object.freeze(...)` and declare them before `buildFlagSettings`.

---

## Batch B3 — `buildAgentSpawnTool`, `eager-tool-definitions.budget.spec.ts`, & `agent-lanes` `SKILL.md`

### Summary
- `AgentSpawnArgsSchema` (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.ts:86-138`) is unchanged; every parameter in `buildAgentSpawnTool` keeps a single-line description; `eager-tool-definitions.budget.spec.ts` (`19` tools, `21_459` char budget) passes; and `.claude/skills/agent-lanes/SKILL.md` and `plugins/ptah-core/skills/agent-lanes/SKILL.md` are byte-identical (`37,350` chars).
- However, B3 dropped the required warning on `force`, omitted critical `accountSelection` and `effort` rules from both the tool description and `agent-lanes/SKILL.md`, and left 7 failing tests across 3 spec suites in `libs/backend/vscode-lm-tools` (the B3 lane's Jest run had hung and never completed).

### Numbered Defects (B3)

1. **[Blocking] Three `vscode-lm-tools` spec suites fail against the shortened `buildAgentSpawnTool` descriptions**
   - **Location**:
     - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.spec.ts:367-368,398-400,422-425`
     - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-surface-parity.spec.ts:119`
     - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.spec.ts:407-408,414-422,457`
   - **Severity**: Blocking
   - **Impact**: 7 tests fail because they still assert removed phrases (`"delivered"` and `"Do not paste a role template into task"` on `role`; `"Use only when the limit is known to be wrong"` on `force`; level names + `"Wins over the per-CLI setting"` + `"ignored"` on `effort`; `"HTTP calls wait at most 45 s"` on `buildAgentSpawnTool({ transport: 'http' })`; `'only with cli "claude"'` / `'"kind":"named"'` on `accountSelection`; `'Also applies to system cli "claude"'` on `modelTier`; `'Claude Agent SDK session'` / `'over MCP'` on `cli`; and `'route: { routeId, phaseId }'` on `route`).
   - **Fix**: Restore the required `force` warning (Defect 2 below), then update the remaining stale assertions in `tool-description.builder.spec.ts`, `agent-spawn-surface-parity.spec.ts`, and `agent-spawn-args.schema.spec.ts` to test the new concise contract (e.g. `agent-wait.tool.ts` still carries the 45 s HTTP cap, while `buildAgentSpawnTool` delegates lifecycle detail to `agent-lanes`).

2. **[Serious] `force` parameter description dropped the required warning that it is only for a limit known to be wrong**
   - **Location**: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:930-933`
   - **Severity**: Serious
   - **Impact**: `force.description` is `'Override a reported lane limit; always starts a new lane.'` — missing the explicit requirement (`Use only when the limit is known to be wrong`), which invites callers to bypass real quota limits or cooldowns (`agent-lanes/SKILL.md:139` also omits this warning).
   - **Fix**: Update `force.description` to include the short warning (e.g., `'Override a reported limit only when known to be wrong; always starts a new lane.'`, +14 chars, well within the 4,500-char ceiling and 21,459-char eager budget) and add the same rule to the advanced controls paragraph in both `agent-lanes/SKILL.md` copies.

3. **[Serious] Call-time semantics for `accountSelection` and `effort` were removed from `tool-description.builder.ts` without moving to `agent-lanes/SKILL.md`**
   - **Location**:
     - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:863-872,896-899`
     - `.claude/skills/agent-lanes/SKILL.md:59,137-142`
     - `plugins/ptah-core/skills/agent-lanes/SKILL.md:59,137-142`
   - **Severity**: Serious
   - **Impact**:
     - `accountSelection` (`agent-spawn-args.schema.ts:44-59`) enforces strict rules (`omitted` = stored workspace lane account or existing login; `ambient` = existing login; `named` + `profileId` = fresh `cli: "claude"` lane only; refused with `ptahCliId`, other CLIs, or `named` on resume). None of these rules remain in the tool description or `SKILL.md:137`.
     - `effort` is an unconstrained `string` in the schema (`agent-spawn-args.schema.ts:109`), and neither `tool-description.builder.ts:898` nor `SKILL.md:139` lists the accepted scale (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
     - Additionally, `SKILL.md:59` still says `ptah_agent_spawn rejects any key not listed here` while `## 2. Address` (`:39-53`) omits the advanced parameters described in `:137-140`.
   - **Fix**: Document the `accountSelection` kinds/refusal rules and the `effort` level scale in `## 2. Address` / `Advanced spawn controls` of both identical `agent-lanes/SKILL.md` copies (or add them concisely to the skill table so `:59` stays accurate).

4. **[Moderate] Stdio transport `buildAgentSpawnTool` mixes `agent_wait` with `ptah_agent_read`**
   - **Location**: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:808-810`
   - **Severity**: Moderate
   - **Impact**: `buildAgentSpawnTool({ transport: 'stdio' })` emits `agent_wait; read finished output with ptah_agent_read` (and `ptah_agent_list`), whereas on the stdio wire surface (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/tool-builders.ts:61-75`) tools drop the `ptah_` prefix (`agent_read`, `agent_list`).
   - **Fix**: Use `transport === 'stdio' ? 'agent_read' : 'ptah_agent_read'` at `:810` (and consider `agent_list` / `agent-lanes` consistency).

---

## Five Logic Questions (Combined Scope)

1. **How does this fail silently?**
   - In B1, `agent-rpc.handlers.ts:723,757,1181` silently drops any `CLAUDE_BUNDLED_SKILL_IDS` entry from `agentOrchestration.enabledClaudeBuiltinSkills` on read/write, reverting sessions to `disableBundledSkills: true`. In B3, dropping `"Use only when the limit is known to be wrong"` on `force` lets callers bypass rate-limit/cooldown guards silently.
2. **What user action produces unexpected behaviour?**
   - Enabling a bundled skill (e.g. `dataviz`) while a project's capability policy is `unverified` unexpectedly populates `settings.skillOverrides` (`sdk-query-options-builder.ts:1717-1733,1861-1864`) instead of keeping `skillOverrides` absent; saving settings via `agent:setConfig` erases any hand-added bundled skill opt-in.
3. **What input data makes this produce a wrong answer rather than an error?**
   - Passing `accountSelection: { kind: 'named', profileId }` on a resumed `claude` lane or passing an invented `effort` string: `SKILL.md` no longer explains `accountSelection` constraints or the `effort` scale (`minimal..max`), and unsupported `effort` strings are silently ignored (`agent-spawn-args.schema.ts:107-109`).
4. **What happens when a dependency fails, times out, or returns a shape it should not?**
   - If `discoverClaudeSkillNames` fails (`status: 'unknown'`), `withoutCollidingBuiltinSkillDenials(..., null, CLAUDE_BUNDLED_SKILL_IDS)` (`sdk-query-options-builder.ts:1727-1733`) safely drops bundled skill denials rather than hiding user skills. When Jest hung in the B3 lane, failing assertions in `tool-description.builder.spec.ts`, `agent-spawn-surface-parity.spec.ts`, and `agent-spawn-args.schema.spec.ts` went unobserved.
5. **What is missing that the requirements never mentioned?**
   - Updating the sibling flag-settings spec files (`sdk-query-options-builder.capabilities.spec.ts`, `sdk-query-options-builder.output-style.spec.ts`, `sdk-query-options-builder.subagent-ttl.spec.ts`), `agent-rpc.handlers.ts` opt-in normalization, `vscode-lm-tools` parity/schema/description specs, and `agent-lanes/SKILL.md` coverage for `accountSelection` and `effort`.

---

## Checks run

- **Focused Jest — `agent-sdk` (B1 + sibling flag-settings/prompt specs)**:
  Command: `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts libs/backend/agent-sdk/src/lib/helpers/assemble-system-prompt.output-style.spec.ts libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.subagent-ttl.spec.ts libs/backend/agent-sdk/src/lib/helpers/claude-md-dedup.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ptah-ui-hint.spec.ts libs/backend/agent-sdk/src/lib/helpers/model-identity-prompt.spec.ts`
  - **Result**: **6 suites passed, 3 failed** (9 total); **278 passed, 18 failed, 22 skipped** (318 total).
  - Passing: `sdk-query-options-builder.spec.ts`, `assemble-system-prompt.output-style.spec.ts`, `claude-builtin-catalog.spec.ts`, `claude-md-dedup.spec.ts`, `sdk-query-options-builder.ptah-ui-hint.spec.ts`, `model-identity-prompt.spec.ts`.
  - Failing: `sdk-query-options-builder.capabilities.spec.ts` (3 failures: `:306`, `:708` from B1; `:793` pre-existing Windows `claude-md-dedup.ts:211` behavior), `sdk-query-options-builder.output-style.spec.ts` (13 failures from B1), `sdk-query-options-builder.subagent-ttl.spec.ts` (2 failures from B1).

- **Focused Jest — `vscode-lm-tools` (B3 + parity/schema specs)**:
  Command: `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/eager-tool-definitions.budget.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/vendor-roster-drift.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-surface-parity.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.spec.ts`
  - **Result**: **2 suites passed, 3 failed** (5 total); **270 passed, 7 failed** (277 total).
  - Passing: `eager-tool-definitions.budget.spec.ts`, `vendor-roster-drift.spec.ts`.
  - Failing: `tool-description.builder.spec.ts` (3 failures: `:367`, `:398`, `:422`), `agent-spawn-surface-parity.spec.ts` (1 failure: `:119`), `agent-spawn-args.schema.spec.ts` (3 failures: `:407`, `:414`, `:457`).

- **Focused Jest — `cli-agent-runtime` (lane/spawn consumers of `buildFlagSettingsArg`)**:
  Command: `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.spec.ts libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-output-style.spec.ts libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-inbound-peer.spec.ts libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-spawn-options.builtins.spec.ts`
  - **Result**: **4 suites passed, 0 failed**; **151 passed, 0 failed**.

- **Skill parity check**:
  - Node exact comparison of `.claude/skills/agent-lanes/SKILL.md` and `plugins/ptah-core/skills/agent-lanes/SKILL.md`: **identical (`true`), length 37,350 chars**.

- **Typecheck (`tsc --noEmit`)**:
  - `node D:\projects\PtahCode\node_modules\typescript\bin\tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **passed** (exit `0`).
  - `node D:\projects\PtahCode\node_modules\typescript\bin\tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: **passed** (exit `0`).
  - `ptah_get_diagnostics` on `sdk-query-options-builder.ts`, `claude-builtin-catalog.ts`, `tool-description.builder.ts`: **unavailable** (timed out at 45 s on both calls).
