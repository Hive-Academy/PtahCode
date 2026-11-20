# Code Style Review: TASK_2026_2272_7f01 (Schedules UI redesign)

Scope: `libs/frontend/cron-scheduler-ui/src/lib/components/` (7 files, one Read each).
Not read: `cron-format.ts`, `cron-run-status.ts`, the specs, and the services.
Two reads came back truncated (the tool replaced the tail with an outline):
- `cron-job-form.component.ts`: lines 71-77, 79-98 omitted. Line 306 onward is outline only. The form's class body after line 305 (validation, submit, focus handling) was not seen.
- `cron-job-detail-drawer.component.ts`: line 298 onward is outline only. The drawer's class body (delete-confirm focus handling) was not seen.
Every finding below is limited to text that was visible. Items that depend on unseen code are marked "unverified".

## Verdict

NEEDS_REVISION. 0 blockers, 3 major, 12 minor.

Conventions confirmed as met across all seven files: standalone, OnPush, signal `input()`/`output()`, `inject()`, `@if`/`@for` control flow, no `[innerHTML]`, no `ngClass`, no `any`, no `console.*`, no `<div (click)>`, no `track $index`. The only `@for` tracks a stable value (`job.id`, `row.id`, a skeleton index constant). Icons have `aria-hidden="true"`, and icon-only buttons carry a `label` or `aria-label`.

## Findings

### Major

M1. Scope switch is marked up as an ARIA tablist but does not behave like one
- File: `cron-header-band.component.ts:80-113`
- Problem: the container has `role="tablist"` and the buttons have `role="tab"` plus `[attr.aria-selected]`. There is no `tabpanel`, no `aria-controls`, and no roving `tabindex` or arrow-key handling. Screen readers announce a tab widget whose keyboard contract does not exist. The buttons also set both `[selected]` and `[attr.aria-selected]`.
- Fix: make it a segmented control. Use `role="radiogroup"` with `role="radio"` and `aria-checked`, or plain buttons with `[attr.aria-pressed]`. If the design system has a segmented or tab component in `@ptah-extension/ui`, use that.

M2. The same job facts are derived separately in the card and the drawer, and the two have already drifted
- Files: `cron-job-card.component.ts:255-279` and `cron-job-detail-drawer.component.ts:104-148, 215-228`
- Problem:
  - Next run: the card calls `nextRunMetric(job)` (`card:255`). The drawer reimplements it in the template (`drawer:106-113`) as `j.enabled ? time(nextRunAt) + relative(nextRunAt) : 'Paused'`. The two can disagree for paused jobs or jobs with no next run.
  - Creator: the card builds `{id, preview}` from `job.createdBy` (`card:272-279`) and the drawer builds `creatorSessionId` the same way. The strings "Created by agent session" and "Created by you" are duplicated (`card:135-140`, `drawer:142-147`).
  - Toggle label and icon: `enabled ? 'Disable' : 'Enable'` with `PowerOff`/`Power` appears in both (`card:180-188`, `drawer:223-227`).
  - Last-run time and relative text: the card has `lastRunTime` and `lastRunRelative` computeds; the drawer has `time()` and `relative()` helpers.
  - State vocabulary: the card shows a neutral `ptahBadge` "Paused" only when disabled (`card:71-79`). The drawer shows `ptah-status` with `'online'`/`'offline'` and "Enabled"/"Paused" (`drawer:81-87`). The same state is rendered by two different components.
- Fix: put the shared derivations in `cron-format.ts` / `cron-run-status.ts`. Candidates: `creatorLabel(job)` returning `{kind, label, sessionId, preview}`, `jobStateView(job)` returning `{label, status}`, and a single `nextRunMetric` used by both. Have the drawer use `nextRunMetric(job)` instead of its inline branch.

M3. No focus management is visible when the form, the drawer or the inline delete confirm open or close
- Files: `cron-scheduler-tab.component.ts:211-228`, `cron-job-card.component.ts:189-216`, `cron-job-detail-drawer.component.ts:66-72`
- Problem:
  - The tab's `editJob` selects `null` (closing the drawer) and shows the form. `newJob` shows the form. Neither moves focus to the form or returns it to the opener. The form has `viewChild` refs for its inputs (`form:278-280`), but whether it focuses on open is unverified because the class body was truncated.
  - The drawer relies entirely on `ptah-native-drawer` for focus trap and focus return to the opening card. The drawer file has `#deleteButton`, `afterNextRender` and `Injector` imports that suggest restoring focus after the delete confirm is cancelled, but that code was not visible.
  - The card shows `ptah-inline-confirm` after "Delete job" (`card:205-216`) with no `afterNextRender` focus move onto the confirm, and no focus return to the delete button on cancel (`card:214`). The drawer appears to handle this and the card does not, which is a consistency gap. Whether `ptah-inline-confirm` focuses itself is unverified.
- Fix: confirm that `NativeDrawerComponent` restores focus to the opener. Make the form focus its first field on open and return focus to the invoking control on `saved` and `cancelled` (the tab can track the opener element). Give the card the same delete-confirm focus handling as the drawer, or move that behaviour into `ptah-inline-confirm`.

### Minor

m1. `cron-scheduler-tab.component.ts:162-165` — `reviewAvailable` calls `this.vscodeService.config();` and discards the result, only to register a signal dependency. There is no comment saying so. Add a comment, or read the config value and pass it to `isReviewSurfaceAvailable`.

m2. `cron-scheduler-tab.component.ts:230-242` — mixed async patterns. `toggleEnabled` and `runNow` are `async` and are bound directly in the template (`(toggled)="toggleEnabled($event)"`, `(runNow)="runNow($event)"`), which leaves unawaited promises there. `deleteJob` is a sync wrapper using `void`. The `*Selected` methods wrap with `void`. Pick one style, for example sync methods that `void` the call.

m3. `cron-scheduler-tab.component.ts:188-195` vs `cron-job-list.component.ts:111, 154-156` — the tab comment says the description is resolved there "so the drawer stays free of Angular DI". The list injects `CronExpressionService` and calls `describe()` from the template for every card (`list:96`). Resolve the descriptions in one place (a computed map in the list, or the tab for both), and remove the template method call.

m4. `cron-header-band.component.ts:25` — `CRON_JOB_LIST_ID` is defined in the header band and imported by the list (`list:19`). One sibling component imports a constant from another. Move it to a small shared file (for example `cron-ids.ts`). `list:45` sets `[id]` on a `div` with no `tabindex`. The comment says the band "moves focus to it". A plain `div` is not focusable, so verify the instrument band sets `tabindex="-1"` or handles this itself.

m5. `cron-job-list.component.ts:89-92` — `<section aria-label="Scheduled jobs">` repeats the heading "Scheduled jobs" from `ptah-section-header` (`list:46`), and the grid has no list semantics. Use a `<ul>`/`<li>` structure or `aria-labelledby` on the existing heading. The same redundancy appears in `cron-run-history.component.ts:92-93` ("Run history") and `cron-job-form.component.ts:115-118` (`[attr.aria-label]="heading()"` next to the section header).

m6. `cron-job-card.component.ts:189-197` — the delete button sets `aria-expanded` but no `aria-controls` pointing at the confirm region.

m7. `cron-job-card.component.ts:1-9` and `cron-job-detail-drawer.component.ts:1-18` and `cron-run-history.component.ts:1-12` carry file-header comments before the imports. The tab, list, header and form put the doc comment above the class. Choose one location. The drawer header is a long block that mixes a rationale for NG8011 with design notes.

m8. Naming drift: the card calls the last-run view `lastRun` (`card:258`), the drawer calls it `lastRunView` (`drawer:126`). Name them the same.

m9. Spacing tokens are inconsistent. The tab and header band use arbitrary values like `gap-[var(--ptah-gap-section)]` (`tab:74`, `header:44, 50, 69`). The card, list drawer and run history use token utilities such as `gap-ptah-controls`, `gap-ptah-heading`, `gap-ptah-section` (`card:66, 83, 107`, `drawer:94, 152`, `history:92`). Raw numeric spacing also appears: `gap-2`/`gap-3`/`px-3 py-2` (`history:105, 108, 134`, `drawer:79, 95, 185`, `header:52`). Prefer the token utility form everywhere.

m10. `cron-job-detail-drawer.component.ts:154-160` — `<p tabindex="0">` makes the scrollable prompt block focusable. It has no role or accessible name, and a non-interactive element with `tabindex` may trip `@angular-eslint/template/no-noninteractive-tabindex`. Add `role="region"` with an `aria-label`, or a `<pre>`/`<section>` with a label.

m11. `cron-job-form.component.ts:229-242` — the checkbox `<label>` wraps the "Enabled" text and the explanatory sentence, so the accessible name becomes "Enabled A job that is not enabled keeps its schedule but does not run." Keep the label to "Enabled" and attach the sentence with `aria-describedby`. `form:216-226` also puts `aria-label="Timezone"` on `ptah-select` inside a `ptah-field label="Timezone"`; the duplicate label may be redundant, so verify how `ptah-field` associates labels with `ptah-select`.

m12. `cron-job-form.component.ts:285-286` — `expressionHelp` and `timezoneHint` are `protected readonly` instance strings, while `SUGGESTED_TIMEZONES`, `RESERVED_PROMPT_PREFIX` and `SAVE_FAILED_FALLBACK` are module-level constants. Move the static help text to module level.

Smaller notes (not counted):
- `cron-scheduler-tab.component.ts:66` hard-codes the releases URL.
- `cron-run-history.component.ts:226` calls `navigator.clipboard.writeText` directly. The Electron preload exposes `ptahClipboard` (see `03-quality-audit.md`). Check how other components copy text and follow that path. Unverified whether `navigator.clipboard` works in the sandboxed renderer.
- `cron-run-history.component.ts:214` — `copyLabel(runId)` is a template method call per row. Fold the label into the `rows` computed, or into a map.
- `data-testid="cron-empty-state"` appears in both the tab (`tab:50`) and the list (`list:76`). Only one renders at a time, but the shared id is ambiguous in specs.

## Repository convention checklist

| Rule | Status | Evidence |
| --- | --- | --- |
| Standalone, OnPush | PASS | all 7 files |
| Signal `input()`/`output()`, `inject()` | PASS | e.g. `header:149-156`, `drawer:271-292` |
| Built-in control flow, stable `track` | PASS | `list:66, 93`, `history:103` |
| No `[innerHTML]`, `ngClass`, `any`, `console.*`, `<div (click)>` | PASS | none found |
| Design-system components and tokens | PASS with m9 | `@ptah-extension/ui` used throughout; spacing token use is mixed |
| `aria-*` on interactive controls | PARTIAL | M1, M3, m6, m10, m11 |
| Duplicated logic belongs in `cron-format.ts` / `cron-run-status.ts` | FAIL | M2 |
