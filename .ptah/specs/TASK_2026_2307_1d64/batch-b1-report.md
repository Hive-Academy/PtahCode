## Changes

- Item 4. Connect provider and its deep link invoke blank setup at `providers-settings.component.ts:342` and `:1217`. The focusable page entry describes the first gate reason at `:866`. The parent passes the card-resolved status and default-model capability at `:592` and dispatches the row shortcut at `:1555`. The wizard's picker, loading rows and retry alert are in `provider-setup-wizard.component.ts:458`–`:587`.
- Item 5. The discard dialog uses the native modal, its Escape behavior and a danger button at `provider-setup-wizard.component.ts:405`. The close condition and probe handling are at `:2527`.
- Item 6. The stable-label API-key toggle is projected into the four credential fields at `provider-setup-wizard.component.ts:752`, `:936`, `:998` and `:1059`.
- Updated both chat specs, the reachability picker and discard paths at `settings-reachability.table.ts:97` and `:249`, and the Providers E2E scenarios at `settings-providers.e2e.spec.ts:127` and `:144`.

## Parity

- Connect provider entry moved to direct wizard setup at `providers-settings.component.ts:342`.
- More providers deep link moved to blank wizard setup at `providers-settings.component.ts:1217`.
- Case-insensitive name and ID search kept at `provider-setup-wizard.component.ts:458` and `:1723`.
- Search reset kept through keyed wizard instances at `providers-settings.component.ts:581` and draft reset at `provider-setup-wizard.component.ts:2563`.
- Catalog count and names kept in the page hint at `providers-settings.component.ts:956`.
- Unconfigured provider rows moved to the start of the wizard group, with connected providers following at `provider-setup-wizard.component.ts:1722`.
- Row auth method, registry description and default-model hint moved to `provider-setup-wizard.component.ts:536`.
- Row identity moved to the existing provider mark and fallback at `provider-setup-wizard.component.ts:524`.
- Selecting a named provider moved to the row radio at `provider-setup-wizard.component.ts:515`.
- Setup gating moved to the page entry at `providers-settings.component.ts:343`, `:866` and `:1441`.
- Direct OAuth/CLI sign-in moved to the row shortcut at `provider-setup-wizard.component.ts:546` and `providers-settings.component.ts:1555`.
- Custom endpoint entry and explanation moved to the last radio at `provider-setup-wizard.component.ts:560`.
- Connections read error and Retry moved to the page alert at `providers-settings.component.ts:387` and the later refresh alert at `provider-setup-wizard.component.ts:486`.
- Loading feedback moved to the gate reason at `providers-settings.component.ts:381` and to four skeleton rows during an in-drawer refresh at `provider-setup-wizard.component.ts:493`.
- No match and Clear search kept at `provider-setup-wizard.component.ts:470`.
- Close, Escape and focus containment moved to the existing wizard drawer at `provider-setup-wizard.component.ts:316` and `:2527`.
- Return focus kept on the setup opener at `providers-settings.component.ts:1441` and `:1517`.
- Removed the approved catalog modal shell, its deferred block and its spec. The setup wizard retains its own deferred block at `providers-settings.component.ts:580`.
- Drawer close X, backdrop, Escape and Cancel kept at `provider-setup-wizard.component.ts:316`, `:1456` and `:2527`.
- Busy close guard kept at `provider-setup-wizard.component.ts:2527`.
- Cancel in-flight probe on close kept at `provider-setup-wizard.component.ts:2528`.
- Dirty-draft check kept at `provider-setup-wizard.component.ts:2007`.
- Discard confirmation moved from an inline review to the native modal at `provider-setup-wizard.component.ts:405`.
- Discard title and body copy kept at `provider-setup-wizard.component.ts:412` and `:420`.
- Keep editing and dismissal kept at `provider-setup-wizard.component.ts:409`, `:423` and `:2545`.
- Discard clears the key draft, masks the field and emits close at `provider-setup-wizard.component.ts:2548`.
- Initial discard focus moved to Keep editing. Native dialog focus return uses the prior drawer control, with Cancel as the fallback at `provider-setup-wizard.component.ts:423` and `:2536`.
- Confirmation reset kept in the draft reset flow at `provider-setup-wizard.component.ts:2585`.

## Decisions

- Derive Connected using the Connections card's `resolveConnectionState` and `applyRecordedCheck` helpers. Matching the card's displayed state preserves probe and failure semantics that a raw configuration flag would lose. Reversible in the page-to-wizard data binding.
- Display the binding scope-gate reason next to Connections and keep Retry setting sources in the existing Main agent region. This preserves the requested reason and the projection boundary. Reversible at the page entry.
- Use the native dialog's initial-focus and restoration behavior with Cancel as a drawer fallback when backdrop activation leaves focus outside the panel. The existing modal primitive owns Escape and Tab. Reversible in the discard template and close handler.

## Checks

- Jest passed 2 suites and all 172 tests. Early runs exposed a missing route fixture, the shared modal backdrop in the wizard button-style test and the concurrently edited Main agent assertion. B1 corrected the fixture and backdrop check. The Main agent assertion was left intact and passed on the final run.
- ESLint exited 0 with 0 errors and 3 file-length warnings. The module boundaries rule skipped all six files because a cached Nx project graph was unavailable. An earlier lint run flagged explicit `autofocus`; the final modal relies on the native first-control focus.
- Chat library TypeScript exited 0 with 0 errors. It ran before the final template-only removal of `autofocus`.
- Scoped `ptah_get_diagnostics` timed out after 45 seconds and returned six unchecked files.
- The focused commands below ran sequentially. The final runs used `node scripts/verify.mjs --exec` in direct-command mode, under the repository memory lock.

```sh
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.spec.ts
npx eslint libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.spec.ts libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-reachability.table.ts libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-providers.e2e.spec.ts
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
```

## Extra reads

- Loaded the repository's `angular-frontend-patterns` skill and its effect guidance.
- Verified the provider registry and connections mapping, card status helpers, alert live roles, badge and skeleton APIs, the field trailing outlet, the danger button variant and the native drawer/modal keyboard contracts. Read the repository verification instructions in `CLAUDE.md` and the lock wrapper’s direct execution mode.
- Checked the account-removal and credentials precedents, and searched for catalog selectors in the adjacent E2E helper and visual scenario.
- Ptah file search returned zero results for the hidden task files. Read the supplied task-folder paths with native tools. Ptah AST analysis parsed the three affected source files successfully. The dependents index was building, so searched the explicit catalog selector and imports with `rg`.

## Not done

- The catalog selector survives in `settings-visual.e2e.spec.ts:1201` (owned by the other lane) and `settings-drawer.reach.ts:274` (outside B1's allowlist). B1's two E2E files no longer call the retired helper.
- Electron rendering, E2E execution and Angular template typecheck were outside the authorized check list. Jest exercised both edited Angular components in its test renderer.

## Proposed Removals

## Clarifications Needed
