# Headless behavior library evaluation

## Decision

Use native HTML for simple controls, existing CDK and Floating UI for focus/overlays/positioning, and **Angular Aria 22.2.x** for complex selection/navigation after adding it explicitly to `libs/frontend/ui`. Styling remains DaisyUI 4.12 plus existing glass tokens inside `@ptah-extension/ui`; feature libraries import only that package. Reuse current advanced dropdown/autocomplete implementations before migration. Retain existing SVG mini charts; add a chart engine only for concrete complex charts.

This is a design recommendation, not an installation. Angular Aria is **absent** from this checkout: no root/UI manifest declaration, lockfile entry, `libs`/`apps` import, or `node_modules` directory. PR #1028 discusses `ngOption` and proposed 22.2.6, but that is not installed source (`.ptah/specs/TASK_2026_904/pr-1028.diff:29,350,382`). Thus `node_modules/@angular/aria/types/*.d.ts` cannot be read here; exact 22.2.x exports and host directive compatibility need checking after installation. The current [Angular Aria guide](https://angular.dev/guide/aria) documents autocomplete, listbox, select, multiselect, combobox, menu, menubar, toolbar, accordion, tabs, tree, and grid. Its [launch post](https://blog.angular.dev/announcing-angular-v21-57946c34f14b) calls it signal-based, unstyled developer preview.

## Repository facts

| Fact | Evidence |
|---|---|
| Angular core `~22.2.0`, CDK `~22.2.0`, Floating UI DOM `^1.7.4` | `package.json:73,150,88`; `libs/frontend/ui/package.json:5-9` |
| Tailwind `^3.4.18`, DaisyUI `^4.12.24` | `package.json:206,185` |
| Angular Aria direct/transitive | Neither: no `@angular/aria` in manifests or `package-lock.json`; `rg '@angular/aria' libs apps` returned none; `node_modules/@angular/aria/package.json` unavailable. |
| CDK | `rg -l '@angular/cdk/(overlay\|a11y\|listbox\|menu\|drag-drop\|scrolling\|table)' libs/frontend -g '*.ts'`: 12 files including tests; import-line counts: a11y 7, overlay 6, drag-drop 2, listbox/menu/scrolling/table 0. `libs/frontend/ui/src/lib/selection/autocomplete/autocomplete.component.ts:16-17` uses overlay/key manager; `libs/frontend/ui/src/lib/overlays/popover/popover.component.ts:1-2` uses focus trap/overlay; `libs/frontend/chat/src/lib/components/atoms/resize-handle.component.ts:22` uses drag. Clipboard also exists at `libs/frontend/chat-ui/src/lib/atoms/copy-button.component.ts:8`. |
| Floating UI | `rg -l '@floating-ui/dom' libs/frontend -g '*.ts'`: 18 files including specs; four production import-bearing files. Examples `libs/frontend/ui/src/lib/native/shared/floating-ui.service.ts:36`, `libs/frontend/ui/src/lib/native/dropdown/native-dropdown.component.ts:50`, `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:50`. |
| Charts | No `echarts`, `chart.js`, `ngx-echarts`, `ng2-charts`, `d3`, or `apexcharts` TS imports in `libs/frontend` or root manifest/lock entries. Custom SVG: `libs/frontend/chat-ui/src/lib/molecules/vitals/spend-bars.component.ts:40`, `progress-ring.component.ts:46`, `activity-grid.component.ts:92`. Accessible chart names tested at `libs/frontend/chat-ui/src/lib/organisms/ptah-ui/ptah-ui-block.component.spec.ts:933-944`. |

The lockfile has CDK and Floating UI entries (`package-lock.json:720,6600`). Counts are textual `rg` counts, not bundle measurements. The PR diff's installed-declarations claim cannot be reproduced in this checkout.

## Candidate comparison

Coverage: B button, T toggle/checkbox, S select, C combobox/autocomplete, M menu/dropdown, A tabs/accordion, D dialog, P popover/tooltip, L listbox, R tree, G table/grid, K date picker/slider, H charts. “Partial” means primitives rather than a complete widget.

| Candidate | Coverage | Angular 22 / signals | Styling and headless fit | Electron, cost, maintenance, license, migration |
|---|---|---|---|---|
| Native HTML + existing UI | B,T,S,K; D partial; SVG H | Native signal bindings | Ideal DaisyUI fit | Lowest cost. Dialog focus return needs care; consolidate divergent wrappers. |
| [Angular Aria](https://angular.dev/guide/aria) | S,C,M,A,L,R,G, toolbar; no B/T/D/P/K/H | Angular team, signal-based; pin compatible 22.2.x | Fully unstyled; excellent | One new package; developer-preview API risk. [MIT](https://angular.dev/license). Test overlay/focus in Electron and webview. |
| [Angular CDK](https://material.angular.dev/cdk/categories) | D/P focus and positioning, drag; partial S/C/M/L/G | Installed 22.2.x; mixed signal/observable APIs | Fully headless; excellent | Existing cost, low migration. More widget code to write. [MIT](https://www.npmjs.com/package/%40angular/cdk). |
| [Spartan brain + copied helm](https://www.spartan.ng/documentation/installation) | Broad B/T/S/C/M/A/D/P/L/R/K; no H | Check exact Angular 22 peer range | Brain headless, helm Tailwind copy-in | Adds brain and local helm CSS ownership competing with DaisyUI. License/version require package check; higher migration. |
| [ng-primitives](https://angularprimitives.com/getting-started/introduction/) | Broad S/C/M/A/D/P/L/R/K; no H | `0.121.0+` supports Angular 21/22; [host directives](https://angularprimitives.com/getting-started/get-started/) | Headless data attributes, excellent fit | Peers CDK/Floating UI already declared; pre-1.0 API churn. [Apache-2.0](https://www.npmjs.com/package/ng-primitives). |
| [PrimeNG unstyled/pass-through](https://primeng.dev/configuration) | Nearly all controls incl G/K/H | Verify Angular 22 peer range; signals-first support unclear | Unstyled option, but PrimeNG owns internal DOM | Broader payload and harder style ownership; high migration. Verify license/edition terms before adoption. |
| [TanStack Angular Table](https://tanstack.com/table/v8/docs/framework/angular/angular-table) | G only; no ARIA widget | Signal-backed Angular adapter | Fully headless | Add only for sorting/filtering/pagination. Table semantics/keyboard remain ours. [MIT](https://github.com/TanStack/table). |
| [ngx-echarts](https://github.com/xieziyu/ngx-echarts/blob/master/README.md) + ECharts | H rich charts | v22 supports Angular 22 | Theme via chart options | Larger engine; modular core imports help. [Apache ECharts](https://github.com/apache/echarts/blob/master/LICENSE), [MIT wrapper](https://github.com/xieziyu/ngx-echarts/blob/master/LICENSE). Test CSP/resize. |
| [ng2-charts](https://github.com/valor-software/ng2-charts) + Chart.js | H standard charts | v11 supports Angular 22; standalone | Theme via options | Register narrow modules for cost; canvas needs accessible text/table. [MIT wrapper](https://github.com/valor-software/ng2-charts/blob/master/LICENSE), [MIT Chart.js](https://github.com/chartjs/Chart.js/blob/master/LICENSE.md). |
| Existing SVG mini charts | H sparklines/bars/rings/heatmap | Already in Angular 22 | Full token control | Zero new dependency; limited chart grammar. |

No production bundle sizes are measured without a build; cost is relative. [Spartan docs](https://www.spartan.ng/documentation/introduction) confirm brain/helm separation; [TanStack quick start](https://tanstack.com/table/latest/docs/framework/angular/quick-start) confirms headless rendering. ng-primitives documents a two-major support policy; ngx-echarts/ng2-charts publish Angular 22 releases. These are current web claims, distinct from lockfile facts.

## Component choices

| Type | Behavior inside `libs/frontend/ui` |
|---|---|
| Button, toggle, checkbox, slider | Native button/input; forms labels, disabled, focus-visible. DaisyUI button/toggle/checkbox/range plus glass styling. |
| Select | Native select for simple forms; Angular Aria Select for rich custom options. |
| Combobox/autocomplete | Reuse UI autocomplete and provider/model picker; move to Aria Combobox/Autocomplete only after parity test. |
| Menu/dropdown | Reuse native dropdown shell and Floating UI service; Aria Menu for commands, not form selection. |
| Tabs, accordion, listbox, tree, toolbar | Angular Aria directives. |
| Dialog | Native `<dialog>` for simple modal; CDK focus trap/overlay for portal/nested cases. |
| Popover/tooltip | Existing Floating UI and CDK focus/overlay; preserve native popover wrapper. |
| Table | Native semantic table; TanStack only for rich data state; Aria Grid only for spreadsheet-like navigation. |
| Date picker | Native date input; evaluate specialized primitive only for concrete locale/range needs. |
| Charts | Existing SVG mini charts; ngx-echarts v22 only for rich visualizations. |

Make `@angular/aria` a **direct** dependency of `libs/frontend/ui` and root lockfile when implementation begins; a transitive import would violate ownership. Keep CDK and Floating UI already declared. Do not add other candidates speculatively. Every feature library uses exported `@ptah-extension/ui` wrappers and types.

### Host directive composition sketch

```ts
// Illustrative only: verify 22.2.x exports/selectors and hostDirectives eligibility.
import { Component, input } from '@angular/core';
import { Option } from '@angular/aria/listbox';

@Component({
  selector: 'div[ptahOption]',
  standalone: true,
  hostDirectives: [{ directive: Option, inputs: ['value', 'disabled'] }],
  host: { '[class]': 'classes()' },
  template: '<ng-content select="[leading]"/><ng-content/><ng-content select="[trailing]"/>',
})
export class PtahOption {
  readonly tone = input<'default' | 'glass'>('default');
  protected classes = () => `min-h-10 rounded-box focus-visible:outline-primary ${
    this.tone() === 'glass' ? 'glass-surface' : 'bg-base-200'
  }`;
}
```

The wrapper owns CSS, projection, and public API; Aria owns role, selection, focus, and keyboard. Compose the Listbox container through UI too. Avoid two focus managers on one element. Replace illustrative `glass-surface` with the existing `data-glass-surface` styling during implementation.

### Chart theme adapter

Read computed DaisyUI variables from the actual themed host; refresh on `data-theme` changes. DaisyUI 4 token channels may be HSL while enhanced tokens may be `oklch(...)`; normalize to computed CSS colors before passing to canvas/SVG engines. Keep HTML legend and accessible data table.

```ts
function chartColors(host: HTMLElement) {
  const css = getComputedStyle(host);
  const read = (name: string, fallback: string) => {
    const raw = css.getPropertyValue(name).trim();
    const value = raw.startsWith('oklch(') || raw.startsWith('#')
      ? raw : raw ? `hsl(${raw})` : fallback;
    const probe = document.createElement('span');
    probe.style.color = value;
    host.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  };
  return { primary: read('--p', '#6aa8ff'), text: read('--bc', '#fff'),
    surface: read('--b1', '#10151d') };
}
// ECharts options: color: [primary], textStyle: {color: text},
// backgroundColor: 'transparent', axisLabel: {color: text}.
```

This sketch is not runtime code. Check actual token format/contrast during implementation and lazily load chart modules for Electron and VS Code webview.

## Verification limits

Read-only research: no install, tests, build, or code edits. No rendered UI changed. `node_modules` is absent, so installed Angular Aria version and requested declaration listing are unavailable. Repository skill discovery found no matching research/evaluation skill for this task.
