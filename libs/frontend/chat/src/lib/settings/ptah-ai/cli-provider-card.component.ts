import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { NativePopoverComponent, ProviderMarkComponent } from '@ptah-extension/ui';
import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import { cliModelDisplay, type SystemCliMatrixRow } from './cli-matrix-rows';
import { CliCapabilityCellsComponent } from './cli-capability-cells.component';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import { CursorCredentialPopoverComponent } from './cursor-credential-popover.component';
import { CliProviderCardPopoversComponent } from './cli-provider-card-popovers.component';
import { ClaudeLaneAccountCellComponent } from './claude-lane-account-cell.component';

export type CliProviderOpenKind = 'info' | 'capabilities' | 'model' | 'effort' | 'permission' | 'credentials' | 'install';
export type CliProviderDefaultChoice = NonNullable<CliLaneDefaults[CliType]>;

@Component({
  selector: 'ptah-cli-provider-card', standalone: true,
  imports: [NativePopoverComponent, ProviderMarkComponent, CliCapabilityCellsComponent,
    CliLaneDefaultCellComponent, CliModelEffortPopoverComponent, CursorCredentialPopoverComponent,
    CliProviderCardPopoversComponent, ClaudeLaneAccountCellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cli-provider-card.component.css',
  template: `<article class="provider-card rounded-lg border border-base-content/10 bg-base-100 text-base-content"
      data-glass-surface="tile" [attr.data-testid]="'cli-provider-card-' + row().id">
    <header class="flex min-w-0 items-center gap-2 border-b border-base-content/10 px-3 py-2">
      <ptah-provider-mark [providerId]="row().cli" fallback="Terminal" size="sm" />
      <h3 class="min-w-0 flex-1 truncate text-sm font-semibold" [title]="row().name">{{ row().name }}</h3>
      @if (row().versionLabel) { <span class="min-w-0 truncate text-xs" data-testid="cli-matrix-version" [title]="row().version ?? ''">{{ row().versionLabel }}</span> }
      <span class="status-slot badge badge-sm badge-outline border-base-content/60 text-xs" [title]="statusText()"
        [attr.data-status]="statusKind()">{{ statusText() }}</span>
    </header>
    <div class="card-body min-h-0 min-w-0 p-1">
      <div class="flex h-10 shrink-0 items-center justify-between gap-1 px-1">
        <span class="min-w-0 truncate text-xs text-base-content-muted" [title]="row().codexStatusLine ?? ''">
          {{ row().codexStatusLine ?? (row().installed ? 'Installed' : 'Not installed') }}
        </span>
        <label class="flex min-h-10 shrink-0 items-center gap-1 text-xs">
          <span>Enabled</span><input type="checkbox" class="checkbox checkbox-primary checkbox-sm border-base-content/60"
            [checked]="row().enabled && row().installed" [disabled]="!row().installed"
            [attr.aria-disabled]="busy() || !canWrite() ? 'true' : null"
            [attr.aria-label]="row().name + ' enabled'" (change)="onToggle($event)" />
        </label>
      </div>
      @if (row().cli === 'claude' && row().installed) { <ptah-claude-lane-account-cell /> }
      <div class="capability-strip min-w-0 px-1"><ptah-cli-capability-cells [manifest]="row().manifest" /></div>
      <ptah-native-popover [isOpen]="openKind() === 'capabilities'" placement="bottom-start" [hasBackdrop]="true"
        backdropClass="transparent" (closed)="popoverClosed.emit()">
        <button trigger type="button" class="btn btn-ghost btn-xs" data-popover-kind="capabilities" [attr.aria-expanded]="openKind() === 'capabilities'"
          (click)="popoverRequested.emit('capabilities')">All capabilities</button>
        @if (openKind() === 'capabilities') { <ptah-cli-provider-card-popovers content [row]="row()" kind="capabilities" (closed)="popoverClosed.emit()" /> }
      </ptah-native-popover>
      <div class="grid min-w-0 grid-cols-[4.7rem_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5 px-1 text-xs">
        <span class="text-base-content-muted">Provider</span><span class="truncate" [title]="row().provider ?? 'CLI default'">{{ row().provider ?? 'CLI default' }}</span>
        <span class="text-base-content-muted">Model</span>
        <ptah-native-popover [isOpen]="openKind() === 'model'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
          <button trigger type="button" class="btn btn-ghost btn-xs min-w-0 justify-start truncate" data-popover-kind="model" [disabled]="!row().interactive"
            [attr.aria-disabled]="busy() ? 'true' : null" [title]="modelTitle()" [attr.aria-expanded]="openKind() === 'model'" (click)="requestPopover('model')">{{ modelText() }}</button>
          @if (openKind() === 'model') { <ptah-cli-model-effort-popover content [row]="row()" field="model" (closed)="popoverClosed.emit()" /> }
        </ptah-native-popover>
        <span class="text-base-content-muted">Effort</span>
        @if (row().effort) {
          <ptah-native-popover [isOpen]="openKind() === 'effort'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
            <button trigger type="button" class="btn btn-ghost btn-xs min-w-0 justify-start truncate" data-popover-kind="effort" [disabled]="!row().interactive"
              [attr.aria-disabled]="busy() ? 'true' : null" [attr.aria-expanded]="openKind() === 'effort'" (click)="requestPopover('effort')">{{ row().effort?.value || 'default' }}</button>
            @if (openKind() === 'effort') { <ptah-cli-model-effort-popover content [row]="row()" field="effort" (closed)="popoverClosed.emit()" /> }
          </ptah-native-popover>
        } @else { <span class="text-base-content-muted">n/a</span> }
        <span class="text-base-content-muted">Safety</span>
        <ptah-native-popover [isOpen]="openKind() === 'permission'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
          <button trigger type="button" class="btn btn-ghost btn-xs min-w-0 justify-start truncate" data-popover-kind="permission" [title]="row().permission.detail"
            [attr.aria-expanded]="openKind() === 'permission'" (click)="popoverRequested.emit('permission')">{{ row().permission.badge }}</button>
          @if (openKind() === 'permission') { <ptah-cli-provider-card-popovers content [row]="row()" kind="permission" (closed)="popoverClosed.emit()" /> }
        </ptah-native-popover>
      </div>
      <div class="border-t border-base-content/10 px-1 pt-1 text-xs">
        <p class="font-semibold">Current CLI mode</p><p class="truncate text-base-content-muted" [title]="row().permission.detail">{{ row().permission.badge }}</p>
      </div>
      <div class="shrink-0 border-t border-base-content/10 px-1 pt-1 text-xs">
        <ptah-cli-lane-default-cell [cli]="row().cli" [name]="row().name" [manifest]="row().manifest"
          [saved]="saved()" [disabled]="busy() || !canWrite()" layout="card"
          (selected)="defaultSelected.emit($event)" (resetRequested)="defaultResetRequested.emit()" />
      </div>
      <div class="credential-slot min-w-0 px-1 text-xs">
        @if (row().credentialAction) {
          <ptah-native-popover [isOpen]="openKind() === 'credentials'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (opened)="focusCredentialKey()" (closed)="popoverClosed.emit()">
            <button trigger type="button" class="btn btn-ghost btn-xs" data-popover-kind="credentials" [attr.aria-expanded]="openKind() === 'credentials'"
              (click)="popoverRequested.emit('credentials')">Credentials</button>
            @if (openKind() === 'credentials') { <ptah-cursor-credential-popover content (closed)="popoverClosed.emit()" /> }
          </ptah-native-popover>
        } @else if (row().cli === 'codex') { <button type="button" class="btn btn-ghost btn-xs" (click)="codexSettingsRequested.emit()">Codex settings</button> }
      </div>
      <div class="test-status min-w-0 px-1 text-xs text-base-content-muted" aria-live="polite" [title]="testText()">
        <span class="block truncate">{{ testing() ? 'Running…' : testText() }}</span>
      </div>
    </div>
    <footer class="flex items-center justify-between gap-2 border-t border-base-content/10 px-3 py-2">
      <button type="button" class="test-button btn btn-outline btn-sm border-base-content/60" [disabled]="!row().installed || testing() || busy()"
        (click)="testRequested.emit(row().id)">{{ testing() ? 'Running…' : 'Test' }}</button>
      <div class="flex items-center gap-1">
        <ptah-native-popover [isOpen]="openKind() === 'info'" placement="bottom-end" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
          <button trigger type="button" class="btn btn-ghost btn-xs" data-popover-kind="info" [attr.aria-expanded]="openKind() === 'info'" (click)="popoverRequested.emit('info')">Info</button>
          @if (openKind() === 'info') { <ptah-cli-provider-card-popovers content [row]="row()" kind="info" [detail]="testText() || row().permission.detail" (closed)="popoverClosed.emit()" /> }
        </ptah-native-popover>
        @if (!row().installed) {
          <ptah-native-popover [isOpen]="openKind() === 'install'" placement="bottom-end" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
            <button trigger type="button" class="btn btn-ghost btn-xs" data-popover-kind="install" [attr.aria-expanded]="openKind() === 'install'" (click)="popoverRequested.emit('install')">Install guide</button>
            @if (openKind() === 'install') { <ptah-cli-provider-card-popovers content [row]="row()" kind="install" [guide]="guide()" [busy]="busy()" (redetectRequested)="redetectRequested.emit($event)" (closed)="popoverClosed.emit()" /> }
          </ptah-native-popover>
        }
      </div>
    </footer>
  </article>`,
})
export class CliProviderCardComponent {
  readonly row = input.required<SystemCliMatrixRow>();
  readonly saved = input<CliProviderDefaultChoice>();
  readonly busy = input(false);
  readonly canWrite = input(true);
  readonly testing = input(false);
  readonly testText = input('');
  readonly guide = input<{ readonly command: string | null; readonly note: string }>();
  readonly openKind = input<CliProviderOpenKind | null>(null);
  readonly toggled = output<{ row: SystemCliMatrixRow; event: Event }>();
  readonly defaultSelected = output<CliProviderDefaultChoice>();
  readonly defaultResetRequested = output<void>();
  readonly testRequested = output<string>();
  readonly redetectRequested = output<string>();
  readonly codexSettingsRequested = output<void>();
  readonly popoverRequested = output<CliProviderOpenKind>();
  readonly popoverClosed = output<void>();
  protected readonly modelText = computed(() => cliModelDisplay(this.row().model.value).label || 'CLI default');
  protected readonly modelTitle = computed(() => cliModelDisplay(this.row().model.value).title || 'CLI default');
  protected onToggle(event: Event): void {
    if (this.busy() || !this.canWrite()) {
      const input = event.target;
      if (input instanceof HTMLInputElement) input.checked = this.row().enabled && this.row().installed;
      return;
    }
    this.toggled.emit({ row: this.row(), event });
  }
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The Credentials popover's key field takes focus once the panel is positioned. */
  protected focusCredentialKey(): void {
    this.element.nativeElement.querySelector<HTMLElement>('[data-testid="cursor-credential-key"]:not([disabled])')?.focus();
  }
  protected requestPopover(kind: CliProviderOpenKind): void {
    if (!this.busy()) this.popoverRequested.emit(kind);
  }
  protected readonly statusKind = computed(() => this.testing() ? 'running' : this.testText().startsWith('The connection test failed.') ? 'failed' : this.row().status.kind);
  protected readonly statusText = computed(() => this.testing() ? 'Running' : this.statusKind() === 'failed' ? 'Test failed' : this.row().status.label);
}
