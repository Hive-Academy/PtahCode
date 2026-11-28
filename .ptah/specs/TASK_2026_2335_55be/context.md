# TASK_2026_2335_55be — Remove membership/license system, reorder navigation

## User decisions
- Remove Ptah's own paid plan / membership / license system COMPLETELY (UI, backend service,
  `license:*` RPC methods, network check, tests, fixtures, docs).
- Electron navbar tab order: **Chat · Voice · Tasks · Reviews · Apps · Machines · Analytics**.
  Setup leaves the tab strip and always shows in the right cluster
  (`GlobalConfigActionsComponent`): **Thoth · Marketplace · Setup · Settings**.
  VS Code header (app-shell.component.html) follows the same relative order.

## Facts
- No feature is gated by `isPremium` / `tier` / `valid`. Removal changes no feature behavior.
- Nothing subscribes to `license:verified|expired|updated` events.

## KEEP (not Ptah plans)
Claude `subscriptionType`/`planTier`, cost basis `covered-by-subscription`, CLI plan limits
(`plan-limit-owner-discovery`), model pricing (`pricing.utils`, `config:pricing-get`), Copilot
"premium requests", marketplace `'community'` source, memory/output-style tiers, MIT license
texts, grammar LICENSE files, landing/legal "free, no license key, no subscriptions" copy.

## Inventory (from read-only sweep)

### Shared (libs/shared)
- `types/rpc/rpc-misc.types.ts:276-350` License* types, `LicenseTier`.
- `types/rpc.types.ts:1666-1677` + `3909-3911` registry/method-presence entries for
  `license:getStatus|setKey|clearKey`.
- `types/rpc/host-source-registry.baseline.ts:191-193`.
- `constants/environment.constants.ts:16-41` `PRICING_URL`, `SIGNUP_URL` (check `API_URL`,
  `FRONTEND_URL` other users before deleting), `55-63` `LICENSE_PUBLIC_KEY_BASE64`.

### Backend
- vscode-core: `services/license.service.ts`, `services/license/{license-fetcher,license-cache,
  license-state-broadcaster,license-types}.ts` (delete); `index.ts:89-95` exports;
  `di/tokens.ts:91,264` `LICENSE_SERVICE`; `di/register-platform-agnostic.ts:34-63,144-170`
  `includeLicensingAndAuth` (also controls AuthSecrets + Sentry — keep those, drop license part,
  rename flag e.g. `includeAuthAndTelemetry`); `messaging/rpc-handler.ts:66` `'license:'` prefix;
  comments in `di/register-storage-shims.ts`, `testing/rpc-handler.mock.ts`, `subsystem-bringup.ts`.
- rpc-handlers: `handlers/license-rpc.handlers.ts` + `license-rpc.schema.ts` + spec (delete);
  exports `handlers/index.ts:38`, `src/index.ts:49`, `host-profile/manifest.ts:69,340-342`;
  `handlers/settings-rpc.handlers.ts:32,113-114,303,450-480` (license re-verify on import);
  `handlers/settings-export.schema.ts:47-48` `licenseKey`; comments in
  `register-shared-rpc-handlers.ts:74`, `persistence-rpc.handlers.ts:10`, `embedder-rpc.handlers.ts:10`.
- agent-sdk: `types/settings-export.types.ts:26-27,138-139,176` `SECRET_KEYS.LICENSE_KEY`;
  `settings-export.service.ts:52-70`, `settings-import.service.ts:85-86`.
- cli-engine: `container.ts:11,78,152,528,714-725,1029`; `output/stderr-json.ts:23`
  `FatalErrorCode.LicenseRequired` (+ spec l.74).

### Electron main (apps/ptah-electron/src)
- `activation/bootstrap.ts:140-172,567-571` `startMembershipVerification()`.
- `activation/post-window.ts:46-67,194-220` 24 h revalidate interval; `main.ts:143,447,547-549`,
  `activation/shutdown.ts:214` clear it.
- `di/phase-1-infra.ts:6,133` comments, `di/phase-4-handlers.ts:42,126,180` LicenseRpcHandlers.
- `services/platform/electron-platform-commands.ts:25,105-111` `ptah.openPricing`, `ptah.openSignup`.
- `replay/scenario-sanitizer.ts:163`, `replay/__fixtures__/chat-tool-call.json:93-97`.
- comments: `preload.ts:12`, `di/electron-adapters.ts:12`.

### Frontend
- chat: `services/chat-store/chat-lifecycle.service.ts:7,24-26,47-50,77,86-124`
  (`licenseStatus`, `fetchLicenseStatus`); `chat.store.ts:68,128,303-305`; `chat-store/index.ts:18`;
  `message-sender.service.ts:98` comment.
- settings: `settings/license/license-status-card.component.ts` (+spec) delete; it hosts the
  settings import/export slot → move that into a plain "Data" card in
  `settings/advanced-settings.component.ts:26,67,88,117-168`; `settings/settings.component.ts:172-176`
  Advanced-tab attention mark from `licenseStatus()?.reason`.
- dashboard: `components/builders-card/*` delete; `dashboard/src/index.ts:2`,
  `dashboard-grid.component.ts:3,27` + `.html:18`; localStorage `ptah.builders-card.dismissed`.

### E2E / fixtures / specs
- `apps/ptah-electron-e2e/src/specs/license-watcher.spec.ts` (delete); `specs/rpc.spec.ts:16,44-51,149`;
  `specs/startup-config.spec.ts:8-19`; `support/rpc-bridge.ts:29`; `specs/thoth/skill-telemetry.spec.ts:32`;
  `README.md:62`; `design-preview/settings-advanced.fixtures.ts:34-37`, `settings-advanced.shot.ts:90-94`.
- `libs/frontend/webview-e2e-harness/.../settings/`: `settings.fixtures.ts:475-484,1009`,
  `settings-advanced.entries.ts:20-69` (ADV-1..4), `settings-advanced-search-voice.{fixtures,reach,e2e.spec}.ts`,
  `settings-reachability.table.ts:1050-1054`.
- Unit specs: `settings-rpc.handlers.spec.ts`, `auth-rpc.handlers.spec.ts:49,595-597`,
  `advanced-settings.component.spec.ts`, `settings.component.spec.ts`, `chat-lifecycle.service.spec.ts`,
  `chat.store.question-tab.spec.ts:86`, Electron `boot-order.spec.ts:498-531`,
  `bootstrap.network.spec.ts:70-101`, `recovery-mode-ipc.spec.ts:84`, `di/container.smoke.spec.ts:277,1291,1322`,
  `platform-core/provider-key-slots.spec.ts:55`, comments `setup-rpc.handlers.spec.ts:1742`,
  `chat-session-auth.spec.ts:184`.

### Docs / scripts
- `apps/ptah-docs/src/content/docs/getting-started/signing-in.md:3,46-58`, `first-launch.md:58-60`,
  `getting-started/index.mdx:23`, `settings/index.mdx:26`, `settings/import-export.mdx:13-29`,
  `astro.config.mjs:26` (redirect `/troubleshooting/license-issues` — keep redirect target valid).
- `docs/design-system/settings/settings-design-spec.md:226-232`, `settings-apply-plan.md:108`,
  `prototype/settings-prototype.html`.
- `scripts/generate-license-keys.ts` (delete).

## Batches
| Batch | Owner | Scope |
|---|---|---|
| A | backend-developer | libs/shared, libs/backend/*, apps/ptah-electron, apps/ptah-electron-e2e, scripts |
| B | frontend-developer | libs/frontend/* (incl. webview-e2e-harness), navbar reorder, apps/ptah-docs, docs/ |
