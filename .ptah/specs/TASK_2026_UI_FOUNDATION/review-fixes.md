# Phase A review fixes

## Findings and regression coverage

1. **Busy button** — `libs/frontend/ui/src/lib/surfaces/button.directive.ts:1-38`: replaced pointer fall-through with a capture-phase click listener, removed it on destroy, and added opacity/cursor busy treatment while retaining focus and ARIA state. `button.directive.spec.ts:5-29` puts a template click handler before activation, checks pointer and keyboard-generated clicks while busy, then checks activation after busy clears.
2. **Narrow list and focus** — `libs/frontend/ui/src/lib/foundation/list-detail.component.ts:4-48`: shared `hasSelection` treats `null` and `""` alike; selection focuses Back in a narrow container and Back restores the selected option or first option. JSDoc and `list-row.component.ts:3` require explicit listbox selection. `apps/ptah-extension-webview/src/app/ui-gallery.component.ts:38` sets `selectionMode="explicit"`. `list-detail.component.spec.ts:17-39` checks focus transfer, return, and empty ID; `app.routes.spec.ts:42-48` locks the gallery setting.
3. **Selected and disabled rows** — `libs/frontend/ui/src/lib/foundation/list-row.component.ts:9`: `aria-selected` gets base background and gold left border independently of `current`; `aria-disabled` gets reduced opacity and unavailable cursor. `list-row.component.spec.ts:6-23` checks Angular Aria selection and the state classes.
4. **Partial state panel** — `libs/frontend/ui/src/lib/foundation/state-panel.component.ts:9-22`: partial status is a DaisyUI warning above full-width projected content; error retains alert semantics. `state-panel.component.spec.ts:4-31` checks roles, warning class, projection order, and action output.
5. **Affected audit graph** — `tools/ui-class-audit/project.json:7`: implicit dependency on the webview app and `tag:scope:webview` projects. `check-ui-classes.spec.ts` locks the config. `nx show project ui-class-audit --json` expanded the tag to frontend project names, and `nx show projects --affected --files=libs/frontend/chat/src/index.ts` included `ui-class-audit`. No module-boundary lint error in verify.
6. **Status shapes** — `libs/frontend/ui/src/lib/foundation/status-badge.component.ts:8`: running is a hollow state-run ring; queued/pending are hollow circles. `status-badge.component.spec.ts:5-19` checks shapes.
7. **Negative meter value** — `libs/frontend/ui/src/lib/foundation/meter.component.ts:8,19-22`: finite negatives clamp to zero for bar and ARIA value; only invalid/nonfinite input or invalid max is unavailable. `meter.component.spec.ts:13-29` checks both branches.
8. **Gallery route and samples** — `apps/ptah-extension-webview/src/app/app.routes.spec.ts:41-56` checks guard identity, lazy loader, and absence of an eager component. `ui-gallery.component.ts:8,16,53` imports and renders shared surface card and tile samples. The same route spec checks those samples.

## Verification

- `npm run verify -- -p @ptah-extension/ui,ptah-extension-webview,ui-class-audit`: exit 0. Final run: `NX 6 tasks: 6 succeeded, 2 cached`; `NX 3 tasks: 3 succeeded, 1 cached`; `lock released after 52.3s, exit code 0`.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; `0 token count(s) over baseline` (5572 existing blocked tokens across 451 files).
- Scoped `ptah_get_diagnostics`: no diagnostics in requested changed source files. It also listed pre-existing diagnostics in sibling spec/testing files outside this task; project verification above passed.
- No screenshots or Electron launch, per task constraints.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use capture-phase native click blocking and opacity/cursor-wait treatment. | Spinner, opacity treatment | Template click handlers precede directive bubble listeners; capture runs first and native keyboard activation produces a click. | Yes |
| Use explicit Angular Aria listbox selection in the gallery and focus Back only in narrow containers. | Follow selection, explicit selection | Installed `listbox.d.ts` documents explicit selection; review identifies follow selection as the narrow-view failure. | Yes |
| Match audit dependencies by webview scope tag. | List every frontend project, broad name glob, scope tag | Nx expands `tag:scope:webview` to the relevant projects; affected query includes audit. | Yes |
| Skip overlay and motion gallery samples. | Add samples now, defer | Task explicitly excludes them from this review fix. | Yes |
| Use repo source and existing conventions without a skill. | Skill load | No skill-loading tool was listed for this lane. | Yes |
