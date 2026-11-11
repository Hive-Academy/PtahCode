# Lane report: batch 3 (memory-curator-ui, skill-synthesis-ui, machines-ui)

| file:line | old classes | new attributes | notes |
|---|---|---|---|
| machines-ui/src/lib/components/add-machine-pane/add-machine-pane.component.ts:212 | btn btn-ghost btn-xs border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" |  |
| machines-ui/src/lib/components/copy-command/copy-command.component.ts:35 | btn btn-ghost btn-xs gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" |  |
| machines-ui/src/lib/components/machine-list/machine-list.component.ts:98 | btn btn-primary btn-sm mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="primary" class="mt-2" |  |
| machines-ui/src/lib/components/machines-view/machine-overview.component.ts:65 | btn btn-ghost btn-sm hidden gap-1 self-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content max-[767px]:inline-flex | ptahButton variant="ghost" class="hidden self-start max-[767px]:inline-flex" |  |
| machines-ui/src/lib/components/machines-view/machine-overview.component.ts:104 | btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/machines-view/machine-overview.component.ts:114 | btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/machines-view/machine-overview.component.ts:178 | btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/machines-view/machine-overview.component.ts:216 | btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="primary" |  |
| machines-ui/src/lib/components/machines-view/machine-overview.component.ts:227 | btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/machines-view/machines-intro.component.ts:41 | btn btn-primary btn-sm gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="primary" |  |
| machines-ui/src/lib/components/machines-view/machines-view.component.ts:126 | btn btn-ghost btn-xs self-start gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" class="self-start" |  |
| machines-ui/src/lib/components/machines-view/machines-view.component.ts:148 | btn btn-ghost btn-xs self-start gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" class="self-start" |  |
| machines-ui/src/lib/components/readiness-panel/readiness-panel.component.ts:173 | btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="primary" |  |
| machines-ui/src/lib/components/readiness-panel/readiness-panel.component.ts:183 | btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/reconnect-banner/reconnect-banner.component.ts:36 | btn btn-ghost btn-xs btn-square focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahIconButton size="xs" |  icon-only; label from old aria-label |
| machines-ui/src/lib/components/remote-approval-block/remote-approval-block.component.ts:107 | btn btn-ghost btn-xs gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" |  |
| machines-ui/src/lib/components/remote-approval-block/remote-approval-block.component.ts:165 | btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="primary" |  |
| machines-ui/src/lib/components/remote-approval-block/remote-approval-block.component.ts:176 | btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/remote-composer/remote-composer.component.ts:60 | btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content disabled:cursor-not-allowed disabled:border-dashed disabled:border-surface-border disabled:bg-transparent disabled:text-base-content-muted | ptahButton variant="primary" |  |
| machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts:74 | btn btn-ghost btn-xs gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" |  |
| machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts:91 | btn btn-primary btn-xs gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="primary" size="xs" |  |
| machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts:158 | btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="primary" |  |
| machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts:169 | btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts:198 | btn btn-ghost btn-xs border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" |  |
| machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts:151 | btn btn-ghost btn-sm gap-1 border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts:167 | btn btn-ghost btn-sm gap-1 border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-base-content-muted | ptahButton variant="ghost" |  |
| machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts:202 | btn btn-ghost btn-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/corpus-build-dialog.component.ts:151 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/corpus-build-dialog.component.ts:160 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/corpus-list.component.ts:78 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/corpus-list.component.ts:91 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/corpus-list.component.ts:164 | btn btn-xs btn-ghost | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/corpus-list.component.ts:177 | btn btn-xs btn-ghost | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/corpus-list.component.ts:188 | btn btn-xs btn-ghost | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/corpus-suggestions.component.ts:78 | btn btn-ghost btn-xs btn-circle | ptahIconButton size="xs" |  icon-only; label from old aria-label |
| memory-curator-ui/src/lib/components/corpus-suggestions.component.ts:103 | btn btn-primary btn-sm mt-1 | ptahButton variant="primary" class="mt-1" |  |
| memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts:201 | btn btn-xs btn-primary | ptahButton variant="primary" size="xs" |  |
| memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts:215 | btn btn-xs btn-ghost | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts:293 | btn btn-xs btn-primary | ptahButton variant="primary" size="xs" |  |
| memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts:307 | btn btn-xs btn-ghost | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts:330 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:188 | btn btn-xs | ptahButton size="xs" |  |
| memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:224 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:257 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/memory-curator-tab.component.ts:97 | btn btn-sm btn-primary mt-1 | ptahButton variant="primary" class="mt-1" |  |
| memory-curator-ui/src/lib/components/memory-curator-tab.component.ts:133 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/memory-curator-tab.component.ts:151 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/memory-danger-zone.component.ts:77 | btn btn-sm btn-error md:self-end | ptahButton variant="danger" class="md:self-end" |  |
| memory-curator-ui/src/lib/components/memory-danger-zone.component.ts:103 | btn btn-xs btn-link p-0 | ptahButton variant="link" size="xs" |  |
| memory-curator-ui/src/lib/components/memory-entry-list.component.ts:107 | btn btn-ghost btn-xs btn-square text-base-content-muted | ptahIconButton size="xs" class="text-base-content-muted" |  icon-only; label from old aria-label |
| memory-curator-ui/src/lib/components/memory-entry-list.component.ts:123 | btn btn-ghost btn-xs btn-square text-base-content-muted | ptahIconButton size="xs" class="text-base-content-muted" |  icon-only; label from old aria-label |
| memory-curator-ui/src/lib/components/memory-entry-list.component.ts:139 | btn btn-ghost btn-xs btn-square text-base-content-muted hover:text-error | ptahIconButton size="xs" class="text-base-content-muted hover:text-error" |  icon-only; label from old aria-label |
| memory-curator-ui/src/lib/components/memory-indexed-code.component.ts:34 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts:55 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts:110 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts:130 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts:138 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts:158 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts:177 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/timeline-filters.component.ts:53 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| memory-curator-ui/src/lib/components/timeline-filters.component.ts:66 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| memory-curator-ui/src/lib/components/timeline-view.component.ts:50 | btn btn-xs btn-ghost | ptahButton variant="ghost" size="xs" |  |
| memory-curator-ui/src/lib/components/timeline-view.component.ts:103 | btn btn-ghost btn-xs ml-auto text-base-content-muted opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100 | ptahButton variant="ghost" size="xs" class="ml-auto text-base-content-muted opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100" |  |
| memory-curator-ui/src/lib/components/timeline-view.component.ts:140 | btn btn-sm btn-outline | ptahButton |  |
| skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:210 | btn btn-ghost btn-xs ml-auto | ptahButton variant="ghost" size="xs" class="ml-auto" |  |
| skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:254 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:337 | btn btn-primary btn-xs | ptahButton variant="primary" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:348 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:401 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:421 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:457 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/bulk-rebase-confirm.component.ts:69 | btn btn-sm | ptahButton |  |
| skill-synthesis-ui/src/lib/components/clones/clone-body-editor.component.ts:110 | btn btn-primary btn-xs | ptahButton variant="primary" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-body-editor.component.ts:122 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-card.component.ts:382 | btn btn-ghost btn-xs transition-colors duration-150 | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-card.component.ts:400 | btn btn-ghost btn-xs transition-colors duration-150 | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:249 | btn btn-primary btn-xs | ptahButton variant="primary" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:361 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:449 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:467 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:490 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:160 | btn btn-ghost btn-sm | ptahButton variant="ghost" |  |
| skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:170 | btn btn-primary btn-sm | ptahButton variant="primary" |  |
| skill-synthesis-ui/src/lib/components/clones/lazy-diff-view.component.ts:90 | btn btn-outline btn-xs | ptahButton size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:199 | btn btn-ghost btn-xs transition-colors duration-150 | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:212 | btn btn-ghost btn-xs transition-colors duration-150 | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:230 | btn btn-ghost btn-xs | ptahButton variant="ghost" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:283 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:292 | btn btn-sm btn-primary | ptahButton variant="primary" |  |
| skill-synthesis-ui/src/lib/components/clones/reconcile-guard.ts:255 | btn btn-sm btn-ghost | ptahButton variant="ghost" |  |
| skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:195 | btn btn-ghost btn-xs shrink-0 transition-colors duration-150 | ptahButton variant="ghost" size="xs" class="shrink-0" |  |
| skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:339 | btn btn-ghost btn-xs shrink-0 transition-colors duration-150 | ptahButton variant="ghost" size="xs" class="shrink-0" |  |
| skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:371 | btn btn-primary btn-xs | ptahButton variant="primary" size="xs" |  |
| skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:504 | btn btn-sm | ptahButton |  |
| skill-synthesis-ui/src/lib/components/skill-specs-control.component.ts:41 | btn btn-primary btn-xs gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary | ptahButton variant="primary" size="xs" | aria-busy -> [busy] |
| skill-synthesis-ui/src/lib/components/skill-specs-control.component.ts:61 | btn btn-outline btn-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary | ptahButton size="xs" |  |
Notes: line numbers are the first changed line of each hunk in the new file. Utilities that the family owns
(`gap-*`, `border*`, `focus-visible:*`, `transition-*`, `px-*`, `min-h-*`) were removed. Imports and
`imports` arrays were updated in every changed component. `memory-curator-tab.component.ts:95` is an `<a>`.

## Skipped

| file:line | reason |
|---|---|
| memory-curator-ui corpus-build-dialog.component.ts:75 | filter chip, dynamic `[class.btn-primary]`/`[class.btn-ghost]` |
| memory-curator-ui timeline-filters.component.ts:82 | filter chip, dynamic `[class.btn-*]` |
| memory-curator-ui memory-search-bar.component.ts:61,71 | `join-item` group, dynamic `[class.btn-primary]` |
| memory-curator-ui memory-indexed-code.component.ts:111,120 | `join-item` group buttons |
| memory-curator-ui corpus-list.component.ts:190 | red ghost (`btn-ghost text-error`) |
| memory-curator-ui memory-diagnostics-accordion.component.ts:168 | link-like control with `underline`, `text-primary`, `min-h-7` |
| skill-synthesis-ui agent-model-editor.component.ts:384 | `btn-warning` |
| skill-synthesis-ui bulk-rebase-confirm.component.ts:77 | `btn-warning` |
| skill-synthesis-ui clone-bulk-toolbar.component.ts:34 | `btn-active` toggle with dynamic `[class.btn-active]` |
| skill-synthesis-ui clone-bulk-toolbar.component.ts:51 | `btn-warning` |
| skill-synthesis-ui clone-card.component.ts:407,420 | ghost with `text-warning` (warning colour, no variant) |
| skill-synthesis-ui clone-detail-drawer.component.ts:303,319 | `btn-outline btn-warning` |
| skill-synthesis-ui reconcile-guard.ts:264 | `btn-warning` |
| skill-synthesis-ui skill-clones-view.component.ts:499 | `btn-warning` |
| machines-ui machine-overview.component.ts:162 | red ghost (`text-state-err border-state-err`) |
| machines-ui add-machine-pane.component.ts:239 | not a DaisyUI `btn` (`btn-ghost` token only, custom element) |

Other `aria-busy` hits in machines-ui (add-machine-pane:70, readiness-panel:85, machine-list:71,
machines-view:187, remote-session-list:178) are on non-button elements. They stay.

## Counts

- Converted: 96 elements (91 `ptahButton`, 5 `ptahIconButton`).
- Skipped: 20 elements (listed above).
- No spec file changed.

## Test run

`npm run verify -- -t test -p @ptah-extension/memory-curator-ui,@ptah-extension/skill-synthesis-ui,@ptah-extension/machines-ui`
: 3 tasks succeeded, exit code 0. The first run failed because a script put an import line inside a
multi-line `import type {` block in 3 files. I fixed these and ran prettier on the changed `.ts` files.
