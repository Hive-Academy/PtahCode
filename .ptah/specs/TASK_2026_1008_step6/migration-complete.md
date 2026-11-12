# Migration result: ptahInput size sm

## 1. Canvas rename field: DONE (not committed)
File: `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts`
- Added `PtahInputDirective` to the `@ptah-extension/ui` import and to `imports`.
- Input now uses `ptahInput size="sm" class="mb-3 w-full"`.
- Removed `input input-sm input-bordered`, `bg-base-100`, `border-base-content/10`
  and the custom `focus-visible:outline*` classes. The owner supplies the look.
- Kept `#renameInput`, `aria-label`, `aria-describedby`, `maxLength`, `value`,
  `readOnly`, `(input)` and `(keydown.enter)`.
- RISK: the owner look may differ a little from the removed custom background,
  border and focus outline. No screenshot was taken. A visual check in Electron is needed.

## 2. Attention permission input: BLOCKED
File: `libs/frontend/core/src/lib/components/attention-permission-actions.component.ts`
- `libs/frontend/core` has tags `scope:webview`, `type:core`.
- `libs/frontend/ui` has tags `scope:webview`, `type:ui`.
- `eslint.config.mjs` (line ~394) allows `type:core` to depend only on
  `type:core` and `type:util`. An import of `@ptah-extension/ui` breaks the boundary rule.
- No file was changed. A decision is needed: move the owner to a `type:util`/`type:core`
  lib, move the component out of core (for example to `chat-ui`), or accept an exception.

## Verification
`npm run verify -- -p canvas,ui`
- lint and typecheck: pass (canvas typecheck ran, 53.8 s).
- test: FAIL for every canvas suite with "Could not locate module marked" at
  `node_modules/marked/lib/marked.umd.js`. This is an environment problem in the
  worktree, not caused by this change. `core` was not run because it has no change.
