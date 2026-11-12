# Batch 4 independent review

Reviewed `git diff origin/main...HEAD` against `family-3-look.md`. Source review only; no builds or wide checks were run. The CLI exposes Ptah workspace tools but no invocable skill mechanism, so no skill could be loaded.

## Findings

1. **P1 — Parent spec still queries the removed DaisyUI class.** `libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-limits-lanes.component.spec.ts:62-63` searches each provider tile for `.badge-ghost` and expects `Provider API`. The child now renders `<span ptahBadge size="xs">` at `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/provider-lane-limit-tile.component.ts:39`, which has `[data-ptah-badge]` and no `.badge-ghost`. This assertion will receive `[undefined, undefined]`. Update this parent spec's selector.

2. **P2 — Failed state uses the metadata tone.** `libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-call-header.component.ts:197-202` renders the word `failed` with `tone="neutral"`. `family-3-look.md` section 1 assigns `err` to failed states and `neutral` to metadata. Set `tone="err"` if this badge is intended to communicate failure; the text already supplies the non-color cue.

3. **P2 — Dynamic labels can lose their meaning when clipped.** `libs/frontend/chat-ui/src/lib/molecules/agent-summary.component.ts:94-96` puts `block.name` directly in a badge inside a shrinkable `min-w-0` container. The owner CSS says direct text in its inline-flex host is cut without an ellipsis; `family-3-look.md` section 1 calls for a `.ptah-badge-text` child for long text. Wrap this name, as done for the tool chip at `libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-call-header.component.ts:169`. The dynamic plugin ID at `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts:400-402` also uses direct text; consider wrapping it if IDs can exceed the available row width.

## Checks and scope

- All newly adopted `ptahBadge` hosts in the diff are `span` elements. Each changed component imports `PtahBadgeDirective` from `@ptah-extension/ui` and includes it in component `imports`.
- The warn/err timer mappings at `permission-request-card.component.ts:96` and `question-card.component.ts:69` preserve the old threshold semantics. Ghost becomes neutral, success becomes ok, and primary becomes accent. The gold Ptah chip remains raw at `tool-call-header.component.ts:117`; `batch4-lane-b.md:10` records its custom gold look as the reason. The button badge left raw in the dashboard is recorded in `batch4-lane-c.md:8`, consistent with the directive's `span[ptahBadge]` selector.
- The changed specs now query `[data-ptah-badge]`, but the parent spec above was missed. Other `.badge` queries found in chat-ui specs target still-raw badge behavior or `badgeClass` data (`compact-feed-rows.spec.ts:46`, `compact-session-activity.component.spec.ts:678`, `lane-usage-tile.component.spec.ts:258`).
- The dense rail chips and tool chips correctly use `.ptah-badge-text`. `command-rail-tabs.component.ts:51-53` retains a glass-only `.tab-badge` background override, so its count chip may differ from the family token fill on that surface. This is a source-level look observation; no rendered Electron comparison was performed in this read-only review.
