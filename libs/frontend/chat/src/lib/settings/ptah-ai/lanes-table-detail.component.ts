import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CliType } from '@ptah-extension/shared';
import { NativePopoverComponent, PtahButtonDirective, PtahDescriptionItemComponent, PtahDescriptionListComponent } from '@ptah-extension/ui';
import type { LaneTableRow } from './lanes-table.component';
import { ClaudeLaneAccountCellComponent } from './claude-lane-account-cell.component';
import { CursorCredentialPopoverComponent } from './cursor-credential-popover.component';
import { CliProviderCardPopoversComponent, type CliProviderInfoKind } from './cli-provider-card-popovers.component';
import { CliCapabilityCellsComponent } from './cli-capability-cells.component';

@Component({
  selector: 'ptah-lanes-table-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NativePopoverComponent, PtahButtonDirective, PtahDescriptionItemComponent, PtahDescriptionListComponent, ClaudeLaneAccountCellComponent, CursorCredentialPopoverComponent, CliProviderCardPopoversComponent, CliCapabilityCellsComponent],
  template: `
    @if (row().kind === 'system') {
      @if (row().cli === 'claude' && row().installed) { <ptah-claude-lane-account-cell /> }
      <ptah-description-list [ariaLabel]="row().name + ' details'" data-testid="cli-provider-facts">
        @if (row().versionLabel) {
          <div ptahDescriptionItem term="Version"><span data-testid="cli-matrix-version" [title]="row().version ?? ''">{{ row().versionLabel }}</span></div>
        }
        @if (row().codexStatusLine) { <div ptahDescriptionItem term="Executable" [value]="row().codexStatusLine"></div> }
        <div ptahDescriptionItem term="Provider" [value]="row().provider ?? 'CLI default'"></div>
        <div ptahDescriptionItem term="Native CLI behavior" title="Built-in behavior of this CLI. Lanes that Ptah spawns use the Lane default below; a parent session in Plan Mode caps them to Plan.">
          <ptah-native-popover [isOpen]="isOpen('permission')" [keepInViewport]="true" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
            <button trigger type="button" ptahButton variant="ghost" size="xs" data-popover-kind="permission" [title]="row().permission.detail" [attr.aria-expanded]="isOpen('permission')" (click)="kindToggled.emit('permission')">{{ row().permission.badge }}</button>
            @if (isOpen('permission')) { <ptah-cli-provider-card-popovers content [row]="row()" kind="permission" (closed)="popoverClosed.emit()" /> }
          </ptah-native-popover>
        </div>
      </ptah-description-list>
      <ptah-cli-capability-cells [manifest]="row().manifest" />
      @for (kind of infoKinds; track kind) {
        @if (kind !== 'install' || !row().installed) {
          <ptah-native-popover [isOpen]="isOpen(kind)" [keepInViewport]="true" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
            <button trigger type="button" ptahButton variant="ghost" size="xs" [attr.data-popover-kind]="kind" [attr.aria-expanded]="isOpen(kind)" (click)="kindToggled.emit(kind)">{{ kind === 'install' ? 'Install guide' : kind === 'info' ? 'Info' : 'All capabilities' }}</button>
            @if (isOpen(kind)) {
              <ptah-cli-provider-card-popovers content [row]="row()" [kind]="kind" [detail]="testResult() || row().permission.detail" [guide]="guides()[row().cli]" [busy]="busy()" (redetectRequested)="redetect.emit($event)" (closed)="popoverClosed.emit()" />
            }
          </ptah-native-popover>
        }
      }
      @if (row().credentialAction) {
        <ptah-native-popover [isOpen]="isOpen('credentials')" [keepInViewport]="true" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
          <button trigger type="button" ptahButton variant="outline" size="xs" data-popover-kind="credentials" [attr.aria-expanded]="isOpen('credentials')" (click)="kindToggled.emit('credentials')">Credentials</button>
          @if (isOpen('credentials')) { <ptah-cursor-credential-popover content (closed)="popoverClosed.emit()" /> }
        </ptah-native-popover>
      } @else if (row().cli === 'codex') {
        <button type="button" ptahButton variant="outline" size="xs" (click)="codexSettings.emit()">Codex settings</button>
      }
    } @else {
      <ptah-description-list [ariaLabel]="row().name + ' details'">
        <div ptahDescriptionItem term="Provider" [value]="row().provider"></div>
        @if (row().keyStatus?.kind !== 'missing' && row().keyStatus; as keyStatus) { <div ptahDescriptionItem term="Key" [value]="keyStatus.label" data-testid="cli-matrix-key-status"></div> }
        <div ptahDescriptionItem term="Tier models">
          @for (tier of row().tiers ?? []; track tier.tier) { <span [attr.data-tier]="tier.tier">{{ tier.label }}: {{ tier.model }}</span> } @empty { No tier models }
        </div>
      </ptah-description-list>
      <button type="button" ptahButton variant="ghost" size="xs" (click)="tiers.emit(row())">Edit tiers</button>
    }
    <div data-testid="cli-matrix-test-result" aria-live="polite">{{ testing() ? 'Running…' : (testResult() || 'Not run yet') }}</div>
  `,
})
export class LanesTableDetailComponent {
  readonly row = input.required<LaneTableRow>();
  readonly openKind = input<CliProviderInfoKind | 'credentials' | null>(null);
  readonly testResult = input('');
  readonly testing = input(false);
  readonly busy = input(false);
  readonly guides = input<Readonly<Partial<Record<CliType, { readonly command: string | null; readonly note: string }>>>>({});
  readonly kindToggled = output<CliProviderInfoKind | 'credentials'>();
  readonly popoverClosed = output<void>();
  readonly redetect = output<string>();
  readonly codexSettings = output<void>();
  readonly tiers = output<LaneTableRow>();
  protected readonly infoKinds: readonly CliProviderInfoKind[] = ['info', 'capabilities', 'install'];
  protected isOpen(kind: CliProviderInfoKind | 'credentials'): boolean { return this.openKind() === kind; }
}
