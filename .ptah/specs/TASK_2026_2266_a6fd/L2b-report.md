# L2b: lanes table and detail, round 2

## Changes by acceptance item

- A1: Extracted `lane-row-identity.component.ts`, retaining the shared row title and every identity hook. A nonbreaking space reserves the secondary line when the version is absent. Table cells vertically align in the middle.
- A2: Scoped identity secondary text to 12px, 16px line height, normal weight and the muted description token. System versions retain the shared mono treatment; provider names remain proportional.
- A3: Status has one visible shared dot-and-label status. Recovery buttons are now to the left of the overflow menu in Actions. Runtime/key diagnostic hooks remain accessible supporting text. `cli-matrix-tier-summary` moved to the Tier models fact.
- A4: Permission, Network and Model facts render only when the table is collapsed. Detail default-control hosts are 12rem wide, capped at available width and left aligned.
- A5: All facts remain in one shared detail-layout facts grid with one label track and one shrinking value track. Labels use the shared muted color; facts use 14px. Native CLI behavior uses the shared link button with its public noPadding option to align the actual value text.
- A6: Compact capability summaries now use one shared outline badge per group, with abbreviated values. The full summary remains in the title and full capability lists remain behind All capabilities.
- A7: Test uses an outline sm button with its muted result directly beside it. Other detail actions are ghost sm buttons; All capabilities precedes Info/settings or Edit tiers. Projected Edit/Delete participate directly in the same flex row; Delete uses the shared danger tone.
- A8: The expander remains at all widths. Its column/header/cell are explicitly 2.5rem; the header has only its existing screen-reader label. Wide percentages reserve space for that column.
- A9: Fixed table layout prevents content from sizing the entire table wider. The fact grid allows its value track to shrink; values wrap anywhere, tier models get separate wrapping lines, and narrow model buttons wrap. Detail selects cannot exceed their value track. **Actual 600px Electron overflow measurement remains unverified.**
- A10: Instance Permission/Network Unavailable text uses muted text-sm with the explanation in title, in both the row and collapsed facts.

## Files changed in this round

All component paths below are under `libs/frontend/chat/src/lib/settings/ptah-ai/`:

- `lanes-table.component.ts`: row layout, moved actions/facts, fixed expander.
- `lanes-table.component.css` (new): scoped table, control and projected-action layout.
- `lane-row-identity.component.ts` (new): shared identity component and scoped secondary typography.
- `lanes-table-detail.component.ts`: aligned facts, tier summary, shared action styles/order.
- `lanes-table-status.component.ts`: single visible status line.
- `cli-capability-cells.component.ts`: shared capability badges in compact mode.
- `lanes-table.component.spec.ts`: column expectations and behavioral regressions.

No shared UI files or controls changed. No missing shared UI option is required: existing button noPadding, ghost danger tone, badges, label-free selects and detail slots suffice. Table component is 868 lines after Prettier. Existing long native-behavior title is unchanged; no new code lines exceed 140 characters.

## Verification

Exact permitted commands:

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-status.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-cells.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts
npx prettier --write libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-status.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-cells.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts
```

- Jest: first run failed the outdated width expectation (46 passed, one failed); updated expectations and added three regression tests. Next run passed both suites, 50 tests. Final rerun after the escaped-space and width refinements: PASS, 2 suites / 50 tests, exit 0 (47.307s).
- TypeScript: PASS, exit 0, no output.
- ESLint: PASS, exit 0, zero errors and one existing max-lines warning (table remains below the task's explicit 881-line ceiling). Earlier lint caught a literal nonbreaking space, now replaced by an escaped constant.
- Prettier: PASS, exit 0 for all seven changed source/spec/style files.

## Visual evidence and limitations

Read the supplied design decisions/spec and inspected all three iter1 Electron shots against the 1168-wide and 784-expanded prototype screenshots. Checked row grammar, secondary typography, status/action placement, detail value alignment, and control/action widths. Navigated the in-workspace prototype with ptah_browser_navigate and inspected its ptah_browser_screenshot. That is reference evidence, not a render of the changed Angular code.

No build/serve/e2e target was started. The updated Angular UI still requires the parent Electron screenshot gate, including 1824px and 600px scrollWidth/clientWidth measurement; side-by-side visual equivalence is not claimed. A parent progress request for that gate returned parent-inbox-full and was not retried.

Repository UI design and Angular frontend SKILL.md files were read from the CLI workspace skill directory. No dedicated CLI skill-invocation tool was exposed; matching repository skills were found and read through the filesystem. Native reads/edits were used; the Ptah diagnostics attempt returned unavailable after its 45-second timeout, so the permitted focused tsc command is the verification fallback.
