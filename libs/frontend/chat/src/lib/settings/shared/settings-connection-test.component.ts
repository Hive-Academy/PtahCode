import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PtahButtonDirective, PtahStatusComponent } from '@ptah-extension/ui';

export type SettingsConnectionTestState = 'idle' | 'running' | 'ok' | 'fail';

@Component({
  selector: 'ptah-settings-connection-test',
  standalone: true,
  imports: [PtahButtonDirective, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-ptah-controls">
      <button
        ptahButton
        type="button"
        variant="secondary"
        [busy]="state() === 'running'"
        [attr.data-testid]="testId()"
        (click)="test.emit()"
      >{{ label() }}</button>
      <!-- The live region stays in the DOM in every state, so a screen reader announces each result. -->
      <span role="status" aria-live="polite" data-ptah-connection-result>
        @switch (state()) {
          @case ('running') {
            <ptah-status status="running" [label]="message() || 'Testing connection'" />
          }
          @case ('ok') {
            <ptah-status status="online" [label]="message() || 'Connection works'" />
          }
          @case ('fail') {
            <ptah-status status="failed" [label]="message() || 'Connection failed'" />
          }
        }
      </span>
    </div>
  `,
})
export class SettingsConnectionTestComponent {
  readonly label = input.required<string>();
  readonly state = input<SettingsConnectionTestState>('idle');
  readonly message = input<string | null>(null);
  readonly testId = input<string | null>(null);

  readonly test = output<void>();
}
