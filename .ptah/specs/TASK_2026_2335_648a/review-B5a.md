# Batch B5a Code-Logic Review

| Field | Value |
| --- | --- |
| Scope | Batch B5a backend (`batch-B5a-report.md` — `agent-sdk`, `agent-generation`, `output-styles`, `rpc-handlers`) |
| Reviewer Role | `code-logic-reviewer` (read-only) |
| Score | **6 / 10** — Real gaps: core static prompt assembly, route gating on `chat:start`, and per-workspace write serialization are solid, but 3 Serious defects (unnormalized `selectedStyleName` injecting a bogus `'default'` style or false named-account unavailability, silent output-style drop + bypassed dual-path assertion in `SdkQueryOptionsBuilder.build`, and mid-conversation fallback to preset on resumed sessions without SDK snapshot) plus 4 Moderate defects prevent a 7/10; the architecture and core invariants are sound so it is above 5/10. |
| Findings | 0 Blocking, 3 Serious, 4 Moderate, 0 Minor |
| Verdict | **REVISE** |

---

## 1. Preset-Rule Audit Table

Audited every rule in the Claude Code preset reference dumps (`.ptah/tmp/prompt-dump/system-0.md`, `.ptah/tmp/prompt-dump/system-1.md`, and `.ptah/tmp/prompt-dump/system-2.md` lines 1–34, chars 0–6,423) against `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-full-prompt.ts` and its embedded `PTAH_CORE_SYSTEM_PROMPT` (`ptah-core-prompt.ts`).

| Preset Source | Rule | Present? | Location (`file:line`) | Notes |
| --- | --- | --- | --- | --- |
| `system-0.md:1`, `system-1.md:2` | Identity & autonomous judgment (Claude via Claude Agent SDK, work with user toward goals) | Yes (adapted) | `ptah-full-prompt.ts:9`, `ptah-core-prompt.ts:70` | Adapted from terminal CLI to Ptah webview + Claude Agent SDK. |
| `system-1.md:4` | Security policy (authorized testing/defensive/CTF/education; refuse destructive attacks, DoS, mass targeting, supply-chain compromise, malicious evasion; dual-use requires clear authorized context) | Yes | `ptah-full-prompt.ts:13` | Preserves all refusal categories and dual-use authorization boundary. |
| `system-1.md:7` | Markdown output (adapted from terminal to Ptah rich-markdown webview) | Yes (adapted) | `ptah-core-prompt.ts:70, 115` | Correctly drops terminal wording and keeps GFM + webview callouts. |
| `system-1.md:8` | Permission denials (user declined; adjust approach, do not retry verbatim / route around) | Yes | `ptah-full-prompt.ts:19`, `ptah-core-prompt.ts:100` | Covered in both header and Ptah core. |
| `system-1.md:9` | Mid-conversation system reminders & hook output as user feedback | Yes | `ptah-full-prompt.ts:19` | `"Honor system reminders and treat hook output as user feedback."` |
| `system-1.md:10` | Untrusted content / `<pasted_content>` / prompt-injection caution | Yes (compressed) | `ptah-full-prompt.ts:21` | Covers tool results, files, web pages, and pasted documents as data; drops `<pasted_content>` random-ID mechanics (acceptable compression). |
| `system-1.md:11` | Dedicated file/search tools over shell; parallel independent tool calls | Yes | `ptah-full-prompt.ts:19`, `ptah-core-prompt.ts:29-31` | Reinforced by Ptah MCP substitution table. |
| `system-1.md:12` | Clickable source location references (`file:line`) | Yes | `ptah-full-prompt.ts:23` | `"Reference source locations as file:line."` |
| `system-2.md:1` | Gender-neutral default pronouns (`they/them` when unstated; never infer from name) | **No (undocumented drop)** | — | Omitted from `ptah-full-prompt.ts` and not listed in `batch-B5a-report.md` drop table (see Defect 6). |
| `system-2.md:3` | Confirm before hard-to-reverse / externally visible actions; inspect before delete/overwrite | Yes (compressed) | `ptah-full-prompt.ts:15` | Core rule present; drops the explicit note that sending content externally publishes it and may be cached/indexed even if deleted (see Defect 6). |
| `system-2.md:3` | Honest outcome reporting (failures, skipped checks, verified outcomes) | Yes | `ptah-full-prompt.ts:15` | `"Report failures, skipped checks, and verified outcomes accurately."` |
| `system-2.md:5` | Privacy (treat user/project info as private; no personal/identifying details to external services without explicit authorization) | Yes (compressed) | `ptah-full-prompt.ts:15` | Core rule present; omits header/URL/payload and `User-Agent` contact-detail guidance (see Defect 6). |
| `system-2.md:8` | Slash-skill invocation (`/<skill-name>` -> invoke via `Skill`; only use skills listed in user-invocable skills, do not guess) | **No (undocumented drop)** | — | Omitted from `ptah-full-prompt.ts` and not listed in `batch-B5a-report.md` drop table; relevant in Ptah chat where unrecognized `/<skill>` passes through to Claude (see Defect 6). |
| `system-2.md:9` | `/ultrareview` / `/code-review ultra` product command | Intentionally dropped | — | Claude Code product-specific command; documented in `batch-B5a-report.md:39`. |
| `system-2.md:11-14` | Fixed Claude 5 model catalog, Claude Code surface list, `/fast` mode | Intentionally dropped | — | Product-specific / stale runtime facts; documented in `batch-B5a-report.md:39`. |
| `system-2.md:16-33` | Context-management narration, autonomy/task-completion guidance, `<total_tokens>`, WebSearch `mode` | Intentionally dropped | — | Replaced by Ptah's orchestration/AskUserQuestion/token-economy rules (`ptah-core-prompt.ts:42-108`); documented in `batch-B5a-report.md:40`. |
| Git safety (Ptah + preset parity) | Never force push or bypass hooks; commit only when asked/authorized; review before commit; keep unrelated changes intact | Yes | `ptah-full-prompt.ts:27`, `ptah-core-prompt.ts:111` | Present and consistent with workspace-authority rule. |
| Read before edit | Read relevant files before editing | Yes | `ptah-full-prompt.ts:19`, `ptah-core-prompt.ts:101` | Present in both places. |
| SDK Environment block | Runtime cwd, platform, OS, shell, git repo, local date, model | Replaced after dynamic boundary | `sdk-query-options-builder.ts:1116-1137, 2479-2492` | Placed strictly after `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`. |

---

## 2. Review Checklist (Items 1–7)

| # | Check | Status | Evidence & Notes |
| --- | --- | --- | --- |
| 1 | Static full prompt safety-relevant preset rules | **PARTIAL** | All 7 core safety categories (security policy, destructive/external confirmation, privacy, honest reporting, prompt-injection caution, git safety, system reminders/hooks) are present in `ptah-full-prompt.ts:13-27` and `ptah-core-prompt.ts:100-111`. Static length is 10,142 chars (<= 16,000; verified by `ptah-full-prompt.spec.ts`). Two preset rules (`/<skill-name>` -> `Skill` and gender-neutral default pronouns) were silently dropped without documentation (Defect 6). |
| 2 | Static part byte-stability across sessions | **PASS** | Before `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` (`sdk-query-options-builder.ts:2483-2492`), only `buildPtahFullPrompt()` (pure template + `PTAH_CORE_SYSTEM_PROMPT` + `renderCoreSubstitutionBlock()` from `as const` `TOOL_SUBSTITUTIONS`), optional `PTAH_UI_HINT`, `sessionConfig?.systemPrompt`, `fullPrompt.outputStyleBody`, and `enhancedPromptsContent` appear. Zero date, cwd, model, shell, git, or per-turn values precede the boundary. `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` (`ptah-full-prompt.ts:5-6`) verified identical at runtime to `sdk.mjs` (`"__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__"`). |
| 3 | Route isolation & fallback when enhanced content is absent | **PARTIAL** | **New sessions (`chat:start`)**: PASS — `chat-session.service.ts:1242-1244, 1847-1853` sets `preset: 'enhanced'` only for main-chat Claude SDK sessions (`!surfaceMode`, `mcpToolProfile !== 'apps'`, non-blank `enhancedPromptsContent`). Non-main callers verified untouched: Ptah CLI (`chat-session.service.ts:1170-1187`, `claude-sdk-lane-options.ts:237-244`), agent-child (`chat-session.service.ts:1532-1550`), handoff (`chat-session.service.ts:1644-1658`), gateway (`gateway-chat-bridge.ts:843-884`), and third-party/localhost endpoints (`sdk-query-options-builder.ts:1433-1438` requires `isFirstPartyAnthropicBaseUrl`, `!phase`, `!skills?.length`, and `!!enhancedPromptsContent?.trim()`). **Resumed/continued main-chat sessions**: FAIL — `autoResumeIfInactive` (`chat-session.service.ts:3510-3533`) omits `preset: 'enhanced'`, silently reverting to preset+append whenever SDK `snapshot` is unrolled or cleared by compaction (Defect 3). |
| 4 | Output style applied exactly once in every mode (incl. named-account & localhost-proxy) | **FAIL** | Localhost-proxy route stays on preset+append (`isFirstPartyAnthropicBaseUrl` is `false`); multi-workspace localhost-global + Anthropic-workspace preserves pre-resolved `outputStyleBody` and suppresses the flag (`:1439, :1912`); named account overwrites ambient `outputStyleBody` with admitted-resource resolution (`:1440-1453`). However: (a) `selectedStyleName` is not normalized in `resolveSessionFields` (`output-style-session-activation.service.ts:161`), causing `'default'` to inject an unwanted directive and blank/untrimmed names to misbehave (Defect 1); (b) optional `outputStyleActivation` DI absence or mismatched `accountResources` silently drops the style (0 applications) while `:1912` suppresses the flag and bypasses `assertSingleOutputStylePath` (Defect 2). |
| 5 | Enhanced-prompt `enabled` migration preserves explicit user choice | **PARTIAL** | `EnhancedPromptsState` adds `enabledPreference?: boolean` (`enhanced-prompts.types.ts:122`); `setEnabled` writes both `enabled` and `enabledPreference` (`enhanced-prompts.service.ts:593-599`); `updateState` serializes per-workspace writes cleanly without mutating cached state on failure (`:809-842`). Legacy records with `{ enabled: false, generatedPrompt: '<non-empty>' }` migrate as explicit opt-out. Edge bug: `:746` checks `state.generatedPrompt` without `.trim()`, disagreeing with `:463` and `:916` on whitespace-only records (Defect 4). |
| 6 | Environment block: fields, bounded git check, safe when git missing | **PARTIAL** | Emits all 7 required fields (`cwd`, `Platform`, `OS`, `Shell`, `Git repository`, `Today's date`, `Model`) after the boundary (`sdk-query-options-builder.ts:1127-1136`), uses `execFile('git', ['rev-parse', '--git-dir'], { cwd, timeout: 2_000, windowsHide: true })`, maps exit `128` -> `'no'` and missing/timeout/other errors -> `'unknown'`. Gaps: no `AbortSignal`, empty `SHELL=""` emits blank `Shell: `, and synchronous `execFile` throws are unguarded (Defect 5). |
| 7 | Error paths and missing specs | **FAIL** | Several new B5a branches and error boundaries have zero unit test coverage across all four libraries (Defect 7). |

---

## 3. Five Logic Questions

1. **How does this fail silently?**
   - If `OutputStyleSessionActivationService` is not injected into `SdkQueryOptionsBuilder` (`sdk-query-options-builder.ts:1329-1330`, optional DI, registered *after* `registerSdkServices` in `apps/ptah-electron/src/di/phase-2-libraries.ts:305, 791` and `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts:177`), or if a named run's `input.accountResources` is missing/mismatched (`:1443`), `fullPromptStyleBody` becomes `undefined` while `:1912` suppresses `Options.settings.outputStyle`. The user's output style is silently applied **0 times** with no warning logged (Defect 2).
   - Passing `undefined` to `buildFlagSettingsArg` on the `fullPrompt` route (`:1912`) skips `assertSingleOutputStylePath(sessionConfig)` (`:418-429`), so a regression that sets both `outputStyleName` and `outputStyleBody` fails silently on `fullPrompt` instead of throwing loudly as in preset mode (Defect 2).
   - On `autoResumeIfInactive` (`chat-session.service.ts:3510-3533`) when SDK `snapshot` is unrolled or cleared by compaction, the session silently reverts from the Ptah full prompt array back to `{ type: 'preset', preset: 'claude_code', append }` with no diagnostic or session-mode mismatch signal (Defect 3).
   - Untrimmed `options.selectedStyleName` (e.g. `'  Explanatory  '`) silently fails exact match (`output-style-session-activation.service.ts:161, 177`) and drops the style without warning (Defect 1).

2. **What user action produces unexpected behaviour?**
   - **Continuing/resuming a main chat after app restart, Stop, idle eviction, or compaction**: On accounts without SDK `snapshot` rollout or after compaction clears the snapshot, the user's enhanced main chat loses the Ptah full prompt and reverts to the `claude_code` preset, busting prompt cache and changing system instructions mid-thread (Defect 3).
   - **Typing `/<skill-name>` in a full-prompt main chat**: If the slash command is a Claude skill not intercepted by Ptah's local router, the preset rule instructing Claude to invoke `/<skill-name>` via `Skill` (and not guess unlisted skills) is absent from `ptah-full-prompt.ts` (Defect 6).
   - **Cancelling/aborting a new session while `git rev-parse` hangs on a slow/network drive**: Session abort stalls up to 2,000 ms waiting for `execFile` to time out because `abortController.signal` is not passed to `buildPromptEnvironment` (Defect 5).

3. **What input data produces a wrong answer?**
   - `options.selectedStyleName = 'default'` passed to `OutputStyleSessionActivationService.resolveSessionFields({ injectIntoSystemPrompt: true, selectedStyleName: 'default' })` (`output-style-session-activation.service.ts:161, 188-192`) matches the built-in `'default'` sentinel (`built-in-output-styles.ts:38-47`) and injects `"Follow the default output style. The standard behaviour — ..."` instead of returning `NO_OUTPUT_STYLE` (Defect 1).
   - `options.selectedStyleName = ''` or `'   '` on a named account (`:161, 180-185`) does not short-circuit to `NO_OUTPUT_STYLE`; it runs discovery, finds `winner === null`, logs a false warning, and returns `{ outputStyleUnavailable: true }` (Defect 1).
   - Legacy persisted enhanced-prompts state `{ enabled: false, generatedPrompt: '   ' }` (`enhanced-prompts.service.ts:746`) reports `hasGeneratedPrompt: false` in `getStatus` (`:463`), yet `runWizard` migrates it as `enabledPreference: false`, leaving freshly generated prompts disabled (Defect 4).
   - `process.env['SHELL'] = ''` (empty string) produces `Shell: ` (blank) instead of falling back to `ComSpec` / `'unknown'` (`sdk-query-options-builder.ts:1126`, Defect 5).

4. **What happens when a dependency fails?**
   - `outputStyleActivation.resolveSessionFields` throws on a named account -> rethrows `OutputStyleAccountResourceError` (`output-style-session-activation.service.ts:204-205`), which fails closed and aborts the named launch (verified good). On an ambient account, catches and degrades to `NO_OUTPUT_STYLE` with a warning (`:208-212`, verified good).
   - `git` missing (`ENOENT`) or timing out -> `execFile` callback receives `error` with `code !== 128` and resolves `'unknown'` (`sdk-query-options-builder.ts:1122`). However, a synchronous throw from `execFile` (e.g., invalid `cwd` containing a NUL byte) rejects `build()` instead of degrading to `'unknown'` (Defect 5).
   - `globalState.update()` fails during `enhancedPromptsService.setEnabled` or `runWizard` -> `updateState` (`enhanced-prompts.service.ts:809-842`) computes a new immutable object without mutating the cached state before the write, propagates the rejection to the caller, and `.catch(() => undefined)` on the queue tail ensures subsequent writes are not permanently wedged (verified good, though untested — Defect 7).
   - `this.outputStyleActivation` missing in DI -> silently drops the style on `fullPrompt` while still suppressing the SDK flag (Defect 2).

5. **What is missing that the requirements never mentioned?**
   - **Persisted per-session prompt mode** (`'ptah-full' | 'preset'`) in session metadata so resumed/continued/compacted sessions stay consistent with their launch prompt mode without relying on an unrolled/compaction-cleared SDK `snapshot` (Defect 3).
   - **DI registration order guard / Electron container smoke assertion** ensuring `SdkQueryOptionsBuilder` actually receives a non-undefined `OutputStyleSessionActivationService` in `apps/ptah-electron` and `libs/backend/cli-engine` (Defect 2).
   - **Runtime boundary contract test** in `ptah-full-prompt.spec.ts` verifying `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` matches `@anthropic-ai/claude-agent-sdk` and that `buildPtahFullPrompt()` is byte-identical across calls (Defect 7).

---

## 4. Numbered Defects

### Defect 1 — `OutputStyleSessionActivationService.resolveSessionFields` skips normalization for `options.selectedStyleName`
- **Severity**: **Serious**
- **Location**: `libs/backend/output-styles/src/lib/output-style-session-activation.service.ts:161, 180-192` (compare `libs/backend/output-styles/src/lib/output-style-selection.ts:79-86`, `libs/backend/output-styles/src/lib/built-in-output-styles.ts:38-47`)
- **Scenario & Impact**:
  Line 161 computes:
  ```ts
  const selected = options.selectedStyleName ?? this.readSelectedName();
  ```
  `readSelectedName()` normalizes persisted values through `normalizeOutputStyleSelection()` (trimming whitespace and mapping empty string or `DEFAULT_OUTPUT_STYLE_NAME` `'default'` to `null`). When `options.selectedStyleName` is passed directly, normalization is skipped:
  1. `selectedStyleName: 'default'` does not become `null`. `discovery.discover()` returns the built-in sentinel entry `{ name: 'default', tier: 'builtin', description: 'The standard behaviour — ...' }`, so lines 188–192 inject `"Follow the default output style. The standard behaviour — ..."` into the static system prompt prefix instead of omitting the block.
  2. `selectedStyleName: ''` or `'   '` does not return `NO_OUTPUT_STYLE`; it runs disk discovery, gets `winner === null`, and for `context?.kind === 'named'` (`:180-185`) emits a spurious warning and `{ outputStyleUnavailable: true }`.
  3. Untrimmed names such as `'  Explanatory  '` (which `buildFlagSettings` trims at `sdk-query-options-builder.ts:474`) fail `style.name === selected` (`:177`) and silently drop the style.
- **Concrete Fix**:
  Normalize `options.selectedStyleName` with `normalizeOutputStyleSelection` whenever it is provided:
  ```ts
  const selected =
    options.selectedStyleName !== undefined
      ? normalizeOutputStyleSelection(options.selectedStyleName)
      : this.readSelectedName();
  ```
  Add unit tests covering `'default'`, `''`, `'   '`, and `'  Explanatory  '` for both ambient and named contexts with `injectIntoSystemPrompt: true`.

### Defect 2 — Silent output-style drop and bypassed `assertSingleOutputStylePath` on the `fullPrompt` route
- **Severity**: **Serious**
- **Location**: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1329-1330, 1439-1454, 1911-1912`; DI ordering in `apps/ptah-electron/src/di/phase-2-libraries.ts:305, 791` and `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts:177`
- **Scenario & Impact**:
  1. `outputStyleActivation` is injected as `{ isOptional: true }` (`:1329`), and in both Electron (`phase-2-libraries.ts:305` vs `:791`) and Thoth CLI (`register-thoth-libraries.ts:177`), `registerSdkServices` executes *before* `registerOutputStyleServices` (working today only because `SdkQueryOptionsBuilder` happens to be resolved lazily after phase 2, with no DI test verifying wiring). If `this.outputStyleActivation` is `undefined`, or if `named` is truthy and `input.accountResources` is omitted or has a mismatched `route` (`:1443`), `fullPromptStyleBody` resolves to `undefined` while line 1912 (`fullPrompt ? undefined : sessionConfig`) still suppresses the SDK `outputStyle` flag. The user's selected output style is silently dropped (applied **0 times**) with zero warning logged.
  2. Passing `undefined` to `buildFlagSettingsArg` at `:1912` bypasses `assertSingleOutputStylePath(sessionConfig)` (`:418-429`, invoked inside `buildFlagSettings` at `:473`). A caller regression that sets both `outputStyleName` and `outputStyleBody` throws loudly in preset mode but is silently masked on the `fullPrompt` route.
- **Concrete Fix**:
  - Call `assertSingleOutputStylePath(sessionConfig)` unconditionally at the start of style resolution in `SdkQueryOptionsBuilder.build()` (before the `fullPrompt` branch).
  - When `fullPrompt && (named || sessionConfig.outputStyleName)` and either `!this.outputStyleActivation` or `(named && input.accountResources?.route !== named.route)`, log an explicit `this.logger.warn(...)` naming the dropped style / missing activation wiring (and on named runs with mismatched `accountResources`, fail closed rather than silently continuing without the named style check).
  - Register `registerOutputStyleServices` before `registerSdkServices` (or add an Electron DI container smoke assertion verifying `SdkQueryOptionsBuilder` receives `OUTPUT_STYLE_TOKENS.SESSION_ACTIVATION`).

### Defect 3 — Resumed / continued / slash-relaunched main-chat sessions lose `preset: 'enhanced'` without SDK `snapshot` or after compaction
- **Severity**: **Serious**
- **Location**: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1851-1853, 3510-3533`; `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2585-2598`
- **Scenario & Impact**:
  `preset: 'enhanced'` is attached only inside `launchSdkSession` (`chat-session.service.ts:1851-1853`, i.e., `chat:start`). `autoResumeIfInactive` (`:3510-3533`, used by `chat:continue` after app restart, Stop, idle eviction, watchdog recovery, and `chat:resume` with `activate: true`) and slash-command relaunches never pass `preset: 'enhanced'`.
  `batch-B5a-report.md:22, 66` relies on the SDK's default `snapshot` behavior, but per `sdk.d.ts:2585-2598`:
  1. `snapshot` is still rolling out (it is a no-op on accounts where the feature is not rolled out, and on Bedrock/Vertex/Foundry).
  2. Even when rolled out, **compaction clears the snapshot** and re-renders the system prompt from the current launch's `Options.systemPrompt`.
  Consequently, resuming a full-prompt main chat on any non-rollout account or after compaction silently switches the live conversation back to `{ type: 'preset', preset: 'claude_code', append }`, invalidating the prompt cache and altering behavioral instructions mid-thread.
- **Concrete Fix**:
  Persist the session's initial prompt mode (e.g., `'ptah-full' | 'preset'`) in `SessionMetadataStore` when `chat:start` launches a Claude SDK session. On `autoResumeIfInactive` (and slash relaunch), restore `preset: 'enhanced'` if and only if the persisted session was created in `'ptah-full'` mode (never reading the mutable workspace toggle directly on resume, which would flip existing preset sessions).

### Defect 4 — Legacy opt-out migration checks `state.generatedPrompt` without `.trim()`
- **Severity**: **Moderate**
- **Location**: `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts:744-746` (compare `:463`, `:916`)
- **Scenario & Impact**:
  `getStatus` (`:463`) and `getEnhancedPromptContent` (`:916`) treat whitespace-only `generatedPrompt` as absent (`!!state.generatedPrompt?.trim()`). In `runWizard`, line 746 computes:
  ```ts
  const enabledPreference =
    state.enabledPreference ??
    (state.generatedPrompt && !state.enabled ? false : undefined);
  ```
  Because `.trim()` is omitted, a legacy or corrupted record with `{ enabled: false, generatedPrompt: '   ' }` reports `hasGeneratedPrompt: false` (so the toggle was disabled and the user could never have opted out), yet `runWizard` migrates it to `enabledPreference: false` and leaves the newly generated enhanced prompt turned off.
- **Concrete Fix**:
  Change line 746 to:
  ```ts
  const enabledPreference =
    state.enabledPreference ??
    (state.generatedPrompt?.trim() && !state.enabled ? false : undefined);
  ```

### Defect 5 — `buildPromptEnvironment` lacks `AbortSignal` cancellation, emits blank `Shell: ` on `SHELL=""`, and does not guard synchronous `execFile` throws
- **Severity**: **Moderate**
- **Location**: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1116-1137, 2479-2482`
- **Scenario & Impact**:
  1. `execFile('git', ...)` (`:1118-1123`) does not receive `signal: abortController.signal`. Aborting a session while `git rev-parse` hangs on a slow/networked mount stalls cleanup for up to 2 seconds.
  2. Line 1126 uses `process.env['SHELL'] ?? process.env['ComSpec'] ?? 'unknown'`. Because `??` checks only `null`/`undefined`, an explicitly empty `SHELL=""` renders `Shell: ` (blank) instead of falling back to `ComSpec` or `'unknown'`.
  3. If `execFile` throws synchronously (e.g., invalid `cwd` containing a NUL byte or unsupported option error), the Promise rejects and aborts `build()` instead of resolving `'unknown'`.
- **Concrete Fix**:
  Pass `abortController.signal` into `buildPromptEnvironment` (`signal` option on `execFile`), wrap `execFile` in `try { ... } catch { resolve('unknown'); }`, and normalize shell with:
  ```ts
  const shell =
    process.env['SHELL']?.trim() || process.env['ComSpec']?.trim() || 'unknown';
  ```

### Defect 6 — Undocumented preset rule drops and minor privacy/confirmation compression in `ptah-full-prompt.ts`
- **Severity**: **Moderate**
- **Location**: `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-full-prompt.ts:8-30` vs `.ptah/tmp/prompt-dump/system-2.md:1, 3, 5, 8`
- **Scenario & Impact**:
  Two rules from the preset (`system-2.md` chars 0–6,423) were dropped without being recorded in `batch-B5a-report.md`'s kept/dropped table:
  1. **Slash-skill invocation (`system-2.md:8`)**: `"When the user types /<skill-name>, invoke it via Skill. Only use skills listed in the user-invocable skills section — don't guess."` In Ptah main chat, unrecognized `/<skill>` commands pass through to Claude; without this rule, Claude can hallucinate unlisted skills or fail to route explicit `/<skill>` calls through `Skill`.
  2. **Gender-neutral default pronouns (`system-2.md:1`)**: `"When you use a pronoun for someone ... and their pronouns haven't been stated, use they/them ... never infer pronouns from a name."` Dropped silently.
  Additionally, `ptah-full-prompt.ts:15` compresses the privacy rule (omitting concrete `header, URL, or payload` and `User-Agent` contact-detail guidance from `system-2.md:5`) and the external-action confirmation rule (omitting `"Sending content to an external service publishes it; it may be cached or indexed even if later deleted"` from `system-2.md:3`). With 5,858 characters of unused headroom below the 16,000-character budget, keeping these ~250 characters costs virtually nothing.
- **Concrete Fix**:
  Restore the one-line `/<skill-name>` -> `Skill` rule in `# Working with tools`, restore the concise header/URL/payload/User-Agent privacy clause (and either restore the one-line pronoun rule or explicitly record its omission in `batch-B5a-report.md`).

### Defect 7 — Missing focused unit tests for critical B5a branches and error paths
- **Severity**: **Moderate**
- **Location**:
  - `libs/backend/output-styles/src/lib/output-style-session-activation.service.spec.ts`
  - `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts`
  - `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.accounts.spec.ts`
  - `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.ptah-ui-flag.spec.ts`
  - `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts`
  - `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-full-prompt.spec.ts`
- **Scenario & Impact**:
  Key invariants of B5a are untested and directly allowed Defects 1, 2, and 4 to slip through:
  1. `output-style-session-activation.service.spec.ts`: no tests for `injectIntoSystemPrompt: true` on `builtin` styles (`Explanatory`/`Learning`/`Proactive`), `selectedStyleName: 'default'` / blank / untrimmed, or `named` account context (found, unavailable -> `outputStyleUnavailable: true`, error -> `OutputStyleAccountResourceError`).
  2. `sdk-query-options-builder.spec.ts`: no tests for `fullPrompt` with `named` account + `accountResources` (matching vs mismatched/missing), `fullPrompt` fallback when `phase` or `skills` is set, `fullPrompt` with pre-resolved `outputStyleBody` (localhost-global + Anthropic-workspace), `fullPrompt` when `outputStyleActivation` is `undefined`, dual `{ outputStyleName, outputStyleBody }` assertion on `fullPrompt`, or `buildPromptEnvironment` error paths (`git` missing `ENOENT`, exit `128`, timeout -> `'unknown'`, `SHELL=""`).
  3. `session-query-executor.accounts.spec.ts`: no assertion verifying `accountResources: named.resources` is passed to `queryOptionsBuilder.build()`.
  4. `chat-session.ptah-ui-flag.spec.ts`: no tests verifying `mcpToolProfile: 'apps'`, `startAgentChildSession`, `startHandoffSession`, and whitespace-only `enhancedPromptsContent` omit `preset: 'enhanced'`.
  5. `enhanced-prompts.service.spec.ts`: no tests for concurrent `setEnabled` + `runWizard` serialization, write-failure rollback / queue recovery, or whitespace-only legacy `generatedPrompt`.
  6. `ptah-full-prompt.spec.ts`: no test asserting `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` equals the SDK's exported constant or that `buildPtahFullPrompt()` is byte-identical across repeated calls.
- **Concrete Fix**:
  Add focused test cases covering the above paths in each corresponding spec file.

---

## 5. Checks Run

| Check | Command | Result |
| --- | --- | --- |
| SDK boundary runtime value | `node -e "import('file:///D:/projects/PtahCode/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs').then(m => console.log(JSON.stringify(m.SYSTEM_PROMPT_DYNAMIC_BOUNDARY)))"` | **PASS** — `"__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__"` (matches `ptah-full-prompt.ts:5-6`). |
| ESLint (all 8 B5a files) | `node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js <8 B5a source/spec files>` | **PASS** — exit 0, 0 errors, 4 pre-existing `max-lines` warnings; Nx module boundary check (`agent-sdk` -> `output-styles`) clean. |
| TypeScript (`output-styles`) | `node .\node_modules\typescript\bin\tsc --noEmit --project libs/backend/output-styles/tsconfig.lib.json` | **PASS** — exit 0, 0 errors. |
| TypeScript (`agent-sdk`) | `node .\node_modules\typescript\bin\tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` | **PASS** — exit 0, 0 errors. |
| TypeScript (`agent-generation`) | `node .\node_modules\typescript\bin\tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json` | **PASS** — exit 0, 0 errors. |
| TypeScript (`rpc-handlers`) | `node .\node_modules\typescript\bin\tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` | **PARTIAL / ENV BLOCKED** — exit 2: **0 errors in `libs/backend/rpc-handlers/`**; all reported errors were in transitive `libs/backend/acp-runtime/` due to missing `@agentclientprotocol/sdk` in shared `D:\projects\PtahCode\node_modules`. |
| Focused Jest (`output-styles`) | `node .\node_modules\jest\bin\jest.js --config libs/backend/output-styles/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/output-styles/src/lib/output-style-session-activation.service.spec.ts` | **PASS** — 1/1 suite, 20/20 tests passed (exit 0). |
| Focused Jest (`agent-generation`) | `node .\node_modules\jest\bin\jest.js --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts` | **PASS** — 1/1 suite, 73/73 tests passed (exit 0). |
| Focused Jest (`agent-sdk`: `ptah-full-prompt.spec.ts`) | Included in `agent-sdk` Jest run (`--runInBand --coverage=false --runTestsByPath`) | **PASS** — 1/1 test passed. |
| Focused Jest (`agent-sdk` builder/output-style, `rpc-handlers`, `cli-agent-runtime`) | `node .\node_modules\jest\bin\jest.js --config <proj>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>` | **ENV BLOCKED (NOT VERIFIED)** — suites failed to load (`Test suite failed to run` / `Cannot find module '@babel/code-frame'`) because the shared junction target `D:\projects\PtahCode\node_modules` became incomplete during verification (`@babel/code-frame=False`, `@agentclientprotocol/sdk=False`, `.bin/jest.cmd=False`). Do not treat these suites as verified here; re-run after restoring `node_modules`. |
| `git diff --check` | `git diff --check -- libs/backend/agent-sdk libs/backend/agent-generation libs/backend/output-styles libs/backend/rpc-handlers` | **PASS** — exit 0, no whitespace/conflict-marker issues. |
| DI lint (`tools/di-lint/check-injects.ts`) | `node tools/di-lint/check-injects.ts` | **ENV BLOCKED** — `ReferenceError: __dirname is not defined` under Node v26 ESM loader; verified DI registrations manually in `apps/ptah-electron/src/di/phase-2-libraries.ts` and `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts`. |

> Tooling fallbacks used: `ptah_code_search_symbols` returned 0 symbols (empty worktree index) and `ptah_search_files` excludes gitignored `.ptah/`; fell back to `git grep`, `read_file`, and PowerShell directory listings.

---

## 6. Verdict

**REVISE**

Fix Serious Defects **1**, **2**, and **3** (and Moderate Defects **4**, **5**, **6**, and **7**), restore `D:\projects\PtahCode\node_modules` so the blocked `agent-sdk`, `rpc-handlers`, and `cli-agent-runtime` Jest suites can be re-verified cleanly, and re-submit for re-review.
