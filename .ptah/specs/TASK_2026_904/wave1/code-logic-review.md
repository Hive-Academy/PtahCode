# Wave 1 code logic review

**Verdict: APPROVE.** No evidenced class-set, attribute, event, or import regression in the named extraction and adoption paths. This is a source review; no executable checks were run under the review restriction.

## Findings

| Severity | File:line | Evidence | Suggested fix |
| --- | --- | --- | --- |
| — | — | No evidenced defect in the reviewed paths. | — |

## Per-element class equality

`F` denotes the retained `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` set. Look definitions: `libs/frontend/ui/src/lib/extracted/setup-action/setup-action.directive.ts:4-9`, `setup-field/setup-field.directive.ts:4-7`, `rail-icon-action/rail-icon-action.look.ts:7-9`. Before values came from `git show 1fb1c68a3:<path>`.

| Element (current file:line) | Before set | After: look + static/bound leftovers | Equal? |
| --- | --- | --- | --- |
| Analyze Continue previous (`analyze-workspace.page.ts:173`) | `btn btn-primary btn-sm` | primaryCompact | yes |
| Analyze Start fresh (`:178`) | `btn btn-sm` | ghost | yes |
| Analyze new run (`:194`) | `btn btn-primary mt-4` | primaryFull | yes |
| Analyze Retry (`:216`) | `btn btn-sm` | ghost | yes |
| Analyze Use saved (`:235`) | `btn btn-primary btn-sm` | primaryCompact | yes |
| Analyze Hide (`:242`) | `btn btn-sm` | ghost | yes |
| Resume (`resume-banner.component.ts:19`) | `btn btn-primary btn-sm min-h-8` | glass | yes |
| Workspace select (`workspace-header.component.ts:17`) | `select select-bordered select-sm` | workspace | yes |
| Model select (`generation-model-picker.component.ts:23`) | `select select-bordered select-sm w-full` | default model via `undefined` | yes |
| Dense cards (`canvas-rail.component.ts:154`) | `btn btn-ghost btn-xs` | rail look | yes |
| Collapse (`canvas-rail.component.ts:168-172`) | `btn btn-ghost btn-xs min-h-6 min-w-6` + conditional `opacity-60` | rail look + `min-h-6 min-w-6` + same condition | yes |
| Pair (`add-machine-pane.component.ts:229-230`) | `btn btn-primary btn-sm` + F | primaryCompact + F | yes |
| Cancel (`add-machine-pane.component.ts:238-239`) | `btn btn-ghost btn-sm` + F | ghost (`btn btn-sm`) + static `btn-ghost` + F | yes |
| Add machine, empty (`machine-list.component.ts:51-54`) | `btn btn-sm gap-1` + F + `btn-ghost` | ghost + `gap-1` + F + bound `btn-ghost` | yes |
| Add machine, populated (`machine-list.component.ts:51-54`) | `btn btn-sm gap-1` + F + `btn-primary` | ghost + `gap-1` + F + bound `btn-primary` | yes |
| Review close (`review-settings-drawer.component.html:24-25`) | `btn btn-ghost btn-sm` | ghost + static `btn-ghost` | yes |
| Review retry (`review-settings-drawer.component.html:39-40`) | `btn btn-ghost btn-sm` | ghost + static `btn-ghost` | yes |

No listed element duplicates a class declaration: the `ghost` look supplies `btn btn-sm`, and consumers retain `btn-ghost` only where needed. Angular merges static classes, directive `[class]`, and individual `[class.x]` bindings.

## Five logic questions

1. **Intent:** Every changed element retains its original DOM and class set, including both states of the conditional machines button, as tabulated.
2. **Inputs/defaults:** `[ptahSetupField]="undefined"` falls through `??` to the root `model` look (`setup-field.directive.ts:16-18`; `setup-field.look.ts:6-9`), matching the original select. Other consumers use explicit looks.
3. **Attributes, events, and state:** The density button retains `aria-pressed` via `[active]`, plus its label, title, description, type, and click handler (`canvas-rail.component.ts:153-165`; `rail-icon-action.directive.ts:7-18`). Collapse had no `aria-pressed` before and gets none because `active` is undefined. It retains dynamic `aria-label`, `aria-expanded`, `aria-disabled`, description, title, test ID, and click handler (`canvas-rail.component.ts:167-183`). Both rail buttons previously had no native disabled attribute; the directive defaults false. Setup action's `aria-busy` defaults null, adding no attribute (`setup-action.directive.ts:15-24`). Other changed elements retain native type, disabled, IDs, option markup, and handlers.
4. **Imports/boundaries:** Each standalone consumer imports its directive (`analyze-workspace.page.ts:45`, `resume-banner.component.ts:9`, `workspace-header.component.ts:8`, `generation-model-picker.component.ts:15`, `canvas-rail.component.ts:59`, `add-machine-pane.component.ts:63`, `machine-list.component.ts:41`, `review-settings-drawer.component.ts:30`). UI's public barrel exports the extracted barrel. New imports run from `scope:webview,type:feature` libraries to `scope:webview,type:ui`, per their `project.json` tags.
5. **Tests/incompleteness:** Directive specs exercise look classes, injected defaults, native type/disabled, and rail label/pressed changes (`extracted/*/*.directive.spec.ts`). They do not explicitly test the collapse button's absent `aria-pressed` or merged static classes; source establishes those states, but coordinator runtime verification remains. No stub was found in the reviewed extraction and adoption paths. The visual parity spec is present; its result was not inferred from source.

The renamed status badge selector is used consistently in the gallery (`status-badge.component.ts:6`; `ui-gallery.component.ts:23,53`). The UI class audit changes the replacement hint text (`check-ui-classes.ts:115-122`); its token classification and failure threshold are outside those changed lines.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Approve on source logic evidence. | Require a fix; approve pending coordinator verification. | All listed class sets match, and inspected bindings preserve attributes and handlers. | Yes |
