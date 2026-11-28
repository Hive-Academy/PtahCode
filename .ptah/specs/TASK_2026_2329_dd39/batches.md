# Implementation batches

Each batch has one CLI lane and its own file list. Batch 1 lands first. Batches 2–4 depend on its overlay contract and can then run in parallel. Batch 5 can run independently. Listed test files include portal-query updates where needed.

For each batch, run one focused check at a time from the workspace root.

- `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <listed specs for that project>`
- `npx tsc --noEmit --project <project>/tsconfig.lib.json` for changed libraries and `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json` for the renderer.
- `npx eslint <changed files>` for files covered by ESLint.
- Use a running Electron renderer for interaction and screenshots. CLI lanes do not run `npm run verify`, Nx, or build/serve/e2e targets. No commits or pushes.

## 1. Shared CDK overlay primitives

**Files**

- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.template.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-compact.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-look.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/form-controls-layout.spec.ts`
- `libs/frontend/ui/src/lib/overlays/shared/overlay-positions.ts`
- `libs/frontend/ui/src/lib/overlays/popover/popover.component.ts`
- `libs/frontend/ui/src/lib/overlays/popover/popover.component.spec.ts`
- `libs/frontend/ui/src/lib/overlays/dropdown/dropdown.component.ts`
- `libs/frontend/ui/src/lib/overlays/dropdown/dropdown.component.spec.ts`
- `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts`
- `libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts`
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts`
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts`
- `libs/frontend/ui/src/lib/native/modal/index.ts`
- `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts`
- `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.spec.ts`
- `libs/frontend/ui/src/lib/patterns/editable-section/editable-section.component.spec.ts`
- `apps/ptah-extension-webview/src/styles.css`

**Acceptance.** Existing public overlay components use the shared CDK connected placement policy or CDK Dialog shell. The select list mounts in a CDK layer above a scrolling dialog/drawer and an anchored popover. Verify a nested searchable select near each viewport edge, scroll/reposition, content width/height, child-first Escape and outside click, focus return, destroy cleanup, and light, dark and glass styling. Public slots, CVA, accessible names and shared-host callers continue to work.

**Checks.** Run the Jest command above for the listed specs, grouped by `libs/frontend/ui`. Typecheck the affected library configs listed above and lint the changed files. Also typecheck the renderer. Smoke-test a chat UI popover and a nested settings fixture in Electron.

## 2. CLI lanes layout and controls

**Files**

- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.visual.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-model-effort-cell.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts`

**Acceptance.** At viewport/container widths bracketing 640px and 950px and at 400px, Model and Network remain in their own cells without collision or horizontal overflow. Opening an instance detail keeps the group header stable. One labeled Defaults action exposes Permission, Network and Reset. Read-only inheritance, drag ordering, keyboard focus, save/reset behavior and the full-access confirmation work through the normal lane paths.

**Checks.** Run the Jest command above for the listed specs, grouped by `libs/frontend/chat`. Typecheck the affected library configs listed above and lint the changed files. In Electron compare the Network control and Model label bounds and open/close both the expanded row and Defaults menu in each layout tier.

## 3. Provider and instance subforms

**Files**

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
- `libs/frontend/chat/src/lib/settings/providers/accounts/accounts-tab.component.spec.ts`

**Acceptance.** Add/edit instance exposes one submit path, including Enter, and the Provider connection list is fully operable near the modal bottom. The drawer presents the current step once and one primary action, with Done as the primary action after a successful connection. Keep Cancel/Back, discard review, probe and scope flows, retry and partial-save feedback. Verify the connected editor, account detail dialog and tier mapping form still open and return focus using the shared shells.

**Checks.** Run the Jest command above for the listed specs, grouped by `libs/frontend/chat`. Typecheck the affected library configs listed above and lint the changed files. In Electron walk new and existing connection flows plus add/edit instance at a short viewport height. Capture the open Provider connection list and the saved wizard footer.

## 4. Background models resolution and picker layout

**Files**

- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html`
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/decision-model-row.popover.spec.ts`
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts`
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.spec.ts`
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-search-field.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.spec.ts`

**Acceptance.** With Claude Subscription effective and OpenRouter stored as a stale provider or available without credentials, opening Memory curator frames the inherited Claude provider and its role default, and makes zero OpenRouter catalog calls. An explicit provider fetches only its own catalog, including the appropriate error/retry or saved-list notice. Preserve explicit saved IDs, blank inheritance sentinels, manual IDs, Setup pairing, Decision behavior and scope-aware writes. Check transitions from unresolved to ready, rapid provider/workspace changes, empty catalogs and out-of-order responses. Provider/model controls and feedback fit the Electron pane.

**Checks.** Run the Jest command above for the listed specs, grouped by `libs/frontend/ui` and `libs/frontend/chat`. Typecheck the affected library configs listed above and lint the changed files. In Electron inspect the inherited and explicit selections, keyboard operation and popover width at 400px and wide widths.

## 5. Routing evidence summaries

**Files**

- `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.spec.ts`

**Acceptance.** Render a compact CLI/model view. Only sampled keys create chips or detailed cells, with one clear no-evidence state for an empty CLI. Expand to inspect measured scores and outcomes. Preserve catalog freshness, non-catalog and family-default evidence, effort provenance, funnel and decision-model outcomes, retries and loading. Keep labels and counts legible without color alone and at narrow widths.

**Checks.** Run the Jest command above for the listed specs, grouped by the `libs/frontend/chat` config. Typecheck the affected library configs listed above and lint the changed files. In Electron compare sparse, empty and populated evidence in a narrow pane and check keyboard access to details.
