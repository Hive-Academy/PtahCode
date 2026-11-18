import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  PtahFieldComponent,
  PtahFieldGridDirective,
  PtahInputDirective,
  PtahRichSelectComponent,
  PtahSettingRowComponent,
  type PtahSelectOption,
} from '@ptah-extension/ui';
import { MODEL_OPTIONS } from './gallery-form-controls.data';

const EFFORT_OPTIONS: readonly PtahSelectOption<string>[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Maximum (slow, uses the largest thinking budget of the model)' },
];

/**
 * Settings controls as the prototype shows them (docs/design-system/settings/prototype):
 * a field grid row of floating fields that align, and setting rows with the compact select.
 */
@Component({
  selector: 'ptah-gallery-settings-controls',
  standalone: true,
  imports: [
    PtahFieldComponent,
    PtahFieldGridDirective,
    PtahInputDirective,
    PtahRichSelectComponent,
    PtahSettingRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-testid="form-controls-settings-grid" class="flex flex-col gap-ptah-field">
      <span class="text-ptah-label text-base-content-muted">Settings field grid: one row aligns</span>
      <div ptahFieldGrid>
        <ptah-field label="Default model">
          <ptah-select [options]="models" [(value)]="model" />
        </ptah-field>
        <ptah-field label="Port" hint="From 1024 to 65535">
          <input ptahInput type="number" value="39123" />
        </ptah-field>
        <ptah-field label="Effort">
          <ptah-select [options]="effort" placeholder="Select an effort" />
        </ptah-field>
        <ptah-field label="Base URL" error="Enter a URL that starts with https://">
          <input ptahInput value="http://example.invalid" />
        </ptah-field>
        <ptah-field label="Request timeout">
          <input ptahInput placeholder="Seconds, for example 60" />
        </ptah-field>
        <ptah-field label="Effort (disabled)">
          <ptah-select [options]="effort" [value]="'medium'" disabled />
        </ptah-field>
      </div>
    </div>
    <div data-testid="form-controls-settings-rows" class="flex flex-col">
      <ptah-setting-row label="Default effort" hint="The effort of a new session." controlId="gallery-row-effort">
        <ptah-select triggerId="gallery-row-effort" [options]="effort" [value]="'high'" />
      </ptah-setting-row>
      <ptah-setting-row label="Fallback model" controlId="gallery-row-model">
        <ptah-select triggerId="gallery-row-model" [options]="models" placeholder="No fallback" />
      </ptah-setting-row>
    </div>
  `,
})
export class GallerySettingsControlsComponent {
  protected readonly models = MODEL_OPTIONS;
  protected readonly effort = EFFORT_OPTIONS;
  protected readonly model = signal<string | null>('opus');
}
