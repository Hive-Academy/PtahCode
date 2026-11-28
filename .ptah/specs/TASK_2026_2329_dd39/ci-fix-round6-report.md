# PR 1517 CI fix round 6

Head under repair: `8a5feb6c4`. No commit or push was made.

## 1. Setup recovery model-picker focus

- **Failure:** `ProviderConsumerAssignmentsComponent › focuses the model picker in the attached Setup recovery panel`.
- **Decision:** Product regression from `8a5feb6c4`.
- **Root cause:** The rich model combobox is disabled while its catalogue loads. `onPopoverOpened()` tried to focus it during that load, then cleared the focus target even though the focus attempt failed.
- **Fix:** Keep the Setup focus target in a signal until the requested control receives focus. An `afterRenderEffect` retries field focus when the picker's loading state changes. Disabled controls are skipped. Cell focus remains in the popover's `opened` event so the native panel cannot overwrite it afterward. The picker exposes its existing read-only `modelsLoading` signal to the host.
- **Files:**
  - `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts`
  - `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts`
- **Spec:** The original recovery assertion is unchanged and now passes. The existing deep-link cell-focus assertion also passes.

## 2. Lanes table Model and Network tracks

- **Failure:** `LanesTableComponent visual presentation › clips Model and Network to their own wide-row tracks`.
- **Decision:** The spec was out of date with the intended layout change in `27e71f6e9`.
- **Root cause:** The commit intentionally gives Permission and Network equal 13% tracks. The spec still required Network 12% and Permission 14%.
- **Fix:** Update those two expected widths to 13%. All clipping, DOM-separation, and other track assertions remain unchanged.
- **File:** `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.visual.component.spec.ts`.
- **Ownership:** No owned CSS, HTML, detail template, or Electron shot file was edited. No change in those files is needed.

## 3. Capability matrix collapsed detail triggers

- **Failure:** `CapabilityMatrixSettingComponent › connects collapsed detail triggers to their content`.
- **Decision:** The spec's resize double was out of date with the intended popover size observer added in `8a5feb6c4`.
- **Root cause:** The mock stored only the newest `ResizeObserver` callback. Opening the native popover added a panel observer and replaced the table callback. Later test resize calls therefore resized the popover panel, not the table.
- **Fix:** Bind the saved callback to the observed `PTAH-TABLE` host and pass the observed target in mock entries. Wait for the render effects around placement changes. The assertions for closing the popover and restoring focus are unchanged.
- **File:** `libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.spec.ts`.

## 4. Providers fold and Batch 52 card heights

- **Failures:**
  - `settings-visual.e2e.spec.ts:903`, baseline smoke, Electron, both themes.
  - `settings-visual.e2e.spec.ts:1264`, live-shaped Batch 52, Electron, both themes.
  - Both measured a connection card at 87 px against the existing 80 px budget.
- **Decision:** Product layout defect exposed by the intended fixture change in `27e71f6e9`.
- **Root cause:** The fixture now gives Ollama a saved local endpoint so Add Ptah CLI instance can create a keyless local lane. `ProvidersSettingsStateService` therefore marks Ollama configured and the Providers page gains its valid connection card. That card is Not checked and shows the status, Check connection action, and Local badge. The right-side flex group could wrap. Its extra height adds to the separate provenance grid row, producing the 87 px card.
- **Fix:** Keep the status group on one line. Allow the status label to truncate, keep the inline action at its content width, and preserve the existing full provider name and modality. The card's accessible name retains the complete status. No raw pixel class was added.
- **Files:**
  - `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts`
  - `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.spec.ts`
- **Spec:** The E2E height budget remains `<= 80`. A local-provider unit case covers the one-line control contract. The previous long-provider-name coverage remains as a separate test.
- **Verification limit:** Playwright was prohibited for this lane. The 80 px rendered result therefore needs the next CI run. The focused unit tests compile the inline template and verify its layout classes, but do not measure browser pixels.

## 5. Marketplace visual failure

- **Failure:** `marketplace-visual.e2e.spec.ts:190`; the third catalog card had no resolved `[card-mark]` descendant at the line-213 check.
- **Decision:** Unrelated to this branch; leave unchanged.
- **Evidence:** `git diff main...HEAD` changes the marketplace detail-drawer test id and the later drawer animation wait. It does not change catalog-card mark rendering, catalog fixtures, or the failing helper. The failing check occurs before the changed drawer scene. The missing element is consistent with intermittent mark resolution, but the supplied log contains no retry result that would prove flake behavior.
- **Files changed for this item:** None.

## Focused verification

| Check | Result |
| --- | --- |
| Chat Jest: provider consumer assignments, provider connection card, lanes table visual, capability matrix | 4 suites passed; 119 tests passed. |
| UI Jest: provider model picker | 1 suite passed; 79 tests passed. |
| `npx.cmd tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | Passed. |
| `npx.cmd tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` | Passed. |
| ESLint on all six changed TypeScript files | No errors. One pre-existing `max-lines` warning in `provider-consumer-assignments.component.ts`. |
| `git diff --check` | Passed; only existing CRLF notices were printed. |

No `npm run verify`, Nx, build, serve, E2E, or Playwright command was run. Other lanes' worktree changes were preserved.
