# Fix Round 1 — Lane F4 Report (`TASK_2026_2325_899d`)

Status: Complete

## Scope
Fix review findings **C1, C2, C4, C6, C7** from `code-logic-review-p1-C.md` in `libs/backend/rpc-handlers` (excluding C3 and C5, owned by other lanes).

## Files Changed
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.spec.ts`

## Fixes Implemented (with Plan Refs)
- **C1 (Major) — Non-throwing post-commit state resolution in `wizard:set-setup-model`**
  - Source: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:433-450`
  - Plan ref: `implementation-plan.md:369-375` (RPC receipt vs effective state and Undo binding)
  - Change: Wrapped the post-commit `this.resolveSetup(workspaceRoot)` call in `try/catch` after `commitSetupPair` succeeds. On resolution throw or timeout, logs a sanitized warning and returns `{ committed, commitSeq, state }` with a non-throwing `unavailable` state (`{ kind: 'unavailable', source: committed ? 'setup' : 'workspace', provider: committed?.provider ?? '', model: committed?.model ?? '', cause: 'provider-unavailable' }`), never throwing after a committed write.
- **C2 (Minor) — Backstop Decision stage status in `runJudgeWithDeadline`**
  - Source: `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:614-658`
  - Plan ref: `implementation-plan.md:117,134-140` (R14 stage reporting and `+70 s` hard deadline)
  - Change: Added `decisionStatus: 'failed' | 'skipped'` parameter to the local `fallback(...)` helper. Pre-dispatch fallbacks (`!this.skillJudge || !input.resolved` at `:625-627` and `remainingHardMs <= 0` at `:630-632`) keep Decision as `'skipped'`; post-invocation backstops where Decision may have run now label Decision `'failed'` with fixed safe categories (`'timed-out'` at `:650` on hard-deadline hit; `'unavailable'` at `:654` on unexpected judge throw, with Normal `'failed'/'provider-error'`).
- **C4 (Minor) — Control-character sanitization on AI skill draft description**
  - Source: `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.ts:68-73,190-196`
  - Plan ref: `implementation-plan.md` Preview/Create byte-identity (D27) & `brief-fix-r1.md` F3/F4 split
  - Change: Added `sanitizeDraftDescription(raw)` replacing `\r\n?` and `[\p{Cc}\p{Bidi_Control}]` with spaces and trimming before `serializeSkillDocument`. Rejects control-character-only descriptions as `invalid-output`. Backslashes are intentionally left untouched for F3's shared `serializeSkillDocument` fix (A4) so they are not double-escaped. Both `result.description` and `result.content` use the sanitized value so Preview and `HarnessFsService.createSkillPlugin` stay byte-identical.
- **C6 (Minor) — Bound `buildReasons` array length on `wizard:generate-skill-draft`**
  - Source: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:152`
  - Change: Added `.max(10)` to `buildReasons: z.array(draftText(2_000, true)).max(10)` in `DraftParamsSchema`.
- **C7 (Minor) — Name Setup provider ID in `SETUP_MODEL_INVALID` error message when known**
  - Source: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:178-213,378`
  - Plan ref: `implementation-plan.md:135` ("naming Setup provider", R13)
  - Change: Added `sanitizeProviderId(...)` (strips control/bidi chars, trims, caps at 64 chars) and updated `setupModelError(resolution, fallbackProvider)` to include `${sourceLabel} provider ${provider}` when `resolution.provider` (or `pair?.provider` during `validateSetupPair`) is known, while cleanly omitting provider when null/unknown and never exposing credentials or raw provider errors.

## Specs Added / Updated
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`
  - `names the stored Setup provider ID in SETUP_MODEL_INVALID errors when known` (`:1061-1135`) — covers `source: 'setup'` with provider, `provider: null` omitting `null`, thrown `validateSetupPair` naming requested provider without leaking raw error text, and `source: 'workspace'` `unavailable`. (C7)
  - `post-commit resolution failure still returns the committed receipt` (`:1137-1193`) — covers both set-pair and clear-pair commits where post-commit `resolveSetup` rejects, asserting committed receipt, monotonic `commitSeq`, safe `unavailable` state, and no secret leakage. (C1)
  - Added 11-entry `buildReasons` case to `rejects a draft outside the input limits` (`:1339-1348`). (C6)
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`
  - `labels Decision failed on hard-deadline and unexpected judge backstops while keeping pre-dispatch skipped` (`:1195-1305`) — covers `+70 s` hard deadline (`decision: failed/timed-out`, `normal: failed/timed-out`), unexpected judge rejection (`decision: failed/unavailable`, `normal: failed/provider-error`, no raw error leak), and pre-dispatch zero-budget (`decision: skipped/timed-out`, `judge` not invoked). (C2)
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.spec.ts`
  - `replaces control characters in AI description with spaces before serialization and stays byte-equal on disk` (`:255-303`) — verifies `\r\n`, `\t`, `\u0000`, `\u001b`, `\u202e` replacement and byte-equal Preview vs `HarnessFsService.createSkillPlugin` disk output. (C4)
  - `rejects an AI description made only of control characters as invalid-output` (`:305-327`). (C4)

## Checks
All focused checks executed sequentially and passed:
1. `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts`
   - Result: **PASS** — 4/4 test suites, 176/176 tests passed (49.86 s).
2. `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
   - Result: **PASS** — exit code 0, 0 errors.
3. `npx eslint libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.spec.ts`
   - Result: **PASS** — 0 errors, 2 pre-existing warnings in `setup-rpc.handlers.ts` (`preserve-caught-error` at `:307`, `max-lines` at `:824`, both documented as pre-existing in `code-logic-review-p1-C.md:80-86`).
4. `ptah_get_diagnostics` (scoped to the 6 changed files): unavailable due to >45 s TypeScript server background run; verified directly with `tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` (0 errors).

## Decisions
1. **Post-commit resolution fallback state shape (C1)**
   - **Decision**: Return `{ kind: 'unavailable', source: committed ? 'setup' : 'workspace', provider: committed?.provider ?? '', model: committed?.model ?? '', cause: 'provider-unavailable' }` whenever post-commit `this.resolveSetup(workspaceRoot)` throws or times out.
   - **Options**: (a) Return `unavailable` for both set and clear commits; (b) reuse the pre-commit validation result `{ kind: 'set', pair: committed }` for set commits and `unavailable` for clear commits.
   - **Evidence**: `SetupPairState` (`libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts:25-31`) models `unavailable` with `{ source, provider, model, cause: 'provider-unavailable' }`; `brief-fix-r1.md:60-62` recommends returning a non-throwing `unavailable` state with a safe cause. Option (a) avoids falsely claiming live resolution succeeded when the post-commit probe actually failed or timed out, while still returning the authoritative `committed` receipt and `commitSeq`.
   - **Reversible**: Yes (isolated to `setup-rpc.handlers.ts:435-448`).
2. **Decision backstop category on unexpected judge throw (C2)**
   - **Decision**: Change only Decision `status` from `'skipped'` to `'failed'` on post-invocation backstops while keeping the existing fixed categories (`'timed-out'` on hard deadline, `'unavailable'` on unexpected throw).
   - **Options**: (a) Keep `'unavailable'` on unexpected throw; (b) change Decision category to `'provider-error'`.
   - **Evidence**: `brief-fix-r1.md:63-64` specifies labeling Decision `failed` (not `skipped`) and keeping stage categories fixed and safe; `implementation-plan.md:391` guarantees `pairAttempted` is always `undefined` on `'unavailable'`.
   - **Reversible**: Yes (single literal at `skill-recommendation.service.ts:654`).
3. **Leave backslashes unescaped in `SkillDraftGenerationService` (C4)**
   - **Decision**: Replace `\r\n?` and `[\p{Cc}\p{Bidi_Control}]` with spaces in `SkillDraftGenerationService` and do not double or strip `\`.
   - **Options**: (a) Control-char replacement only in `SkillDraftGenerationService`, leaving `\` escaping to F3 in `serializeSkillDocument`; (b) escape `\` in `SkillDraftGenerationService` too.
   - **Evidence**: `brief-fix-r1.md:47-48,65-66` explicitly splits backslash escaping to F3 (A4) and control-character replacement to F4 (C4); doing both would double-escape backslashes once F3 merges.
   - **Reversible**: Yes (`sanitizeDraftDescription` in `skill-draft-generation.service.ts:68-73`).
4. **No extra DI resolution on `resolveSetup` timeout for provider name (C7)**
   - **Decision**: Include `resolution.provider` when returned by `resolveSetup`/`validateSetupPair` and `pair?.provider` when `validateSetupPair` throws/times out, without adding a separate `WorkspaceScopeResolver` resolution inside `resolveSetup`.
   - **Options**: (a) Use `resolution?.provider ?? pair?.provider`; (b) resolve `WorkspaceScopeResolver` inside `resolveSetup` on catch/timeout to read stored `setup.provider`.
   - **Evidence**: `code-logic-review-p1-C.md:77-78` says "add the stored provider ID (not a secret) when the resolution has it"; `brief-fix-r1.md:68` says "when known"; existing spec `setup-rpc.handlers.spec.ts` asserts `container.resolve` is called once (`SDK_WORKSPACE_LLM_RESOLVER` only) on blocked Setup.
   - **Reversible**: Yes (`setupModelError` in `setup-rpc.handlers.ts:187-213`).

## Open Items & Needed Changes in Other Groups
- **F3 (A4)**: Backslash escaping in `libs/shared/src/lib/utils/skill-document.ts` (`serializeSkillDocument`) completes the YAML-safety pair with C4.
- **Pre-existing ESLint warnings in `setup-rpc.handlers.ts`**: `preserve-caught-error` (`:307`) and `max-lines` (`:824`) remain out of scope per `code-logic-review-p1-C.md:80-86`.

## Extra Reads
- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` (verified `SetupPairState`, `SkillJudgeStageRecord`, `SkillJudgeStageCategory`, `WizardSetSetupModelResult`, `WizardGenerateSkillDraftParams`)
- `libs/shared/src/lib/utils/skill-document.ts` (verified `serializeSkillDocument` escaping behavior for C4/F3 coordination)
- `libs/backend/agent-sdk/src/index.ts` and `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` (verified `SetupResolution` union type for C1 and C7; `ptah_code_search_symbols` index was empty with 0 symbols)
- `implementation-plan.md` lines 115-160 and 355-410 (plan references cited by `code-logic-review-p1-C.md`)
