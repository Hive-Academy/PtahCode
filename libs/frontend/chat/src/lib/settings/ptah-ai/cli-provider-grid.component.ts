import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import { CliProviderCardComponent, type CliProviderOpenKind } from './cli-provider-card.component';

export interface CliProviderOpenCell { readonly rowId: string; readonly kind: CliProviderOpenKind }
export type CliProviderChoice = NonNullable<CliLaneDefaults[CliType]>;

@Component({
  selector: 'ptah-cli-provider-grid', standalone: true,
  imports: [CliProviderCardComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cli-provider-grid.component.css',
  template: `<div class="provider-grid" aria-label="CLI agents" data-testid="cli-provider-grid">
    @for (row of rows(); track row.id) {
      <ptah-cli-provider-card [row]="row" [saved]="defaults()?.[row.cli]"
        [busy]="busy()" [canWrite]="canWrite()" [testing]="testing() && testingId() === row.id"
        [testText]="testTexts()?.[row.id] ?? ''" [guide]="guides()?.[row.cli]"
        [openKind]="activeOpenCell()?.rowId === row.id ? activeOpenCell()?.kind ?? null : null"
        (popoverRequested)="togglePopover(row.id, $event)" (popoverClosed)="closePopover()"
        (toggled)="toggled.emit($event)" (defaultSelected)="defaultSelected.emit({row, choice: $event})"
        (defaultResetRequested)="defaultResetRequested.emit(row)" (testRequested)="testRequested.emit($event)"
        (redetectRequested)="redetectRequested.emit($event)" (codexSettingsRequested)="codexSettingsRequested.emit()" />
    }
  </div>`,
})
export class CliProviderGridComponent {
  readonly rows = input.required<readonly SystemCliMatrixRow[]>();
  readonly defaults = input<CliLaneDefaults>();
  readonly busy = input(false);
  readonly canWrite = input(true);
  readonly testing = input(false);
  readonly testingId = input<string | null>(null);
  readonly testTexts = input<Readonly<Record<string, string>>>();
  readonly guides = input<Readonly<Partial<Record<SystemCliMatrixRow['cli'], { readonly command: string | null; readonly note: string }>>>>();
  /** Defined by the matrix when installed and uninstalled grids share one popover owner. */
  readonly sharedOpenCell = input<CliProviderOpenCell | null | undefined>(undefined);
  readonly popoverToggled = output<CliProviderOpenCell>();
  readonly popoverDismissed = output<void>();
  readonly toggled = output<{ row: SystemCliMatrixRow; event: Event }>();
  readonly defaultSelected = output<{ row: SystemCliMatrixRow; choice: CliProviderChoice }>();
  readonly defaultResetRequested = output<SystemCliMatrixRow>();
  readonly testRequested = output<string>();
  readonly redetectRequested = output<string>();
  readonly codexSettingsRequested = output<void>();
  private readonly localOpenCell = signal<CliProviderOpenCell | null>(null);
  protected readonly activeOpenCell = computed(() => this.sharedOpenCell() === undefined ? this.localOpenCell() : this.sharedOpenCell());
  protected togglePopover(rowId: string, kind: CliProviderOpenKind): void {
    if (this.sharedOpenCell() !== undefined) this.popoverToggled.emit({ rowId, kind });
    else this.localOpenCell.update(open => open?.rowId === rowId && open.kind === kind ? null : { rowId, kind });
  }
  protected closePopover(): void {
    if (this.sharedOpenCell() !== undefined) this.popoverDismissed.emit();
    else this.localOpenCell.set(null);
  }
}
