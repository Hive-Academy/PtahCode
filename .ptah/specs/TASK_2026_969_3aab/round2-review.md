# Round 2 independent review

Verdict: APPROVE

## Findings

### Minor — unconfirmed: rendered contrast and clipping

- `libs/frontend/ui/src/lib/form-controls/ptah-field.css:250`, `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css:230`, `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-look.spec.ts:179`: The tests inspect CSS text and DOM, not computed colors or layout. This read-only review cannot confirm 3:1 focus contrast, AA panel text contrast, or panel clipping in every dark theme and ptah-glass-light. Exact fix: in the separate visual check, measure computed focus edge and panel text/background contrast in those themes, and open the select inside a clipped or transformed ancestor; correct the owner token or overlay placement if a check fails.

## Review evidence

- The field reset removes the inner border, outline and shadow on mouse and keyboard focus (`ptah-field.css:172-176`). The box has one inset focus edge with unchanged border width (`ptah-field.css:250-254`). Its selector has higher specificity than the glass control focus rule (`styles.css:3365-3370`).
- The action group is outside the trigger button; clear then chevron has stable order and the group stays at the inline end (`rich-select.template.ts:30-48`, `ptah-select.css:140-175`). There is no button inside a button. The clear button alone accepts pointer events. Focus order remains trigger then clear.
- The new default `size='sm'` has a 32 px trigger height (`rich-select.component.ts:93`, `ptah-select.css:31-32`). HEAD already set `min-height: var(--ptah-control-h-sm)`; current `ptah-select` usages in `libs/` are inside `ptah-field`, where the field reset sets trigger height to auto. No existing consumer height regression was found. Gallery changes stay under `apps/ptah-extension-webview/src/app/ui-gallery/`.
- The panel uses `--surface-3`, defined once on the root as a mix of opaque theme base colors (`styles.css:170`). It does not depend on glass mode. `FloatingUIService` writes `position: fixed` and computes with `strategy: 'fixed'` (`floating-ui.service.ts:180-182`); the CSS now agrees with it. A transformed, clipped ancestor still needs the visual check above.
- The changed owner selectors fit `design-tokens.spec.ts:134-136`; new CSS values use `--ptah-*` tokens. No new ad hoc classes, `any`, or `ts-ignore` appeared in the diff. The look specs cover structure, token references, size and automatic search, but cannot prove the rendered metrics.

No verify, build, browser or Electron command was run, as requested. Local skill discovery returned no installed review skill.
