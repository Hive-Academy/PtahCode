# Batch 6 badge adoption — assigned components

## Files

- `marketplace/src/lib/smithery-surface.component.ts`: adopted the static “Managed by Ptah” badge as neutral `xs`; removed the old 10 px type override.
- `marketplace/src/lib/ui/needs-attention.component.ts`: adopted the numeric count as neutral `sm` with the directive's `count` input.
- `marketplace/src/lib/ui/provider-table.component.ts`: adopted the origin badge as neutral `sm`; kept its layout utility and wrapped the variable label in `ptah-badge-text`.
- `memory-curator-ui/src/lib/components/corpus-suggestions.component.ts`: adopted concept badges as neutral `sm`; wrapped variable concept names in `ptah-badge-text`.
- `memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts`: adopted coherent and sqlite-vec badges with `ok`/`err` tones, and mapped the embedder's dynamic state to `ok`/`warn`/`err`/neutral. Wrapped its variable label in `ptah-badge-text`.

All badge hosts are `span` elements and each component imports `PtahBadgeDirective`. No target badge was left raw.

## Specs and verification

- Searched specs in both changed libraries for `.badge` selectors and old badge class assertions. None target these components; no spec edit was needed.
- `git diff --check` passed for the five assigned files. A source search found no remaining `badge badge-*` or `[class.badge-*]` recipes in them.
- Scoped Ptah diagnostics did not complete: the TypeScript compiler reported that its check was still running after 45 seconds. The dependency index did not cover the inspected file.
- `node_modules` is absent in this worktree, so scoped Nx verification could not start.
- No Electron render was available under the brief's build/serve restriction. Source review checked size, tone, and retained layout classes against `family-3-look.md` and the badge owner's CSS. Visual appearance remains unverified.
