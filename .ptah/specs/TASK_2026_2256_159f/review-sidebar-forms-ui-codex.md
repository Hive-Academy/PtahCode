# Independent UI review

Verdict: **CHANGES**

Scope: the six requested UI files, including the two untracked field-grid files. No chat files were reviewed. Source files were not edited.

| Severity | File:line | Finding | Suggested fix |
| --- | --- | --- | --- |
| major | libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts:37 | `frameGap` now contains two space-separated classes, but line 297 uses that entire string as one key in the object passed to `[class]`. Angular ignores class-map keys containing spaces. Neither the zero column gap nor zero frame padding is applied. Navigation retains the outer page gutter and group gap while the main column also gains its own gutter, preventing the intended flush sidebar layout. Confirmed against the installed Angular implementation: `classKeyValueArraySet` explicitly excludes keys containing spaces. | Use separate boolean map entries for each class, or return a class string with both classes. Add a navigation-mode DOM assertion for each individual class and verify neither leaks into tabs mode. |
| major | libs/frontend/ui/src/lib/tokens/ptah-tokens.css:485 | `--ptah-settings-nav-height: 100cqh` does not establish a relationship to the available page height. The layout host at component line 128 supplies only `container-type:inline-size`, which cannot supply block-axis query units. Without another eligible ancestor, `cqh` falls back to the small viewport height. In an embedded host whose scrollport is shorter than the viewport, the sidebar and footer extend below the visible page; the list shrinks against the wrong height. Sticky positioning and `min-h-0` on the list do not correct that height mismatch. | Define the available block size at the actual page scrollport and pass it through the height token, or establish a definite-height size query container there. Do not switch this auto-height host blindly to size containment. Verify short embedded scrollports as well as viewport-sized pages, with both short and overflowing navigation lists. |
| minor | libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts:381; libs/frontend/ui/src/lib/patterns/form-section/field-grid.directive.spec.ts:17 | The only settings-spec change updates the child-indent string. Nothing asserts the new frame overrides, sidebar height, list overflow/minimum height, or footer `mt-auto`/`shrink-0`; the class-map defect therefore passes all tests. The field-grid spec checks class strings and an input update, but supplies `sm` explicitly, so it does not exercise the unbound default. It also cannot establish one-column behavior in a narrow container because Jest does not lay out CSS grids. | Add DOM regression assertions for the navigation changes and tabs-mode isolation, and a host without `minColumn` to test the default. Supply rendered evidence for narrow field grids and sidebar scrolling/footer visibility in the approved visual-check workflow. |

The field-grid formula itself matches the requested auto-fit/minmax/min expression. Both literal variants are present for Tailwind scanning; the new tokens are 10rem and 14rem, and the directive is exported through the patterns barrel. Its standalone metadata, signal input, computed class binding, and token-based spacing follow the requested Angular conventions. Directives do not have a change-detection strategy; OnPush is present on the component and test hosts.

Tabs-mode class branches, landmarks, heading-level selection, panel relationships, roving focus, and keyboard handling remain unchanged by the diff. Existing keyboard/accessibility assertions pass. The new scroll clipping should still receive a rendered focus-ring check. No newly introduced forbidden casts, `any`, suppression comments, console calls, innerHTML, skipped tests, ngClass, decorator inputs, inline styles, or daisyUI classes were found. The `as unknown as` at settings spec line 77 already exists in HEAD and is not introduced here. Zero-valued spacing resets and `mt-auto` serve structural layout purposes; added nonzero spacing uses tokens.

## Evidence and limits

- Jest: 2 suites and 23 tests passed.
- ESLint: zero errors; one warning because the CSS file has no matching ESLint configuration. CSS was reviewed manually.
- Compared source layout rules with `origin/main:docs/design-system/settings/prototype/settings-prototype.html`: 14.5rem sidebar, sticky placement, 1rem/.75rem padding, and bottom footer. The reference subtracts surrounding toolbar/stage space from its viewport-based height; the new token does not account for equivalent host space.
- No rendered visual quality claim is made. The prototype is absent from the current filesystem (Ptah file search returned zero results), and launching/building the renderer or writing a temporary fixture is outside the allowed checks/write scope. No screenshot was captured. Narrow-grid geometry, actual host scrollport sizing, and focus-outline clipping remain unverified visually.
- Ptah workspace analysis and AST inspection were available and used. No CLI skill-loading mechanism was exposed; local `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md` were read directly. Native PowerShell/git/rg supplied diff and source inspection. No additional validation targets ran.

## Commands and exit codes

| Command | Exit code / result |
| --- | --- |
| `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/form-section/field-grid.directive.spec.ts libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts` | 0 |
| `npx eslint libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts libs/frontend/ui/src/lib/patterns/form-section/field-grid.directive.ts libs/frontend/ui/src/lib/patterns/form-section/field-grid.directive.spec.ts libs/frontend/ui/src/lib/patterns/index.ts libs/frontend/ui/src/lib/tokens/ptah-tokens.css` | 0; CSS ignored warning |
| `git diff HEAD --` followed by the scoped files (batched and repeated for targeted reading) | 0 |
| `git status --short -- libs/frontend/ui` | 0 |
| `git status --short -- .ptah/specs/TASK_2026_2256_159f/review-sidebar-forms-ui-codex.md` (before writing) | 0 |
| `git ls-tree -r --name-only origin/main docs/design-system/settings` | 0 |
| `git show origin/main:docs/design-system/settings/settings-design-spec.md` and `git show origin/main:docs/design-system/settings/prototype/settings-prototype.html`, piped through targeted `Select-String` / `Select-Object` reads | 0 |
| `git show HEAD:libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts` piped to `Select-String 'as unknown as'` | 0 |
| `Get-Location`; `Get-Content` on the local skill files, scoped source/spec files, and installed Angular `_debug_node-chunk.mjs`; numbered source reads through `ForEach-Object` | 0 |
| `rg --files` for local skill/AGENTS discovery; `rg -n` for Angular class-map implementation, package versions, container sizing, and forbidden constructs in scoped files | Successful matching searches: 0; AGENTS search: no matches (1). One batched inspection consequently returned 1. |
| `rg -n` for layout/container rules under `apps/ptah-electron/src/renderer` | 2; path absent. Other relevant container searches used existing UI/webview paths. The surrounding shell group returned 0. |

Ptah workspace/AST/file-search calls are MCP operations and have no shell exit code. The only write is this deliverable.
