import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  PtahCheckboxDirective,
  PtahControlSize,
  PtahFieldComponent,
  PtahInputDirective,
  PtahRichSelectComponent,
  PtahSelectDirective,
  PtahSelectIconDirective,
  PtahTextareaDirective,
  PtahToggleDirective,
} from '@ptah-extension/ui';
import {
  GALLERY_ICON_PATHS,
  MODEL_OPTIONS,
  PAGE_SIZE_OPTIONS,
  PROVIDER_OPTIONS,
  REGION_OPTIONS,
} from './gallery-form-controls.data';
import { GalleryProviderFormComponent } from './gallery-provider-form.component';
import { GallerySectionComponent } from './gallery-section.component';

interface TintPanel {
  readonly id: 'base-200' | 'base-300';
  readonly label: string;
  /** Opaque fill of the notch label on this panel. */
  readonly notchBg: string;
}

/** Reference for the form controls family (TASK_2026_950_ed73). */
@Component({
  selector: 'ptah-gallery-form-controls-family',
  standalone: true,
  imports: [
    GallerySectionComponent,
    NgTemplateOutlet,
    GalleryProviderFormComponent,
    PtahFieldComponent,
    PtahInputDirective,
    PtahTextareaDirective,
    PtahSelectDirective,
    PtahRichSelectComponent,
    PtahSelectIconDirective,
    PtahCheckboxDirective,
    PtahToggleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section id="family-form-controls" title="Form controls family">
    <p class="text-ptah-hint text-base-content-muted">
      A field puts its label inside the box. The label moves up when the control
      gets focus or a value. The line at the bottom edge shows focus, an error or
      work in progress. The rich select adds groups, search and icons.
    </p>
    <ng-template #icon let-option>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path [attr.d]="icons[option.icon ?? 'cloud']" />
      </svg>
    </ng-template>
    <div data-testid="form-controls-reference" class="flex flex-col gap-ptah-group">
      <div data-testid="form-controls-field-states" class="grid grid-cols-1 gap-ptah-field sm:grid-cols-2 lg:grid-cols-3">
        <ptah-field label="Workspace name"><input ptahInput /></ptah-field>
        <ptah-field label="Workspace name" hint="Filled"><input ptahInput value="ptah-extension" /></ptah-field>
        <ptah-field label="Branch prefix" hint="A real placeholder floats the label">
          <input ptahInput placeholder="feat/" />
        </ptah-field>
        <ptah-field label="Search sessions" clearable>
          <span ptahFieldLeading aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path [attr.d]="icons['search']" /></svg>
          </span>
          <input ptahInput type="search" value="design tokens" />
        </ptah-field>
        <ptah-field label="Access token" revealable required hint="Select the eye to show the text">
          <input ptahInput type="password" value="pt-demo-value" autocomplete="off" />
        </ptah-field>
        <ptah-field label="Timeout in seconds" required error="Enter a number from 1 to 60">
          <input ptahInput inputmode="numeric" value="99" />
        </ptah-field>
        <ptah-field label="Indexed files" busy hint="Busy: the index runs">
          <input ptahInput value="1 204 files" readonly />
        </ptah-field>
        <ptah-field label="Workspace root" hint="Read-only">
          <input ptahInput value="/projects/ptah" readonly />
        </ptah-field>
        <ptah-field label="License seat" hint="Disabled">
          <input ptahInput value="Team plan" disabled />
        </ptah-field>
        <ptah-field label="Large field" size="lg"><input ptahInput value="Size lg" /></ptah-field>
        <ptah-field label="Stacked label" appearance="stacked" hint="The label sits above the box">
          <input ptahInput placeholder="Stacked" />
        </ptah-field>
        <ptah-field label="Compact path" appearance="stacked" hint="Compact has no floating label">
          <input ptahInput tone="compact" value="libs/frontend/ui" />
        </ptah-field>
      </div>

      <div data-testid="form-controls-multiline" class="grid grid-cols-1 gap-ptah-field sm:grid-cols-2">
        <ptah-field label="Commit message" counter hint="72 characters for the subject line">
          <textarea ptahTextarea rows="3" maxlength="200">feat(ui): add the floating label field</textarea>
        </ptah-field>
        <ptah-field label="Cron schedule" hint="Mono tone">
          <textarea ptahTextarea tone="mono" rows="3">*/5 * * * *</textarea>
        </ptah-field>
        <ptah-field label="Archived notes" hint="Disabled">
          <textarea ptahTextarea disabled>Disabled</textarea>
        </ptah-field>
        <ptah-field label="System prompt" error="The prompt is empty. Type a prompt.">
          <textarea ptahTextarea></textarea>
        </ptah-field>
      </div>

      <div data-testid="form-controls-rich-select" class="grid grid-cols-1 gap-ptah-field sm:grid-cols-2 lg:grid-cols-3">
        <ptah-field label="Provider" hint="Groups, icons, descriptions, a disabled option">
          <ptah-select [options]="providers" clearable>
            <ng-template ptahSelectIcon let-option><ng-container *ngTemplateOutlet="icon; context: { $implicit: option }" /></ng-template>
          </ptah-select>
        </ptah-field>
        <ptah-field label="Model" hint="8 or more options: search is on">
          <ptah-select [options]="models" [(value)]="model">
            <ng-template ptahSelectIcon let-option><ng-container *ngTemplateOutlet="icon; context: { $implicit: option }" /></ng-template>
          </ptah-select>
        </ptah-field>
        <ptah-field label="Region" hint="Short list: no search">
          <ptah-select [options]="regions" />
        </ptah-field>
        <ptah-field label="Region" error="Select a region">
          <ptah-select [options]="regions" />
        </ptah-field>
        <ptah-field label="Region" hint="Disabled">
          <ptah-select [options]="regions" [value]="'eu'" disabled />
        </ptah-field>
        <div class="flex flex-col gap-ptah-label">
          <span class="text-ptah-label text-base-content-muted">Standalone in a toolbar</span>
          <ptah-select label="Sort order" [options]="regions" [value]="'us'" />
        </div>
      </div>

      <div data-testid="form-controls-select-sizes" class="flex flex-wrap items-center gap-ptah-controls">
        <span class="text-ptah-label text-base-content-muted">Select, inline sizes</span>
        @for (size of sizes; track size) {
          <ptah-select [size]="size" [label]="'Page size ' + size" [options]="pageSizes" [value]="25" clearable />
        }
      </div>

      <div data-testid="form-controls-native-select" class="flex flex-wrap items-center gap-ptah-controls">
        <span class="text-ptah-label text-base-content-muted">Legacy ptahSelect (native menu)</span>
        <select ptahSelect size="sm" label="Page size (legacy)">
          <option>25 rows</option>
          <option>50 rows</option>
        </select>
      </div>

      <div data-testid="form-controls-choices" class="flex flex-wrap items-center gap-ptah-group">
        @for (size of choiceSizes; track size) {
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahCheckbox [size]="size" checked /> Checkbox {{ size }}
          </label>
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahToggle [size]="size" checked /> Toggle {{ size }}
          </label>
        }
        <label class="flex items-center gap-ptah-inline text-ptah-label">
          <input type="checkbox" ptahCheckbox /> Checkbox off
        </label>
        <label class="flex items-center gap-ptah-inline text-ptah-label">
          <input type="checkbox" ptahToggle disabled checked /> Toggle disabled
        </label>
      </div>

      <ptah-gallery-provider-form />

      @for (panel of panels; track panel.id) {
        <div
          [attr.data-testid]="'form-controls-tint-' + panel.id"
          class="grid grid-cols-1 gap-ptah-field rounded-ptah-surface border border-surface-border p-ptah-surface sm:grid-cols-3"
          [class.bg-base-200]="panel.id === 'base-200'"
          [class.bg-base-300]="panel.id === 'base-300'"
          [style.--ptah-field-notch-bg]="panel.notchBg"
        >
          <ptah-field [label]="'Name on ' + panel.label"><input ptahInput /></ptah-field>
          <ptah-field [label]="'Error on ' + panel.label" error="Enter a name">
            <input ptahInput value="x" />
          </ptah-field>
          <ptah-field [label]="'Provider on ' + panel.label">
            <ptah-select [options]="providers" [value]="'ollama'">
              <ng-template ptahSelectIcon let-option><ng-container *ngTemplateOutlet="icon; context: { $implicit: option }" /></ng-template>
            </ptah-select>
          </ptah-field>
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahCheckbox checked /> Checkbox on {{ panel.label }}
          </label>
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahToggle checked /> Toggle on {{ panel.label }}
          </label>
        </div>
      }
    </div>
  </ptah-gallery-section>`,
})
export class GalleryFormControlsFamilyComponent {
  protected readonly icons = GALLERY_ICON_PATHS;
  protected readonly providers = PROVIDER_OPTIONS;
  protected readonly models = MODEL_OPTIONS;
  protected readonly regions = REGION_OPTIONS;
  protected readonly pageSizes = PAGE_SIZE_OPTIONS;
  protected readonly model = signal<string | null>('opus');
  public readonly sizes: readonly PtahControlSize[] = ['xs', 'sm', 'md'];
  public readonly choiceSizes = ['xs', 'sm'] as const;
  public readonly panels: readonly TintPanel[] = [
    { id: 'base-200', label: 'base-200', notchBg: 'oklch(var(--b2))' },
    { id: 'base-300', label: 'base-300', notchBg: 'oklch(var(--b3))' },
  ];
}
