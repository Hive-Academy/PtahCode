# Batch B2

## Changes

- Item 7. `libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.ts:40` places Change at the end of the heading row. The two-line tile starts at line 63 and handles pending, ready, unresolved and error states.
- Item 10. `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts:49` aligns the navigation connector and reduces the child row height and weight. Lines 171 and 194 retain the parent section cue and give every navigation item a 1rem status slot. Line 221 still projects the navigation footer.
- Item 10. `libs/frontend/chat/src/lib/settings/settings.component.ts:183` configures Decision matrix as a connector-led child and preserves its page-heading icon at line 206. `libs/frontend/chat/src/lib/settings/settings.component.html:40` uses a compact Workspace and App grid and revises the local note. The custom-endpoint warning sentence stays intact at line 52.
- Tests cover the new summary markup and transitions in `libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.spec.ts:63`, settings navigation and footer in `libs/frontend/chat/src/lib/settings/settings.component.spec.ts:291`, and navigation-only layout behavior in `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts:404`. Updated visual assertions start at `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts:937`.

## Parity

Main-agent paths below are relative to `libs/frontend/chat/src/lib/settings/providers/`.

- Status dot kept at `main-agent-section.component.ts:42`.
- Main agent h2 and ID kept at `main-agent-section.component.ts:47`.
- Assignment badge merged into `main-agent-section.component.ts:83`. Its hook and assignment metadata expose active, attention and not-set.
- Projected D16 scope badges and clear controls kept at `main-agent-section.component.ts:50`.
- Route status moved to the live region at `main-agent-section.component.ts:83`. Its original hook is at line 86, and error announcements move to line 100.
- Pending skeleton and available action kept at `main-agent-section.component.ts:68` and line 54.
- Error alert and Retry kept at `main-agent-section.component.ts:100`.
- Provider name and ID fallback kept at `main-agent-section.component.ts:80` and in the route computation.
- Model ID, tier or default moved to the chip at `main-agent-section.component.ts:111`.
- Effort and provider default moved to the chip at `main-agent-section.component.ts:116`.
- Empty-state instruction and action kept at `main-agent-section.component.ts:106` and line 55.
- Reassign action and chevron moved to `main-agent-section.component.ts:54`. The existing output still opens the popover.
- Bottom-left popover anchor kept at `main-agent-section.component.ts:129`.
- Main-agent deep-link focus kept at `providers-settings.component.ts:1207`.
- Projected read errors and clear review kept at `main-agent-section.component.ts:131`.
- Popover stacking kept at `main-agent-section.component.ts:33` and line 38.

## Decisions

- Read the projected reassign popover's existing `open` signal through a content query. An additional host input would require a coordinated edit. The local query preserves the projection contract and can be reversed independently.
- Use the connector beside Decision matrix in the sidebar while retaining its existing icon in the page header. Keeping the sidebar icon would add a second visual cue between the connector and label. The choice is local and reversible.
- Keep the mark count in flow beside the fixed slot. Overlaying the count could cover a long row label. Existing count and description data continue to work, and the positioning can be changed within navigation mode.

## Checks

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.spec.ts libs/frontend/chat/src/lib/settings/settings.component.spec.ts` passed. 2 suites and 79 tests passed, 0 failed.
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts` passed. 1 suite and 26 tests passed, 0 failed.
- `npx eslint libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.ts libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.spec.ts libs/frontend/chat/src/lib/settings/settings.component.html libs/frontend/chat/src/lib/settings/settings.component.ts libs/frontend/chat/src/lib/settings/settings.component.spec.ts libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts` exited 0 with no file-level lint findings. It emitted seven messages that `@nx/enforce-module-boundaries` was skipped because the cached ProjectGraph was unavailable.
- Scoped `ptah_get_diagnostics` did not return a TypeScript result after two 45-second timeouts. The HTML file was unrecognized.

## Edits needed in files I do not own

- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts:2055`. Replace the `nodeAction` matcher value `'Change main agent: provider, model and effort'` with `'Change main agent'` at line 2057. The surrounding control-size assertion still applies.
- The Providers host template needs no edit.

## Extra reads

- Worktree `CLAUDE.md` verification and Electron guidance, plus `.claude/skills/angular-frontend-patterns/SKILL.md` via its filesystem registration. No native skill invocation tool was listed.
- Consulted named Providers host projection and test excerpts, the reassign popover's open input, the route and connection contracts, and UI provider mark, badge, alert, skeleton and settings token definitions.
- `ptah_search_files` returned zero task paths. Used `rg --files` for the hidden task directory. `ptah_ast_analyze` parsed the three edited TypeScript components. Dependency queries reported graph construction, so source checks covered the named consumers.

## Not done

Electron rendering, screenshots and e2e execution were outside the authorized checks. The coordinator still needs the Electron visual pass for wide and narrow layouts in light and dark themes. Angular template typechecking and Nx boundary lint remain unverified.

## Clarifications Needed

None.
