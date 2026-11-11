import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HarnessSessionController } from '@ptah-extension/harness-builder';
import { HarnessHealthStore } from '@ptah-extension/marketplace/services';
import { PtahButtonDirective } from '@ptah-extension/ui';

type SessionRecord = NonNullable<
  ReturnType<ReturnType<HarnessSessionController['session']>['record']>
>;
type Receipt = NonNullable<SessionRecord['applyReceipt']>;
@Component({
  selector: 'ptah-apply-result',
  standalone: true,
  imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section
    class="space-y-3 rounded-[22px] border border-state-done p-5"
    data-glass-surface="content"
    aria-labelledby="apply-result-title"
  >
    <h2 id="apply-result-title" class="text-lg font-semibold">
      {{ showDetails() ? 'Applied revision' : 'Next steps' }}
    </h2>
    @if (showDetails()) {
      <p>{{ receipt().appliedPaths.length }} files written.</p>
      <ul aria-label="Applied paths" class="space-y-1">
        @for (path of receipt().appliedPaths; track path) {
          <li class="break-all font-mono text-xs">{{ path }}</li>
        }
      </ul>
      <button ptahButton type="button" (click)="copyPaths()">Copy paths</button>
      @if (receipt().warnings.length) {
        <div role="status">
          <h3 class="font-medium">Warnings</h3>
          <ul class="list-disc pl-5">
            @for (warning of receipt().warnings; track warning) {
              <li>{{ warning }}</li>
            }
          </ul>
        </div>
      }
    }
    <p role="status" class="text-sm text-base-content-muted">
      {{
        health.loading()
          ? 'Checking harness health…'
          : 'Harness health: ' + health.summary().label
      }}
    </p>
    <div class="flex flex-wrap gap-2">
      <button ptahButton type="button" (click)="openChat.emit()">
        Open chat</button
      ><button ptahButton type="button" (click)="openDashboard.emit()">
        Open health dashboard</button
      ><button ptahButton variant="primary" type="button" (click)="done.emit()">
        Done
      </button>
    </div>
    <p class="sr-only" role="status">{{ announcement() }}</p>
  </section>`,
})
export class ApplyResultComponent {
  protected readonly health = inject(HarnessHealthStore);
  readonly receipt = input.required<Receipt>();
  readonly showDetails = input(true);
  readonly openChat = output<void>();
  readonly openDashboard = output<void>();
  readonly done = output<void>();
  readonly announcement = signal('');
  async copyPaths(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        this.receipt().appliedPaths.join('\n'),
      );
      this.announcement.set('Paths copied');
    } catch {
      this.announcement.set('Could not copy paths');
    }
  }
}
