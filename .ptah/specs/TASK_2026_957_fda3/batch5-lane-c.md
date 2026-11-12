# Badge adoption batch 5 — lane C

## Files (all under libs/frontend/marketplace/src/lib/)

- `external-consent-dialog.component.ts`: adopted 3 badges. The upgrade badge is warn `xs`. The skill chips are neutral `xs`. The local-item badge is neutral `sm`. Layout classes kept.
- `external-install-report.component.ts`: adopted 1 badge (neutral `sm`, `shrink-0` kept).
- `kept-items-repair-prompt.component.ts`: adopted 2 badges. The outcome badge now uses `[tone]`: err when failed, ok when Replaced, otherwise neutral. The reason badge is neutral `sm`.
- `pages/overview/overview-page.component.html` (and `.ts` import): adopted the provider count as a neutral `count` badge with `tabular-nums` kept.
- `pages/servers/installed-servers-page.component.ts`: adopted 2 badges. The scope badge is outline, tone warn for global scope and neutral otherwise (replaces `border-warning`). The capability scope label is neutral `sm`.

No badge remains raw in the five files. Each component imports `PtahBadgeDirective` from `@ptah-extension/ui`.

## Specs

- `pages/servers/installed-servers-page.component.spec.ts`: the `border-warning` class check now reads `data-tone="warn"`. No other spec in the marketplace library queries `.badge`.

## Verification

- `npm run verify -- -t lint -p @ptah-extension/marketplace` passed.
- Prettier ran on the changed files.
- No spec ran (no node_modules in this worktree). No rendered UI review ran.
- Possible look change: the old `badge-ghost` was a gray fill. The directive default is the soft neutral look. The reviewer should check the visual result.
