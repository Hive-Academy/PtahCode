# List and detail look notes

- `list-detail.component.ts`: rounded the surface, fixed the two and three column ranges, made the third (meta) column opt-in with the new `withMeta` input (off by default, so no empty column shows), and limited the back control to narrow containers.
- `toolbar.component.ts`: removed the glass surface and arranged search, sort, filters, and result count in a flat two row grid.
- `list-row.component.ts`: aligned text to the shared surface inset and added token based hover, selected, disabled, and inset focus states.
- The three foundation specs pin the changed classes and structure. The gallery places Run context inside the detail content.

In Electron, inspect `/ui-gallery` in dark theme and `ptah-glass-light`. At widths below 768 px, select a row and check the stacked view and Back to list control. At 1200 px or wider, check that the optional third column stays beside the detail pane and that Run context remains inside the gallery detail content.

Verify results (final state):

- `npm run verify -- -p ui`: **passed** (lint, typecheck, test).
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: **passed**.
- Webview jest target: nine suites fail in this worktree only because the mapped `marked` file is missing in this worktree's `node_modules`. This is outside the edited files; CI decides.
- Electron was not started. The actual look still needs the user's review there.
