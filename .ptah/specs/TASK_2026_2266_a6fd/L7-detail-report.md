# L7 detail report

Implemented the expanded lane detail in the owned files only:

- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.html` (extracted template)
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.css` (extracted styles)
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts`

Uses `ptah-table-detail-layout mode="wide"` with facts, capabilities, and actions in separate slots. The inset background, border, padding, and radius use existing card/spacing tokens. One `ptah-description-list` holds all facts, including projected narrow-table facts, with a shared 8.5rem term width for system and instance details. Scoped global selectors are necessary to style the shared layout wrappers and projected parent actions without editing shared UI or the parent.

All action buttons use the existing small ptahButton size. Test and its live status line form their own group above the other actions. Projected destructive Delete stays last and aligns to the far right. Capability buttons show only Messaging, Permission, Network, MCP, and Limit; values open in the shared native popover with native keyboard-operable button triggers, expanded state, and controls IDs. Native CLI behavior uses a Permission button and retains its existing detailed popover. All capabilities and its full list remain. Existing identifiers, test IDs, and accessible labels are retained.

## Validation

- Requested Jest command with detail, lanes-table, and lanes-table.visual component specs: final run PASS, 3 suites / 55 tests. Earlier run passed 56 while other lanes were editing the shared-worktree specs. Added tests cover wide slots, action order/size, status placement, chip opening/toggling, and instance Edit/Delete order.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: PASS (exit 0).
- `npx eslint` on the four changed files: PASS, no errors; CSS produces the existing/configuration warning that no matching ESLint configuration is supplied.
- `npx prettier --write` on the four changed files: PASS.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: PASS, zero token counts over baseline; baseline was not updated.
- `git diff --check` for owned tracked files: PASS.
- Ptah scoped diagnostics: unavailable after its 45-second compiler timeout; direct requested tsc is the compiler verification fallback.

## Rendered evidence

`L7-layout-evidence.html` renders DOM captured from Angular component tests, with the actual shared layout CSS, button CSS, project tokens, and changed CSS. It is an isolated detail fixture, not the full Electron application. No app build or server was started.

Inspected all four supplied reference/current images. Compared inset separation, consistent fact alignment, compact action grouping, short chip names, and narrow stacking against the expanded 784px reference and existing 1824px system/instance screenshots.

Ptah browser navigation and screenshots were used on the in-workspace file URL. Screenshots in `screens/L7-detail-{1824,1168,784,600}.png` were visually inspected. Browser measurements for both details:

| Viewport | Layout | Term width | Document scroll width |
| --- | --- | --- | --- |
| 1824 | three columns | 136px | 1824px |
| 1168 | three columns | 136px | 1168px |
| 784 | stacked zones | 136px | 784px |
| 600 | stacked zones | 136px | 600px |

The browser tool only applies viewport dimensions when creating a session; sessions were recreated to verify the real widths. An initial shared-browser navigation collision was discarded and screenshots recaptured after checking the document title and viewport. Attempt to inform parent was refused with `parent-inbox-full`.

## Outside-owned-files changes

None required. No detail-cell wrapper change is needed in `lanes-table.component.html`; projected actions already use small ptahButton and destructive Delete last. Shared UI and other lanes' files were not edited. `cli-capability-view.ts` did not need changes.

Skills: the CLI exposes no skill discovery/loading tool; local `.claude/skills/ui-ux-designer/SKILL.md` and `.claude/skills/angular-frontend-patterns/SKILL.md` were read directly. Existing references and explicit implementation authorization supplied the design direction. Native rg/PowerShell reads and native editing were used alongside available Ptah workspace/AST/dependency/browser tools.
