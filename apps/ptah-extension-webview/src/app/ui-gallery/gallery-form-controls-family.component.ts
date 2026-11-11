import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  PtahCheckboxDirective,
  PtahControlSize,
  PtahFieldComponent,
  PtahInputDirective,
  PtahSelectDirective,
  PtahTextareaDirective,
  PtahTextTone,
  PtahToggleDirective,
} from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

interface TintPanel {
  readonly id: string;
  readonly label: string;
  readonly surface: string;
}

/** Reference for the form controls family (TASK_2026_950_ed73). */
@Component({
  selector: 'ptah-gallery-form-controls-family',
  standalone: true,
  imports: [
    GallerySectionComponent,
    PtahFieldComponent,
    PtahInputDirective,
    PtahTextareaDirective,
    PtahSelectDirective,
    PtahCheckboxDirective,
    PtahToggleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section
    id="family-form-controls"
    title="Form controls family"
  >
    <p class="text-ptah-hint text-base-content-muted">
      Reference for the form controls family: input, textarea, select, checkbox
      and toggle. Text controls have the sizes xs, sm (default) and md, and the
      tones default, mono and compact. Each control uses a ptah directive.
    </p>
    <div
      data-testid="form-controls-reference"
      class="flex flex-col gap-ptah-group"
    >
      <div
        data-testid="form-controls-sizes"
        class="flex flex-wrap items-center gap-ptah-controls"
      >
        @for (size of sizes; track size) {
          <input
            ptahInput
            [size]="size"
            [label]="'Input size ' + size"
            [placeholder]="'Size ' + size"
          />
          <select ptahSelect [size]="size" [label]="'Select size ' + size">
            <option>Size {{ size }}</option>
            <option>Other</option>
          </select>
        }
      </div>

      <div
        data-testid="form-controls-tones"
        class="flex flex-wrap items-center gap-ptah-controls"
      >
        @for (tone of tones; track tone) {
          <input
            ptahInput
            [tone]="tone"
            [label]="'Input tone ' + tone"
            [value]="tone === 'mono' ? 'libs/frontend/ui/src/index.ts' : 'Tone ' + tone"
          />
        }
      </div>

      <div
        data-testid="form-controls-states"
        class="grid grid-cols-1 gap-ptah-field sm:grid-cols-2"
      >
        <input ptahInput label="Placeholder" placeholder="Placeholder text" />
        <input ptahInput label="Hover" data-state="hover" value="Hover" />
        <input ptahInput label="Focus" data-state="focus" value="Focus" />
        <input ptahInput label="Disabled" disabled value="Disabled" />
        <input ptahInput label="Error" invalid value="Invalid value" />
        <input
          ptahInput
          label="Long text"
          class="w-full"
          value="A long value that is wider than the control and scrolls inside it without a change to the height"
        />
        <div class="relative" data-testid="form-controls-icon-slot">
          <span
            aria-hidden="true"
            class="pointer-events-none absolute left-ptah-control-x top-1/2 -translate-y-1/2 text-ptah-label text-base-content-muted"
            >#</span
          >
          <input
            ptahInput
            label="Search with an icon"
            class="w-full pl-8"
            placeholder="Search"
          />
        </div>
        <ptah-field label="Field with an error" error="Enter a number from 1 to 60">
          <input ptahInput value="99" />
        </ptah-field>
      </div>

      <div
        data-testid="form-controls-multiline"
        class="grid grid-cols-1 gap-ptah-field sm:grid-cols-2"
      >
        <textarea ptahTextarea label="Textarea" rows="3">
Many lines of text</textarea
        >
        <textarea
          ptahTextarea
          tone="mono"
          label="Textarea mono"
          rows="3"
        >
*/5 * * * *</textarea
        >
        <textarea ptahTextarea label="Textarea disabled" disabled>
Disabled</textarea
        >
        <textarea ptahTextarea label="Textarea error" invalid>
Invalid</textarea
        >
      </div>

      <div
        data-testid="form-controls-choices"
        class="flex flex-wrap items-center gap-ptah-group"
      >
        @for (size of choiceSizes; track size) {
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahCheckbox [size]="size" />
            Checkbox {{ size }}
          </label>
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahCheckbox [size]="size" checked />
            Checked {{ size }}
          </label>
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahToggle [size]="size" />
            Toggle {{ size }}
          </label>
          <label class="flex items-center gap-ptah-inline text-ptah-label">
            <input type="checkbox" ptahToggle [size]="size" checked />
            On {{ size }}
          </label>
        }
        <label class="flex items-center gap-ptah-inline text-ptah-label">
          <input type="checkbox" ptahCheckbox disabled />
          Checkbox disabled
        </label>
        <label class="flex items-center gap-ptah-inline text-ptah-label">
          <input type="checkbox" ptahToggle disabled checked />
          Toggle disabled
        </label>
        <label class="flex items-center gap-ptah-inline text-ptah-label">
          <input type="checkbox" ptahCheckbox data-state="focus" />
          Checkbox focus
        </label>
      </div>

      @for (panel of panels; track panel.id) {
        <div
          [attr.data-testid]="'form-controls-tint-' + panel.id"
          class="flex flex-wrap items-center gap-ptah-controls rounded-ptah-surface border border-surface-border p-ptah-surface"
          [class]="panel.surface"
        >
          <span class="text-ptah-label text-base-content-muted">{{
            panel.label
          }}</span>
          <input ptahInput [label]="'Input on ' + panel.label" placeholder="Placeholder" />
          <input ptahInput [label]="'Error on ' + panel.label" invalid value="Invalid" />
          <select ptahSelect [label]="'Select on ' + panel.label">
            <option>Option</option>
          </select>
          <input
            type="checkbox"
            ptahCheckbox
            [label]="'Checkbox on ' + panel.label"
          />
          <input
            type="checkbox"
            ptahCheckbox
            checked
            [label]="'Checked on ' + panel.label"
          />
          <input
            type="checkbox"
            ptahToggle
            [label]="'Toggle on ' + panel.label"
          />
          <input
            type="checkbox"
            ptahToggle
            checked
            [label]="'Toggle on, on ' + panel.label"
          />
        </div>
      }
    </div>
  </ptah-gallery-section>`,
})
export class GalleryFormControlsFamilyComponent {
  public readonly sizes: readonly PtahControlSize[] = ['xs', 'sm', 'md'];
  public readonly tones: readonly PtahTextTone[] = [
    'default',
    'mono',
    'compact',
  ];
  public readonly choiceSizes = ['xs', 'sm'] as const;
  public readonly panels: readonly TintPanel[] = [
    { id: 'base-200', label: 'base-200', surface: 'bg-base-200' },
    { id: 'base-300', label: 'base-300', surface: 'bg-base-300' },
  ];
}
