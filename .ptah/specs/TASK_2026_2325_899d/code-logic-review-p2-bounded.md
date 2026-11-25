# P2 code-logic review — bounded D45 follow-up

Reviewer family: antigravity (CLI lane). Implementer family: claude (coordinator, commit `aa7fe624f`).

## Verdict: APPROVED  Score: 8/10

Score rationale: Both Minor findings from `code-logic-review-p2-D45.md` are cleanly resolved in commit `aa7fe624f` with sound type narrowing across all four `SetupPairState` variants, identical button sizing/focus semantics in `SetupActionDirective`, zero new defects, 18/18 tests passing in `analyze-workspace.page.spec.ts`, and 0 TypeScript errors in `libs/frontend/onboarding/tsconfig.lib.json` (clearly above 5–6). Held at 8/10 rather than 9–10 because live Electron visual/focus rendering of the interrupted `Continue previous run` CTA in `ptah-glass` / `ptah-glass-light` remains outside this read-only lane's verification scope, and the `unavailable` (`source: 'workspace'`) branch is verified via static narrowing rather than a dedicated row in the `it.each` spec table.

## Finding status

| # | Severity | Original finding (D45) | Status | Evidence (`file:line`) |
| --- | --- | --- | --- | --- |
| 1 | Minor | Sibling `Continue previous run` CTA still renders with primary styling while disabled | Fixed | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:408-415` switches `[ptahSetupAction]` to `setupReady() ? 'primaryCompact' : 'ghost'` alongside `[disabled]="!setupReady()"` with no competing static `class` attribute. `libs/frontend/ui/src/lib/extracted/setup-action/setup-action.directive.ts:4-9,15-18,24` maps `'primaryCompact'` to `'btn btn-primary btn-sm'` and `'ghost'` to `'btn btn-sm'` (not `.btn-ghost`), preserving `btn-sm` sizing/alignment with the sibling `Start fresh` button (`analyze-workspace.page.ts:416-423`) while dropping `.btn-primary` so `:root[data-theme^='ptah-glass'][data-glass='on'] .btn-primary` (`apps/ptah-extension-webview/src/styles.css:3538`) no longer overrides `:root[data-glass='on'] .btn:is(:disabled, [disabled], .btn-disabled)` (`styles.css:3386`). Native `disabled` keeps the button out of tab order while blocked; when `setupReady()` turns `true`, `.btn-primary` and its `:focus-visible` rule (`styles.css:3546-3547`) return cleanly on the same element. No other disabled CTA on the page retains `.btn-primary` (`analyze-workspace.page.ts:214-300,408-512`). Regression covered on the same DOM button across disabled -> ready recovery at `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts:475-505`. |
| 2 | Minor | `setupActionError` stays stuck if Settings clears Setup onto an invalid or unavailable workspace model | Fixed | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:742-755` clears `this.setupActionError.set(null)` when `state.kind === 'set' || state.kind === 'unset' || state.source === 'workspace'`. Against `SetupPairState` (`libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts:9-31`), short-circuiting on `'set'` and `'unset'` narrows `state` exclusively to `'invalid' \| 'unavailable'`, both of which define `source: 'setup' \| 'workspace'`; thus `state.source === 'workspace'` is type-safe and covers both `invalid` and `unavailable` workspace-sourced states. Because `useWorkspaceModel()` (`analyze-workspace.page.ts:791-830`) is the sole writer of `setupActionError`, the clear predicate is the exact boolean complement of `describeSetupIssue(state)?.canUseWorkspace === true` (`:81-92`), clearing the stale `"Use workspace model"` write error once Setup already follows the workspace model while still preserving it when a queued or focus-triggered refresh returns an unchanged `source: 'setup'` (`invalid` or `unavailable`) state. Regression covered for `set`, `unset`, and `invalid` (`source: 'workspace'`) Settings recovery (asserting the workspace alert remains visible and `setup-model-use-workspace` is absent while `setupActionError` clears) at `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts:382-441`, alongside unchanged `source: 'setup'` failure preservation at `:320-380`. |

## New findings

None.

**Audit scope and checks run:**
- Inspected commit `aa7fe624f` (`git show aa7fe624f`) in full (2 files: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` and `analyze-workspace.page.spec.ts`), plus full surrounding files (`analyze-workspace.page.ts`, `analyze-workspace.page.spec.ts`, `analyze-workspace.render.spec.ts`, `libs/frontend/ui/src/lib/extracted/setup-action/setup-action.directive.ts`, `setup-action.look.ts`, `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts`, and `apps/ptah-extension-webview/src/styles.css:3310-3565`).
- Tool fallbacks noted: `ptah_code_search_symbols` returned 0 hits (`symbolCount: 0`, empty index), so `grep -rn` was used to locate `SetupPairState`; `ptah_get_diagnostics` timed out after 45s twice ("TypeScript check still running after 45s"), so scoped `tsc --noEmit` was used directly.
- Verified focused Jest suite passed:
  - `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts` — 1 suite passed, 18/18 tests passed.
- Verified scoped TypeScript typecheck passed with 0 errors:
  - `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` — exit 0.

**Remaining uncertainty:**
- Live Electron rendering and `:focus-visible` ring behavior for `Continue previous run` across `ptah-glass` and `ptah-glass-light` were verified via CSS selector/specificity inspection and JSDOM class/disabled assertions rather than a live Electron screenshot.
- `analyze-workspace.page.spec.ts:382-441` exercises `invalid` (`source: 'workspace'`) but not `unavailable` (`source: 'workspace'`), though both share the identical `state.source === 'workspace'` branch at `analyze-workspace.page.ts:751`. (Cosmetic note: the `it.each` label `with $kind Setup ($source)` prints literal `($source)` for `set`/`unset`, which have no `source` field.)

## Not checked

- Live Electron rendering / visual capture of `Continue previous run` in disabled and enabled states.
- `tsconfig.spec.json`, ESLint, other Jest specs outside `analyze-workspace.page.spec.ts`, workspace-wide `npm run verify`, `nx`, builds, and e2e suites (out of bounded review scope).
