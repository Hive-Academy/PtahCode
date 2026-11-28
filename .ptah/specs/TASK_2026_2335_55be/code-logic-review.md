# Code Logic Review — TASK_2026_2335_55be

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Assessment | APPROVED |
| Blocking | 0 |
| Serious | 0 |
| Moderate | 2 |
| Failure modes found | 2 |

## Five logic questions

1. Silent failure: no leftover caller resolves the removed token. Repo-wide grep of `LICENSE_SERVICE|LicenseService|license:*|openPricing|openSignup|PRICING_URL|SIGNUP_URL|LICENSE_PUBLIC_KEY|includeLicensingAndAuth|licenseKey|LicenseRpc|LicenseRequired` over apps and libs (ts, html, json) returns nothing. The only hits are tools/mcp-bench fixtures (static data) and one `not.toContain('<ptah-builders-card')` assertion in dashboard-grid.layout.spec.ts, which is intended.
2. User action: Setup is now an icon button in global-config-actions, always rendered. It uses `selectItem` -> `setCurrentView('onboarding')`, the same call the old tab used. `data-test="config-menu-item-setup-hub"` is kept, so the onboarding and config-menu-remount e2e specs still resolve.
3. Wrong-answer input: an old export file containing `licenseKey` is still accepted. `PtahSettingsExportSchema` uses `.passthrough()` (settings-export.schema.ts) and `SettingsImportService` no longer reads the field. The key is ignored, with no error.
4. Dependency failure: removing the 24 h revalidate interval has no ordering effect. `main.ts` no longer reads `post.revalidationInterval`, and `PostWindowResult` only has `updateCheckInterval`. No reference remains (grep `revalidationInterval|startMembership` is empty). `clearTimers` still clears the update-check interval.
5. Missing: a previously stored license-key secret stays orphaned in secret storage (see M1).

## Failure modes

### Orphaned legacy secret
- Trigger: a user who had a license key stored in secret storage.
- Symptom: the value sits unused on disk. Nothing reads or exports it any more.
- Evidence: `SECRET_KEYS.LICENSE_KEY` was removed from the settings code, and no cleanup migration is in the diff.
- Recommendation: optional. Delete the key once at boot, or accept it as harmless.

### No regression test for the legacy export file
- Trigger: a later change to the passthrough schema or to `validateExportData`.
- Symptom: old exports with `licenseKey` start failing, with no test to catch it.
- Evidence: the three removed settings-rpc spec cases were deleted, and I found no replacement. I did not exhaustively check the settings-import spec.
- Recommendation: add one import test with `licenseKey: 'x'` that expects success and `imported` without it.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

- M1: orphaned secret, as above.
- M2: tools/ui-class-audit/baseline.json:435 still lists the deleted builders-card file. The checker says a decrease passes. I did not run it to confirm that a missing file is not an error. The entry is better removed with `--update-baseline`.
- Minor: stale `license:` mentions remain only in the tools/mcp-bench fixtures. They are data, not code.

## Data flow (checked)

- Boot: `bootstrap.ts` no longer exports `startMembershipVerification`. The "never rejects" doc now points at `startAgentAdapterInitialization`. OK.
- Post-window: the interval is removed and the return shape narrowed. OK.
- Shutdown: `main.ts` drops the clearInterval. `clearTimers` still handles the update interval. OK.
- DI: `includeAuthAndTelemetry` is renamed consistently across the Electron, cli-engine and vscode-core specs and in cli-engine container.ts. The default stays true, which registers AuthSecrets and Sentry. OK.
- CLI: the `seedCommunityStatus` call and `LicenseRpcHandlers` registration are gone. The `LicenseRequired` stderr code has no consumers. OK.
- RPC: the `'license:'` prefix is removed from the allowed prefixes in rpc-handler.ts. No client calls remain. OK.
- settings-rpc: the `platformCommands` and `licenseService` injections are removed, along with the reloadWindow timer. `IPlatformCommands` has no other use in that file, since only the removed reload block used it. OK.
- environment.constants: removed `PtahUrls`, `PtahDevUrls`, `resolveEnvironment` and `LICENSE_PUBLIC_KEY_BASE64`. The only caller was electron-platform-commands. `PtahProdDefaults` and `PtahDevDefaults` are kept. No other user found. OK.
- electron-platform-commands: the private `openExternal` helper was used only by the two removed cases. Other code opens URLs through `IUserInteraction.openExternal`. OK.

## Nav

- electron-shell.component.ts: Chat, Voice, Tasks, Reviews and Apps sit inside `@if (layout.hasWorkspaceFolders())` (line ~254). Machines (line ~327) is outside that block, so it shows without a folder. Analytics follows in a second `@if` on `hasWorkspaceFolders()`.
- global-config-actions order is Thoth, Marketplace, Setup, Settings. The `@for` over `items` is a plain array with no inputs, and the component sits outside any `@if`.
- Setup's active state comes from `openConfigurationSurface() === 'onboarding'` via the `selected` input. That matches the old tab logic.
- app-shell.component.html (VS Code): the order is Tasks, Dashboard, then Thoth and Marketplace. The Dashboard and Tasks buttons are still inside `@if (!isElectron)`.
- The removed `openSetupHub` and `WrenchIcon` have no remaining references in this review's greps.

## e2e swap

`auth:getAuthStatus` is registered in auth-status-methods.ts:65 and auth-rpc.handlers.ts. The Electron container registers auth RPC handlers, so a success envelope with a data object is plausible. I did not run it, and I did not verify that the handler returns an object (not null) when the user is unauthenticated.

## KEEP-list

I saw no diff to planTier or subscriptionType, 'covered-by-subscription', model pricing, `prefetchPricing` or Copilot premium requests. Only comment and wording changes touched the removed items. The scenario-sanitizer change dropped only `'license:getStatus'`; `'config:pricing-get'` remains.

## Not verified

- No lint, typecheck or e2e run, as instructed.
- Template compilation (ngc) was not run.
- docs, landing and legal copy were not reviewed line by line.
- Whether `getAuthStatus` returns a non-null object when logged out.

## Verdict

- APPROVE, confidence MEDIUM-HIGH.
- Top risk: no automated check proves that old exports with `licenseKey` still import.
- A more robust version would add the legacy-export test and remove the stale baseline.json entry.
