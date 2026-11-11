import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { PtahButtonDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-generation-stop-control',
  standalone: true,
  imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active()) {
      <button ptahButton type="button" (click)="stopRequested.emit()">
        Stop generation
      </button>
      <p class="text-xs text-base-content-muted">
        Stopping may take a moment. Saved results remain available.
      </p>
    }
  `,
})
export class GenerationStopControlComponent {
  readonly active = input(false);
  readonly stopRequested = output<void>();
}
