# Phase 1 fix round 1 report (TASK_2026_2285_304a)

Status: done. Items 1-7 are fixed. No commit, push, stash, restore, checkout or reset was done. No `nx` or `npm run verify` run.

## Fix 1 — size() write has a per-compute liveness check

- `libs/frontend/ui/src/lib/native/shared/floating-ui.service.ts`:
  - :178 `middlewareFor(live)` builds the middleware list for one compute. The order, the options and the
    non-capped path are the same as before.
  - :204 the `size()` `apply` returns early when `!live()`.
  - :220 `configFor(live)` builds the config. The first compute (:228) uses `() => this.isCurrent(request)`. Each
    auto-update compute (:246) uses its own `live` (`isCurrent(request) && seq === this.updateSeq`).
- `libs/frontend/ui/src/lib/native/shared/floating-ui.service.spec.ts`, `describe('capHeight')`, NEW tests:
  - (a) "drops the size() write of an older overlapping update": two overlapping updates. The newer `apply` writes
    300px. The older `apply` and its late result run after it. Result: one write only (`...300px)`), and `top` is
    `404px` (the newer point).
  - (b) "writes nothing from an apply that runs after cleanup()": the first compute and an update compute run
    `apply` after `cleanup()`. Result: no write.
  - Extra: "writes nothing from the first compute when cleanup() runs while it measures".

## Fix 2 — one max-width in shell

- `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts`:
  - :77 NEW `SHELL_SIZE_WIDTHS` (sm `24rem`, md `32rem`, lg `42rem`, the values of `max-w-sm`, `max-w-lg` and
    `max-w-2xl`).
  - :95 the shell box class is now `max-w-[min(var(--ptah-modal-size),calc(100vw-2rem))]`. It replaces
    `max-w-[calc(100vw-2rem)]`.
  - :117 `[style.--ptah-modal-size]="shellWidth()"` on the box.
  - :218 `boxClass()` returns only the shell classes in `shell`, and only the size class in `plain`.
  - :225 `shellWidth()` returns `null` in `plain`, so the plain box gets no style attribute.
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts`:
  - The shell class test no longer expects `max-w-lg` or `max-w-[calc(100vw-2rem)]`.
  - The plain default test also asserts that there is no `style` attribute.
  - NEW test, shell: for sm, md and lg, the only `max-w-*` class is the single utility, and `--ptah-modal-size` is
    24rem, 32rem or 42rem.
  - NEW test, plain: for sm, md and lg, the class is exactly `modal-box max-w-sm|lg|2xl`, with no variable.

## Fix 3 — barrel export

- `libs/frontend/ui/src/lib/native/modal/index.ts:10`: `export type { NativeModalLayout, NativeModalSize } from './native-modal.component';`.
- No other barrel in `libs/frontend/ui/src` lists `NativeModalSize` by name (a search found only `modal/index.ts`),
  so I did not change a parent barrel.

## Fix 4 — capToViewport documentation

- `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:212`: one new JSDoc sentence: "The value is read
  when the panel opens; a change while the panel is open applies at the next open." There is no code change.

## Fix 5 — New session popover opt-out

- `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:243`: `[capToViewport]="false"` on the
  popover with `[isOpen]="sessionNamePopoverOpen()"`. There is no other change.

## Fix 6 — Session actions menu opt-out

- `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:274`: `[capToViewport]="false"` on the
  popover with `[isOpen]="menuOpen()"`. The rename popover above it is unchanged.

## Fix 7 — styles.css rule removed

- `apps/ptah-extension-webview/src/styles.css`: I removed the comment and the `.settings-page [data-glass-surface='content']`
  rule with an edit (no git command). `git diff --stat -- apps/ptah-extension-webview/src/styles.css` has no output, so
  the file is the same as HEAD. The tokens and the token spec are unchanged.

## Checks

- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/native/shared/floating-ui.service.spec.ts libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts`
  — exit 0 (3 suites, 98 tests passed).
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` — exit 0.
- `npx eslint` on floating-ui.service.ts, its spec, native-modal.component.ts, its spec, modal/index.ts,
  native-popover.component.ts, app-shell.component.html and canvas-rail-card.component.ts — exit 0. There are no
  errors. There is 1 warning: `canvas-rail-card.component.ts` `max-lines` (747 > 700). That warning existed before:
  the file had 790 lines at HEAD, and this fix adds 1 line.
- I did not run the app-shell or canvas-rail-card specs. They are not in the brief's check list. Neither spec
  references `capToViewport`, because the input is new.

## Not done

- No Electron visual check (a lane cannot run the app). The coordinator should confirm that the New Session card shadow
  and the Session actions handoff result are no longer clipped.

## Decisions

- Barrel line style: I put `NativeModalLayout` on the existing `export type { ... }` line, not on a second line. Options:
  one line or two lines. Evidence: the file has one type-export line from the same module. Reversible.
- Shell width fallback: `shellWidth()` falls back to the `md` width for an unknown size, the same as the `plain` code
  path falls back to `''`. Reversible.
- Fix 1 test (a): the mocks of `computePosition` do not run middleware. So the test calls each compute's own `apply`
  (taken from that compute's `size()` call) in the order that a real overlap gives: the newer one first, then the
  older one late. This tests the liveness rule directly.
