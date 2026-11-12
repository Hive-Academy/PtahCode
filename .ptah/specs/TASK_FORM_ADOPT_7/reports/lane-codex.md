# Form owner adoption lane

Files changed:
- `external-marketplaces.component.ts`: marketplace source input now uses bare `ptahInput` sm/mono; error uses `[invalid]`. Native input, test id, value and events remain.
- `harness/harness-repair-dialog.component.ts`: repair row checkbox now uses `ptahCheckbox` xs; native checkbox and row label remain.
- `oauth-surface.component.ts`: URL, friendly name, client ID and secret now sit in floating `ptah-field` owners with `ptahInput`; read-only redirect URL uses bare sm `ptahInput`. Native inputs and bindings remain.
- `pages/connectors/connectors-page.component.html` and `.ts`: search input now uses bare sm `ptahInput`; component imports the directive.
- `pages/servers/installed-servers-page.component.ts`: conversion target checkbox now uses `ptahCheckbox` xs.
- `pages/skills/installed-skills-page.component.ts`: search control uses bare sm `ptahInput`; former styled label wrapper is a positioning div for the icon.
- `canvas/orchestra-canvas.component.ts`: new session name input now sits in floating `ptah-field` with `ptahInput`; id, ngModel and key event remain.

Raw leftovers: no raw input/select/textarea/checkbox/toggle control recipes remain in these scoped files. Harness and server row `<label>` elements remain as clickable checkbox labels; OAuth fieldset legends remain group headings. Canvas rail is outside this file's control surface and was not edited.

Spec selectors updated: none. The canvas spec selects `label[for="canvas-session-name"]`; the field owner generates that label for the retained input id. Other checked selectors use retained test ids or native input state.

Static review: inspected the diff, searched the scoped files for remaining raw control classes and `[attr.aria-invalid]`, and ran `git diff --check` on the scoped files. No build, serve, dev, e2e, verify, lint or visual render was run, as directed. Ptah workspace analysis indexed another worktree, so local file reads were used. No locally invocable UI skill was available.
