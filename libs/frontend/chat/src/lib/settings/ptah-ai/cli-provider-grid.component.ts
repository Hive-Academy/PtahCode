import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import type { CliAdapterManifest, CliLaneDefaults, CliType } from '@ptah-extension/shared';
import { LanesTableComponent, type LaneTableRow } from './lanes-table.component';
import type { LaneOrderMove, LaneOrderSettlement } from './lane-order-drag';

@Component({
  selector: 'ptah-cli-provider-grid', standalone: true,
  imports: [LanesTableComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-lanes-table [rows]="rows()" [defaults]="defaults()" [ptahDefaults]="ptahDefaults()"
    [busy]="busy()" [canWrite]="canWrite()" [canReorder]="canReorder()" [testingRows]="testingRows()"
    [testResults]="testResults()" [loading]="loading()" [orderMode]="orderMode()"
    [guides]="guides()" [error]="error()"
    (toggled)="toggled.emit($event)" (reordered)="reordered.emit($event)"
    (test)="test.emit($event)" (edit)="edit.emit($event)"
    (delete)="delete.emit($event)" (signIn)="signIn.emit($event)"
    (retry)="retry.emit()" (redetect)="redetect.emit($event)"
    (codexSettings)="codexSettings.emit()" (tiers)="tiers.emit($event)"
    (defaultSelected)="defaultSelected.emit($event)"
    (defaultResetRequested)="defaultResetRequested.emit($event)"
    (addRequested)="addRequested.emit($event)"
    (ptahDefaultSelected)="ptahDefaultSelected.emit($event)"
    (ptahDefaultResetRequested)="ptahDefaultResetRequested.emit()" />`,
})
export class CliProviderGridComponent {
  private readonly table = viewChild(LanesTableComponent);
  closeGuide(rowId: string): void { this.table()?.closeGuide(rowId); }
  /** After the save of a Reorder move: focus and announcement of the moved row. */
  orderSettled(result: LaneOrderSettlement): void { this.table()?.orderSettled(result); }
  readonly rows = input.required<readonly LaneTableRow[]>();
  readonly defaults = input<CliLaneDefaults>();
  readonly ptahDefaults = input<{ readonly manifest: CliAdapterManifest; readonly saved: CliLaneDefaults['ptah-cli'] } | null>(null);
  readonly busy = input(false);
  readonly canWrite = input(true);
  readonly canReorder = input(true);
  readonly testingRows = input<Readonly<Record<string, boolean>>>({});
  readonly testResults = input<Readonly<Record<string, string>>>({});
  readonly loading = input(false);
  readonly orderMode = input(false);
  readonly error = input<string | null>(null);
  readonly guides = input<Readonly<Partial<Record<CliType, { readonly command: string | null; readonly note: string }>>>>({});
  readonly toggled = output<{ row: LaneTableRow; event: Event }>();
  readonly reordered = output<LaneOrderMove>();
  readonly test = output<LaneTableRow>();
  readonly edit = output<LaneTableRow>();
  readonly delete = output<LaneTableRow>();
  readonly addRequested = output<'header' | 'empty'>();
  readonly ptahDefaultSelected = output<NonNullable<CliLaneDefaults['ptah-cli']>>();
  readonly ptahDefaultResetRequested = output<void>();
  readonly signIn = output<LaneTableRow>();
  readonly retry = output<void>();
  readonly redetect = output<string>();
  readonly codexSettings = output<void>();
  readonly tiers = output<LaneTableRow>();
  readonly defaultSelected = output<{ row: LaneTableRow; choice: NonNullable<CliLaneDefaults[CliType]> }>();
  readonly defaultResetRequested = output<LaneTableRow>();
}
