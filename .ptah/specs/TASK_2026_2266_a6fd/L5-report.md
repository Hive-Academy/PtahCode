# L5 visual defect corrections

Implemented all eight requested presentation corrections. Fresh Electron screenshot acceptance remains outstanding; this lane did not run build, serve or e2e. L4 behavior and prior work were preserved.

## Per-defect findings and changes

Paths below are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/`.

| # | Cause | Fix | Files |
| --- | --- | --- | --- |
| 1 | Install guide was absolutely positioned in the identity at every width; narrow identity offsets could place it outside its cell. | Wide table renders Install guide in Actions using the same ghost button style and recovery handler as Sign in. Collapsed identity alone renders the guide on its second line; the uninstalled kind badge is hidden there and its guide offset resets to zero. | `lane-row-identity.component.ts`, `lanes-table.component.html` |
| 2 | Effort was rendered for default/empty/unsupported values; every model used mono and padding consumed the short model column. | Suppress default, n/a and empty effort suffixes. Capitalize Provider default. Apply mono only to actual model values. Remove model button padding, reserve effort width, enlarge the wide Model column, and retain full title text plus ellipsis for long model labels. The same template is used for the detail Model fact. Preserve the existing effort test hook as an empty hidden span. | `lanes-table.component.ts`, `.html`, `.css` |
| 3 | Percentage widths made Order too small and Status unable to hold its full label. | Collapsed columns reserve 3.25rem for Order, 7rem minimum for Status, 4rem for Enabled and 2.5rem for the expander. Lane receives remaining width. Existing identity version truncation/title and equal identity height remain. Standard cell padding is retained. Wide Status also receives more width. | `lanes-table.component.html`, `.css` |
| 4 | Unavailable used text-sm, and a table span rule reinforced 14px. | Use muted text-xs for unavailable permission/network states, including the shared compact default cell and detail facts; table secondary span rule uses 12px. The word Unavailable is preserved. | `cli-lane-default-cell.component.ts`, `lanes-table.component.html`, `.css` |
| 5 | Recovery buttons and kebabs flowed left to right without a reserved trailing position. | Make Actions fill its cell and push the last kebab host to the right with auto margin. Recovery actions stay left. Increase the wide Actions allocation to accommodate Install guide plus kebab near the collapse boundary. | `lanes-table.component.html`, `.css` |
| 6 | Test/result and quiet actions were separate flex boxes, creating an indivisible second group. Model button padding indented its value. | Keep the public ptahDetailActions slot and flatten its two wrappers with display: contents, allowing individual actions to wrap only as needed. Existing Test/result, capabilities, Info, CLI settings, tiers, Edit and final danger Delete retain their bindings. No-padding model trigger aligns its text with the other values. Native CLI behavior was already in the same facts dl in the current worktree and remains there without an extra wrapper or gap. | `lanes-table-detail.component.ts`, `lanes-table.component.html`, `.css` |
| 7 | Add-instance header button used primary. | Use outline, matching Edit order. | `lanes-section-header.component.ts`, `.spec.ts` |
| 8 | Refresh was an independent wrapping flex item after the order chain/pencil. | Wrap the order chain/pencil and refresh in one trailing flex group. The field and trailing group can wrap, but the trailing group stays one row; narrow styles no longer impose the chain's previous minimum width. Max Concurrent keeps its ptah-field floating label and all existing bindings. | `agent-orchestration-config.component.html`, `.ts` |

## Checks and evidence

Only the permitted check commands were used. Logs are in this task directory.

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`: six distinct focused suites passed across the runs: lanes table, lanes table visual presentation, lane detail, lanes header, lane default cell and orchestration toolbar. Initial failures were corrected; see `L5-jest.log`, `L5-jest-rerun.log`, `L5-jest-final.log`, and `L5-jest-widths.log`. The final two table suites passed 42 tests; the subsequent width adjustment passed all 29 table tests again.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0 (`L5-tsc.log`).
- `npx eslint <changed TS and HTML files>`: exit 0, zero errors; two existing non-null assertion warnings at lane-default-cell lines 439 and 443 (`L5-eslint-final.log`). The unused import warning from the first run was removed.
- `npx prettier --write <changed files>`: exit 0. Logs: `L5-prettier*.log`.
- The large table spec was split: `lanes-table.component.spec.ts` is 812 lines (main: 869), and `lanes-table.visual.component.spec.ts` is 362 lines. Other edited implementation TS files remain below 700 lines. The orchestration spec has no content diff.
- No files under `libs/frontend/ui/` were edited. No missing public UI API was encountered. RPC, save and Test logic were unchanged.

Inspected the three named prototype JPGs and relevant round-3 Electron table/detail/default screenshots at 1824, 1168, 784 and 600 widths. Opened the supplied settings prototype through Ptah browser navigation and inspected its screenshot. Compared install-guide placement, status width, row secondary text, facts alignment and outline header actions against those references.

Also rendered `L5-layout-fixture.html` using the source table, detail and toolbar CSS in a deliberately narrow 360px content area; inspected `L5-layout-fixture.jpg` captured through Ptah browser navigation/screenshot. It shows full status labels, separated headers, install guide beneath Pi, aligned facts, one actions line when space allows, and the pencil/refresh together. This is a simplified browser DOM fixture, not a live Angular/Electron rendering, and does not establish full visual acceptance.

## Remaining verification / tooling

The parent must recapture the changed Electron table, system/instance detail, header and toolbar at 1824/1168/784/600. No live renderer endpoint was provided and the brief forbids starting the app or running e2e. A progress report requesting this was attempted once with `ptah_agent_report`; delivery was refused with `parent-inbox-full` and was not retried.

CLI skill loading/discovery was unavailable. Read and applied the repository UI/UX Designer and Angular Frontend Patterns SKILL.md files directly. Ptah AST inspection worked; its dependents graph was still building, so targeted native source searches were used for immediate impact analysis. Ptah browser tools worked for the prototype and source-CSS fixture.
