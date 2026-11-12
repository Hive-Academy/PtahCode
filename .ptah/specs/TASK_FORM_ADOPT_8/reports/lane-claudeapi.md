# Lane report: form adoption PR 8 (claudeapi)

No verify, build, lint, test, commit or push was run.

## Files changed and DOM delta
- inline-agent-bubble.component.ts: `textarea textarea-bordered textarea-xs` -> `ptahTextarea size="xs"`.
  Removed `[class.textarea-disabled]`. Import `PtahTextareaDirective` added.
- command-pending-input.component.ts: `input ... border/outline overrides` -> `ptahInput size="md"`,
  kept `mt-1 min-h-11 w-full`. Import `PtahInputDirective` added. Label kept as is (stacked).
- apps-page.component.ts: composer `textarea textarea-bordered` -> `ptahTextarea size="md"`.
  Import `PtahTextareaDirective` added.
- guidance-result-panel.component.ts: `toggle toggle-primary` + outline classes -> `ptahToggle`.
  Wrapper `label` class replaced with `flex cursor-pointer items-center justify-start gap-2`.
  Import `PtahToggleDirective` added.
- workspace-indexing.component.html: 2 toggles `toggle toggle-xs toggle-primary` -> `ptahToggle size="xs"`.
  `workspace-indexing.component.ts`: `PtahToggleDirective` added to `imports` only.

## Left raw
- command-session-controls.component.ts `#command-text`: it has only `input-sm` and sits in a
  custom bordered form wrapper with a transparent background. The owner `ptahInput` adds its own
  border and fill, and there is no borderless variant. Left raw.

## Spec updated
- libs/frontend/command-center/src/lib/components/command-pending-input.component.spec.ts: two tests
  asserted the removed look classes (`!border-base-content/70`, `/50`, placeholder, focus outline).
  They now assert `data-ptah-control="input"` (and `input-md`).
- No spec uses `overrideComponent ... set: { imports }` for these components.

## Note
`apps-page` composer and the subagent send textarea are chat-style; converted as plain textareas.
Revert them if the coordinator treats them as composers.
