Verdict: NOT READY. 0 blockers, 3 majors (variant mapping for ghost+border, two icon-only controls kept as ptahButton), 3 minors.

Scope: 35 .ts files in machines-ui, memory-curator-ui, skill-synthesis-ui (diff b3.diff, plus the final files in the worktree). I compared every `<button>`/`<a>` opening tag of HEAD with the working tree by script. The element count is equal in all files (no @if structure change).

Paths below are relative to `libs/frontend/`.

## Passed checks

- (1) Attributes: `data-testid`, `(click)`, `[disabled]`, `type`, `[attr.*]`, `#ref`, `href/target/rel` are kept on every converted element. The only removed items are `btn*` classes, `focus-visible:*` utilities, `gap-1`, `border*`, `p-0`, `disabled:*` styling and (for icon buttons) `aria-label`. No `@if` structure changed.
- (4) Imports: in all 35 files the used directives are imported from `@ptah-extension/ui` and listed in `imports: [...]`. No unused import. No missing import. No import line sits inside another import block.
- (5) Not converted (correct): `btn-warning` (agent-model-editor, bulk-rebase-confirm, clone-bulk-toolbar, clone-card, clone-detail-drawer, reconcile-guard, skill-clones-view), `join-item` (memory-indexed-code, memory-search-bar), red ghost (corpus-list.component.ts:199, clone-card `text-warning`, machine-overview.component.ts:168 `text-state-err`), `btn-xs` chips (corpus-build-dialog:75, timeline-filters:84), link-like button with `min-h-7` (memory-diagnostics-accordion:169). Dynamic `[class]` hits are on non-button elements (badges, dots, banners).
- (6) aria-busy: the three `[attr.aria-busy]` on ptahButton hosts became `[busy]` (memory-diagnostics-accordion.component.ts:~224, memory-curator-tab.component.ts:~152, skill-specs-control.component.ts:~45). No `[attr.aria-busy]` remains on a ptahButton. Remaining `aria-busy` hits (add-machine-pane:70, readiness-panel:85, machine-list:76, machines-view:198, remote-session-list:184) are on containers.
- (7) Layout utilities: `w-full`, `ml-auto`, `shrink-0`, `self-start`, `mt-*`, `md:self-end`, `max-[767px]:inline-flex`, `hidden` are all kept. Only `transition-colors duration-150` was dropped on 6 buttons (see minor 3).
- Specs: no spec was edited. `machines-view.component.spec.ts:136` reads `btn-primary`, which the directive host still sets, so it should still pass.

## Findings

### Major

1. **ghost+border mapped to `ghost`, rule says `secondary`** (rule 2). The old element had `btn-ghost ... border border-surface-border`. The new element is `variant="ghost"` and lost its border, so it looks like a plain ghost. It must be the default `secondary` (drop the `variant` input). Elements:
   - machines-ui/add-machine-pane/add-machine-pane.component.ts:210
   - machines-ui/machines-view/machine-overview.component.ts:102 (`machine-readiness`)
   - machines-ui/machines-view/machine-overview.component.ts:112 (`machine-actions`; see also finding 2)
   - machines-ui/machines-view/machine-overview.component.ts:225 (`machine-retry`)
   - machines-ui/remote-approval-block/remote-approval-block.component.ts:174 (`approval-deny`)
   - machines-ui/remote-session-list/remote-session-list.component.ts:196
   - machines-ui/remote-session-view/remote-session-view.component.ts:149 (`remote-refresh`)
   - machines-ui/remote-session-view/remote-session-view.component.ts:165 (`remote-stop`)

2. **Icon-only control kept as `ptahButton` with `aria-label`** (rules 3 and mapping). The only child is an icon, so it must be `ptahIconButton label="More machine actions"` with no `aria-label`. machines-ui/machines-view/machine-overview.component.ts:112-122 (`lucide-angular [img]="MoreIcon"` is the only child). It also has the border problem of finding 1 (use `variant="secondary"` on the icon button if the border look must stay).

3. **Icon-only glyph button kept as `ptahButton` with `aria-label`.** memory-curator-ui/diagnostics/db-health-panel.component.ts:~326-334 (`data-testid` none, text is only `✕`, `aria-label="Dismiss notification"`). Convert to `ptahIconButton size="xs" label="Dismiss notification"` and remove `aria-label`. (corpus-suggestions.component.ts:76 does the same glyph case correctly.)

### Minor

1. **Mid-file import.** skill-synthesis-ui/clones/agent-model-editor.component.ts:157-158: `import { PtahButtonDirective } ...` sits after `let nextEditorId = 0;` and not in the import block at the top of the file. Move it up (lint rule `import/first` risk).
2. **Detached doc comment.** machines-ui/machines-view/machine-overview.component.ts:46: the import is placed between the class JSDoc and `@Component`, so the JSDoc no longer documents the component. Move the import to the top import block.
3. **`transition-colors duration-150` dropped** on clone-card.component.ts:380 and 398, quarantined-agents-panel.component.ts:197 and 210, skill-clones-view.component.ts:193 and 337. The rules do not list these utilities as owned by the family. Confirm the directive supplies a transition, or restore them. Low impact.

### Observations (no change required)

- `[attr.aria-disabled]` is bound in the template on clone-card.component.ts:~385 while the directive host also binds `aria-disabled`. The template binding takes priority in Angular, so the old behavior is kept. Worth a quick test.
- Text buttons that keep a visible label plus `aria-label`/`[attr.aria-label]` (corpus-list, timeline-*, memory-curator-tab, copy-command, approval-copy) are valid for `ptahButton`. The `aria-label` can differ from the visible text, which is a pre-existing choice.
- `tools/ui-class-audit/baseline.json` changed (79 insertions, 222 deletions). It is a generated baseline, not in the review scope, but it must be regenerated after the fixes above.

## Counts

- Elements checked: all `<button>`/`<a>` tags in 35 files.
- Findings: 0 blocker, 3 major (11 elements in total), 3 minor.
