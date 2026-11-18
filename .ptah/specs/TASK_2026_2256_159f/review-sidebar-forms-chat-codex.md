# Sidebar and forms chat code review

Verdict: **CHANGES**

Reviewed the uncommitted `git diff -- <file>` changes in all eight requested Angular files on `feat/settings-wide-layout`. Source files were read only. The only file written by this review is this deliverable. The shared field-grid directive and settings-layout component were read for context; the settings-layout diff was excluded.

## Findings

| Severity | File:line | Finding | Fix |
| --- | --- | --- | --- |
| minor | libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:168 | Replacing the explicit one/two/three-column layout with `ptahFieldGrid minColumn="md"` removes the three-column ceiling. The shared directive uses `repeat(auto-fit,minmax(min(100%,14rem),1fr))` with a 1rem gap, so a 59rem grid fits four columns and wider grids fit more. This is reachable in the Advanced tab's Fine-tuning groups: these groups use the main content width rather than the 36rem form-section column, the content cap is 96rem, and `memory-upkeep` contains seven settings. Previously the grid explicitly used three columns above 56rem. This fails the requested 2–3-column wide layout. | Keep the shared directive, but provide a bounded column policy for this consumer: one column when narrow, two at intermediate widths, and at most three wide tracks using `minmax(0,1fr)` so the fields still fill the available width. |

## Review evidence

- No changed business logic, saving/loading behavior, signal expressions, control values, conditions, or event handlers were found. The new `SecurityIcon` member supplies presentation data. The back button still calls `backToChat()` and uses the shared button directive.
- Compared pre-existing literal and bound `id`, `data-testid`, and `aria-label` attributes against HEAD, normalizing CRLF/LF. No pre-existing attribute was removed or changed. Existing attribute occurrence counts by requested file order: 10, 1, 21, 18, 8, 18, 8, 5. The HTML adds two explicit aria-labels: `Back to Chat` and `Local`. These preserve names formerly supplied through the shared icon-button and status components.
- Both components newly using `ptahFieldGrid` import `PtahFieldGridDirective` from `@ptah-extension/ui` and list it in component imports. All seven reviewed TypeScript components remain standalone and OnPush. No new legacy input/output decorators or structural control-flow syntax were introduced.
- No new forbidden escapes, logging, innerHTML bindings, skipped tests, raw controls, inline style attributes, or multi-class object-map keys were introduced. The existing range input and its DaisyUI `range range-xs range-primary` classes remain pre-existing; the changed line only replaces width utilities. Existing DaisyUI classes elsewhere were not treated as newly added defects.
- Existing control IDs and label associations remain intact. The back button retains its accessible name, and the shield explicitly retains the Local name. The sidebar adds an h2 within the navigation landmark; the shared layout still renders the configured h1 for the main page. No definite accessibility regression was identified by source review.

## Permitted checks

Executed from the requested worktree without autofix:

```text
npx eslint libs/frontend/chat/src/lib/settings/settings.component.html libs/frontend/chat/src/lib/settings/settings.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts libs/frontend/chat/src/lib/settings/pro-features/vscode-lm-config.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts
Exit code: 0
```

ESLint reported no errors and one `max-lines` warning at `session-budget-settings.component.ts:778` (734 counted lines; limit 700). This change removes lines from that file, so the warning is not a new regression.

```text
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
Exit code: 0
```

No nx, verify, build, serve, dev, e2e, or test target was run. TypeScript passing does not establish Angular template compilation or rendered layout correctness.

## Limits and tooling

This is a source review. No rendered screenshot or prototype comparison was performed, so pixel fidelity and actual narrow-screen rendering remain unverified. The column-count finding follows directly from the CSS track rule and its reachable container width.

Ptah workspace analysis and AST inspection were available and used. Git and native PowerShell were used for diffs and targeted text reads. Native CLI skill invocation/discovery was unavailable; the local `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md` were read directly as the fallback. No source edits or Git mutations were performed.
