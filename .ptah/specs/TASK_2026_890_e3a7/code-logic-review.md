Verdict: APPROVED
Review family: codex
Implementer family: claude

1. Defects: none.

Evidence:
- `apps/ptah-electron/src/menu/application-menu.ts:171` uses the same docs origin configured in `apps/ptah-docs/astro.config.mjs:10`; the landing-page redirect at `apps/ptah-landing-page/src/app/app.routes.ts:15` agrees. Workspace search found no remaining `https://ptah.live/docs` reference or menu test expecting it. The menu calls Electron `shell.openExternal` directly, with no URL allowlist at this call site.
- `libs/backend/platform-electron/src/implementations/electron-host-attention-notifications.ts:55-71,77-91` deduplicates by notice key and generation and groups burst notices by handle, without using the notification title. `apps/ptah-electron/src/activation/bootstrap.ts:352` passes the options to Electron `Notification`; the e2e smoke test at `apps/ptah-electron-e2e/src/specs/electron-browser-capabilities.spec.ts:173-194` creates a separate notification with its own title. Search found no app code that keys these notifications by title or sets a Windows AppUserModelId. The title assertions in `libs/backend/platform-electron/src/implementations/electron-host-attention-notifications.spec.ts:131,134` were updated.
- `npm run verify -- -t test -p platform-electron` exited 0; Nx reported two successful cached tasks.

Review limitation: Ptah's LSP references resolved against the parent checkout, so workspace Grep was used to confirm string and caller coverage in this worktree. No invocable local review skill was available through skill discovery.
