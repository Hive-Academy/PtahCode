# Batch 3 review (read-only)

Scope: uncommitted `git diff` in `libs/frontend/chat`, `libs/frontend/chat-ui`, and `tools/ui-class-audit/baseline.json` (14 changed components, four specs, one baseline). `agent-card-output` is intentionally raw for its custom `.ptah-superpower-badge` look. No build, serve, e2e, or workspace-wide check ran. No locally invocable review skill was exposed; I read `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md` directly.

## Confirmed defects

None found.

## Non-blocking notes

- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts:38` adds an inline `::ng-deep` rule hiding capability badges from the third child onward. It copies the behavior of `cli-provider-card.component.css:10`, where the selector still targets `.badge`. The inline rule is needed for the migrated `[data-ptah-badge]` markup but leaves a stale, ineffective CSS selector in the component stylesheet and splits the same layout rule across two locations. Move the selector update into the existing stylesheet and remove `styles`. This rule controls visibility within the card; it does not redefine the badge owner's tone, size, or appearance.
- `libs/frontend/chat-ui/src/lib/atoms/cost-badge.component.spec.ts:48` switches to `[data-ptah-badge]` but does not assert `data-tone` or `data-size`. `status-badge.component.spec.ts:29-33` checks tone but not the default `data-size="sm"`; `ptah-cli-instances.component.spec.ts:181` checks size but not tone. These are coverage gaps, not implementation defects.
- Some migrated hosts retain layout or color utility classes, including `cli-capability-cells.component.ts:15` (`border`, `py-0.5`) and `ptah-cli-instances.component.ts:189` (`border-base-content/40`, `bg-base-200`). They can override parts of the badge owner look depending on CSS order. The added inline rule in `cli-provider-card` does not cause these overrides. A rendered visual review would be needed to judge their appearance; none was run for this read-only review.

## Verified OK

- All 14 changed components import `PtahBadgeDirective` and register it in `@Component.imports`. Every migrated `ptahBadge` host is a `span`. The `@ptah-extension/ui` import from `chat-ui` is permitted: both libraries have `scope:webview`; `chat-ui` is `type:feature`, `ui` is `type:ui`, and `eslint.config.mjs` allows both dependency directions used here. The UI barrel exports the badge directive.
- Tone and appearance mappings match the prior badges: success to `ok`, error to `err`, warning to `warn`, info to `info`, ghost to `neutral`, and outline to `appearance="outline"`. The former `badge-xs` host uses `size="xs"`; otherwise the directive supplies `sm`. The card status text uses a direct `.ptah-badge-text` child for truncation.
- No migrated host retains a DaisyUI `badge` class or gains a `flex` class. The deliberately raw `agent-card-output` is outside this diff.
- Changed specs query `data-ptah-badge` rather than `.badge`; the relevant assertions use `data-tone`, `data-size`, or `data-appearance` where added.
- Baseline comparison against `HEAD` found zero increased or new token counts and 47 decreased or removed token entries; file entries fall from 339 to 334.
- Added lines contain no `any` type, email address, or Windows user path/name. `git diff --check` is clean.
