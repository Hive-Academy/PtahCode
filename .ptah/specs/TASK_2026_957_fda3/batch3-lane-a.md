# Badge adoption batch 3 — lane A

## Changes

- `cli-capability-cells.component.ts`: adopted capability span badges. The unverified state uses a typed warning tone; other states use neutral. Kept spacing and wrapping utilities. The card component now supplies the equivalent `data-ptah-badge` selector that hides badges after the second, since its companion CSS is outside this lane's edit scope.
- `cli-provider-card.component.ts`: adopted the status span with outline appearance and typed status tones. Wrapped the truncated label in `ptah-badge-text`; retained the slot sizing and status attribute.
- `cursor-credential-popover.component.ts`: adopted the stored key status span with outline appearance, `xs` size, and typed ok/neutral tones.
- `elevenlabs-panel.component.ts`: adopted both connection result spans with outline appearance and typed ok/err tones.
- `local-stt-panel.component.ts`: adopted both download status spans with outline appearance and ok/warn tones.

Every changed component imports `PtahBadgeDirective` from `@ptah-extension/ui` and registers it in `imports`. No scoped badge was left raw. No companion HTML exists. The companion specs do not query `.badge`, so they needed no selector updates. `cli-provider-card.component.css` remains untouched as required; its old `.badge` rule is superseded for adopted badges by the equivalent inline component style.

## Verification

- `git diff --check` passed. A scoped source review found no remaining raw DaisyUI badge classes in the five files.
- Scoped `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns='(cli-capability-cells|cli-provider-card|cursor-credential-popover|elevenlabs-panel|local-stt-panel)'` exited 1: Nx reported one failed test task and printed only an external cache log path, not a suite result. This worktree has no `node_modules`; the prior batch documented missing `marked` imports in this environment. The exact cause of this run's failure is unconfirmed from the command output.
- Scoped Ptah diagnostics reported no errors in the five changed files. It also reported errors in sibling files outside this lane.
- No rendered UI review ran; the requested verification rules prohibit starting the Electron renderer. The CLI's skill invocation mechanism was unavailable in this lane.
