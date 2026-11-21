# Batch P report: plan limits layout and provider-specific reason labels

Status: **COMPLETE.** A second agent finished the four "Next steps" of the handoff. The focused jest, tsc and eslint checks pass (see Verification).

## Changed files

All paths are under `libs/frontend/dashboard/src/lib/components/`.

- MODIFIED `provider-account-card/plan-owner.model.ts`: defect 2 is done (see below).
- MODIFIED `provider-account-card/plan-tile-details.model.spec.ts`: existing `planLimitReasonLabel` calls now pass a provider id. Three tests are new: the Grok, Antigravity and unknown-provider sign-in text; no Antigravity or `agy` wording leaks to other providers for any shared reason; the Grok tile pill shows the Grok text.
- MODIFIED `plan-limits/provider-limit-card.view-model.ts`: new fields `titleText`, `accountLine`, `statusTone` and `statusGlyph`. The helpers `STATUS_BADGES` and `titleParts()` are new. Details gets a new first item, `{key:'account', term:'Account', value: tile.label}`, so the full label can be read with the keyboard. Nothing was removed.
- MODIFIED `plan-limits/provider-limit-card.component.ts`. The template is rewritten:
  - The card is an `article` with `ptahSurface variant="inset" padding="md"`.
  - The header has the provider mark, a title with `line-clamp-2` and `title` set to the full label, the account line, and a "Selected" `ptahBadge`. The badge has `title="Selected for chat"`, and an `sr-only " for chat"` keeps its text content as "Selected for chat".
  - The ring has `centerOnly` and `ariaLabel`. The status `ptahBadge` keeps the `provider-limit-status` test id and has a glyph.
  - The footer is a column: the source line (`line-clamp-2`, `title`), then the right-aligned action and Details.
  - Imports added: `PtahBadgeDirective`, `PtahSurfaceDirective`.
  - The window label line is back to `{{ windowLabel }}`, so a label that already ends in "used" does not read "used used".

## Defect 2: what was done

- `PLAN_LIMIT_REASON_LABELS` now holds neutral text for every reason. Examples: `cli-not-signed-in` is "Sign in to the provider CLI", and `no-oauth` is "Not signed in (OAuth)". Claude, Grok and Codex also emit `no-oauth`, `cli-*` and `account-unverified`, which I confirmed by grep in `libs/backend/auth-providers/src/lib/quota/readers/`.
- New `PROVIDER_REASON_LABELS`:
  - `antigravity` keeps all of its old texts.
  - `grok` gets four overrides: `cli-not-signed-in` is "Sign in to the Grok CLI (run grok login)"; `cli-unavailable`, `cli-timeout` and `cli-parse-failed` get Grok-specific text.
- `planLimitReasonLabel(reason, providerId)`: `providerId` is now a required parameter. All three resolve sites in `plan-owner.model.ts` pass `owner.owner.providerId`: `statusNoticeText` and `statusPill` (twice). There are no other consumers. `plan-tile-view.model.ts` only re-exports the function, and no other file in `libs` or `apps` imports it.

## Not done

- `plan-limits-panel.component.ts` has not been changed:
  - Th## Completed in the continuation

- MODIFIED `plan-limits/plan-limits-panel.component.ts`:
  - The section uses `ptahSurface` (replaces `surface-1 rounded-ptah-surface p-ptah-surface`), the same as the other dashboard sections.
  - The card grid is `flex flex-wrap gap-ptah-field`. Each card has the `plan-limit-card-slot` class: `flex: 1 1 calc(50% - 8px); min-width: 15rem`, `flex-basis: calc(25% - 12px)` from a container width of 1120 px, and `100%` below 560 px. `:host { container-type: inline-size }` makes the panel the size container. This uses the same component-`styles` and `@container` pattern as `usage-cost-quality.component.ts`.
  - "Without usage readings" is a sub-section with `border-t border-[var(--surface-border)] pt-ptah-field`. It has an `h3` heading (`text-xs font-semibold` muted) with a neutral `ptahBadge` count (`data-testid="plan-limits-chips-count"`) and a `ul` labelled by that heading. The panel renders each `li` (`plan-limit-chip-slot`, `flex: 1 1 18rem`), so the list holds only `li` children.
  - Kept: `plan-limits-chips`, `STATE_ORDER` and the card sort, the `providerWatcher` reload, `refresh-failed`, and the loading, error, empty, discovery and no-selected states.
- MODIFIED `plan-limits/provider-limit-chip.component.ts`: a two-line row (name `text-xs font-semibold`, reason `text-xs` muted, both wrap). It has `rounded-ptah-chip border px-3 py-2` and the mark. The `· ` prefix is gone. `data-testid="provider-limit-chip"` and `data-provider` stay.
- MODIFIED `plan-limits/provider-limit-card.component.spec.ts`: the `card()` fixture has `titleText`, `accountLine`, `statusTone` and `statusGlyph`. New tests cover:
  - the short title with the full label in `title`;
  - the account line, and that it is absent when the value is null;
  - the status glyph (`aria-hidden`) with its text, and no glyph for a neutral status;
  - the ring's `aria-label`;
  - for the chip: no `·`, and the test id is kept.
- MODIFIED `plan-limits/provider-limit-card.view-model.spec.ts`: new tests cover:
  - the title and account split;
  - the `ok`/`✓`, `err`/`⚠` and `warn`/`▲` badge mapping;
  - the Account item as the first Details item.
- MODIFIED `plan-limits/plan-limits-panel.component.spec.ts`: the chips test also checks the heading text "Without usage readings 1", the count badge, and that the chip renders inside `ul > li`.
- I confirmed that the `rounded-ptah-chip` and `gap-ptah-field` tokens exist in `apps/ptah-extension-webview/tailwind.config.js`.
- `provider-account-card/` needed no fix. All of its specs pass with the predecessor's label change.

## Verification

All commands ran from the worktree. The logs are in `.ptah/tmp/batchp-*.log`.

- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath <plan-limits/*.spec.ts provider-account-card/*.spec.ts>`
  - First run: 1 failure, in my new view-model test. The fixture for 100% had no `usedSource: 'provider-api'`, so the card state was near-limit; I fixed the fixture.
  - Second run: 7 suites and 111 tests passed.
- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json` exited 0 with no errors.
- `npx eslint` on every changed `plan-limits/*.ts` file, `plan-owner.model.ts` and `plan-tile-details.model.spec.ts` exited 0.
- Not run, because this brief forbids it: `typecheck-templates` (`ngc`) and a visual check in Electron. The coordinator should run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`, because the templates changed.

efresh notices: untouched in `plan-limits-panel.component.ts`. `STATE_ORDER` is at lines 31–40, the `cards` sort at about 154–161, and the `providerWatcher` effect and `refreshNotice` at about 185–205. `refresh-failed-notice.ts` is untouched.
2. Details content: `detailItems()` in `provider-limit-card.view-model.ts` keeps every item; only the Account item was added at the front. The popover markup (`isOpen`, `closed` and `backdropClicked`, `aria-expanded`) is unchanged in the card's footer. `cardNotice()` still words a retry delay differently from a reset.
3. Action destinations: the `runAction()`, `openChat` and `openSettings` outputs are unchanged, and the panel still calls `openSettingsTab('providers', providerId)`.
4. The panel is not coupled to usage data: no change, and nothing in `usage-dashboard/` was touched.

## Deviations from the spec

- The provider mark uses the existing `md` size, which is 32 px. The spec asks for 28 px, but the only other size, `sm`, is 16 px.
- The value column shows `primaryValueText` only when the ring is missing, which is the current behavior. Showing it beside the ring would repeat the percent, and the review flagged that repetition.
- The new Account item in Details gives keyboard access to the full label, as the review requires.

## Open risks

- Angular templates have not been compiled with `ngc`. Jest renders them in JIT mode, so binding errors would have failed the tests, but the strict template typecheck has not run.
- The 1120 and 560 px breakpoints measure the panel's own width, which is the container, not the viewport.
- The `sr-only` and `line-clamp-2` classes are assumed to be available through Tailwind. I did not confirm this.
- `border-color` on a `ptahSurface` inset depends on that directive rendering a border.
