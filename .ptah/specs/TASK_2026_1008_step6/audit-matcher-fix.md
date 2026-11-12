# Audit matcher fix: input-preview-block

## Fix (option 1, matcher tightened)
- `tools/ui-class-audit/check-ui-classes.ts`: for the `input` root, a token `input-<modifier>` is
  now blocked only when `<modifier>` is in `DAISY_INPUT_MODIFIERS`
  (accent, bordered, error, ghost, group, info, lg, md, neutral, primary, secondary, sm, success,
  warning, xl, xs). `input-group` stays blocked by the documented decision.
- `input-preview-block` (custom class, not DaisyUI) is no longer blocked.
- `tools/ui-class-audit/baseline.json`: removed the stale entry for
  `tool-input-display.component.ts`.
- `check-ui-classes.spec.ts`: added a test for `input-preview-block` (not blocked) and for
  `input-info`/`input-xs` (blocked).
- Doc comment of the matching rule updated.

## Verification
`npm run verify -- -p ui-class-audit` (lint, typecheck, test): all passed, exit code 0.
(The `ui-class-audit:lint` target is covered by this run.)
No commit or push was made.
