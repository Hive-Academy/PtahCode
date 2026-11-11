# Badge and status family: research (composite 1)

Date: 2026-11-11. Task: TASK_2026_957_fda3. Step 1 of the six steps (epic section 4).
Source of counts: a codex CLI lane ran the `rg` commands in "Method" on this branch.

## Summary

- 241 static `badge` class strings plus 3 dynamic ones, in 13 lib groups. 13 status dots,
  22 count chips, 3 plain chips. 7 uses of the two old owners in `libs/frontend/ui`.
- The product uses two sizes (sm 140, xs 91; lg 1, md 0), two styles (ghost 72, outline 71,
  plain 98) and few tones (warning 26, success 9, info 7, neutral 6, error 6, primary 2,
  accent 1). Soft and dash are not used.
- No primitive is necessary. The owner is static text (no keyboard path).

## Recipes found (what each one means)

| Recipe today | Meaning in the product | Owner variant |
|---|---|---|
| `badge badge-ghost badge-sm/xs`, `badge badge-sm/xs` | Metadata: model, kind, scope, version | `ptahBadge` tone `neutral`, soft |
| `badge badge-outline badge-sm/xs text-base-content` | Metadata in settings and catalogs | `ptahBadge` tone `neutral`, outline |
| `badge badge-warning/success/error/info` | A state word: beta, active, failed | `ptahBadge` tone `warn/ok/err/info` |
| `badge badge-primary/accent` | Brand emphasis: new, pro | `ptahBadge` tone `accent` |
| `badge ... tabular-nums` with a count | Count of items | `ptahBadge count` |
| `rounded-full w-2 bg-success` dot (13) | Live state with or without a word | `ptah-status` (pill, inline, dot) |
| `ptah-ui-status-badge` (3) | Run state with a glyph | `ptah-status` pill |
| `ptah-status-badge` in chat-ui (0 uses) | Dead copy | delete at step 6 |

## Exclusions

- `ptah-file-status-badge` (4 uses): a git letter code (M, A, D) with a measured contrast spec.
  It keeps its own look. It can take the badge tokens later.
- Composite owners that only contain a badge (`ptah-cost-badge`, `ptah-duration-badge`,
  `ptah-delivery-status`, `ptah-connector-card-status`, `ptah-harness-health-badge` and the
  others in the owner table): at step 5 their inner recipe moves to `ptahBadge` or
  `ptah-status`. The wrapper stays when it holds logic.
- Chat composer and canvas rail (decision U2): the canvas rail dot keeps its look.
- Spinners (`loading loading-spinner`) are not badges. Skeleton bars and meters are not dots.
- `rounded-badge` (a radius utility) is not a badge.

## API sketch (built in step 2)

```html
<span ptahBadge tone="neutral|accent|info|ok|warn|err" appearance="soft|outline" size="sm|xs" [count]>
<ptah-status status="running|queued|pending|needs-review|warning|failed|offline|completed|online"
             appearance="pill|inline|dot" size="sm|xs" label="...">
```

- `ptahBadge` is a directive on `span`, as `ptahButton` is on `button`. The consumer keeps its
  layout classes. The directive sets `data-*` attributes. The look is in `ptah-badge.css`.
- `ptah-status` reuses the `PtahStatus` type of `ptah-ui-status-badge`, so step 5 is a
  selector swap for those 3 uses.

## Risks

- Ghost and outline are both "neutral" today, with no rule. The look sheet gives one rule.
- 26 warning badges: some mean "beta", some mean "needs action". Step 5 must read the word.
- Unlabeled dots (5 below): at step 5 each one gets a word or `appearance="dot"` with a label.
- Specificity: the owner has no `.badge` class, so the DaisyUI and glass rules do not apply.
- Live regions: `ptah-status` is not a live region. A consumer that announces a change keeps
  its own `role="status"` wrapper.

## Census

### Method

Scope: `libs/frontend/**` and `apps/ptah-extension-webview/**`; exclude `libs/frontend/ui/**` from uses. Counts are template occurrences, not distinct files. `*.ts` was inspected for inline template markup; specs and non-template code were discarded. A badge class means the standalone `badge` token, so `rounded-badge` does not count. Dynamic expressions with no literal `badge` are listed as a limitation.

Exact search commands (run from repository root; matches were grouped by the first folder under `libs/frontend`):

```sh
rg -n -U -o 'class=\x22[^\x22]*\bbadge\b[^\x22]*\x22' -g '*.ts' -g '*.html' -g '!*.spec.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n '(\[class\]|\[ngClass\]|\[class\.[^]]+\]).*\bbadge\b' -g '*.html' -g '*.component.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n -U '(?s)class=\x22[^\x22]*\bbadge\b[^\x22]*\x22.{0,180}\{\{[^}]{0,100}(?:count|Count|\.length|total|Total)' -g '*.html' -g '*.component.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n 'rounded-full' -g '*.ts' -g '*.html' -g '!*.spec.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n 'status status-' -g '*.html' -g '*.component.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n 'rounded-full.*px-2.*text-xs|text-xs.*px-2.*rounded-full' -g '*.html' -g '*.component.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n -o 'selector:\s*\x27ptah-[a-z0-9-]*(badge|chip|pill|tag|status)[a-z0-9-]*\x27|<ptah-[a-z0-9-]*(badge|chip|pill|tag|status)[a-z0-9-]*\b' -g '*.html' -g '*.component.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n -o 'selector:\s*\x27ptah-[a-z0-9-]*(badge|chip|pill|tag|status)[a-z0-9-]*\x27|<ptah-[a-z0-9-]*(badge|chip|pill|tag|status)[a-z0-9-]*\b' -g '*.ts' -g '!*.component.ts' -g '!*.spec.ts' -g '!libs/frontend/ui/**' libs/frontend apps/ptah-extension-webview
rg -n "selector: '(ptah-ui-status-badge|ptah-file-status-badge)'" libs apps -g '*.ts'
```

The multiline count search was manually checked to exclude adjacent counts outside the badge. `px-2.5` does not qualify for the chip recipe. Status dots exclude skeleton bars and audio meter bars. Modifier columns count tokens; one badge can contribute to multiple columns. Dynamic `[class]` recipes with a literal `badge` add three uses beyond the 241 static class strings.

### Recipes by group

| Group | Static badge | Size xs/sm/md/lg | Style ghost/outline/soft/dash | Tone primary/secondary/accent/neutral/info/success/warning/error | Dots | Count chips | Plain chips |
|---|---:|---|---|---|---:|---:|---:|
| chat | 99 | 48/50/0/1 | 19/40/0/0 | 0/0/1/3/7/3/13/4 | 8 | 10 | 1 |
| chat-ui | 26 | 12/14/0/0 | 9/7/0/0 | 1/0/0/2/0/1/2/0 | 0 | 2 | 0 |
| command-center | 7 | 0/4/0/0 | 0/5/0/0 | 1/0/0/0/0/0/0/0 | 0 | 1 | 0 |
| dashboard | 2 | 1/1/0/0 | 1/0/0/0 | 0/0/0/0/0/0/1/0 | 0 | 0 | 0 |
| git-ui | 9 | 8/1/0/0 | 6/1/0/0 | 0/0/0/0/0/1/1/0 | 0 | 1 | 0 |
| machines-ui | 8 | 0/8/0/0 | 0/8/0/0 | 0/0/0/0/0/0/0/0 | 0 | 0 | 0 |
| marketplace | 22 | 4/18/0/0 | 12/2/0/0 | 0/0/0/1/0/0/4/0 | 0 | 5 | 1 |
| memory-curator-ui | 11 | 0/11/0/0 | 1/0/0/0 | 0/0/0/0/0/2/2/2 | 0 | 0 | 0 |
| review-runs-ui | 7 | 1/2/0/0 | 1/4/0/0 | 0/0/0/0/0/0/1/0 | 4 | 0 | 0 |
| setup-wizard | 8 | 0/8/0/0 | 4/0/0/0 | 0/0/0/0/0/1/0/0 | 0 | 1 | 0 |
| skill-synthesis-ui | 14 | 3/11/0/0 | 5/1/0/0 | 0/0/0/0/0/1/1/0 | 0 | 1 | 0 |
| tasks-ui | 27 | 14/11/0/0 | 14/3/0/0 | 0/0/0/0/0/0/0/0 | 0 | 1 | 0 |
| thoth-shell | 1 | 0/1/0/0 | 0/0/0/0 | 0/0/0/0/0/0/1/0 | 0 | 0 | 0 |
| canvas | 0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0/0/0/0/0 | 1 | 0 | 0 |
| onboarding | 0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0/0/0/0/0 | 0 | 0 | 1 |
| webview app | 0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0/0/0/0/0 | 0 | 0 | 0 |
| **Total** | **241** | **91/140/0/1** | **72/71/0/0** | **2/0/1/6/7/9/26/6** | **13** | **22** | **3** |

The 13 dot uses are `rounded-full` with a small width/height and status `bg-*` color; no `status status-*` template use was found. Two dots in `settings.component.html` are `w-1.5`. The three dynamic literal badge classes occur in chat; their modifiers are omitted from the static modifier table. Review-runs-ui also has conditional modifier bindings on one static badge.

### Existing component owners

Use counts are selector opening tags within scope; definitions under excluded `libs/frontend/ui` are shown for ownership. `ptah-status-badge` has zero selector uses in scope.

| Selector | Defining file | Uses |
|---|---|---:|
| `ptah-ui-status-badge` | `libs/frontend/ui/src/lib/foundation/status-badge.component.ts:6` | 3 |
| `ptah-status-badge` | `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts:18` | 0 |
| `ptah-file-status-badge` | `libs/frontend/ui/src/lib/native/file-status-badge/file-status-badge.component.ts:77` | 4 |
| `ptah-connector-card-status` | `libs/frontend/marketplace/src/lib/ui/connector-card-status.component.ts:31` | 3 |
| `ptah-cost-badge` | `libs/frontend/chat-ui/src/lib/atoms/cost-badge.component.ts:48` | 4 |
| `ptah-dashboard-badge` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-badge.component.ts:22` | 1 |
| `ptah-delivery-status` | `libs/frontend/chat/src/lib/components/molecules/delivery-status/delivery-status.component.ts:16` | 7 |
| `ptah-duration-badge` | `libs/frontend/chat-ui/src/lib/atoms/duration-badge.component.ts:15` | 2 |
| `ptah-file-tag` | `libs/frontend/chat/src/lib/components/file-suggestions/file-tag.component.ts:18` | 1 |
| `ptah-generation-source-status` | `libs/frontend/setup-wizard/src/lib/components/generation-source-status.component.ts:10` | 1 |
| `ptah-harness-health-badge` | `libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.ts:63` | 1 |
| `ptah-item-status-card` | `libs/frontend/onboarding/src/lib/shared/item-status-card.component.ts:100` | 1 |
| `ptah-item-status-grid` | `libs/frontend/onboarding/src/lib/shared/item-status-grid.component.ts:23` | 1 |
| `ptah-license-status-card` | `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:67` | 1 |
| `ptah-machine-status` | `libs/frontend/machines-ui/src/lib/components/machine-status/machine-status.component.ts:34` | 2 |
| `ptah-main-agent-scope-badges` | `libs/frontend/chat/src/lib/settings/providers/main-agent-scope-badges.component.ts:48` | 1 |
| `ptah-marketplace-status-bar` | `libs/frontend/marketplace/src/lib/shell/marketplace-status-bar.component.ts:70` | 1 |
| `ptah-mcp-status-chip` | `libs/frontend/chat/src/lib/components/molecules/mcp-status-chip.component.ts:18` | 1 |
| `ptah-provenance-badge` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/provenance-badge.component.ts:45` | 2 |
| `ptah-removal-lock-badge` | `libs/frontend/marketplace/src/lib/ui/removal-lock-badge.component.ts:36` | 3 |
| `ptah-run-status-chip` | `libs/frontend/onboarding/src/lib/shared/run-status-chip.component.ts:37` | 2 |
| `ptah-schedule-wakeup-chip` | `libs/frontend/chat/src/lib/components/organisms/execution/schedule-wakeup-chip.component.ts:21` | 1 |
| `ptah-scorecard-badge` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-badge.component.ts:23` | 2 |
| `ptah-send-message-chip` | `libs/frontend/chat/src/lib/components/organisms/execution/send-message-chip.component.ts:27` | 1 |
| `ptah-session-organization-chips` | `libs/frontend/chat/src/lib/components/atoms/session-organization-chips/session-organization-chips.component.ts:54` | 1 |
| `ptah-session-sync-chip` | `libs/frontend/machines-ui/src/lib/components/reconnect-banner/session-sync-chip.component.ts:15` | 1 |
| `ptah-status-card` | `libs/frontend/onboarding/src/lib/shared/status-card.component.ts:6` | 1 |
| `ptah-status-pill` | `libs/frontend/marketplace/src/lib/ui/status-pill.component.ts:99` | 7 |
| `ptah-token-badge` | `libs/frontend/chat-ui/src/lib/atoms/token-badge.component.ts:31` | 1 |
| `ptah-turn-summary-chip` | `libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-chip.component.ts:79` | 1 |
| `ptah-ui-display-chip` | `libs/frontend/chat-ui/src/lib/organisms/ptah-ui/ptah-ui-display-chip.component.ts:18` | 1 |
| `ptah-workflow-badge` | `libs/frontend/chat/src/lib/components/atoms/workflow-badge.component.ts:19` | 2 |

### Frequent full badge class strings

| Class string | Uses | Two examples (file:line) |
|---|---:|---|
| `badge badge-ghost badge-sm` | 12 | `libs/frontend/setup-wizard/src/lib/components/community-packs-panel.component.ts:151`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/reconcile-guard.ts:204` |
| `badge badge-sm` | 10 | `libs/frontend/setup-wizard/src/lib/components/agent-preview-dialog.component.ts:246`; `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:12` |
| `badge badge-outline badge-xs text-base-content` | 8 | `libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts:192`; `libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts:205` |
| `badge badge-xs` | 7 | `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:377`; `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:387` |
| `badge badge-outline badge-sm gap-1 whitespace-nowrap text-base-content` | 7 | `libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:185`; `libs/frontend/chat/src/lib/settings/ptah-ai/voice-config.component.ts:183` |
| `badge badge-ghost badge-xs` | 5 | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:13`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-detail.component.ts:110` |
| `badge badge-ghost badge-sm tabular-nums` | 5 | `libs/frontend/marketplace/src/lib/shell/marketplace-nav.component.ts:277`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:118` |
| `badge badge-outline badge-sm gap-1 text-base-content` | 4 | `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:271`; `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:285` |
| `badge badge-ghost badge-sm text-base-content` | 4 | `libs/frontend/tasks-ui/src/lib/components/detail/task-folder-overview.component.ts:44`; `libs/frontend/tasks-ui/src/lib/components/detail/task-document-reader.component.ts:95` |
| `badge badge-success badge-sm` | 4 | `libs/frontend/setup-wizard/src/lib/components/community-packs-panel.component.ts:142`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:79` |

### Unlabeled color dots

These five empty dot elements have no own `aria-label` or `title`. Some are `aria-hidden` and accompanied by nearby text, so this is an element-level finding rather than proof that the whole status is inaccessible.

| Example | Color source |
|---|---|
| `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:137` | `bg-success` / `bg-warning` |
| `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:186` | `bg-warning` / `bg-success` |
| `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:378` | `bg-warning` |
| `libs/frontend/review-runs-ui/src/lib/components/review-runs-list.component.ts:57` | `bg-current` from parent state color |
| `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts:217` | `bg-current` with state class bindings |
