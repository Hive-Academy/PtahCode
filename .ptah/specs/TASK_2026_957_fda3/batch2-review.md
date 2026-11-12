# Batch 2 review (read-only)

Scope: the uncommitted `git diff` for 15 chat components, three chat specs, and `tools/ui-class-audit/baseline.json`. No build, serve, e2e, or workspace-wide check ran. The CLI did not expose a skill invocation tool; I read `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md` directly.

## Confirmed defects

None found.

## Non-blocking notes

- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.spec.ts:377-378` checks `data-ptah-badge` and `data-tone="neutral"` but does not check `data-size="sm"`. The other changed badge specs cover size. Adding that assertion would complete the requested attribute coverage for this spec.
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:345-353` now maps task statuses to semantic badge tones. This intentionally replaces the previous task-specific ink classes; the mappings match the old status meanings. No rendered UI review was performed in this read-only diff review.

## Verified OK

- All 15 changed components import `PtahBadgeDirective` and include it in their `@Component.imports`. Every new `ptahBadge` host is a `span`.
- Tone mappings match the prior semantic classes: success to `ok`, error to `err`, warning to `warn`, ghost to default `neutral`; outline uses `appearance="outline"`; `badge-xs` uses `size="xs"`. Default `sm` is supplied by the directive.
- No migrated badge host has an added `flex` class. The truncated task ID uses a direct `.ptah-badge-text` child. No old DaisyUI badge classes remain on the migrated hosts.
- Changed specs use `data-ptah-badge` and tone/size attributes in place of DaisyUI badge class assertions, subject to the coverage note above.
- `baseline.json` has no increased token count or new token entry; its changes only reduce counts or remove entries.
- The added diff lines contain no `any` type, email address, or Windows user path/name. `git diff --check` reports no whitespace error.
