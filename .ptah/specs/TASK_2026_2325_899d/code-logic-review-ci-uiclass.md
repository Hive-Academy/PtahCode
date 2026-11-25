# Code Logic Review — `TASK_2026_2325_899d` (PR #1514 CI `ui-class-audit` fix, D47)

## Verdict: APPROVED  Score: 8/10

- **Assessment:** APPROVED (0 blocking, 0 serious, 0 moderate, 0 minor findings)
- **Confidence:** HIGH
- **Score justification:** Scores **8/10** (sound) rather than **6/10** because every changed line across all 8 files in `git diff -- libs` was read in full and proven behavior- and style-equivalent: exact class-set parity for both new `SetupActionDirective` looks, 0 px delta across all four spacing token substitutions, verified DaisyUI `.card-actions` override coverage, intact D45 collapsed-details handling, zero diagnostics on all 7 changed `.ts` files, `0` over baseline in `ui-class-audit`, and 54/54 passing focused Jest tests. Kept below **9/10** because visual equivalence is verified statically (no live Electron render in this focused CI check) and `setup-action.directive.spec.ts` covers static rendering of each look without a `primaryFull` -> `plainFull` reverse-transition assertion.

---

## Checks 1–5

### Check 1 — `libs/frontend/ui/src/lib/extracted/setup-action/`
- **PASS.**
- `SetupActionLook` (`libs/frontend/ui/src/lib/extracted/setup-action/setup-action.look.ts:4-10`) keeps all four existing looks (`primaryCompact`, `primaryFull`, `ghost`, `glass`) and default token factory `'primaryCompact'` (`setup-action.look.ts:12-19`) untouched, adding only `'plainFull'` (line 7) and `'ghostLink'` (line 9).
- `LOOK_CLASSES` (`libs/frontend/ui/src/lib/extracted/setup-action/setup-action.directive.ts:4-12`) keeps all four existing class strings unchanged and adds:
  - `plainFull: 'btn mt-4'` (`setup-action.directive.ts:7`) — exact match for the former Start analysis classes when `!setupReady()` (`analyze-workspace.page.ts:444-445` prior to diff).
  - `ghostLink: 'btn btn-ghost btn-sm px-2 text-xs font-medium text-base-content underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content'` (`setup-action.directive.ts:9-10`) — character-for-character match for `ACTION` in `provider-consumer-assignments.component.ts:62-64`.
- `SetupActionDirective` (`setup-action.directive.ts:15-28`) binds only `[class]` and `[attr.aria-busy]` on `button[ptahSetupAction]`; it does not add `data-ptah-button` or alter native `type`, `disabled`, or click handling.
- Tailwind scanning verified: `apps/ptah-extension-webview/tailwind.config.js` and `apps/ptah-landing-page/tailwind.config.js` include `createGlobPatternsForDependencies(__dirname)` covering `libs/frontend/ui/src/**/*.ts`, and PostCSS/Tailwind compilation confirmed every utility class in `plainFull`, `primaryFull`, and `ghostLink` is generated.
- Spec updated (`libs/frontend/ui/src/lib/extracted/setup-action/setup-action.directive.spec.ts:17-18,30-47`): exercises both `[ptahSetupAction]="'plainFull'"` (with `disabled`) and static attribute `ptahSetupAction="ghostLink"`, asserts order-independent exact class token sets for all 7 buttons (`lines 39-41`), and asserts `buttons[5].disabled === true` (`line 47`). Passes (1/1).

### Check 2 — `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
- **PASS.**
- `analyze-workspace.page.ts:444-456` replaces `class="btn mt-4" [class.btn-primary]="setupReady()"` with `[ptahSetupAction]="setupReady() ? 'primaryFull' : 'plainFull'"` (`line 446`).
- When `setupReady()` is `true`, `LOOK_CLASSES['primaryFull']` applies `btn btn-primary mt-4` and `[disabled]="!setupReady()"` (`line 447`) is `false`. When `setupReady()` is `false`, `LOOK_CLASSES['plainFull']` applies `btn mt-4` (no `btn-primary`) and `[disabled]` is `true`.
- `data-testid="start-analysis-button"` (`line 448`), `(click)="startFresh()"` (`line 449`), icon (`lines 451-455`), and copy (`Start analysis`) are unchanged.
- No other buttons in `analyze-workspace.page.ts` were altered (`Continue previous run` at `line 411`, `Start fresh` at `line 419`, `Retry` at `line 480`, `Use` at `line 501`, and `Hide from list` at `line 508` already used `ptahSetupAction`).
- `analyze-workspace.page.spec.ts:443-473` (`only gives Start the primary treatment when Setup is ready`) still asserts `start?.disabled === true` / `classList.contains('btn-primary') === false` when invalid and `false` / `true` after recovery. Passes within the 27/27 onboarding Jest run.

### Check 3 — `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.{html,ts,spec.ts}`
- **PASS.**
- All three hooks were renamed consistently across template, component styles, and spec, with zero remaining references to `.card-name`, `.card-details`, or `.card-actions` anywhere in `libs/frontend/onboarding/`, `apps/`, or `e2e/`:
  - `card-name` -> `skill-card-name`: `skill-pick-card.component.html:22`, `skill-pick-card.component.ts:33`.
  - `card-details` -> `skill-card-details`: `skill-pick-card.component.html:92`, `skill-pick-card.component.ts:54`, `skill-pick-card.component.spec.ts:169`.
  - `card-actions` -> `skill-card-actions`: `skill-pick-card.component.html:109`, `skill-pick-card.component.ts:41,49` (both `.skill-card-actions` and `.skill-card-actions > button`).
- D45 collapsed-details fix remains intact (`skill-pick-card.component.html:88-93`): `[hidden]="!detailsExpanded()"` (`line 90`), `[class.flex]="detailsExpanded()"` (`line 91`), `class="skill-card-details flex-col gap-1.5 text-xs"` (`line 92`). `.skill-card-details` (`skill-pick-card.component.ts:54-59`) declares no `display` property, so `[hidden]` is never overridden when collapsed. Asserted in `skill-pick-card.component.spec.ts:131-154`.
- DaisyUI `.card-actions` impact verified against `node_modules/daisyui/dist/full.css:2774` and `dist/styled.css`: DaisyUI defines only one `.card-actions` rule (`display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.5rem`) and no `.card-name` or `.card-details` rules. Every property of DaisyUI `.card-actions` is explicitly set by the higher-specificity scoped `.skill-card-actions` rule (`skill-pick-card.component.ts:41-48`: `display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--ptah-space-2); min-width: 0;`), where `--ptah-space-2` is `0.5rem` (`libs/frontend/ui/src/lib/tokens/ptah-tokens.css:12`). No lost styling.

### Check 4 — `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts`
- **PASS.**
- `SetupActionDirective` imported from `@ptah-extension/ui` (`line 32`) and added to `@Component.imports` (`line 87`).
- Dynamic `[class]="action"` replacements (5 Setup buttons, none carrying any other `class`, `[class.*]`, or `ptahSetupActionBusy` binding):
  - `line 365` (`data-testid="readiness-setup-setup"`), `line 377` (`Retry loading Setup`), `line 387` (`Choose a provider` / `Choose a model`), `line 398` (`data-testid="setup-use-workspace"`), `line 425` (`data-testid="setup-undo"`).
  - Previously bound to immutable `protected readonly action = ACTION` (`lines 62-64, 682`); now bound to `ptahSetupAction="ghostLink"`, which resolves to the exact same 14 classes in every enabled/disabled/focus state. Remaining 8 dynamic class bindings (`lines 171, 200, 292, 466, 503, 511, 537, 594`) stay at baseline (8/8) and keep `ACTION` used.
- Spacing token substitutions (verified against `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:11-12,22` with `1rem = 16px`, no responsive/theme overrides for these tokens, and PostCSS/Tailwind utility emission verified):

| Location (`provider-consumer-assignments.component.ts`) | Old class | Old size | New class | Generated CSS | New size | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| `lines 307, 338` | `px-1` | `0.25rem` (`4px`) | `px-[var(--ptah-space-1)]` | `padding-left/right: var(--ptah-space-1)` | `0.25rem` (`4px`) | `0px` |
| `line 313` | `gap-2` | `0.5rem` (`8px`) | `gap-[var(--ptah-gap-controls)]` | `gap: var(--ptah-gap-controls)` (`var(--ptah-space-2)`) | `0.5rem` (`8px`) | `0px` |
| `lines 356, 414` | `gap-1.5` | `0.375rem` (`6px`) | `gap-[calc(var(--ptah-space-1)*1.5)]` | `gap: calc(var(--ptah-space-1) * 1.5)` | `0.375rem` (`6px`) | `0px` |
| `lines 356, 414` | `p-2` | `0.5rem` (`8px`) | `p-[var(--ptah-space-2)]` | `padding: var(--ptah-space-2)` | `0.5rem` (`8px`) | `0px` |

### Check 5 — `data-testid`, `aria-*` attributes, and copy
- **PASS.**
- Line-by-line diff audit confirmed zero changes to any `data-testid`, `aria-*`, `role`, `[attr.role]`, `[disabled]`, `(click)`, or user-visible text copy across all 8 files:
  - `provider-consumer-assignments.component.ts:307-435`: `setup-commit-feedback`, `setup-model-issue`, `readiness-setup-setup`, `setup-use-workspace`, `setup-undo`, `aria-label="Undo Setup model change"`, `[attr.role]`, and all copy untouched.
  - `analyze-workspace.page.ts:444-456`: `start-analysis-button`, `[disabled]="!setupReady()"`, `aria-hidden="true"`, and `Start analysis` untouched.
  - `skill-pick-card.component.html:19-144`: all `aria-label`, `aria-describedby`, `aria-expanded`, `aria-controls`, `aria-hidden`, `[hidden]`, and copy untouched.

---

## Five logic questions

1. **How does this fail silently?** No silent failure path introduced. If a future caller passed an invalid look string via an untyped template bypass, `LOOK_CLASSES[key]` in `setup-action.directive.ts:27` would yield `undefined` and strip classes without throwing, but Angular strict template checks enforce `SetupActionLook | undefined` at compile time (`setup-action.directive.ts:25`, `setup-action.look.ts:4-10`).
2. **What user action produces unexpected behaviour?** None identified. Toggling `setupReady()` (`analyze-workspace.page.ts:446-447`), clicking Setup recovery/undo actions (`provider-consumer-assignments.component.ts:365-425`), and expanding/collapsing compact skill card details (`skill-pick-card.component.html:88-124`) retain identical DOM handlers, native `disabled` gating, and `[hidden]` behavior.
3. **What input data produces a wrong answer?** None identified. Static string binding `ptahSetupAction="ghostLink"` (`provider-consumer-assignments.component.ts:365,377,387,398,425`) and ternary `setupReady() ? 'primaryFull' : 'plainFull'` (`analyze-workspace.page.ts:446`) both map to total keys in `LOOK_CLASSES`.
4. **What happens when a dependency fails?** No new runtime/RPC dependency added. If `ptah-tokens.css` were ever omitted, arbitrary spacing utilities (`px-[var(--ptah-space-1)]`, `gap-[calc(var(--ptah-space-1)*1.5)]`, `p-[var(--ptah-space-2)]`, `gap-[var(--ptah-gap-controls)]`) would fall back to unset/0, same as every other `--ptah-*` token consumer in the app (`ptah-tokens.css` is loaded globally).
5. **What is missing that the requirements never mentioned?** Nothing blocking. For completeness, `setup-action.directive.spec.ts` only checks initial static rendering (not dynamic `primaryFull` <-> `plainFull` look switching, though `plainFull` -> `primaryFull` is exercised by `analyze-workspace.page.spec.ts:443-473`).

---

## Verification Evidence

- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: **exited 0**
  - `ui-class-audit: TOTAL 842 blocked token(s) across 213 file(s); 0 token count(s) over baseline`
  - `ui-class-audit [raw-spacing]: TOTAL 514 blocked token(s) across 36 file(s); 0 token count(s) over baseline`
- Focused Jest (`--runInBand --coverage=false --runTestsByPath`):
  - `libs/frontend/ui/jest.config.ts` (`setup-action.directive.spec.ts`): **1/1 passed**
  - `libs/frontend/onboarding/jest.config.ts` (`skill-pick-card.component.spec.ts`, `analyze-workspace.page.spec.ts`): **27/27 passed**
  - `libs/frontend/chat/jest.config.ts` (`provider-consumer-assignments.component.spec.ts`): **26/26 passed**
- `ptah_get_diagnostics` scoped to all 7 changed `.ts` files: **0 diagnostics** in requested files (`coverage: clean`).
- Tailwind CSS utility emission verified via installed `tailwindcss` + `apps/ptah-extension-webview/tailwind.config.js` (`gap-[calc(var(--ptah-space-1)*1.5)]` emits valid `gap: calc(var(--ptah-space-1) * 1.5)`).
- **Residual uncertainty:** Visual parity is proved statically from class lists, token definitions, and generated CSS; no live Electron render was executed (per task rules).

---

## New findings

None.
