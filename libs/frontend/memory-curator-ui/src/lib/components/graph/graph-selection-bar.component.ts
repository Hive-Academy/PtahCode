import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { PtahButtonDirective, PtahInlineConfirmComponent } from '@ptah-extension/ui';

@Component({ selector: 'ptah-memory-graph-selection-bar', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahInlineConfirmComponent],
  template: `
    <div role="toolbar" aria-label="Selected memory actions" data-testid="memory-graph-selection-bar" class="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border bg-surface-2 p-2 text-sm">
      <span>{{ count() }} selected</span>
      <button ptahButton type="button" size="xs" variant="ghost" [disabled]="busy() || count() === 0" (click)="pinAll.emit()">Pin all</button>
      <button ptahButton type="button" size="xs" variant="ghost" [disabled]="busy() || count() === 0" (click)="unpinAll.emit()">Unpin all</button>
      @if (confirming()) { <ptah-inline-confirm message="Forget selected memories?" tone="danger" [busy]="busy()" confirmLabel="Forget all" (confirm)="forgetAll.emit(); confirming.set(false)" (cancelled)="confirming.set(false)" /> }
      @else { <button ptahButton type="button" size="xs" variant="ghost" [disabled]="busy() || count() === 0" (click)="confirming.set(true)">Forget all</button> }
      <button ptahButton type="button" size="xs" variant="ghost" [disabled]="busy() || count() === 0" (click)="clear.emit()">Clear selection</button>
    </div>
  `,
})
export class GraphSelectionBarComponent {
  public readonly count = input.required<number>();
  public readonly busy = input(false);
  public readonly pinAll = output<void>();
  public readonly unpinAll = output<void>();
  public readonly forgetAll = output<void>();
  public readonly clear = output<void>();
  protected readonly confirming = signal(false);
}
