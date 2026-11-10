# Summary

Updated only `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-cli-matrix.entries.ts` to target the provider-card grid while retaining the existing Ptah CLI instance-card locators. The provider helper now resolves `cli-provider-card-<id>`; the instance helper still resolves `cli-matrix-row-glm-instance-1`. No component hook was needed.

# Scenarios changed

| Scenario | Old target | New target |
| --- | --- | --- |
| #59–#69 delegated model and effort | System CLI table row and `cli-matrix-model/effort-<id>` cell | Provider card and button beside its Model or Effort label; existing model/effort popover content checks retained |
| #63 Copilot auto-approve | Permission info cell and table permission badge | Copilot card Safety button and provider popover; toggle and Undo assertions retained |
| #64 Cursor credentials | Cursor row Credentials cell | Cursor card Credentials button; credential popover assertions retained |
| #70 permission and safety notes | Codex/Copilot permission cells | Card Safety buttons and provider popover; also checks capability popover, Codex lane default selects, and full-access dialog Cancel/Confirm controls |
| #71 uninstalled CLIs | `tr` count, table cells, install cell | Provider-card count, status slot, disabled Model/Test/enabled controls, Install guide popover and Re-detect button; checks shared defaults card and its selects |
| RUX-8 effort save and Undo | Codex effort cell | Codex card Effort button; RPC and Undo assertions retained |
| Ptah CLI instance scenarios (#39, #42, #43–#57, RUX-11) | Instance row/card test IDs | Existing instance card IDs retained through the card helper; instance interaction and assertions retained |

# Hooks requested

None. Existing card test IDs, labels, classes, and popover IDs support the updated entries.

# Verification

Command: `npm run verify -- -p webview-e2e-harness | Select-Object -Last 60; exit $LASTEXITCODE` from the worktree root. Exit code 0. Relevant tailed lines:

```text
[verify 2026-11-08T21:26:03.739Z] starting verify lint,typecheck (webview-e2e-harness)
 NX   2 tasks: 2 succeeded
[verify 2026-11-08T21:26:25.837Z] starting verify test (webview-e2e-harness)
 NX   0 tasks: 0 succeeded
[verify 2026-11-08T21:26:29.712Z] lock released after 26.0s, exit code 0
```

Nx reported that `@ptah-extension/webview-e2e-harness` has no configured `test` target. Scoped Ptah diagnostics timed out before returning a TypeScript result; the mandated verify command completed lint and typecheck successfully.

## Decisions

- Kept the Uninstalled disclosure because the matrix still owns grouping while the new grid replaces its row rendering. Reversible if the mounting lane changes grouping.
- Used label-adjacent Model, Effort, and Safety triggers because the card template has no per-field test IDs; scoped them to a provider card ID. Reversible by adding dedicated hooks later.
- Kept instance-card selectors because `ptah-cli-instances` continues to render those cards and their existing test IDs.

## Not done

No e2e run, as requested. No pre-existing scenario exercised Reset through its new popover or clicked Confirm in the full-access dialog; #70 checks that Confirm is present and cancels the proposal without saving. The lane had no skill-loading tool, so `angular-frontend-patterns` could not be loaded.
