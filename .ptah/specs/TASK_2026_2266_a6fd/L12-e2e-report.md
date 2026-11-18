# L12 webview-e2e CI repair

Implemented fixes for the nine distinct failures in `ci-webview-e2e-3546f9bb.txt` (17 failed cases across hosts/themes plus the Save to flaky case). No Playwright execution, commits, pushes, stashes, or reverts.

## One line per distinct failure

Paths below are relative to `libs/frontend/`; test lines identify the supplied CI revision.

| Failing test | Decision, root cause, and fix | Assertion strength |
| --- | --- | --- |
| orchestration:246, cell pick | **Product**: narrow detail facts could receive no usable width because the detail grid selected its tier by viewport instead of embedded content width; the capability max-content track crowded the facts. `chat/src/lib/settings/ptah-ai/lanes-table-detail.component.css:3,84,90` uses a named container and content-width breakpoints. L11's wrapping and expanded-detail popover guards remain. | E2E unchanged: actual click, focused search, exact single write, return focus and Undo remain. |
| orchestration:382, More actions | **Spec, approved structure change**: the Status-cell menu now owns Details, Test, All capabilities, Edit tiers, Edit, Delete. `webview-e2e-harness/src/lib/scenarios/settings/settings-orchestration.e2e.spec.ts:400` requires exactly six visible items. | Stronger exact count replaces allowed counts 2/4; every panel/viewport containment and Edit/Delete ordering assertion stays. |
| orchestration:516, Cursor key | **Product**: compact status explicitly replaced needs-key text with `Key`. Remove that branch in `chat/src/lib/settings/ptah-ai/lanes-table-status.component.ts:61`; retain `Needs API key`. `lanes-table.component.css:243,268` gives the fixed action anchor intrinsic width and reserves recovery space. | E2E status text, credential save/remove, row movement, open detail/popover and Esc focus checks unchanged. Added compact status regression. |
| providers:227, provider change | **Spec, approved select design change**: ptah-select displays the provider plus authentication modality, while the migration supplied the old bare provider name to an exact-label helper. `webview-e2e-harness/src/lib/scenarios/settings/settings-providers.e2e.spec.ts:234` selects `Kimi Code · API key`, matching `mainAgentProviderOptions` and the fixture's apiKey connection. | Helper still requires exact visible label and enabled option. D6 copy, confirmation, cancellation and zero writes before confirmation unchanged. |
| visual:900, matrix popovers | **Product**: row model/effort editors were inside a ptahCollapsible cell, so at 1024 the locator found hidden controls. `chat/src/lib/settings/ptah-ai/lanes-table.component.html:97,352` renders the same row template beneath the compact identity and in the Model cell at wide width, never twice in a row. Detail editors stay available. | E2E row locators unchanged; focused search, list, on-screen geometry, topmost panel and overflow assertions unchanged. Saved effort stays in rows; unset effort stays detail-only. |
| visual:887, policy row | **Product**: flex wrapping plus trailing flex-basis 20rem / 100% forced two rows. `chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts:76` keeps a single row, allows the max-concurrent field to shrink, and gives the measured whole-chip strip remaining space. | E2E height <=48 unchanged, including whole-chip, viewport, keyboard and order assertions. |
| visual:909, providers fold | **Product**: separately wrapped subtitle and two-line usage produced three provenance lines; wrapping the entire face could add another row. `chat/src/lib/settings/providers/provider-connection-card.component.ts:84` uses avatar / flexible identity / status grid and one shared two-line provenance clamp. Inline subtitle/usage retain all text; overflow measurement includes their clamped parent so the full usage tooltip survives. | E2E every-card height <=80, columns, fold bottoms and overflow assertions unchanged. |
| visual:1345, live-shaped providers fold | **Product**: same extra provenance-line cause and fix as visual:909, also affecting live-shaped names/consumer lists. | E2E <=80 and all live-shaped data/geometry assertions unchanged. |
| visual:1047, Main Agent Save to | **Product**: the CI received an empty option array immediately after the opening click, not different scope values. The child select renders its conditional option DOM on a scheduled Angular render. `chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:108` and `.html:326` commit its open state during the bubbling click. | E2E unchanged: exact Global / host App / workspace labels and order; subsequent app rescope and confirmation checks stay. New tests require all three actual option DOM nodes synchronously on the opening click in both hosts. The scheduling diagnosis is inferred from source and the empty-array log; no live CI trace was available. |

## Other spec changes

- `lanes-table.component.spec.ts:237`: the compact row-editor locator now scopes to the row instead of the hidden Model td. Same editor switching and exactly-one-popover checks remain.
- `lanes-table.visual.component.spec.ts:367`: added full missing-key status, one compact row trigger, correct cell ownership, and successful open assertions.
- `main-agent-reassign-popover.component.spec.ts:1089`: added opening-click DOM option assertions for VS Code and Desktop app using fixtures that offer all three scopes.
- `provider-connection-card.component.spec.ts`: added coverage for full-usage tooltip when the shared provenance parent clamps the text.
- No E2E numeric bound, conditional assertion, timeout, skip, or retry was added or loosened. No visual E2E file changed.

## L11 and hard-rule preservation

All eight L11 outcomes remain: unset effort detail-only; wrap editable detail values; compact subtitle hidden; no artificial subtitle; fixed Status-cell action edge; separator belongs to usage; intrinsic wide capabilities and full-width middle-tier capabilities; compact Order width/padding. Detail breakpoints now use actual container width, preserving those arrangements at their intended available widths. A narrow pane inside a wide window now stacks instead of allocating zero width to its facts; this directly resolves the hit-target failure.

All existing ids, data-testids and aria-labels are retained. No protected shared field, setting-row, description-list, advanced-settings group/types, or class-audit baseline file changed.

## Changed source/spec files

- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html`
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.html`
- `libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-status.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.visual.component.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-orchestration.e2e.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-providers.e2e.spec.ts`

## Checks and visual evidence

- Chat `tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: passed.
- Harness `tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`: passed; this configuration excludes spec files.
- Harness `tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.spec.json`: failed on existing configuration/source issues, with no diagnostics in the changed specs. Its existing CommonJS setting conflicts with `import.meta` in fixture-server, marketplace-visual, onboarding-ready-capture, plan-limits-visual, and settings-capture (TS1343). Existing preferences.e2e.spec.ts:46 passes a RegExp as selectOption's label (TS2345). The configuration and preference call were confirmed unchanged against HEAD. No out-of-scope files were edited to suppress these errors.
- Focused Jest: **5 suites / 199 tests passed**, using the allowed chat config with `--runInBand --coverage=false --runTestsByPath`: lanes-table.component.spec.ts, lanes-table.visual.component.spec.ts, agent-orchestration-config.component.spec.ts, provider-connection-card.component.spec.ts, and main-agent-reassign-popover.component.spec.ts.
- Scoped ESLint: exited 0, no errors; one existing max-lines warning for main-agent-reassign-popover.component.ts (already over 700 lines before this change).
- Prettier: completed on all changed source/spec files; final provider component and regression formatting also completed.
- ui-class-audit: passed, **0 counts over baseline**, including raw-spacing; baseline unchanged. Ran `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`.
- `git diff --check`: passed.
- Ptah workspace analysis and structural inspection used. Dependency lookup reported no indexed entry; native rg confirmed consumers in providers-settings and cli-orchestration-matrix. Scoped Ptah diagnostics could not check HTML and its TypeScript check exceeded 45 seconds; direct allowed TypeScript checks are the fallback. Codex exposes no skill-loading command: local Angular frontend patterns and UI/UX designer SKILL.md files were read through filesystem discovery and existing approved design guidance applied.
- Ptah browser navigated the in-worktree file URLs and screenshots were inspected: `L12-lanes-layout.html`, `L12-providers-layout.html`, `L12-policy-layout.html`. These use existing Angular DOM evidence and component CSS, with representative fixtures rather than a running application. Narrow detail facts now have 380px of width in a 412px panel (previously 0px); visible model text and capability chips no longer overlap. Representative connection cards measure **78.25px** high at 459px width. Policy bars measure **40px** high at content widths 650 / 480 / 360, with zero measured horizontal overflow. Compared against the approved one-row policy, <=80px card, and L11 readable/wrapped detail requirements. Fixture icons, field theme rendering and dataset coverage are approximate; the policy fixture contains representative whole chips rather than the live measurement logic.

## Remaining limits

No unexplained additional distinct failure was found in the supplied log. Actual Electron/VS Code host interaction and CI pass status remain unverified because Playwright/build/serve/e2e are expressly forbidden for this lane. Save to timing is a source-supported diagnosis with a deterministic DOM regression, not a reproduced live-browser failure. The harness spec type check remains red on the unrelated existing issues above. The parent should use the permitted upstream CI run to confirm all nine repairs.
