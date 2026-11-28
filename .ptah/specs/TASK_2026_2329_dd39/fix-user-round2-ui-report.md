# Settings overlays round two

## A. Ptah CLI lane header

The chevron opens an inline detail panel. Its model and effort controls lived in the general detail facts, while permission and network appeared in those facts only when the table collapsed. Instance rows show inherited permission and network as text.

The expanded instance now has a dedicated header for name, provider, model and effort, inherited permission, and inherited network. It uses a shared control-height minimum and the control gap token. The fields wrap when the panel width is constrained. The table row aligns the inherited values to the small control height, and the group header gives Defaults and Add a shared token gap.

The table uses equal Permission and Network tracks and keeps each inherited label on one line. Long values can truncate in the table and remain available in the expanded header.

Files in `libs/frontend/chat/src/lib/settings/ptah-ai` include `lanes-table.component.{html,css,spec.ts}` and `lanes-table-detail.component.html`. The Electron scenes are in `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts`.

## B. Provider options

The background picker merged route metadata with the static registry. The Add Ptah CLI Agent Instance modal read all entries in the connection store, including catalog-only entries. Both now take choices from the deduplicated Settings connection data. The main connection list retains its setup-only cards. Picker choices exclude missing credentials, unreadable keys, stale tokens, and role-specific incompatible providers. Disconnected saved choices stay visible in the background picker and instance editor. The empty state links to the existing connection setup wizard.

Files in `libs/frontend/chat/src/lib/settings/providers` include `provider-connection-options.ts`, `providers-settings.component.ts`, `provider-consumer-assignments.component.{ts,spec.ts}`, and `add-cli-instance-modal.component.{ts,html,spec.ts}`. The shared picker change is in `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts`. Updated webview harness files are `settings-cli-matrix.entries.ts`, `settings-orchestration.e2e.spec.ts`, and `settings.fixtures.ts` under `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings`.

The Decision model receives the same connected options from the assignments component. Its own saved-value and empty-state presentation is in the parallel lane's files. The parent was notified.

## Verification and screenshots

The three changed chat Jest suites passed all 115 tests. The shared picker suite passed all 78 tests. The webview harness TypeScript check passed. ESLint on the changed TypeScript and HTML exited successfully with 20 warnings for existing file lengths and non-null assertions. `git diff --check` passed.

Angular template compilation passed using `ngc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json`, with existing unused-import warnings. The requested `copy-renderer-dev` command used `NX_DAEMON=false` and an 8 GB Node heap for both attempts. Angular bundling exited with code 1 after the Tailwind deprecation warning on Node 26.13.1 and Node 24.22.3. The retry used two Angular workers and serial TypeScript compilation. The copy step did not run, and the existing Electron renderer timestamp was unchanged. The nested build logs are `.nx/cache/terminalOutputs/16255876466700609607` and `.nx/cache/terminalOutputs/3759004150254844340`.

Fresh Electron capture is blocked by the renderer build. Playwright discovered all ten overlay scenes. The updated scenes target `ptah-cli-instance-header-1440.png`, `ptah-cli-instance-header-1824.png`, `ptah-cli-instance-header-800.png`, and `ptah-cli-instance-edit-1824.png`. They assert one header line at both desktop widths and wrapping at 800 px. The Add instance scene also asserts the absence of an unconnected provider. The Electron scenes and webview scenarios have yet to run with the new bundle.

I inspected the existing Electron references `providers-lanes-dark-1824-after.jpg`, `add-ptah-cli-instance-provider-open.png`, and `memory-curator-openrouter-provider-open.png`. They show the inherited values in the 1824 px table and provider menus containing catalog entries. The 1440 px reference shows the inherited Network label wrapping. These references predate the fix.

The CLI exposed no native skill invocation. I read the repository UI design, Angular frontend, and orchestration skill files directly. Ptah search did not return usable results, so file discovery used `rg` and PowerShell.
