# Batch 3 report — Provider and instance subforms

## Implementation

- The add/edit instance modal now has one real submit path. The body form has an ID, and the footer uses an associated `type="submit"` button. Enter and the footer button use the same form submit handler. The hidden submit button and separate footer click handler are removed.
- The provider wizard merges its desktop and mobile progress into one compact current-step header with an **All steps** disclosure. One persistent step heading receives focus. Duplicate headings inside the five step panels and extra body padding are removed.
- The saved wizard state keeps its status in the body and shows **Done** as the only footer action. The duplicate body Done button and the simultaneous commit action are removed. Back, Cancel, and the commit action remain unchanged before a successful save.
- Tier mapping focus now queries `NativeModalComponent.panel()?.nativeElement`. Host-local queries cannot reach the CDK-projected controls.
- Specs now query the attached CDK drawer, modal, popover, or document portal. Discard and Escape checks use CDK dismissal instead of native `<dialog>` events.

## Files changed

- `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.html`
- `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.stored-key.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/connection-detail-drawer.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.spec.ts`

`accounts-tab.component.spec.ts` needed no change. No Batch 1, Batch 2, or Batch 4 files were edited.

## Checks

| Check | Result |
| --- | --- |
| Focused Jest command with all 8 Batch 3 spec paths | 8 suites passed, 0 failed. 365 tests passed, 0 failed. |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | Passed, 0 errors. |
| `npx eslint` on the 10 changed files | Exited 0 with 0 errors and 1 `max-lines` warning in `provider-setup-wizard.component.ts` (2223 lines). The Nx module-boundary rule was skipped because no cached project graph was available. |
| Scoped `ptah_get_diagnostics` | Unavailable after 45 seconds. The direct TypeScript check passed. |
| Electron interaction and screenshots | Not run. No active browser or Electron renderer was available. No build, serve, dev, or e2e target was run. |

## Decisions

| Decision | Evidence | Reversible |
| --- | --- | --- |
| Use one compact step header and a native All steps disclosure. | The plan requires the current step once, and completed-step navigation must remain available at every width. Existing step links and focus behavior remain covered by specs. | Yes, presentation-only. |
| Show Done alone only while the saved Scope step is open. | The plan requires one primary action after save. Restricting this state to Scope preserves normal footer actions after a close and reopen. | Yes, footer-only conditional rendering. |

## Open risks

- Actual Provider connection panel dimensions near the modal bottom and the short-viewport wizard footer still need an Electron smoke test and screenshots. Jest verifies the portal structure and interactions, not rendered geometry.
