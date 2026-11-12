# Batch 2, lane C: badge adoption (settings)

All paths are under `libs/frontend/chat/src/lib/settings/`. Each file imports `PtahBadgeDirective` and lists it in the component `imports`.

- `providers/main-agent-section.component.ts`: status span is now `ptahBadge` (neutral, sm). Kept `shrink-0 whitespace-nowrap`.
- `providers/provider-connection-card.component.ts`: "N connected" is `ptahBadge` (neutral). Auth modality is `ptahBadge appearance="outline"`. Kept `whitespace-nowrap`.
- `providers/provider-connection-card.component.spec.ts`: the `badge-ghost` assertion now checks `data-ptah-badge` and `data-tone="neutral"`.
- `providers/provider-consumer-assignments.component.ts`: tier label is `ptahBadge` (neutral). Timeout display is `ptahBadge appearance="outline" tone="warn"`. Kept `font-mono` and `whitespace-nowrap`.
- `providers/providers-settings.component.ts`: connections count is `ptahBadge` (neutral).
- `ptah-ai/capability-matrix-setting.component.ts`: model count is `ptahBadge count`. Source is `ptahBadge size="xs"`. "Stale" is `ptahBadge tone="warn" size="xs"`.

## Files left raw
None. No file needed a button or anchor host.

## Verification
`npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=<5 names>`: exit code 0, 1 task succeeded. The other four spec files have no `.badge` queries. No template typecheck ran.
