# Code Logic Review — `TASK_2026_2325_899d` (D46 CI Degradation Audit)

## Verdict: APPROVED  Score: 8/10

**Assessment**: All 11 added `// degradation-audit:` markers make **TRUE** claims backed by concrete surfacing or optional-capability paths in the code. Zero markers conceal a silent success or dropped user/caller failure. The uncommitted diff (`git diff -- libs/backend libs/frontend/onboarding`) is strictly comment-only (11 lines added across 6 files), and `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` reports `TOTAL 0 unsuppressed site(s)` across 4,744 scanned files.

**Score rationale**:
- **Why 8/10 (sound) rather than 9–10 (exemplary)**: The 3 `hasProxyCredentials` catches in `workspace-provider-profile-resolver.ts` (`:773`, `:787`, `:800`) surface failures to callers as `not-signed-in`, so the `reported` claims hold, but they discard unexpected credential-check exceptions without calling the class's existing `this.logger.warn(...)` (unlike the sibling catch in `buildSetupProfile:648-655`), creating a Moderate observability gap.
- **Why 8/10 rather than 5–6 (real gaps)**: Every one of the 11 claims is verifiably true end-to-end with `file:line` evidence, zero Blocking or Serious defects were introduced or hidden, and the CI audit passes cleanly (`TOTAL 0`).

---

## Marker Verification Table

Post-edit line numbers in the worktree (`/home/amun/ptah-extension/.claude-worktrees/skill-judge`):

| # | Marker (`file:line`) | Kind | Claim True/False | Evidence (`file:line`) |
| --- | --- | --- | --- | --- |
| 1 | `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:774` (catch `:773`) | `reported` | **TRUE** | Returning `false` (`:775`) causes `buildSetupProfile` (`:636-638`) to return `{ ok: false, kind: 'invalid', cause: 'not-signed-in' }`, forwarded by `WorkspaceLlmResolver` (`workspace-llm-resolver.ts:283-304`, `:441-462`) and rendered as a sign-in error alert (`analyze-workspace.page.ts:102-110, 239-272`; `analyze-skills.page.ts:123-131, 235-253, 270-290`). Note: `CopilotAuthService.tryRestoreAuth()` also logs internally (`copilot-auth.service.ts:360-367`); see Finding 1 for unlogged exceptions from `isAuthenticated()`. |
| 2 | `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:788` (catch `:787`) | `reported` | **TRUE** | Returning `false` (`:789`) flows through `buildSetupProfile` (`:636-638`) -> `WorkspaceLlmResolver` (`workspace-llm-resolver.ts:283-304`, `:441-462`) -> UI sign-in error alert (`analyze-workspace.page.ts:102-110, 239-272`; `analyze-skills.page.ts:123-131, 235-253, 270-290`). See Finding 1 for missing `this.logger.warn` when `kimiCodeAuth.isAuthenticated()` throws. |
| 3 | `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:801` (catch `:800`) | `reported` | **TRUE** | Returning `false` (`:802`) flows through `buildSetupProfile` (`:636-638`) -> `WorkspaceLlmResolver` (`workspace-llm-resolver.ts:283-304`, `:441-462`) -> UI sign-in error alert (`analyze-workspace.page.ts:102-110, 239-272`; `analyze-skills.page.ts:123-131, 235-253, 270-290`). See Finding 1 for missing `this.logger.warn` when `openRouterAuth.isAuthenticated()` throws. |
| 4 | `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-json-extract.ts:40` (catch `:39`) | `optional-capability` | **TRUE** | `parseObject` returns `null` so `extractJsonObject` skips malformed ```` ```json ```` fences and tries subsequent fences or bare `{...}` extraction (`:6-31`). When no valid JSON object is extracted (`null` returned), every caller surfaces `'invalid-output'`: `skill-draft-generation.service.ts:175-179` and `skill-judge.service.ts:619-625`. |
| 5 | `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:508` (catch `:507`) | `reported` | **TRUE** | Post-deadline (`searchSettled === true`, set in `finally` at `:537`): `:541-552` synchronously marks every `started && status === 'not-searched'` bucket as `failed` with `TIMED_OUT_FAILURE` and logs `this.logger.warn` (`:547-550`); `:442-446` reports it in both `searchFailures` and `judge.items[].registryFailure`. In-budget (`searchSettled === false`): `:510-521` sets `bucket.status = 'failed'`, sets `bucket.failure`, and logs `this.logger.warn`, then `:442-446` surfaces it in `searchFailures` and `registryFailure`. |
| 6 | `libs/backend/settings-core/src/reactive/reactive-settings-store.ts:103` (call `:104`) | `reported` | **TRUE** | `backendPromise.catch(() => undefined)` (`:104`) attaches a handler to avoid premature `UnhandledPromiseRejection` while awaiting `prevPublication`, without replacing `backendPromise`. `publish()` always reaches `await backendPromise` (`:112`), which rejects `step` (`:123`) and rejects `await step` (`:125`) directly back to the originating `writeGlobalBatch` caller (`workspace-scope-resolver.ts:446`). |
| 7 | `libs/backend/settings-core/src/reactive/reactive-settings-store.ts:110` (call `:111`) | `reported` | **TRUE** | `prevPublication` is either `Promise.resolve()` (`:33`) or the previous call's `step` (`:123-124`), which that previous call directly awaits without catching (`:125`). Catching `prevPublication` in the next batch only prevents an earlier batch failure from stalling or failing unrelated subsequent batches. |
| 8 | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:634` (catch `:633`) | `reported` | **TRUE** | Sole caller is `load()` (`:733-736`) on `SETUP_MODEL_INVALID`. For the active request (`version === this.version && !this.destroyRef.destroyed`), the catch falls through to `:637` `this.applySetupBlock(fallbackSetupBlock(hasPriorResult))`, updating `setupBlockState` (`:603`) which renders `<ptah-alert data-testid="setup-model-blocked">` at `:235-253` (`:240`, no prior result) and `:268-291` (`:275`, with prior result). Superseded/destroyed requests return early (`:635`) to avoid stale UI overwrites. |
| 9 | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:77` (catch `:76`) | `optional-capability` | **TRUE** | Core analysis (`startFresh`, `continuePrevious`, `stop`, `loadSaved`, `useSaved`, `reviewSkills`, `refreshSetupModel`, `useWorkspaceModel`) works without `AppStateManager`; both `this.appState` uses are guarded (`:679` view-return refresh effect, `:774` `openSetupSettings`), and `analyze-workspace.render.spec.ts:128-152` exercises the full page without providing `AppStateManager`. See Finding 2 (Minor pre-existing UI edge case). |
| 10 | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:761` (catch `:760`) | `reported` | **TRUE** | For the active request (`!this.destroyed && seq === this.setupRequestSeq`), `:763` sets `setupReadFailed.set(true)`, which renders `<ptah-alert data-testid="setup-model-read-error">` with a `Retry` button (`:279-303`) and sets `setupReady()` to `false` (`:580`), disabling Start/Continue actions (`:412, 420, 448`). Superseded/aborted requests (`seq !== this.setupRequestSeq`, incremented at `:731` / `:797`) or destroyed instances intentionally return early (`:762`). |
| 11 | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:844` (catch `:843`) | `reported` | **TRUE** | `this.store.listAnalyses()` calls `this.rpc.listAnalyses({ throwOnError: true })` (`analysis-step.store.ts:119-123`). On rejection, `:845` sets `savedError.set(true)` and returns before `:849`, rendering the `role="alert"` error message and `Retry` button at `:469-486`. |

---

## New findings

### 1. [Moderate] Unexpected proxy credential-check exceptions are collapsed into `not-signed-in` with no warning log

- **Severity**: Moderate (missing observability; does not invalidate the `reported` markers because callers and users still receive a typed `not-signed-in` refusal rather than a silent success)
- **File**: `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:773-776`, `:787-790`, `:800-803`
- **Scenario**: `hasProxyCredentials()` calls `copilotAuth.isAuthenticated()`/`tryRestoreAuth()`, `kimiCodeAuth.isAuthenticated()`, and `openRouterAuth.isAuthenticated()`. Normal signed-out state returns `false` without throwing. When one of these throws an exception instead (for example, OS keychain / secret-store decryption failure in `OpenRouterAuthService.isAuthenticated()` at `openrouter-auth.service.ts:51-54` or `KimiCodeAuthService.getStatus()` at `kimi-code-auth.service.ts:101-118`, filesystem `EACCES` on `~/.kimi/credentials`, or an unexpected refresh error in `CopilotAuthService.isAuthenticated()` at `copilot-auth.service.ts:567-580`), the `catch` blocks discard the error without logging and return `false`. Setup reports `not-signed-in` to the user, leaving zero log evidence distinguishing a broken secret store or I/O error from a genuinely signed-out account — inconsistent with the sibling catch in `buildSetupProfile` (`workspace-provider-profile-resolver.ts:647-655`) and `buildProfile` (`:893-905`), which both log via `this.logger.warn`.
- **Fix**: Bind `catch (error: unknown)` in the three blocks (`:773`, `:787`, `:800`) and log with the class's existing `this.logger` using the same secret-free shape as `:648-655`:
  ```ts
  this.logger.warn(
    '[WorkspaceProviderProfileResolver] Setup proxy credential check failed — treating as not-signed-in',
    { providerId, error: error instanceof Error ? error.name : 'unknown' },
  );
  ```
  (Non-blocking follow-up; keep the `// degradation-audit: reported` markers since `logger.warn` is not `.error()`.)

### 2. [Minor] Pre-existing Settings-navigation buttons remain rendered as no-ops when `resolveOptionalAppState` returns `null`

- **Severity**: Minor (pre-existing edge case; production hosts provide `AppStateManager` at root, as relied upon by `analyze-skills.page.ts:455` and `analyze-done.page.ts:58`)
- **File**: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:73-80`, `:215-229`, `:247-256`, `:773-791`
- **Scenario**: `AppStateManager` is `@Injectable({ providedIn: 'root' })` (`app-state.service.ts:344`), so `injector.get(AppStateManager, null)` only throws when instantiating `AppStateManager` fails (isolated tests like `analyze-workspace.render.spec.ts` where `SurfaceRouterService` dependencies are omitted, or a broken DI tree). In that state, analysis works, but the "Change in Settings" link (`:215-229`) and Settings-redirecting Setup recovery buttons (`:247-256`) still render and silently return on click (`:774`).
- **Fix**: Optional follow-up — expose `protected readonly canOpenSettings = this.appState !== null` and hide/disable Settings-only navigation buttons when `false` (leaving `issue.action === 'retry'` enabled).

---

## Five Logic Questions

1. **How does this fail silently?** None of the 11 suppressed sites produce a false success. The only dropped diagnostic is the exception type in `workspace-provider-profile-resolver.ts:773, 787, 800` (Finding 1), where the caller/user still gets a hard `not-signed-in` refusal.
2. **What user action produces unexpected behaviour?** If `resolveOptionalAppState` (`analyze-workspace.page.ts:73-80`) ever returned `null` in a real host, clicking "Change in Settings" or a non-retry Setup issue action would silently no-op (Finding 2). On all other 10 sites, user-visible alerts or caller rejections occur as expected.
3. **What input data makes this produce a wrong answer rather than an error?** Malformed JSON inside a ```` ```json ```` fence (`skill-json-extract.ts:35-42`) is intentionally skipped so a valid subsequent fence or `{...}` block can parse; if no candidate parses, `null` becomes `'invalid-output'` in both callers (`skill-draft-generation.service.ts:177-179`, `skill-judge.service.ts:620-625`).
4. **What happens when a dependency fails, times out, or returns a shape it should not?**
   - Auth services throwing -> `not-signed-in` (`workspace-provider-profile-resolver.ts:636-638`), unlogged (Finding 1).
   - Registry search failing/timing out -> `searchFailures` + `registryFailure` + `logger.warn` (`skill-recommendation.service.ts:442-446, 510-521, 541-552`).
   - Backend batch write rejecting out of order or listener throwing -> originating batch caller receives the rejection (`reactive-settings-store.ts:112, 125`), subsequent batches still run (`:111`).
   - Onboarding RPCs rejecting -> Setup fallback block (`analyze-skills.page.ts:637`), Setup read retry alert (`analyze-workspace.page.ts:763`), or saved analyses retry alert (`analyze-workspace.page.ts:845`).
5. **What is missing that the requirements never mentioned?** Safe `error.name` warning logs on the three `hasProxyCredentials` catch paths (Finding 1) to match `buildSetupProfile:648-655`.

---

## Scope Examined, Checks Run & Remaining Uncertainty

- **Scope examined (read in full)**: All 6 changed source files (`workspace-provider-profile-resolver.ts`, `skill-json-extract.ts`, `skill-recommendation.service.ts`, `reactive-settings-store.ts`, `analyze-skills.page.ts`, `analyze-workspace.page.ts`), `tools/degradation-audit/check-degradation.ts`, `tools/degradation-audit/baseline.json`, `.ptah/specs/TASK_2026_2325_899d/batch-fix-ci-audit-report.md`, `.ptah/specs/TASK_2026_2325_899d/decisions.md`, plus direct callers/callees (`workspace-llm-resolver.ts`, `copilot-auth.service.ts`, `kimi-code-auth.service.ts`, `openrouter-auth.service.ts`, `skill-draft-generation.service.ts`, `skill-judge.service.ts`, `workspace-scope-resolver.ts`, `app-state.service.ts`, `analysis-step.store.ts`, `workspace-provider-profile-resolver.spec.ts`, `analyze-workspace.page.spec.ts`, `analyze-workspace.render.spec.ts`).
- **Checks run**:
  - `git diff -- libs/backend libs/frontend/onboarding`: verified strictly 11 comment-only marker lines added across the 6 named files.
  - `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exited 0, `scanned 4744 file(s)`, `degradation-audit: TOTAL 0 unsuppressed site(s)`.
  - Per task rules, `npm run verify`, `nx`, builds, and e2e were not executed.
  - **Tool fallback note**: `ptah_code_search_symbols` returned an empty index (`symbolCount: 0`) and `ptah_lsp_references` resolved relative paths against the main repository rather than the `.claude-worktrees/skill-judge` worktree; native `git grep` was used in the worktree to verify all callers/implementations.
- **Remaining uncertainty**: Runtime tests/typechecks were not re-executed by this reviewer (scoped out by review rules), relying on the strictly comment-only `git diff` and the implementer's recorded `tsc`/`eslint` runs in `batch-fix-ci-audit-report.md`.
