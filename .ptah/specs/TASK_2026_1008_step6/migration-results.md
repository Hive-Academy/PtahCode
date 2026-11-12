# Migration results: STOPPED, no code changed

## Status
Blocker found. No file was changed, per instruction 5.

## Blocker 1: dependency boundary (attention-permission-actions)
- File: libs/frontend/core/src/lib/components/attention-permission-actions.component.ts:46
- Owner: `PtahInputDirective` (`input[ptahInput]`) in `@ptah-extension/ui`
  (libs/frontend/ui/src/lib/form-controls/input.directive.ts).
- `@ptah-extension/core` has tag `type:core`. eslint.config.mjs:394-395 allows `type:core`
  to depend only on `type:core` and `type:util`. `type:ui` is not allowed.
- `core` has no import of `@ptah-extension/ui` today. The reverse is also locked:
  `ui` must not import `core` (dependency-boundaries.spec.ts).
- The migration needs an owner change (new dependency edge or moving the component).
  This is outside the allowed scope.

## Note 2: wrong path in brief
- `libs/frontend/canvas-ui/...` does not exist. The file is
  libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts (project
  `@ptah-extension/canvas`). `canvas-ui` is not a project name, so
  `npm run verify -- -p canvas-ui,core,ui` would not match. Use `-p canvas,core,ui`.

## Canvas rename field: feasible, not done
- Line 419 uses `input input-sm input-bordered` plus custom classes (`bg-base-100`,
  `border-base-content/10`, focus outline in `--s`). `canvas` already imports `@ptah-extension/ui`.
- Migration would add `ptahInput size="sm"` and `PtahInputDirective` to `imports`.
  The owner sets height from `--ptah-control-h-sm` and the token look. The custom
  background, border and focus classes may conflict with the token look. A look check
  is needed. Not done because of the stop rule.

## Options for the coordinator
1. Migrate the canvas field only (confirm the look change is acceptable).
2. For the core component: add an eslint boundary exception, move the component to a
   `type:ui` or feature lib, or keep the raw input and exclude it from the token lock.

## Verification
Not run. No change was made.
