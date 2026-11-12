# Audit report: form adoption step 6 (removal and lock)

Worktree: chore-ui-form-step6-removal. Nothing was edited, committed or pushed.
`npm run verify -- -p ui,ptah-extension-webview` was NOT run (audit only, no change to verify).

## 1. Baseline status

Command: `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`
(the `lint` target of `ui-class-audit`). Exit code 0.

Result: `TOTAL 1522 blocked token(s) across 292 file(s); 0 token count(s) over baseline`.

- Status: MATCHES for the ratchet rule. No file is over baseline.
- The tool prints no "under baseline" delta. I did not run `update-baseline`, so
  I could not measure whether any baseline entry is now too high (stale).
  Run `update-baseline` in a scratch copy and `git diff` to check this.
- The audit excludes `libs/frontend/ui/**`. `libs/frontend/ui` raw classes are not ratcheted.

## 2. Form tokens still in baseline (exceptions to preserve)

Blocked roots for forms: `checkbox`, `input`, `select`, `textarea`, `toggle`, `form-control`, `label`.
`radio` is NOT a blocked root, so the radio exception is not in the baseline.

| File | Tokens | Exception |
|---|---|---|
| tasks-ui `board/task-card.component.ts` | `checkbox` | 24 px task-card checkbox |
| command-center `command-session-controls.component.ts` | `input-sm` | Borderless command text |
| chat `ptah-ai/copilot-auto-approve-toggle.component.ts` | `toggle toggle-success toggle-xs` | Success-tone toggle |
| chat `ptah-ai/host-routing-setting.component.ts` | same | Success-tone toggle |
| chat `ptah-ai/lane-rotation-setting.component.ts` | same | Success-tone toggle |
| review-runs-ui `review-settings-drawer.component.html` | `toggle toggle-warning` | Warning toggle |
| chat-ui `molecules/question-card.component.ts` | `checkbox checkbox-info checkbox-xs`, `input input-bordered input-info input-xs` | Question-card info variants |
| declarative-dashboard `surface-choice-input.component.ts:79` | `<input type="radio" class="radio radio-sm">` (not audited) | Radio group |

Other form tokens in baseline that are NOT in your exception list (confirm with owner):
- canvas `canvas-rail/canvas-rail-card.component.ts:419`: `input input-sm input-bordered` (rename field).
- core `components/attention-permission-actions.component.ts`: `input input-bordered input-sm`.
- chat-ui `tool-execution/tool-input-display.component.ts`: `input-preview-block`. This is a
  false positive of the `input-` prefix rule (a custom class). Rename it or accept it.

Totals of form tokens in baseline: input 3, input-bordered 3, input-sm 3, input-xs 1, input-info 1,
input-preview-block 1, checkbox 2, checkbox-info 1, checkbox-xs 1, toggle 4, toggle-success 3,
toggle-xs 3, toggle-warning 1. There are no `select`, `textarea` or `form-control` entries.

## 3. Dead helpers

### 3a. TypeScript exports in `libs/frontend/ui/src/lib/form-controls`

Method: word-boundary search over `libs` and `apps` (non-spec files). `ptah_lsp_references`
was not used: a name-based search gave the same answer for these unique names.

No export is dead. Each export has a consumer inside the module or the app:

| Export | Consumers |
|---|---|
| `bindAccessibleLabel` | `choice-control.base.ts`, `text-control.base.ts` |
| `normalizeText`, `matchesQuery` | used inside `rich-select-list.ts` only (internal) |
| `buildGroups`, `flatItems`, `moveActive`, `typeAheadIndex`, `ActiveMove` | `rich-select.component.ts` |
| `RICH_SELECT_TEMPLATE` | `rich-select.component.ts` |
| `PTAH_SELECT_SEARCH_MIN_OPTIONS` | `rich-select.component.ts` and `rich-select-look.spec.ts` (public via index) |
| `PtahControlSize`, `PtahTextTone`, `PtahChoiceSize` | base classes, rich-select, gallery |
| `PtahSelectIconContext/Item/Group` | `rich-select-icon.directive.ts`, `rich-select-list.ts` |

Notes:
- `marketplace/.../provider-list-view.component.ts` has a private `moveActive` method. It is unrelated.
- `normalizeText` and `matchesQuery` are `export`ed but only used in their own file. They are
  not re-exported by `index.ts`. They are low-risk candidates to drop the `export`
  keyword (check `rich-select-list.spec.ts` first, which may import them).

### 3b. Raw form CSS with no consumer (`apps/ptah-extension-webview/src/styles.css`)

| Rule | Evidence | Verdict |
|---|---|---|
| `.toggle-sm { width:32px; height:16px }` (~line 2252) | Only consumer is `PtahToggleDirective` (`toggle.directive.ts:20`, class binding `toggle-sm`). | KEEP unless the directive stops binding it |
| `.input, .textarea { min-height: var(--input-height) ... }` and `.textarea` padding (~2162-2170) | Raw `input`/`textarea` classes still exist in the exceptions above (canvas rename, attention-permission, question-card, command-session). | KEEP until those are migrated |
| `--input-height: 32px` (line 97) | Only used by the rule above. | KEEP with that rule |
| `.input, .textarea, .select` colors and placeholders (~2581-2590) | Raw `.select` still used in `libs/frontend/ui/.../json-schema-form.component.ts:75` and `provider-model-picker.component.ts:206,251` (not audited). | KEEP |
| `:where(ptah-settings) :is(.checkbox,.radio,.toggle):focus-visible` (~456) | Raw checkbox/toggle/radio classes still used. | KEEP |

Conclusion: no CSS rule is fully dead today. Each rule has a live raw-class consumer.

## 4. Recommendation

1. Do not remove any TypeScript helper from `form-controls`. No dead export exists.
2. Optional cleanup: remove `export` from `normalizeText` and `matchesQuery` in
   `rich-select-list.ts` after you confirm that no spec imports them.
3. Do not edit `styles.css` raw form rules in this step. The exceptions in section 2 and the
   `libs/frontend/ui` raw `select` users still consume them.
4. To "lock the form tokens in the ratchet": run `update-baseline` once, review the diff
   (expect only decreases), and commit the new `baseline.json`. Decide if the three extra
   inputs (canvas rename, attention-permission, `input-preview-block`) are accepted
   exceptions or migrate to `ptahInput`.
5. If you want the `radio` root locked, add `'radio'` to `BLOCKED_ROOTS` in
   `tools/ui-class-audit/check-ui-classes.ts` and re-seed the baseline. The surface-choice-input
   radio then becomes a baseline entry. Also check `check-ui-classes.spec.ts`.
6. Files to touch if you proceed: `tools/ui-class-audit/baseline.json`,
   optionally `check-ui-classes.ts` (+spec) and `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-list.ts`.

## Summary

- Audit passes: 1522 tokens, 292 files, 0 over baseline.
- 8 accepted exceptions confirmed in source. 3 extra form-token entries need an owner decision.
- 0 dead helpers and 0 dead CSS rules found. Removal scope is minimal.
- Verification command not run: no code changed.
