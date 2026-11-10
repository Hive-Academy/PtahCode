# Design preview — notes and next steps (TASK_2026_902)

## How to make the captures again

1. Build the Electron app (heavy, run it under the lock):
   `node scripts/verify.mjs --exec --task findings-preview -- npx nx run-many -t build-dev,copy-renderer-dev -p ptah-electron`
2. Capture (from `apps/ptah-electron-e2e`):
   `PTAH_PREVIEW_OUT="$(pwd)/../../dist/apps/ptah-electron-e2e/design-preview-shots" node ../../scripts/verify.mjs --exec --task findings-preview -- npx playwright test --config=design-preview.config.ts`
3. Build the page (from the repository root):
   `node .ptah/specs/TASK_2026_902_c4d8/build-design-preview.mjs dist/apps/ptah-electron-e2e/design-preview-shots .ptah/specs/TASK_2026_902_c4d8/design-preview-defects.json`
4. Publish `.ptah/specs/TASK_2026_902_c4d8/design-preview.html` with `ptah_artifact_publish`
   (title: "Design preview — interactive review findings (PR #1040)").

The capture spec uses the e2e fake RPC listener (`ui.mockRpc`). It makes no GitHub request.
`design-preview.config.ts` is separate from `playwright.config.ts`, so the `e2e` target does not run it.
Dark is the default theme of the app. Light is "Ptah Glass Light", selected with the real theme menu.

## Defects found in the captures

See `design-preview-defects.json` (the page shows the same list).

## Open next steps

0. Translucent drawer (`review-run-detail.component.ts`, `<aside class="surface-1 ...">`): give the
   drawer an opaque floor. `data-glass-surface="overlay"` was tested: it made the dark drawer
   opaque, but it changed the box of the drawer in Ptah Glass Light (the role adds its own
   position rules). Try an opaque background class (for example `bg-base-100`) on an inner
   element, or use `ptah-native-drawer` from `libs/frontend/ui`. The captures in the page are
   from the code without that test edit, and the renderer in `dist/` still has the test edit:
   build again before the next capture.

1. Drawer header behind the navigation bar (`review-run-detail.component.ts`, and the same
   structure in `review-settings-drawer.component.html`): find the stacking context of the top
   navigation bar in `libs/frontend/chat/src/lib/components/templates/app-shell.component.html`
   and put the drawer above it (or start the drawer below the bar). Capture again to confirm.
   TASK_2026_904 Wave 1 edits these templates: keep the edit small.
2. Accept button keeps the primary color after triage (`review-finding-card`): give the inactive
   state a neutral look. Capture again to confirm.
3. Empty state copy: the UX brief (`reviews-ux.md`, R14) says "No findings for this run." and
   "No matching findings." + "Clear filters". Compare with the panel text. No capture exists for
   the empty state.
