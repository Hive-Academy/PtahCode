# L10: Providers e2e DOM migration

Updated only the permitted harness/spec source paths plus this report. Product source, design previews, IDs, test IDs and aria labels were preserved. No commits, pushes, visual baseline updates, e2e/Playwright runs, nx commands, builds or servers.

## Failure mapping

Numbers refer to `ci-failures-91684b20.txt`. Shared fixes cover the indicated hosts/themes.

| Failure | Change |
| --- | --- |
| 1, 6: add-instance provider select | Added `choosePtahSelect(control, label)` in `src/lib/choose-ptah-select.ts`, exported from the harness barrel. Opens the button combobox, follows aria-controls to its listbox, selects an exact visible label, rejects disabled options and waits for closure. Local/OAuth option labels include the modality rendered by the source. |
| 2, 7: edit-instance menu | Locate More actions and Edit in the instance row Status cell instead of lane-detail. |
| 3, 8: roles collapsed by default | Replaced with assertions that consumer-table and enhancement role are visible initially and after leaving/returning to Providers. |
| 4, 9: More actions visual geometry | Measure the row menu in the instance row, retaining panel/viewport checks. |
| 5, 10: Copilot instance provider | Choose the shared-select option labeled GitHub Copilot with its OAuth modality. |
| 11, 12: Main Agent provider | Select Kimi Code through the shared helper; retained confirmation/no-write assertions. |
| 13, 14: kept selectors reachability | Removed the sr-only header reveal click; assignment heading is already visible. |
| 15, 18, 21, 24: orchestration fold/roles | Assert the current gap-[var(--ptah-gap-field)] token and visible consumer-table. Measure the visible roles table instead of an sr-only header. Removed obsolete disclosure/chevron rotation/open-state checks, retaining roles, layout and popover checks. |
| 16, 19, 22, 25: matrix popovers | Migrated add-provider selection to shared select; locate Model/Effort controls in their lane row, retaining expanded-detail Permission/Credentials locators. |
| 17, 20, 23, 26: Save to options | Open the rich-select listbox and assert role=option labels. All three original expected choices remain: Global, host App name, This workspace. Choose the host app with the helper. Source targetSelectOptions still maps all targets; this is intended DOM migration, not a scope behavior change. |
| 27, 28, 29, 30: live-shaped Batch 52 version | Follow Version dt + dd span[title] in the detail facts; inspect the adjacent term instead of removed data-ptah-description-row wrapper. Exact normalized version, raw title, placement and clipping assertions retained. Antigravity Model now resides in its lane row; model text/title checks retained. Source still renders the Version fact and title, so no product regression was identified here. |
| Electron shard 3: settings renders | Removed click on sr-only background-roles-summary; assert consumer-table visible before assignment heading. |
| Electron shard 4: enhancement saved provider/model | Assert consumer-table visible, then keep the saved enhancement row checks. |

## Additional matching stale assumptions

- Migrated all other Providers selectOption calls in settings-cli-matrix.entries.ts and settings-reachability.table.ts, including Save-to option count/text assertions. Unrelated native selects in Preferences and VS Code LM remain unchanged.
- Migrated the Electron permission evidence interaction to combobox/Auto edit option and button text. Electron cannot import the harness by workspace boundary rules, so this spec uses the two DOM clicks directly.
- Moved remaining instance detail-menu locators and menu items to their row. Detail Test fallback now opens the row menu. Pi detail access uses the existing shared expandMatrixDetail helper.
- Permission detail triggers now say Permission; retained Copilot state assertions against the source tooltip detail instead of removed badge text. Explicitly reopen Codex detail after inspecting Copilot.
- Added capability-chip interaction assertions: click each data-capability chip and verify its aria-controlled value popover is populated. All capabilities full-detail assertions remain.
- Preserved the pre-existing catalog-hint reachability change: catalog names are asserted in catalog-hint-text after opening the badge popover. The pre-existing reachability file changes were not overwritten.
- No remaining background-roles-summary click or lane-detail-scoped ptah-table-row-actions locator exists in the searched harness/Electron specs.

## Checks and results

- `npx prettier --write <changed files>`: passed for all ten changed TypeScript files (including the new helper); repeated for the final two modified files.
- `npx eslint <changed files>`: final run passed, exit 0, zero errors. Two max-lines warnings remain in the already oversized settings-cli-matrix.entries.ts and settings-reachability.table.ts. Initial lint caught the forbidden Electron-to-harness dependency; removed that import and reran successfully.
- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.json`: passed, exit 0. This root has empty files/include and project references; this command alone does not check the specs.
- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.spec.json`: failed, exit 1, on existing TS1343 CommonJS/import.meta incompatibility in fixture-server.ts, marketplace-visual.e2e.spec.ts, onboarding-ready-capture.ts, plan-limits-visual.e2e.spec.ts and settings-capture.ts; plus unrelated TS2345 at preferences.e2e.spec.ts:46 (RegExp passed as a native selectOption label). No errors were reported in the changed sources. These unrelated files/configs were left untouched.
- `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json`: passed, exit 0. This root also has empty files/include with references, so it does not establish full Electron spec type safety.
- Runtime/visual verification intentionally not performed: the task prohibits e2e, Playwright and servers. No screenshots or baselines were generated, and rendered visual quality is not claimed.

## Tools and limitations

Ptah workspace analysis was available and used. Ptah dependent lookup returned an incomplete graph with the requested helper absent; used rg imports/text searches and native source reads as fallback. The CLI exposes no skill-loading mechanism; read the local angular-frontend-patterns SKILL.md directly for Angular source context. No product/UI design was implemented in this lane. Browser rendering would conflict with the task's explicit verification restrictions.

A progress report about the harness typecheck limitation was refused by the parent messaging tool with parent-inbox-full; no retry was sent. This file and the final completion message contain the result.
