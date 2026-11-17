import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import { LanesTableComponent, type LaneTableRow } from './lanes-table.component';

@Component({
  selector: 'ptah-cli-provider-grid', standalone: true,
  imports: [LanesTableComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-lanes-table [rows]="rows()" [defaults]="defaults()"
    [busy]="busy()" [canWrite]="canWrite()" [testingRows]="testingRows()"
    [testResults]="testResults()" [loading]="loading()" [orderMode]="orderMode()"
    [guides]="guides()" [error]="error()"
    (toggled)="toggled.emit($event)" (moved)="moved.emit($event)"
    (test)="test.emit($event)" (edit)="edit.emit($event)"
    (delete)="delete.emit($event)" (capabilities)="capabilities.emit($event)"
    (installGuide)="installGuide.emit($event)" (signIn)="signIn.emit($event)"
    (retry)="retry.emit()" (redetect)="redetect.emit($event)"
    (codexSettings)="codexSettings.emit()" (tiers)="tiers.emit($event)"
    (defaultSelected)="defaultSelected.emit($event)"
    (defaultResetRequested)="defaultResetRequested.emit($event)" />`,
})
export class CliProviderGridComponent {
  private readonly table = viewChild(LanesTableComponent);
  closeGuide(rowId: string): void { this.table()?.closeGuide(rowId); }
  readonly rows = input.required<readonly LaneTableRow[]>();
  readonly defaults = input<CliLaneDefaults>();
  readonly busy = input(false);
  readonly canWrite = input(true);
  readonly testingRows = input<Readonly<Record<string, boolean>>>({});
  readonly testResults = input<Readonly<Record<string, string>>>({});
  readonly loading = input(false);
  readonly orderMode = input(false);
  readonly error = input<string | null>(null);
  readonly guides = input<Readonly<Partial<Record<CliType, { readonly command: string | null; readonly note: string }>>>>({});
  readonly toggled = output<{ row: LaneTableRow; event: Event }>();
  readonly moved = output<{ row: LaneTableRow; direction: -1 | 1 }>();
  readonly test = output<LaneTableRow>();
  readonly edit = output<LaneTableRow>();
  readonly delete = output<LaneTableRow>();
  readonly capabilities = output<LaneTableRow>();
  readonly installGuide = output<LaneTableRow>();
  readonly signIn = output<LaneTableRow>();
  readonly retry = output<void>();
  readonly redetect = output<string>();
  readonly codexSettings = output<void>();
  readonly tiers = output<LaneTableRow>();
  readonly defaultSelected = output<{ row: LaneTableRow; choice: NonNullable<CliLaneDefaults[CliType]> }>();
  readonly defaultResetRequested = output<LaneTableRow>();
}
