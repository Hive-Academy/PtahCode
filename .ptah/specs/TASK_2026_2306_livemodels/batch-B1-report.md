# Batch B1 report (B1.1 + B1.2) — TASK_2026_2306_livemodels

Root: `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`. Nothing committed, staged or stashed.

## Files

### B1.1 Shared RPC contracts and pure helpers

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\types\rpc\rpc-providers.types.ts`:
  added `ProviderModelListSource` and `ModelListFailureReason` (literal unions), `ProviderModelInfo.toolUseUnknown?: true`
  and `upstreamProtocol?`, and `ProviderListModelsResult.source? / failureReason? / savedAt? / notice?`. `error?` and
  `isStatic?` are kept and their docs reworded.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\types\rpc\rpc-agents.types.ts`:
  added `PtahCliListModelsResult.source? / failureReason?` and made `isStatic` optional. Reworded the
  `CliModelOption.isFallback` doc to "set by classification when no account source confirmed the CLI's id" (plan :588-589).
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\model-list-failure.ts`:
  `CREDENTIAL_FAILURE_REASONS`, `describeModelListFailure` (an exhaustive switch with a `never` check),
  `modelListErrorText` and `modelListNoticeText` (the date is UTC `YYYY-MM-DD`).
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\model-list-failure.spec.ts`
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\closest-live-model.ts`:
  `closestLiveModel(preferred, liveIds)`.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\closest-live-model.spec.ts`:
  covers the 4 plan examples, suffix re-append, "no version -> exact only", the predecessor fallback, ties and totality.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\index.ts`:
  exports the new helpers.

### B1.2 Registry fields, Kimi live parser, OpenCode type move

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\provider-registry.ts`:
  added `AnthropicProvider.modelsAuthScheme?` and `liveModelCapabilities?`, plus `getProviderLiveModelCapabilities(providerId)`,
  which resolves through `getPtahCliLaneProvider`. `customEntryToAnthropicProvider` is unchanged and sets neither field.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\entries\kimi-code-provider-entry.ts`:
  `liveModelCapabilities: KIMI_CODE_MODEL_CAPABILITIES`. The static rows are untouched.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\entries\kimi-code-models.ts`:
  `parseKimiCodeModels(payload)`.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\entries\kimi-code-models.spec.ts`
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\entries\opencode-provider-entry.ts`:
  now owns `OpenCodeProviderId`, `OpenCodeProtocol` and `isOpenCodeProviderId`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\entries\opencode-model-routes.ts`:
  imports the types from the entry with `import type` and re-exports them. It re-exports `isOpenCodeProviderId` as its last statement.
- MODIFIED `index.ts` (same file as in B1.1): exports `parseKimiCodeModels`. The OpenCode guard and types are now exported from the
  entry, with the same public names.

## Checks (focused, run from the worktree)

- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: exit 0 (`.ptah/tmp/b1-tsc-lib.log`).
- `npx tsc --noEmit --project libs/shared/tsconfig.spec.json`: exit 0 (`.ptah/tmp/b1-tsc-spec.log`).
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath` on 7 specs
  (closest-live-model, model-list-failure, kimi-code-models, opencode-provider-entry, kimi-code-model-merge, provider-registry,
  provider-lookup): 7 suites, 155 tests passed (`.ptah/tmp/b1-jest.log`). After the Prettier pass, 3 of those suites ran again:
  58 tests passed (`.ptah/tmp/b1-jest2.log`).
- `npx eslint <13 changed files>`: exit 0, no findings (`.ptah/tmp/b1-eslint.log`). ESLint printed "No cached ProjectGraph", so
  `@nx/enforce-module-boundaries` was skipped in this run. The coordinator's `-t lint` covers it.
- Prettier: the new files and `opencode-model-routes.ts` are formatted. `rpc-agents.types.ts` and `provider-registry.ts` were already
  unformatted on `main`, at lines this batch did not touch. They were left as they are, and lint-staged will format them at commit.
- Not run, as the brief requires: `npm run verify` (the `--related`, `-t lint,typecheck` and B1 gate runs). The coordinator owns these.

## Deviations and decisions

1. **OpenCode import cycle.** The entry reads `OPENCODE_MODEL_ROUTES` while it loads. A value import from routes to the entry at the
   top of the file therefore crashes any module that loads routes first, such as the existing `opencode-provider-entry.spec.ts`.
   The fix has three parts:
   - Routes imports the two types with `import type`, which is erased at runtime.
   - `getOpenCodeModelProtocol` guards with an own-property check on the frozen table instead of calling `isOpenCodeProviderId`.
     The behaviour is the same and it is stricter for `__proto__`.
   - `export { isOpenCodeProviderId } from './opencode-provider-entry'` is the file's last statement, with a comment. It is kept
     because the existing spec, which is outside the write set, imports the guard from routes.

   This is temporary until Component 10 deletes routes. No export moves twice.
2. **`closestLiveModel`, same version first.** Before the successor rule, a candidate with the same version wins. Example: for
   `k3.1-pro[1m]` with only `k3.1-pro` live, the result is `k3.1-pro`, not `k3.2-pro`. Candidates are unsuffixed live ids only, so a
   bare id that is not live is never returned. Candidates with no version number are ignored. Both rules are pinned in the spec.
   Reversible.
3. **`parseKimiCodeModels`.**
   - The envelope is `{data: unknown[]}`, at most 1000 rows. The batch does not set this limit; it follows the precedent in
     `opencode-live-routes.ts`.
   - `[]` is returned when the vendor lists no rows, so the caller reports `empty`.
   - `null` is returned when the envelope fails, or when rows are listed but none can be read (fail closed, `bad-response`).
   - Duplicate ids are skipped.
   - "Row reports tools" means an optional boolean `supports_tool_use` or `supportsToolUse` on the row. That field name is not
     confirmed (A2 is unverified). Without it, a row gets `supportsToolUse: false` plus `toolUseUnknown: true`.
   - Capabilities come from `KIMI_CODE_PROVIDER_ENTRY.liveModelCapabilities` directly, which avoids a value import of the registry.
4. **Precedent file.** `file-settings-errors.ts` lives in `libs/backend/platform-core`, not in `libs/shared`. It was used only for
   its fixed-text style.
5. **`PtahCliListModelsResult` types.** It reuses the two union types by `import type` from the sibling `./rpc-providers.types`.
   This stays inside `types/rpc`, with no import from `providers/`.
6. **No spec for `customEntryToAnthropicProvider` setting no `modelsAuthScheme`.** `provider-registry.spec.ts` is not in the write
   set. The function is unchanged and visibly sets neither new field.

## Out-of-scope observations

- `PtahCliListModelsResult.isStatic` is now optional. Consumers outside `shared` that read it as a `boolean` still type-check when
  it is used in a condition. The coordinator's scoped typecheck of dependent projects should confirm this.
