# Batch B5a Code-Logic Re-Review (Round 2)

| Field | Value |
| --- | --- |
| Scope | Batch B5a revision round 1 (`revise-B5a.md`, verifying fixes for Defects 1–7 from `review-B5a.md` + previously blocked Jest suites) |
| Reviewer Role | `code-logic-reviewer` (read-only) |
| Findings | 2 Blocking (11 failing Jest tests in `agent-sdk`), 1 Serious (output style dropped on ambient full-prompt slash relaunch), 1 Moderate (post-restart child session misclassified as `mainChat`) |
| Verdict | **REVISE** |

---

## 1. Defect-by-Defect Audit (Defects 1–7 from `review-B5a.md`)

| # | Original Defect | Status | Evidence (`file:line`) |
| --- | --- | --- | --- |
| 1 | `OutputStyleSessionActivationService.resolveSessionFields` skipped normalization for `options.selectedStyleName` | **FIXED** | `libs/backend/output-styles/src/lib/output-style-session-activation.service.ts:162-166` normalizes explicit `options.selectedStyleName` via `normalizeOutputStyleSelection()` (`output-style-selection.ts:79-86`) and returns `NO_OUTPUT_STYLE` before discovery on `''`, whitespace, or `'default'`. Covered and passing in `output-style-session-activation.service.spec.ts:97-150` (41/41 tests pass). |
| 2 | Silent output-style drop and bypassed `assertSingleOutputStylePath` on the `fullPrompt` route | **FIXED + NEW DEFECT (R2-1)** | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1448` now runs `assertSingleOutputStylePath(sessionConfig)` unconditionally before the `fullPrompt` branch. Lines `1449-1480` keep `flagStyleConfig = sessionConfig` on ambient runs when `outputStyleActivation` is absent or returns no body, suppress `flagStyleConfig = undefined` when `fullPromptStyleBody` is resolved (`:1478-1480`) or `style?.outputStyleUnavailable` is true (`:1475`), and warn + clear both style paths on named runs with missing/mismatched `accountResources` (`:1456-1465`). Lazy DI wiring verified (`libs/backend/agent-sdk/src/lib/di/register.ts:989-990` uses `{ useClass: SdkQueryOptionsBuilder }`, resolved after `registerOutputStyleServices`). **New Defect R2-1**: updating `:1942-1943` from `fullPrompt ? undefined : sessionConfig` to `flagStyleConfig` broke the wiring-guard test at `sdk-query-options-builder.output-style.spec.ts:304` (FAIL). |
| 3 | Resumed / continued / slash-relaunched main-chat sessions lost `preset: 'enhanced'` without SDK `snapshot` or after compaction | **PARTIALLY FIXED + NEW DEFECTS (R2-3, R2-4)** | `chat-session.service.ts:3510-3522` (`autoResumeIfInactive`) and `chat-slash-command-router.service.ts:420-436` (`routeFollowUpSlashCommand`) now set `preset: 'enhanced'` for main-chat Claude SDK runs when enabled guidance is non-blank (matching `context.md:55-58` where the user can toggle System prompt mode back and forth). However, two real defects remain: **(a) New Defect R2-3**: `chat-slash-command-router.service.ts:427-449` sets `preset: 'enhanced'` without resolving `outputStyle`, so ambient full-prompt slash relaunches (e.g. `/compact`) silently drop the user's output style; **(b) Defect R2-4**: `knownSessionChild` only checks the in-memory `SessionChildRegistry` (`chat-session.service.ts:3510`, `chat-slash-command-router.service.ts:420`), ignoring persisted `metadata?.isChildSession === true`, so non-phased child sessions resumed after an app restart are misclassified as `mainChat`. |
| 4 | Legacy opt-out migration checked `state.generatedPrompt` without `.trim()` | **FIXED** | `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts:744-746` now checks `state.generatedPrompt?.trim() && !state.enabled ? false : undefined`, matching `getStatus` (`:463`) and `getEnhancedPromptContent` (`:916`). Covered and passing in `enhanced-prompts.service.spec.ts:1742` (76/76 tests pass). |
| 5 | `buildPromptEnvironment` lacked `AbortSignal`, emitted blank `Shell: ` on `SHELL=""`, and did not guard synchronous `execFile` throws | **FIXED (code) + NEW DEFECT (R2-2 in spec)** | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1117-1146, 2515-2519` forwards `abortController.signal` to `execFile`, wraps `execFile` in `try { ... } catch { resolve('unknown'); }`, and normalizes shell with `process.env['SHELL']?.trim() || process.env['ComSpec']?.trim() || 'unknown'`. **New Defect R2-2**: all 5 new `handles git probe failure` cases in `sdk-query-options-builder.spec.ts:1614-1644` currently FAIL before verifying the environment block because `fullPromptInput()` omits `tabId`. |
| 6 | Undocumented preset rule drops (`/<skill-name>` -> `Skill`, default pronouns, privacy compression) | **FIXED** | `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-full-prompt.ts:17, 25-26` restores the private-details rule, `For /<skill-name>, invoke it via Skill.`, and `Use they/them for people unless their pronouns are known.`. Assembled static prompt is 10,210 / 16,000 chars; `ptah-full-prompt.spec.ts` passes 2/2 tests including live ESM SDK `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` parity and byte-stability checks. |
| 7 | Missing focused unit tests for critical B5a branches and error paths | **NOT FIXED (11 tests failing in `agent-sdk`)** | Newly added tests in `output-styles` (`output-style-session-activation.service.spec.ts:97-150`), `agent-generation` (`enhanced-prompts.service.spec.ts:333-340, 1738-1824`), `rpc-handlers` (`chat-session.ptah-ui-flag.spec.ts:196-242`, `chat-session-agent-child.spec.ts:903, 1016`, `chat-slash-command-router.accounts.spec.ts:209-223`), and `agent-sdk` (`ptah-full-prompt.spec.ts:7-29`, `session-query-executor.accounts.spec.ts:1092-1117`, `sdk-query-options-builder.spec.ts:1566-1574, 3154-3175`) all pass. However, 10 new tests in `sdk-query-options-builder.spec.ts:1556-1644` and 1 existing wiring test in `sdk-query-options-builder.output-style.spec.ts:304` **FAIL** (Defects R2-1 and R2-2). |

---

## 2. Active Defects to Fix (Round 2)

### Defect R2-1 — Broken source-wiring guard in `sdk-query-options-builder.output-style.spec.ts`
- **Severity**: **Blocking** (failing Jest suite)
- **Location**: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts:303-305` vs `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1942-1943`
- **Evidence**:
  `sdk-query-options-builder.ts:1942-1943` was changed from `buildFlagSettingsArg(fullPrompt ? undefined : sessionConfig, ...)` to `buildFlagSettingsArg(flagStyleConfig, ...)`, but `sdk-query-options-builder.output-style.spec.ts:304` still asserts the old literal substring:
  ```
  FAIL agent-sdk libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts
    ● build() wiring › passes options.settings through buildFlagSettingsArg
      Expected substring: "settings: buildFlagSettingsArg( fullPrompt ? undefined : sessionConfig, ..."
  ```
- **Concrete Fix**:
  Update the expected substring in `sdk-query-options-builder.output-style.spec.ts:304` to match `flagStyleConfig` and re-run the suite.

### Defect R2-2 — 10 new `sdk-query-options-builder.spec.ts` tests fail because `fullPromptInput()` omits `tabId`
- **Severity**: **Blocking** (10 failing Jest tests)
- **Location**: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts:1540-1549, 1556-1644` (`sdk-query-options-builder.ts:2627-2628`)
- **Evidence**:
  `fullPromptInput()` omits `sessionConfig.tabId` (and `sessionId`). Every test using `fullPromptInput()` that reaches `buildMcpServers()` fails with:
  ```
  SdkError: Cannot build the Ptah MCP server URL without a session routing id.
    at SdkQueryOptionsBuilder.buildMcpServers (src/lib/helpers/sdk-query-options-builder.ts:2628:13)
    at SdkQueryOptionsBuilder.build (src/lib/helpers/sdk-query-options-builder.ts:1879:14)
  ```
  Failing tests (10 total):
  1. `:1556` `keeps the style flag when full-prompt activation is not installed`
  2. `:1576` `retains a pre-resolved global style on the localhost preset route`
  3. `:1593` `includes a pre-resolved workspace style exactly once`
  4. `:1603` `preserves the preset route when phase delivery is requested (0)` (`phase`)
  5. `:1603` `preserves the preset route when phase delivery is requested (1)` (`skills`)
  6–10. `:1614` `handles git probe failure` (`ENOENT`, `ABORT_ERR`, `128`, `null`, `throw`)
- **Concrete Fix**:
  Add `tabId: 'tab-fixture'` to `fullPromptInput().sessionConfig` (matching lines `1658` and `1694` in the same `describe` block) and run `sdk-query-options-builder.spec.ts` to verify all 10 tests pass against the real implementation.

### Defect R2-3 — Ambient full-prompt slash relaunch (`/compact`, `/review`, etc.) silently drops the user's output style
- **Severity**: **Serious**
- **Location**: `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:423-449`; `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1451-1477`
- **Scenario & Impact**:
  1. On `chat:start` (`chat-session.service.ts:1764-1767`) and `chat:continue` (`chat-session.service.ts:3460-3463`), `ChatSessionService` resolves the session's output style via `outputStyleActivation.resolveSessionFields({ workspaceRoot })` and spreads it into `sessionConfig`.
  2. On a follow-up slash relaunch (`chat-slash-command-router.service.ts:423-449`), `ChatSlashCommandRouterService` now sets `preset: 'enhanced'` (`:434-436`), but does **not** resolve output styles — `sessionConfig` has neither `outputStyleName` nor `outputStyleBody`.
  3. In `SdkQueryOptionsBuilder.build()` (`sdk-query-options-builder.ts:1451-1454`):
     ```ts
     if (
       fullPrompt &&
       (named || (!fullPromptStyleBody && sessionConfig.outputStyleName))
     )
     ```
     For an ambient run (`!named`), `sessionConfig.outputStyleName` is `undefined`, so `outputStyleActivation.resolveSessionFields()` is **skipped**. Because `systemPrompt` is a custom `string[]` (not `{ type: 'preset', preset: 'claude_code' }`), the SDK does not inject preset output styles from settings either.
  4. Result: running `/compact` (which also clears any SDK prompt snapshot) or `/review` in an ambient full-prompt main chat silently drops the user's output style (0 applications) for the rest of the session.
- **Concrete Fix**:
  Inject `OUTPUT_STYLE_TOKENS.SESSION_ACTIVATION` (optional or required, matching `ChatSessionService`) into `ChatSlashCommandRouterService`, resolve `await this.outputStyleActivation?.resolveSessionFields({ workspaceRoot: workspacePath })`, and spread it into `sessionConfig` at `chat-slash-command-router.service.ts:427-449` (with a unit test verifying the style field reaches `executeSlashCommand`).

### Defect R2-4 — Post-restart non-phased child sessions are misclassified as `mainChat` on resume / slash relaunch
- **Severity**: **Moderate**
- **Location**: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:3464-3470, 3510-3512`; `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:327-333, 420-422` (compare `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:2126`)
- **Scenario & Impact**:
  `SessionChildRegistry` is in-memory only and starts empty after an app restart. Both `autoResumeIfInactive` (`chat-session.service.ts:3510`) and `routeFollowUpSlashCommand` (`chat-slash-command-router.service.ts:420`) check only `!!this.sessionChildren?.get(sessionId as string)`. For a persisted child session (`metadata?.isChildSession === true`, already persisted and checked at `sdk-agent-adapter.ts:2126`) without a `phase`, resuming or slash-relaunching after a restart evaluates `knownSessionChild === false` -> `mainChat === true` and applies `preset: 'enhanced'`, breaking route isolation for child sessions.
- **Concrete Fix**:
  Read `sessionMetadata` (already available via `this.sessionMetadataStore.get(sessionId)` / `this.metadata?.get(sessionId)`) and compute `const knownSessionChild = !!this.sessionChildren?.get(sessionId as string) || metadata?.isChildSession === true;` before gating `mainChat`. Add a focused test covering a persisted `isChildSession: true` session with an empty `SessionChildRegistry`.

---

## 3. Checks Run (Real Results)

Note: `npx jest` hung with empty output in this Windows shell environment; ran the workspace Jest binary directly via `node .\node_modules\jest\bin\jest.js` with the exact required flags (`--config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`).

| Check | Command | Result |
| --- | --- | --- |
| Focused Jest (`output-styles`) | `node .\node_modules\jest\bin\jest.js --config libs/backend/output-styles/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/output-styles/src/lib/output-style-session-activation.service.spec.ts libs/backend/output-styles/src/lib/output-style-account-context.spec.ts` | **PASS** — 2/2 suites, 41/41 tests passed (26.70 s, exit 0). |
| Focused Jest (`agent-generation`) | `node .\node_modules\jest\bin\jest.js --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts` | **PASS** — 1/1 suite, 76/76 tests passed (49.60 s, exit 0). |
| Focused Jest (`agent-sdk`) | `node .\node_modules\jest\bin\jest.js --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/prompt-harness/ptah-full-prompt.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.output-style.spec.ts libs/backend/agent-sdk/src/lib/helpers/assemble-system-prompt.output-style.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.accounts.spec.ts` | **FAIL** — 3/5 suites passed (`ptah-full-prompt.spec.ts`, `assemble-system-prompt.output-style.spec.ts`, `session-query-executor.accounts.spec.ts`), **2/5 failed** (`sdk-query-options-builder.output-style.spec.ts`: 1 fail; `sdk-query-options-builder.spec.ts`: 10 fails); 298 passed, 11 failed, 309 total (29.63 s, exit 1). |
| Focused Jest (`rpc-handlers`) | `node .\node_modules\jest\bin\jest.js --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-session.ptah-ui-flag.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-session-agent-child.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.accounts.spec.ts libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.spec.ts` | **PASS** — 4/4 suites, 166/166 tests passed (106.07 s, exit 0). |
| Focused Jest (`cli-agent-runtime`) | `node .\node_modules\jest\bin\jest.js --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.spec.ts` | **PASS** — 1/1 suite, 115/115 tests passed (31.42 s, exit 0). |
| TypeScript (`output-styles`, `agent-generation`, `agent-sdk`, `rpc-handlers`) | `node .\node_modules\typescript\bin\tsc --noEmit --project <project>/tsconfig.lib.json` (all 4 projects) | **PASS** — 4/4 projects exited 0 with 0 errors. |
| ESLint (14 changed B5a files) | `node .\node_modules\eslint\bin\eslint.js <14 B5a source/spec files>` | **PASS** — exit 0, 0 errors, 16 pre-existing/non-blocking warnings. |

> Tooling note: used `ptah_search_files`, `read_file`, and `git grep`/`git diff --stat` for read-only inspection; used `node .\node_modules\jest\bin\jest.js` after `npx jest` hung with no output on Windows.

---

## 4. Verdict

**REVISE**

Fix the 2 Blocking test failures in `agent-sdk` (**R2-1**, **R2-2**), resolve the ambient full-prompt output-style drop on slash relaunch (**R2-3**), and gate `knownSessionChild` on persisted `metadata?.isChildSession === true` (**R2-4**), then re-run the focused `agent-sdk` and `rpc-handlers` Jest suites to green.
