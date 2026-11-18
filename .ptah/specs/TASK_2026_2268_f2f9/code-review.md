# PASS WITH NOTES

No blocker or major regression identified in the reviewed uncommitted changes. Two minor accessibility regressions should be addressed.

## Findings

1. **minor — Escape dismissal only works from the key input.**
   - **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/web-search-key-editor.component.ts:20`; footer actions at `libs/frontend/chat/src/lib/settings/ptah-ai/web-search-provider-rows.component.ts:80`.
   - **Behavior:** Open a provider's editor, Tab to the visibility toggle or Save/Cancel, then press Escape. The editor stays open, the draft remains, and the event can reach an enclosing keyboard handler. Previously the popover handled Escape for its contents. The new spec at `web-search-config.component.spec.ts:219` dispatches Escape only on the input, so it misses this regression.
   - **Concrete fix:** Handle Escape on the active editor's common card ancestor, covering the input, visibility toggle and footer actions. While an editor is open, prevent default, stop propagation, and call `closeKeyEditor()` to clear the draft and restore trigger focus. Add DOM keyboard tests from the visibility toggle and footer buttons, checking draft clearing, focus restoration and no propagation.

2. **minor — The key field loses its provider-specific accessible name.**
   - **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/web-search-key-editor.component.ts:13`.
   - **Behavior:** The previous label was `API key for Tavily` (or the other provider); the replacement is always `API key`. Opening different cards gives the same field name, and the surrounding list item has no provider-specific accessible group label. A screen-reader user who navigates directly to the field loses the provider context, despite Save retaining it.
   - **Concrete fix:** Restore `[label]="'API key for ' + opt().label"`, or retain the short visible label and associate the input with both that label and an identified provider title through `aria-labelledby`. Update the field-label test at `web-search-config.component.spec.ts:147` to assert provider-specific naming for all three providers.

## Review evidence and limits

- Ran `git status --short`, `git diff --stat`, and targeted `git diff` reads across the changed source, specs, shared row patterns, Tailwind configuration and harness changes. Read the untracked summary store/component and both specs, plus both Electron design-preview files.
- Traced the rich select's model output against provider/model/voice save, rejection and rollback handlers. The changed handlers explicitly restore the rich select model after failure; the provider control uses the setting row's `titleId()` through `labelledBy`. Existing specs exercise option clicks and failure shapes rather than merely calling selection handlers.
- Reviewed effect ownership and summary reporting. No introduced subscription/effect leak was identified. The summary store is page-scoped and Angular owns the component effects.
- Scanned changed TypeScript/JavaScript files and the requested untracked TypeScript files for all requested forbidden patterns. No introduced matches found. Existing `console.` uses at `settings-advanced-search-voice.e2e.spec.ts:73`, `:97`, `:244`, `:315` and `.fixme(` at `:188` remain unchanged; they are not new findings.
- Attempted the permitted focused Jest command with `--config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` for the ten changed/new Search & Voice component/store suites. Suite startup failed with esbuild `spawn EPERM`; no passing test result is claimed. This is an environment limitation, not evidence of an assertion failure.
- No Electron application or screenshot capture was run, so rendered layout and the compiled `row-split` behavior remain unverified by this review. The shared pattern specs assert class names, not actual breakpoint layout. Source review confirms the variant definition uses `@container (min-width: 26rem)`.
- Used available Ptah workspace/file/AST tools and native Git/PowerShell for source reads and free-text searches. No matching review skill was discoverable through the CLI's available skills. No source was edited; only this deliverable was written. No commit, push, `nx`, or `npm run verify` was run.
