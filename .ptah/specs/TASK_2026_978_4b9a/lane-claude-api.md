# Lane summary: form control adoption (6 files)

## DOM delta per file
- remote-composer: textarea -> `ptahTextarea size="sm"`; classes now `min-h-[2.5rem] flex-1`.
- remote-session-list: select -> `ptahSelect size="sm" tone="mono"`; textarea -> `ptahTextarea size="sm"`.
- allow-list-editor: textarea -> `ptahTextarea size="sm" tone="mono"`, class `w-full`.
- discord-integration-kit: input -> `ptahInput size="sm" tone="mono"`; checkbox -> `ptahCheckbox size="xs"`.
- platform-bindings-panel: input -> `ptahInput size="xs" tone="mono"`, class `w-24`.
- platform-token-form: two inputs -> `ptahInput size="sm" tone="mono"`.
All data-testid, name, aria-*, value and event bindings are unchanged. Directive imports added.
Removed text-sm, text-base-content, rounded-md and font-mono (owners and tone="mono" supply them).
No spec selected by a changed class, so no spec edits.

## Verify (`npm run verify -- -p machines-ui,messaging-gateway-ui`)
- lint and typecheck: 4 of 4 passed.
- test: 387 tests passed, 19 suites passed, 5 suites failed to run (machines-ui).
  Cause: jest cannot find `node_modules/marked` in this worktree (module mapper config error).
  The failing suites (machines-view, remote-session-view, remote-session-pane, remote-markdown,
  remote-transcript) are not in my files. This is an environment problem, not a code failure.

## Open questions
- `apps/ptah-extension-webview/src/app/design-tokens.spec.ts` and
  `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` show changes that are not mine
  (another process edited this worktree). My prettier run may also have reformatted
  `design-tokens.spec.ts` (line endings). Review before commit.
- Nothing was left raw. No variant was missing.
