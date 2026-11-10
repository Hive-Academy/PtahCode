# Batch E3 — setup field

## Source markup before

Model picker (original select and immediate field context):

```html
<div class="space-y-1">
  <label class="text-sm font-medium" [for]="'generation-model-' + tabId()"
    >Model for this tab</label
  >
  <select
    class="select select-bordered select-sm w-full"
    [id]="'generation-model-' + tabId()"
    [value]="selectedModel()"
    [disabled]="locked()"
    (change)="choose($event)"
  >
    @for (model of models.availableModels(); track model.id) {
      <option [value]="model.id" [selected]="model.id === selectedModel()">
        {{ model.name }}
      </option>
    }
  </select>
  <p class="text-xs text-base-content-muted">
    This is the tab model used by generation and chat.
  </p>
```

Workspace selector (original row, label, and control; buttons follow in the same row):

```html
<div class="mt-2 flex flex-wrap items-center gap-2">
  <label for="onboarding-workspace-select" class="sr-only">Switch open folder</label>
  <select id="onboarding-workspace-select" class="select select-bordered select-sm" [disabled]="!store.canSwitch()" (change)="switchTo($event)">
    @for (folder of store.folders(); track folder.path; let index = $index) {
      <option [value]="index" [selected]="index === store.activeIndex()">{{ folder.name }}</option>
    }
  </select>
```

## Extracted API

`SetupFieldDirective` is standalone and selects `select[ptahSetupField]`. Its `ptahSetupField` signal input accepts `'model' | 'workspace' | undefined`. `SETUP_FIELD_LOOK` has a `'model'` root default; `provideSetupFieldLook(look)` overrides the default. The directive puts the exact original class list on the existing native select. No model-selection behavior moves into UI.

## Markup after and equivalence

Model picker:

```html
<div class="space-y-1">
  <label class="text-sm font-medium" [for]="'generation-model-' + tabId()"
    >Model for this tab</label
  >
  <select
    [ptahSetupField]="undefined"
    [id]="'generation-model-' + tabId()"
    [value]="selectedModel()"
    [disabled]="locked()"
    (change)="choose($event)"
  >
    @for (model of models.availableModels(); track model.id) {
      <option [value]="model.id" [selected]="model.id === selectedModel()">
        {{ model.name }}
      </option>
    }
  </select>
  <p class="text-xs text-base-content-muted">
    This is the tab model used by generation and chat.
  </p>
```

Workspace selector:

```html
<div class="mt-2 flex flex-wrap items-center gap-2">
  <label for="onboarding-workspace-select" class="sr-only">Switch open folder</label>
  <select id="onboarding-workspace-select" [ptahSetupField]="'workspace'" [disabled]="!store.canSwitch()" (change)="switchTo($event)">
    @for (folder of store.folders(); track folder.path; let index = $index) {
      <option [value]="index" [selected]="index === store.activeIndex()">{{ folder.name }}</option>
    }
  </select>
```

The only template change in either select is replacing the static `class` attribute with the directive binding. Its host class binding writes those same class strings. Both selects remain native elements in the same order, with the same labels, options, bindings, and event handlers. The directive adds no host element.

## Parts left local

The model picker has a visible label, hint, and `space-y-1` wrapper; the workspace selector has a screen reader label, no field hint, and shares a flex row with folder action buttons. These are different anatomies. Their labels, hint, row layout, and nearby error text stay local. Only the genuinely shared select frame moves. No error input was added because neither source select has a field error state to preserve.

## Files changed

`libs/frontend/ui/src/lib/extracted/setup-field/{setup-field.directive.ts,setup-field.look.ts,setup-field.directive.spec.ts,index.ts}`; the two source components; `libs/frontend/ui/src/lib/extracted/index.ts` with `export * from './setup-field';` as explicitly allowed for verify; this deliverable.

## Verify

Pending foreground `npm run verify -- -p @ptah-extension/ui,@ptah-extension/onboarding,@ptah-extension/setup-wizard`. Initial output: waiting for the machine-wide slot queue (position 14). `ptah_get_diagnostics` reported TypeScript still running after 45 seconds and returned unchecked, not errors. Skill loading was unavailable in this CLI: no skill-loading tool was listed.

## Decisions

- **Extract the select frame only.** Options considered: a whole field wrapper or the shared native select frame. The model wrapper contains a hint; the workspace wrapper also contains folder buttons and lacks a hint. A shared wrapper would impose new DOM or alter the row. This is reversible by moving the class lists back to the sources.
- **Use source-specific looks.** The model source needs `w-full`; the workspace source does not. Two exact class lists preserve their geometry. This is reversible.
