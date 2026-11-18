import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChildren,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import type { CliType } from '@ptah-extension/shared';
import {
  NativePopoverComponent,
  PtahButtonDirective,
  PtahDescriptionListComponent,
  PtahTableDetailLayoutComponent,
} from '@ptah-extension/ui';
import type { LaneTableRow } from './lanes-table.component';
import type {
  InstanceCliMatrixRow,
  SystemCliMatrixRow,
} from './cli-matrix-rows';
import { ClaudeLaneAccountCellComponent } from './claude-lane-account-cell.component';
import { CursorCredentialPopoverComponent } from './cursor-credential-popover.component';
import {
  CliProviderCardPopoversComponent,
  type CliProviderInfoKind,
} from './cli-provider-card-popovers.component';
import { cliCapabilityView } from './cli-capability-view';

@Component({
  selector: 'ptah-lanes-table-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NativePopoverComponent,
    PtahButtonDirective,
    PtahDescriptionListComponent,
    PtahTableDetailLayoutComponent,
    ClaudeLaneAccountCellComponent,
    CursorCredentialPopoverComponent,
    CliProviderCardPopoversComponent,
  ],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './lanes-table-detail.component.css',
  templateUrl: './lanes-table-detail.component.html',
})
export class LanesTableDetailComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly popovers = viewChildren(NativePopoverComponent);
  readonly row = input.required<LaneTableRow>();
  constructor() {
    // A new row value can come with a row move (install state changed: the
    // table puts installed rows first). The move hides an open native popover.
    effect(() => {
      this.row();
      if (this.openKind() !== null) this.openChip.set(null);
      for (const popover of this.popovers()) popover.reattach();
    });
  }
  protected focusCredentialKey(): void {
    this.element.nativeElement
      .querySelector<HTMLElement>('[data-testid="cursor-credential-key"]')
      ?.focus();
  }
  protected readonly systemRow = computed((): SystemCliMatrixRow | null => {
    const row = this.row();
    return row.kind === 'system' ? row : null;
  });
  protected readonly instanceRow = computed((): InstanceCliMatrixRow | null => {
    const row = this.row();
    return row.kind === 'instance' ? row : null;
  });
  readonly openKind = input<CliProviderInfoKind | 'credentials' | null>(null);
  readonly testResult = input('');
  readonly testing = input(false);
  readonly busy = input(false);
  readonly guides = input<
    Readonly<
      Partial<
        Record<
          CliType,
          { readonly command: string | null; readonly note: string }
        >
      >
    >
  >({});
  readonly kindToggled = output<CliProviderInfoKind | 'credentials'>();
  readonly popoverClosed = output<void>();
  readonly redetect = output<string>();
  readonly codexSettings = output<void>();
  readonly tiers = output<LaneTableRow>();
  readonly test = output<void>();
  protected readonly infoKinds: readonly CliProviderInfoKind[] = [
    'capabilities',
    'info',
    'install',
  ];
  protected isOpen(kind: CliProviderInfoKind | 'credentials'): boolean {
    return this.openKind() === kind;
  }
  protected readonly openChip = signal<string | null>(null);
  protected toggleChip(label: string): void {
    this.popoverClosed.emit();
    this.openChip.update((current) => (current === label ? null : label));
  }
  protected capabilityView(row: LaneTableRow) {
    return cliCapabilityView(row.manifest);
  }
}
