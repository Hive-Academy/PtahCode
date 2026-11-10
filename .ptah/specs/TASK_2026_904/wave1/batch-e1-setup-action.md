# E1 setup action extraction

## Source DOM before

`analyze-workspace.page.ts`:

```html
<button
  type="button"
  class="btn btn-primary btn-sm"
  (click)="continuePrevious()"
>
  Continue previous run
</button>
<button type="button" class="btn btn-sm" (click)="startFresh()">
  Start fresh
</button>
<button
  type="button"
  class="btn btn-primary mt-4"
  (click)="startFresh()"
>
  <lucide-angular
    [img]="icons.play"
    class="size-4"
    aria-hidden="true"
  />Start analysis
</button>
```

The saved analysis `Use` action also used `class="btn btn-primary btn-sm"`; `Hide from list` and `Retry` used `class="btn btn-sm"`.

`resume-banner.component.ts`:

```html
<button type="button" class="btn btn-primary btn-sm min-h-8" (click)="resumeRequested.emit()">
  <lucide-angular [img]="icons.play" class="size-4" aria-hidden="true" />Resume
</button>
```

Neither source has component scoped CSS for these buttons. Existing DaisyUI/Tailwind classes supply all styling.

## Extracted API

`SetupActionDirective` is a standalone attribute directive on `button[ptahSetupAction]`. Its typed `ptahSetupAction` input accepts `primaryCompact`, `primaryFull`, `ghost`, or `glass`; `ptahSetupActionBusy` sets `aria-busy` when requested. `SETUP_ACTION_LOOK` and `provideSetupActionLook()` supply an optional default (compact primary). The directive applies the exact source class strings to the existing button. Icons and labels remain native children in source order. No wrapper or style rules are added.

## Source markup after

Analyze uses `[ptahSetupAction]="'primaryCompact'"` on `Continue previous run` and `Use`, `[ptahSetupAction]="'ghost'"` on `Start fresh`, `Retry`, and `Hide from list`, and `[ptahSetupAction]="'primaryFull'"` on `Start analysis`. Resume uses `[ptahSetupAction]="'glass'"` on `Resume`. Each replaces only the source `class` attribute. The native button, `type`, `(click)`, child elements, and text stay in their original order. No source button has a disabled or data-testid attribute.

```html
<button type="button" [ptahSetupAction]="'primaryCompact'" (click)="continuePrevious()">Continue previous run</button>
<button type="button" [ptahSetupAction]="'ghost'" (click)="startFresh()">Start fresh</button>
<button type="button" [ptahSetupAction]="'primaryFull'" (click)="startFresh()"><lucide-angular [img]="icons.play" class="size-4" aria-hidden="true" />Start analysis</button>
<button type="button" [ptahSetupAction]="'ghost'" (click)="loadSaved()">Retry</button>
<button type="button" [ptahSetupAction]="'primaryCompact'" (click)="useSaved(item.filename)">Use</button>
<button type="button" [ptahSetupAction]="'ghost'" (click)="store.hideAnalysis(item.filename)">Hide from list</button>
<button type="button" [ptahSetupAction]="'glass'" (click)="resumeRequested.emit()"><lucide-angular [img]="icons.play" class="size-4" aria-hidden="true" />Resume</button>
```

## Pixel parity reasoning

At each call site the directive attaches to the original native button, adds no host element, and sets the exact former class string in the same class order. The Angular property binding does not add a `ptahSetupAction` DOM attribute. Existing `type` and event attributes stay on the same button in the same relative order. No scoped CSS selector or `:host` rule must move, because these source components define none for these buttons. Native disabled ownership remains with each page.

## Files changed

- `libs/frontend/ui/src/lib/extracted/setup-action/setup-action.directive.ts`
- `libs/frontend/ui/src/lib/extracted/setup-action/setup-action.look.ts`
- `libs/frontend/ui/src/lib/extracted/setup-action/setup-action.directive.spec.ts`
- `libs/frontend/ui/src/lib/extracted/setup-action/index.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
- `libs/frontend/onboarding/src/lib/home/resume-banner.component.ts`

## Verification

First `npm run verify -- -p @ptah-extension/ui,@ptah-extension/onboarding 2>&1 | Select-Object -Last 30` run: onboarding and UI typechecks and both test targets succeeded; UI lint failed on `@angular-eslint/no-input-rename` in the new directive. I renamed the inputs to match their bindings and started the same scoped command again. Its PID 20864 is waiting in the shared verify queue (fifth at last status check); final result pending. Ptah diagnostics was attempted after edits three times but its TypeScript check remained unavailable after 45 seconds each time.

Actual tail from the first run:

```text
✖ nx run @ptah-extension/ui:lint
  full log: C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\10539239718128884817
Re-run with --output-style=static to inline logs.
Run duration:      1m 50s
Cache:             0/3 hit (0%)
Critical path:     1m 30s (1 task)
Recoverable time:  20.2s (18% of the run)
[verify 2026-11-09T22:58:37.293Z] starting verify test (@ptah-extension/ui,@ptah-extension/onboarding)
 NX   2 tasks: 2 succeeded
Re-run with --output-style=static to inline logs.
Run duration:      2m 55s
Cache:             0/2 hit (0%)
Critical path:     2m 13s (1 task)
Recoverable time:  41.5s (24% of the run)
[verify 2026-11-09T23:01:48.861Z] lock released after 319.8s, exit code 1
```

## Decisions

- Four looks: compact and full size primary sources differ in geometry (`btn-sm` versus `mt-4`), so separate typed looks preserve both exact class lists. Reversible by changing the look map and call sites.
- Attribute directive: the native button remains for pixel parity and page owned click, type, and disabled behavior. Named content slots require a component host and would change this source DOM; original icon and label stay direct native children. Reversible if a future consumer accepts a host element.
- No component styles: the sources have none to relocate; existing utility classes remain the styling authority.
- `angular-frontend-patterns` skill: host skill discovery returned no match, so repository source patterns governed implementation.
