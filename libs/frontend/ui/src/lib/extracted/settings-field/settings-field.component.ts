import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The existing Settings numeric-row shell; the feature owns its native control and state. */
@Component({
  // The attribute selector keeps the existing div as the component host, so
  // the extraction adds no wrapper element.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'div[ptahSettingsField]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Remove the marker attribute so the rendered DOM equals the source row.
  host: { '[attr.ptahSettingsField]': 'null' },
  template: `
    <label [for]="fieldId()" class="text-sm font-medium text-base-content">{{ label() }}</label>
    <ng-content select="[settingsFieldControl]" />
    <ng-content select="[settingsFieldBeforeHint]" />
    <p [id]="fieldId() + '-help'" class="text-xs text-base-content-muted"> {{ hint() }} </p>
    @if (error(); as message) {
      <p role="alert" [attr.role]="errorRole()" [id]="fieldId() + '-error'" [attr.data-testid]="errorTestId()"> {{ message }} </p>
    }
    <ng-content select="[settingsFieldAfterError]" />
  `,
})
export class SettingsFieldComponent {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input.required<string>();
  readonly error = input<string | null>(null);
  readonly errorRole = input<string | null>(null);
  readonly errorTestId = input<string | null>(null);
}
