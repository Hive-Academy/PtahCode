# Batch U09 ? Bots visual fixes

Implemented all six requested presentation fixes. Final Electron rebuild and recapture remain with the coordinator.

## Per-defect changes

Paths below are relative to `libs/frontend/bots-ui/src/lib/`.

| Defect                           | Files / lines                                                                          | Change                                                                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Roster filters overflow       | `bots-page.component.ts:127?153`, `bots-page.css:26?76`                                | Search icon and ?Search bots? placeholder; hidden associated Search bots / Scope labels; compact Ptah input/select; wrapping flex row, shrinkable labels, explicit control width and min-width zero. Prevents the search field from painting beneath the adjacent select (the stray rounded edge). |
| 2. Editor header                 | `bot-editor.component.ts:74?97`                                                        | Status uses `ptahBadge` with `ok` or neutral tone beside the name and revision. Enabled control is pushed right with auto margin; its existing aria-describedby hint is visually hidden. Menu follows the toggle.                                                                                  |
| 3. Duplicate callout             | `bot-editor.component.ts:184?185`, `bot-editor.component.spec.ts:129?150`              | Removed the editor notice between header and form. Updated assertion checks absence of the callout heading, while retaining the existing Triggers hint. Page notice remains at `bots-page.component.ts:80`.                                                                                        |
| 4. Native upload chrome          | `bot-identity-runtime-section.component.ts:152?185`, `bot-form-sections.spec.ts:45?70` | Ptah button opens the labeled, visually hidden file input. Same accept list, disabled rules and upload handler; type/size hint describes both controls. Keyboard activation uses the native button. Added a focused trigger/label/hint regression check.                                           |
| 5. Gold New bot                  | `bots-page.component.ts:67?77,108?120`, `bots-page.css:105?109`                        | Explicit primary variant in header and empty state. Empty-state action uses a local Ptah button because the shared state panel hardcodes its default secondary variant.                                                                                                                            |
| 6. Selected roster / description | `bot-list-row.component.ts:72?74,115?127,141?146,161`                                  | Selected row keeps its tint with transparent perimeter and a gold left accent using the existing primary token. Description renders only when present; min-width zero and existing ellipsis keep it to one truncated line. Keyboard focus outline is retained.                                     |

## Decisions

- Loaded `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md`; a native CLI skill loader was not exposed. Used the existing approved design and component/token system.
- Inspected `design-spec.md`, `prototype/bots.html`, both requested approved 1280 PNGs, the real dark editor captures at 1280 and 900, and the light editor capture at 1280. Compared filter sizing, header hierarchy, single page notice, upload chrome, primary action and selected-row treatment.
- Opened the in-workspace prototype with `ptah_browser_navigate` on its file URL, captured it with `ptah_browser_screenshot`, and visually inspected the browser image.
- Updated renderer output has not been rebuilt or visually verified. The supplied captures show the pre-change app. Coordinator must rebuild and recapture Electron at 1280/900 in both themes to verify the fixes; no source/type check is presented as proof of rendered quality.
- Upload keeps the allowed hint-text alternative rather than adding filename state. Existing upload/read/cancellation logic is unchanged.
- No store, RPC, host or multi-root form Scope logic changed. No raw DaisyUI control classes added. All seven edited source/spec/style files are below 700 lines (largest: identity section, 639).
- Inspected `apps/ptah-electron-e2e/src/design-preview/bots.shot.ts`: no selector depends on the removed editor callout or file input, so no change was needed.
- Ptah workspace analysis succeeded. Ptah AST calls rejected the initial argument shape; corrected dependent queries returned incomplete graph coverage with no indexed file. Used native targeted reads and rg for impact review. Scoped Ptah diagnostics reported no diagnostics in requested files; it also reported five sibling BigInt target errors outside this change. Angular ngc is the authoritative focused template check.
- No git, Nx, verify, build, serve, dev, e2e or package commands were run.

## Command results

- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts` ? **exit 0**, 4 suites / 99 tests passed. Earlier runs exposed an overly broad callout assertion and edit-script encoding damage; both were corrected before this final passing run.
- `npx ngc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json` ? **exit 0**, including the final run after the empty-state change.
- `npx eslint` on all seven changed files ? **exit 0**, no errors; one warning that CSS has no matching ESLint configuration. All six TypeScript files checked.
- `npx prettier --check` on all seven changed files ? **exit 0**, all matched files formatted.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` ? **exit 0**, scanned 1,462 files; zero token counts over baseline.

Changed file arguments for ESLint / Prettier: `bots-page.component.ts`, `bots-page.css`, `bot-editor.component.ts`, `bot-editor.component.spec.ts`, `bot-identity-runtime-section.component.ts`, `bot-list-row.component.ts`, `bot-form-sections.spec.ts`, each under `libs/frontend/bots-ui/src/lib/`.

## Revise round 1

Implemented the local scroll containment fix and the requested soft capture check. The coordinator confirmed the original six fixes in both themes at 1280/900 before this revision.

### Cause

- `libs/frontend/ui/src/lib/foundation/list-detail.component.ts:9` wraps the panes in overflow-hidden; lines 10-11 give each pane overflow-auto, but neither the wrapper nor panes have a bounded height. These are the sticky bar's nearest scroll ancestors, so they expand with the full form instead of scrolling within the visible editor.
- Before this revision, `libs/frontend/bots-ui/src/lib/bots-page.css:1` made the page a natural-height block. The sticky host at `bot-save-bar.component.ts:26` therefore used an expanding pane, leaving the bar below the visible frame.
- The Electron host clips its content at `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:540`. Its routed surface already supplies full height (`app-shell.component.html:84`); that wrapper intentionally does not own scrolling. The problem is the missing height constraint in Bots, not the sticky declaration.

### Fix and decisions

- `libs/frontend/bots-ui/src/lib/bots-page.css:1`: full-height flex column, min-height zero, and page overflow auto as a fallback for unusually short windows. Header, notices and scope controls retain their natural height.
- `bots-page.css:15`: list/detail fills the remaining height and can shrink. Lines 19-25 constrain its immediate wrapper and sections to that height. The existing pane overflow-auto now owns scrolling, allowing the existing sticky save bar to stay at the editor bottom while the form scrolls.
- These deep selectors are anchored to the Bots host and direct shared-layout children. No shared UI source, DOM order, focus code, selection handling, editor/store/RPC logic or save-bar styling changed. Existing container queries still control the 900 px list/editor switch and Back button.
- `apps/ptah-electron-e2e/src/design-preview/bots.shot.ts:80`: added nullable dirtySaveBar review evidence. Lines 201-215 measure the bar immediately after the dirty edit and softly assert positive height, top >= 0 and bottom <= window.innerHeight. Both incremental and finally JSON writes include its bounds, viewport height and boolean result (lines 126, 314). This does not scroll the bar into view before checking.
- Loaded repository copies of angular-frontend-patterns and ui-ux-designer; no native skill loader is exposed. Existing approved design remains authoritative. Ptah inspection initially rejected argument shapes; corrected dependent lookup reported incomplete graph coverage, so native rg/targeted reads supplied impact evidence. Scoped diagnostics found zero TypeScript errors but cannot check CSS.

### Visual evidence and limitations

- Inspected the supplied dirty light 1280 and dark 900 Electron captures: name edited near the top, save actions absent. Opened the approved in-workspace prototype using ptah_browser_navigate and inspected ptah_browser_screenshot: actions sit at the editor bottom while the form continues below it.
- Rendered an in-memory browser layout fixture using the changed page CSS, shared wrapper/pane structure, sticky save host, and approved reference form content. Inspected screenshots at 1280 and 900 widths with 1100 px layout height. Bar bottom was approximately 1064 px at both widths, remaining there after pane scrollTop=500; pane content exceeded its bounded height. Narrow fixture also showed Back above the editor. This validates layout geometry, not compiled Angular rendering or theme fidelity.
- No application rebuild or Electron capture run was performed, as instructed. Coordinator must rebuild and recapture both themes at 1280/900; the new soft check records whether the actual compiled save bar is inside the viewport.

### Command results

- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`: exit 0; 2 suites, 59 tests passed.
- `npx ngc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint libs/frontend/bots-ui/src/lib/bots-page.css apps/ptah-electron-e2e/src/design-preview/bots.shot.ts`: exit 0; no errors; one warning that CSS has no matching configuration.
- `npx prettier --write` followed by `npx prettier --check` on those two changed files: exit 0; formatted.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; 1,462 files scanned, zero token counts over baseline.
- Changed source files contain 129 and 326 lines respectively, below 700. No git, Nx, verify, build, serve, dev, e2e or package commands run. No files outside the permitted source write set and this required report were written.

### Clarifications Needed

None. Compiled Electron visual verification remains with the coordinator.
