# Lane report: marketplace button adoption (TASK_2026_941_28aa)

## Converted

| file:line | old classes | new attributes | notes |
|---|---|---|---|
| lib/external-consent-dialog.component.ts:207 | `btn btn-sm btn-circle btn-ghost shrink-0` | `ptahIconButton label="Cancel install" class="shrink-0"` | icon-only; aria-label/title moved to label |
| lib/external-install-report.component.ts:68 | `btn btn-ghost btn-xs shrink-0` | `ptahButton variant="ghost" size="xs" class="shrink-0"` |  |
| lib/external-install-report.component.ts:143 | `btn btn-outline btn-xs` | `ptahButton size="xs"` | outline -> secondary (default) |
| lib/external-marketplaces.component.ts:179 | `btn btn-primary btn-sm shrink-0` | `ptahButton variant="primary" class="shrink-0"` |  |
| lib/external-marketplaces.component.ts:308 | `btn btn-ghost btn-sm border-base-300` | `ptahButton` | ghost + border -> secondary (default) |
| lib/harness/harness-health-badge.component.ts:120 | `btn btn-ghost btn-xs shrink-0` | `ptahIconButton label="Re-check harness health" size="xs" class="shrink-0"` | icon-only; aria-label/title moved to label |
| lib/harness/harness-repair-dialog.component.ts:155 | `btn btn-sm btn-circle btn-ghost shrink-0` | `ptahIconButton label="Close without moving anything" class="shrink-0"` | icon-only; aria-label/title moved to label |
| lib/oauth-surface.component.ts:259 | `btn btn-ghost btn-xs shrink-0` | `ptahIconButton label="Copy redirect URL" size="xs" class="shrink-0"` | icon-only; aria-label/title moved to label |
| lib/oauth-surface.component.ts:310 | `btn btn-primary btn-sm w-full` | `ptahButton variant="primary" class="w-full"` |  |
| lib/pages/connectors/connector-detail.component.html:165 | `btn btn-ghost btn-sm gap-1 border border-base-300` | `ptahButton` | ghost + border -> secondary (default); gap-1 dropped (family owns gap) |
| lib/pages/connectors/connectors-page.component.html:36 | `btn btn-ghost btn-sm border border-base-300` | `ptahButton` | ghost + border -> secondary (default) |
| lib/pages/connectors/connectors-page.component.html:51 | `btn btn-ghost btn-sm border border-base-300` | `ptahButton` | ghost + border -> secondary (default) |
| lib/pages/connectors/connectors-page.component.html:101 | `btn btn-sm btn-outline gap-1` | `ptahButton` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/pages/overview/overview-page.component.html:17 | `btn btn-outline btn-sm gap-1` | `ptahButton` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/pages/overview/overview-page.component.html:29 | `btn btn-primary btn-sm gap-1` | `ptahButton variant="primary"` | gap-1 dropped (family owns gap) |
| lib/pages/overview/overview-page.component.html:147 | `btn btn-outline btn-xs gap-1` | `ptahButton size="xs"` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/pages/servers/installed-servers-page.component.ts:341 | `btn btn-primary btn-sm gap-1` | `ptahButton variant="primary"` | gap-1 dropped (family owns gap) |
| lib/pages/servers/installed-servers-page.component.ts:429 | `btn btn-outline btn-xs` | `ptahButton size="xs"` | outline -> secondary (default) |
| lib/pages/servers/installed-servers-page.component.ts:442 | `btn btn-outline btn-xs` | `ptahButton size="xs"` | outline -> secondary (default) |
| lib/pages/servers/installed-servers-page.component.ts:524 | `btn btn-outline btn-sm` | `ptahButton` | outline -> secondary (default) |
| lib/pages/servers/installed-servers-page.component.ts:550 | `btn btn-outline btn-xs` | `ptahButton size="xs"` | outline -> secondary (default) |
| lib/pages/servers/installed-servers-page.component.ts:609 | `btn btn-outline btn-xs` | `ptahButton size="xs"` | outline -> secondary (default) |
| lib/pages/servers/provider-list-view.component.html:26 | `btn btn-ghost btn-xs btn-square` | `ptahIconButton label="Dismiss message" size="xs"` | icon-only; aria-label/title moved to label |
| lib/pages/servers/server-detail.component.html:38 | `btn btn-outline btn-sm` | `ptahButton` | outline -> secondary (default) |
| lib/pages/servers/server-detail.component.html:212 | `btn btn-outline btn-xs` | `ptahButton size="xs"` | outline -> secondary (default) |
| lib/pages/servers/server-detail.component.html:591 | `btn btn-primary btn-sm gap-1` | `ptahButton variant="primary"` | gap-1 dropped (family owns gap) |
| lib/pages/servers/server-detail.component.html:615 | `btn btn-outline btn-error btn-sm gap-1` | `ptahButton variant="danger"` | outline error -> danger; gap-1 dropped (family owns gap) |
| lib/pages/skills/installed-skills-page.component.ts:211 | `btn btn-ghost btn-xs ml-auto` | `ptahButton variant="ghost" size="xs" class="ml-auto"` |  |
| lib/pages/skills/installed-skills-page.component.ts:239 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | gap-1 dropped (family owns gap) |
| lib/pages/skills/installed-skills-page.component.ts:377 | `btn btn-outline btn-xs shrink-0` | `ptahButton size="xs" class="shrink-0"` | outline -> secondary (default) |
| lib/pages/skills/installed-skills-page.component.ts:406 | `btn btn-ghost btn-xs shrink-0` | `ptahButton variant="ghost" size="xs" class="shrink-0"` |  |
| lib/pages/skills/skill-detail.component.ts:230 | `btn btn-ghost btn-sm gap-1` | `ptahButton variant="ghost"` | gap-1 dropped (family owns gap) |
| lib/pages/skills/skill-detail.component.ts:476 | `btn btn-outline btn-error btn-sm` | `ptahButton variant="danger"` | outline error -> danger |
| lib/shell/marketplace-shell.component.html:16 | `btn btn-ghost btn-sm btn-circle shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahIconButton label="Back to chat" class="shrink-0"` | icon-only; aria-label/title moved to label |
| lib/smithery-surface.component.ts:202 | `btn btn-primary btn-sm w-full` | `ptahButton variant="primary" class="w-full"` |  |
| lib/smithery-surface.component.ts:286 | `btn btn-ghost btn-xs border border-base-300` | `ptahButton size="xs"` | ghost + border -> secondary (default) |
| lib/smithery-surface.component.ts:331 | `btn btn-ghost btn-xs border border-base-300` | `ptahButton size="xs"` | ghost + border -> secondary (default) |
| lib/smithery-surface.component.ts:443 | `btn btn-ghost btn-sm border border-base-300` | `ptahButton` | ghost + border -> secondary (default) |
| lib/smithery-surface.component.ts:615 | `btn btn-ghost btn-sm w-full mt-3 border border-base-300` | `ptahButton class="w-full mt-3"` | ghost + border -> secondary (default) |
| lib/ui/bulk-action-bar.component.ts:96 | `btn btn-ghost btn-sm gap-1` | `ptahButton variant="ghost"` | gap-1 dropped (family owns gap) |
| lib/ui/bulk-action-bar.component.ts:110 | `btn btn-error btn-sm gap-1` | `ptahButton variant="danger"` | gap-1 dropped (family owns gap) |
| lib/ui/bulk-action-bar.component.ts:168 | `btn btn-ghost btn-xs ml-auto` | `ptahButton variant="ghost" size="xs" class="ml-auto"` |  |
| lib/ui/connector-card-status.component.ts:93 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | gap-1 dropped (family owns gap) |
| lib/ui/connector-card-status.component.ts:129 | `btn btn-ghost btn-xs h-5 min-h-0 w-5 p-0` | `ptahIconButton label="Dismiss error" size="xs"` | icon-only; aria-label/title moved to label |
| lib/ui/copy-command-button.component.ts:65 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | gap-1 dropped (family owns gap) |
| lib/ui/coverage-matrix.component.ts:146 | `btn btn-outline btn-xs gap-1` | `ptahButton size="xs"` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/ui/docked-inspector.component.ts:57 | `btn btn-ghost btn-sm btn-square -mr-1 flex-shrink-0` | `ptahIconButton [label]="closeLabel()" class="-mr-1 flex-shrink-0"` | icon-only; aria-label/title moved to label |
| lib/ui/featured-connectors.component.ts:146 | `btn btn-ghost btn-sm gap-1` | `ptahButton variant="ghost"` | gap-1 dropped (family owns gap) |
| lib/ui/featured-connectors.component.ts:183 | `btn btn-sm btn-outline gap-1` | `ptahButton` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/ui/needs-attention.component.ts:138 | `btn btn-outline btn-xs gap-1` | `ptahButton size="xs"` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/ui/needs-attention.component.ts:209 | `btn btn-ghost btn-xs shrink-0` | `ptahButton variant="ghost" size="xs" class="shrink-0"` |  |
| lib/ui/provider-card-list.component.ts:121 | `btn btn-outline btn-sm gap-1` | `ptahButton` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/ui/provider-card-list.component.ts:233 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | gap-1 dropped (family owns gap) |
| lib/ui/provider-filters.component.ts:133 | `btn btn-ghost btn-sm gap-1` | `ptahButton variant="ghost"` | gap-1 dropped (family owns gap) |
| lib/ui/provider-table.component.ts:247 | `btn btn-outline btn-sm gap-1` | `ptahButton` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/ui/provider-table.component.ts:453 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | gap-1 dropped (family owns gap) |
| lib/ui/stat-card.component.ts:125 | `btn btn-outline btn-xs gap-1` | `ptahButton size="xs"` | outline -> secondary (default); gap-1 dropped (family owns gap) |
| lib/ui/storefront-hero.component.ts:220 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | gap-1 dropped (family owns gap) |

## Skipped

| file:line | reason |
|---|---|
| lib/external-installed-row.component.ts:71 | btn-ghost + text-error: no family variant keeps the red text; coordinator decision |
| lib/external-plugin-row.component.ts:57 | btn-ghost + text-error: same as above |
| lib/external-marketplaces.component.ts:331 | btn-ghost + text-error: same as above |
| lib/oauth-surface.component.ts:396 | btn-ghost + text-error: same as above |
| lib/pages/skills/installed-skills-page.component.ts:413 | btn-ghost + text-error: same as above |
| lib/smithery-surface.component.ts:303 | icon-only btn-ghost + text-error: ptahIconButton has no red ghost; coordinator decision |
| lib/external-marketplaces.component.ts:206 | wrapping text button (h-auto, text-left, normal-case) |
| lib/pages/skills/plugin-config-home-notice.component.ts:179 | wrapping text button (h-auto, whitespace-normal, text-left) |
| lib/external-plugin-row.component.ts:71 | dynamic [class.btn-primary]/[class.btn-ghost] bindings |
| lib/smithery-surface.component.ts:370 | chip (rounded-full) with dynamic [class.btn-*] bindings |
| lib/smithery-surface.component.ts:459 | dynamic [class.btn-primary]/[class.btn-ghost] bindings |
| lib/pages/connectors/connectors-page.component.html:201 | chip (rounded-full) with dynamic [class.btn-*] bindings |
| lib/pages/connectors/connectors-page.component.html:214 | chip (rounded-full) with dynamic [class.btn-*] bindings |
| lib/ui/provider-filters.component.ts:94 | join-item group with btn-active toggle |
| lib/ui/provider-filter-select.component.ts:83 | dynamic [class.border-primary] binding on a listbox trigger |
| lib/ui/connector-card-actions.component.ts:34 | dynamic [class]="buttonClass(...)" binding (also :50, :66); spec reads btn-sm |
| lib/harness/harness-health-badge.component.ts:195 | btn-warning btn-outline (no family variant) |
| lib/harness/harness-repair-dialog.component.ts:315 | btn-warning (no family variant) |
| lib/ui/storefront-hero.component.ts:101 | inside a doc comment, not a template |

## Counts

- Converted: 58 (8 to ptahIconButton, 50 to ptahButton)
- Skipped: 21 (connector-card-actions counted as 3 elements in the table below the total: 19 listed rows, 3 elements in one row)

## Edited files

- libs/frontend/marketplace/src/lib/external-consent-dialog.component.ts
- libs/frontend/marketplace/src/lib/external-install-report.component.ts
- libs/frontend/marketplace/src/lib/external-marketplaces.component.ts
- libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.ts
- libs/frontend/marketplace/src/lib/harness/harness-repair-dialog.component.ts
- libs/frontend/marketplace/src/lib/oauth-surface.component.ts
- libs/frontend/marketplace/src/lib/pages/connectors/connector-detail.component.html
- libs/frontend/marketplace/src/lib/pages/connectors/connector-detail.component.ts
- libs/frontend/marketplace/src/lib/pages/connectors/connectors-page.component.html
- libs/frontend/marketplace/src/lib/pages/connectors/connectors-page.component.ts
- libs/frontend/marketplace/src/lib/pages/overview/overview-page.component.html
- libs/frontend/marketplace/src/lib/pages/overview/overview-page.component.ts
- libs/frontend/marketplace/src/lib/pages/servers/installed-servers-page.component.ts
- libs/frontend/marketplace/src/lib/pages/servers/provider-list-view.component.html
- libs/frontend/marketplace/src/lib/pages/servers/provider-list-view.component.ts
- libs/frontend/marketplace/src/lib/pages/servers/server-detail.component.html
- libs/frontend/marketplace/src/lib/pages/servers/server-detail.component.ts
- libs/frontend/marketplace/src/lib/pages/skills/installed-skills-page.component.ts
- libs/frontend/marketplace/src/lib/pages/skills/skill-detail.component.ts
- libs/frontend/marketplace/src/lib/shell/marketplace-shell.component.html
- libs/frontend/marketplace/src/lib/shell/marketplace-shell.component.ts
- libs/frontend/marketplace/src/lib/smithery-surface.component.ts
- libs/frontend/marketplace/src/lib/ui/bulk-action-bar.component.ts
- libs/frontend/marketplace/src/lib/ui/connector-card-status.component.ts
- libs/frontend/marketplace/src/lib/ui/copy-command-button.component.ts
- libs/frontend/marketplace/src/lib/ui/coverage-matrix.component.ts
- libs/frontend/marketplace/src/lib/ui/docked-inspector.component.ts
- libs/frontend/marketplace/src/lib/ui/featured-connectors.component.ts
- libs/frontend/marketplace/src/lib/ui/needs-attention.component.ts
- libs/frontend/marketplace/src/lib/ui/provider-card-list.component.ts
- libs/frontend/marketplace/src/lib/ui/provider-filters.component.ts
- libs/frontend/marketplace/src/lib/ui/provider-table.component.ts
- libs/frontend/marketplace/src/lib/ui/stat-card.component.ts
- libs/frontend/marketplace/src/lib/ui/storefront-hero.component.ts

## Notes

- No spec edit: only `connector-card-actions.component.spec.ts` reads `btn-sm`, and that element is skipped.
- Each owner component now imports exactly the directive classes its template uses.
- Icon-only buttons lost `aria-label` and `title`; the shell back button also lost its `focus-visible:outline*` utilities (family owns focus).
- No build, test or verify run. Formatter not applied, so a few `imports` arrays may need prettier.
