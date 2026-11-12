# Independent review

## Major

1. **Selected ring is absent on the default card.** `libs/frontend/ui/src/lib/card/ptah-card.css:103` sets `box-shadow: 0 0 0 ... var(--_tone), var(--_shadow)`, while `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:313` makes `--_shadow` equal to `none` by default. A comma-separated shadow list cannot contain `none`, so the whole declaration is invalid. The selected state in the gallery (`apps/ptah-extension-webview/src/app/ui-gallery/gallery-card-family.component.ts:82-90`) will show no ring. Fix: use a valid zero-size transparent shadow as the default, or give the selected state a separate shadow rule for the default variant. Add a computed-style assertion for the selected state in a browser test.

2. **Glass default differs from the catalog card, but the look sheet says it has zero pixel difference.** The new recipe fixes the border to `oklch(var(--b3))` at `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:304`. The existing `.border-base-300` card uses `var(--glass-line)` in glass mode at `apps/ptah-extension-webview/src/styles.css:3285`. The new `.ptah-card` has no matching glass border override (`libs/frontend/ui/src/lib/card/ptah-card.css:9-39`). The look sheet says the catalog shell is unchanged in glass (`.ptah/specs/TASK_2026_1012_b1dc/family-card-look.md:160-161`). Fix: add a glass border token or rule that resolves to `--glass-line`, then compare light and dark glass screenshots against the catalog shell. Record any remaining difference in the look sheet.

## Minor

1. **The panel directive does not expose the agreed API.** Research section 5.2 calls for a `tone` input and `data-glass-surface` on the host (`.ptah/specs/TASK_2026_1012_b1dc/card-family-research.md:219-220`); `libs/frontend/ui/src/lib/card/surface.directive.ts:19-29` has neither. Fix: add the agreed input and host attribute, or update the binding design with the reason they are unnecessary. Check the glass styles before adding the attribute because it changes which global rules apply.

## Checks

- The one old consumer at `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:158-182` is unchanged. Its host attribute and projected content still work. The inner element changes from `article` to `div` (`libs/frontend/ui/src/lib/surfaces/surface-card.component.ts:62`); no existing consumer selector found that depends on `article`.
- Normal-theme base fill, border, radius, padding and body gap match the catalog recipe by token values. The glass border exception above prevents a zero-pixel claim across themes.
- Click and Enter/Space activation, nested-control guard, selected and disabled attributes, focus style, standalone/OnPush, signal inputs and outputs follow the old native-card behavior. No banned input names, `any`, `@ts-ignore` or `[innerHTML]` found in the new family.
- Old owners were not edited or deleted. New style import follows the badge import in `apps/ptah-extension-webview/src/styles.css:19-20`. No new raw banned class recipe or frontend/core to ui import found. The new gallery includes default, hover, selected, disabled, interactive, header, footer and empty; its `family-card` ID appears once. Existing unique-section spec checks all gallery files.
- Component behavior specs cover activation, slots, state and level. CSS tests only check text, so they cannot catch the invalid selected shadow or glass border difference.
- No user name, email, absolute local path or agent role name found in new source lines. No test or screenshot was run in this review; the separate verify is already running and serve/build are disallowed. CLI skill invocation was unavailable; I read the local Angular skill instructions directly.

## Verdict

**Reject** until the selected ring and glass border are fixed and the glass look is verified.
