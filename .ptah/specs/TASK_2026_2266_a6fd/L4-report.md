# L4 ? Providers shared control migration

## Changes and line counts

Counts compare the start of this round with the final formatted files. Main counts are included where the path exists there. All changed TS files over 700 lines finish at or below their main count.

| File (under libs/frontend/chat/src/lib/settings/) | Before | After | main | Change |
| --- | ---: | ---: | ---: | --- |
| `providers/decision-model-key-field.component.ts` | 121 | 119 | 121 | Shared floating field and ptahInput for the secret editor; retains focus method and input hooks. |
| `providers/decision-model-row.base-url-field.component.ts` | 94 | 87 | 94 | Shared floating Base URL field and mono input; retains help/error IDs and reserved error slot. |
| `providers/decision-model-row.timeout-field.component.ts` | 232 | 227 | 232 | Shared floating timeout field and mono input; retains validation and commit bindings. |
| `providers/decision-model-row.component.ts` | 506 | 509 | 813 | Imports public shared field/input controls. |
| `providers/decision-model-row.component.html` | 305 | 307 | new | Shared floating model-ID field; datalist, validation and save hooks retained. |
| `providers/main-agent-reassign-popover.component.ts` | 825 | 827 | 828 | Imports public shared field owner. |
| `providers/main-agent-reassign-popover.component.html` | 399 | 403 | new | Shared floating field around manual model ID; existing label and focus target retained. |
| `providers/cli-tier-mapping-modal.component.ts` | 305 | 307 | 305 | Imports shared field and extracts template. |
| `providers/cli-tier-mapping-modal.component.html` | 0 | 202 | new | Extracted template; shared floating manual tier model-ID field. |
| `ptah-ai/cursor-credential-popover.component.ts` | 370 | 200 | 370 | Imports shared field and extracts template. |
| `ptah-ai/cursor-credential-popover.component.html` | 0 | 173 | new | Shared key field with existing show/hide action in the public trailing slot. |
| `ptah-ai/agent-orchestration-config.component.ts` | 542 | 346 | 542 | Imports shared field and extracts template. |
| `ptah-ai/agent-orchestration-config.component.html` | 0 | 199 | new | Shared Max Concurrent field; retains bounds/change binding and gives the floating label adequate width. |
| `ptah-ai/lanes-table.component.html` | 528 | 529 | new | Compact class on Permission/Network control tds, Model td and identity th. |
| `providers/connection-drawer/advanced-tab.component.ts` | 344 | 400 | 344 | Imports field grid and extracts template; existing fields remain shared. |
| `providers/connection-drawer/advanced-tab.component.html` | 0 | 259 | new | Public field grids for endpoint fields and input/output pricing; shared error on Base URL. |
| `providers/decision-model-row.endpoint.spec.ts` | 627 | 641 | 622 | Verifies custom endpoint controls retain ptahInput and shared label associations. |
| `providers/decision-model-row.component.spec.ts` | 843 | 835 | 836 | Replaces obsolete bespoke class assertion with shared field ownership/label checks; consolidates duplicate imports and obsolete introductory commentary. |
| `ptah-ai/lanes-table-detail.component.ts` | 422 | 425 | 324 | Compact class on the expanded Account dd wrapper. |

## Audit, scope additions and API decisions

The initial complete input/select/textarea/ptahSelect inventory of the two settings folders is `L4-inventory.log`. Non-Providers settings pages in that inventory are outside scope. No native select remains in the listed Providers components; they already used ptah-select before this round. There are no ptah-setting-row selects in the listed Providers files, hence no applicable row titleId/labelledBy binding to add. The shared row API exposes titleId(); unrelated setting rows on voice/Advanced settings pages were left untouched.

Checked the added connection drawer scope: connection-detail-drawer, overview-tab, models-tiers-tab, credentials-tab, advanced-tab, kimi-code-login-progress, and accounts/add-account-form. The only text controls are already shared fields in credentials, Advanced, and Add account. Only Advanced needed grouping changes; other files were inspected and retained. None contains a ptah-form-section, so no wide input applies. Model-search components continue through their existing public UI component API.

Also inspected and retained add-cli-instance-modal (name already inside ptah-field; provider already ptah-select), cli-shared-defaults (delegates to cli-lane-default-cell, already shared fields/selects and ptahFieldGrid), and ptah-cli-instances (checkboxes only). Checkboxes/toggles are unchanged. The Account control remains its existing account menu; it was not a native select, and its compact wrapper is now marked. Provider setup wizard is explicitly out of scope and remains untouched.

Read the public PtahFieldComponent label/hint/error/appearance/size and projection API, PtahRichSelectComponent labelledBy, PtahSettingRowComponent titleId(), the field grid's maximum-three-column variants, and the compact table selector in ptah-select.css. Retained existing external help/error elements and their IDs in decision fields because the field API has no consumer-defined error element ID; existing validation and ARIA assertions pass. No UI library file was changed.

## Validation

Results are finalized below. Logs are UTF-8 text in this task folder.

`npx prettier --write libs/frontend/chat/src/lib/settings/providers/decision-model-key-field.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.base-url-field.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.timeout-field.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.html libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.html libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.html libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.html libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.html libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`

`npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`

`npx eslint libs/frontend/chat/src/lib/settings/providers/decision-model-key-field.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.base-url-field.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.timeout-field.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.html libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.html libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.html libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.html libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.html libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`

Jest commands and final results: pending summary.

Prettier: pending final result. TypeScript library check: PASS (exit 0, L4-tsc.log). ESLint: pending result.

## Limitations and execution notes

No build/serve/e2e was authorized or run. Refreshed Electron verification remains unverified; the parent capture request was rejected with parent-inbox-full. No fresh screenshot of these Angular changes is claimed. The changes follow the existing reference's shared floating fields, compact table controls and related-field grouping; tests/type checks do not establish rendered visual quality.

CLI-native skill loading is unavailable. Applied the local angular-frontend-patterns skill already read in this session and read the local ui-ux-designer guidance for existing design-system reuse. No new visual design approval was requested because the brief already authorizes this migration. Ptah's dependency index was previously incomplete for these files; native source reads and rg supplied API/usage inspection, with the requested direct compiler and Jest checks for verification.

No libs/frontend/ui files, unrelated settings pages or setup wizard were edited. No commits, pushes, stashes, reverts, restores, clean operations, Nx, verify, build, serve or e2e commands were run.
