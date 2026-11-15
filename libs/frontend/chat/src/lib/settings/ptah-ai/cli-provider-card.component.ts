import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import {
  NativePopoverComponent,
  ProviderMarkComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahDescriptionItemComponent,
  PtahDescriptionListComponent,
  PtahFieldComponent,
  PtahFieldTriggerDirective,
  PtahSurfaceDirective,
  type PtahBadgeTone,
} from '@ptah-extension/ui';
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

const NATIVE_BEHAVIOR_HINT =
  'Built-in behavior of this CLI. Lanes that Ptah spawns use the Lane default below; a parent session in Plan Mode caps them to Plan.';

@Component({
  selector: 'ptah-cli-provider-card', standalone: true,
  imports: [
    NativePopoverComponent,
    ProviderMarkComponent,
    CliCapabilityCellsComponent,
    CliLaneDefaultCellComponent,
    CliModelEffortPopoverComponent,
    CursorCredentialPopoverComponent,
    CliProviderCardPopoversComponent,
    ClaudeLaneAccountCellComponent,
    PtahButtonDirective,
    PtahBadgeDirective,
    PtahCheckboxDirective,
    PtahDescriptionItemComponent,
    PtahDescriptionListComponent,
    PtahFieldComponent,
    PtahFieldTriggerDirective,
    PtahSurfaceDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cli-provider-card.component.css',
  template: `<article ptahSurface variant="inset" border="faint" padding="none" class="provider-card rounded-lg text-base-content"
      data-glass-surface="tile" [attr.data-testid]="'cli-provider-card-' + row().id">
    <header class="flex min-w-0 flex-wrap items-center gap-[var(--ptah-gap-controls)] border-b border-base-content/10 px-[var(--ptah-space-3)] py-[var(--ptah-space-2)]">
      <ptah-provider-mark [providerId]="row().cli" fallback="Terminal" size="sm" />
      <h3 class="min-w-0 flex-1 break-words text-sm font-semibold">{{ row().name }}</h3>
      <!-- The one status of the card. Version and executable source are facts in the list below. -->
      <span ptahBadge appearance="outline" [tone]="statusTone()" class="status-slot text-xs"
        [attr.data-status]="statusKind()"><span class="ptah-badge-text">{{ statusText() }}</span></span>
      <label class="flex min-h-10 shrink-0 items-center gap-[var(--ptah-gap-inline)] text-xs">
        <span>Enabled</span><input type="checkbox" ptahCheckbox size="sm"
          [checked]="row().enabled && row().installed" [disabled]="!row().installed"
          [attr.aria-disabled]="busy() || !canWrite() ? 'true' : null"
          [attr.aria-label]="row().name + ' enabled'" (change)="onToggle($event)" />
      </label>
    </header>
    <div class="provider-card-body">
      @if (row().cli === 'claude' && row().installed) { <ptah-claude-lane-account-cell /> }
      <ptah-description-list [ariaLabel]="row().name + ' details'" data-testid="cli-provider-facts">
        @if (row().versionLabel) {
          <div ptahDescriptionItem term="Version"><span data-testid="cli-matrix-version" [title]="row().version ?? ''">{{ row().versionLabel }}</span></div>
        }
        @if (row().codexStatusLine) { <div ptahDescriptionItem term="Executable" [value]="row().codexStatusLine"></div> }
        <div ptahDescriptionItem term="Provider" [value]="row().provider ?? 'CLI default'"></div>
        <div ptahDescriptionItem term="Native CLI behavior" [title]="nativeBehaviorHint">
          <ptah-native-popover [isOpen]="openKind() === 'permission'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
            <button trigger type="button" ptahButton variant="ghost" size="xs" density="compact" align="start" data-popover-kind="permission" [title]="row().permission.detail"
              [attr.aria-expanded]="openKind() === 'permission'" (click)="popoverRequested.emit('permission')">{{ row().permission.badge }}</button>
            @if (openKind() === 'permission') { <ptah-cli-provider-card-popovers content [row]="row()" kind="permission" (closed)="popoverClosed.emit()" /> }
          </ptah-native-popover>
        </div>
      </ptah-description-list>
      <ptah-cli-capability-cells [manifest]="row().manifest" />
      <ptah-native-popover [isOpen]="openKind() === 'capabilities'" placement="bottom-start" [hasBackdrop]="true"
        backdropClass="transparent" (closed)="popoverClosed.emit()">
        <button trigger type="button" ptahButton variant="ghost" size="xs" data-popover-kind="capabilities" [attr.aria-expanded]="openKind() === 'capabilities'"
          (click)="popoverRequested.emit('capabilities')">All capabilities</button>
        @if (openKind() === 'capabilities') { <ptah-cli-provider-card-popovers content [row]="row()" kind="capabilities" (closed)="popoverClosed.emit()" /> }
      </ptah-native-popover>
      <!-- Editable lane settings. -->
      <div class="defaults-grid min-w-0 border-t border-base-content/10 pt-[var(--ptah-space-2)] text-xs">
        <div class="defaults-heading flex min-w-0 items-center justify-between gap-[var(--ptah-gap-inline)]">
          <h4 class="text-xs font-semibold text-base-content-muted">Defaults</h4>
          @if (row().credentialAction) {
            <div class="credential-slot min-w-0" [attr.data-has-reset]="saved() ? '' : null">
              <ptah-native-popover [isOpen]="openKind() === 'credentials'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (opened)="focusCredentialKey()" (closed)="popoverClosed.emit()">
                <button trigger type="button" ptahButton variant="outline" size="xs" data-popover-kind="credentials" [attr.aria-expanded]="openKind() === 'credentials'"
                  (click)="popoverRequested.emit('credentials')">Credentials</button>
                @if (openKind() === 'credentials') { <ptah-cursor-credential-popover content (closed)="popoverClosed.emit()" /> }
              </ptah-native-popover>
            </div>
          } @else if (row().cli === 'codex') {
            <div class="credential-slot min-w-0" [attr.data-has-reset]="saved() ? '' : null">
              <button type="button" ptahButton variant="outline" size="xs" (click)="codexSettingsRequested.emit()">Codex settings</button>
            </div>
          }
        </div>
        <ptah-field label="Model" size="sm" class="defaults-trigger-field min-w-0">
          <ptah-native-popover [isOpen]="openKind() === 'model'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
            <button trigger ptahFieldTrigger type="button" class="default-trigger min-w-0" data-popover-kind="model" [disabled]="!row().interactive" [attr.aria-label]="'Model default for ' + row().name"
              [attr.data-busy]="busy() ? '' : null" [attr.aria-disabled]="busy() ? 'true' : null" [attr.aria-busy]="busy() ? 'true' : null" [title]="modelTitle()" [attr.aria-expanded]="openKind() === 'model'" (click)="!busy() && requestPopover('model')">{{ modelText() }}</button>
            @if (openKind() === 'model') { <ptah-cli-model-effort-popover content [row]="row()" field="model" (closed)="popoverClosed.emit()" /> }
          </ptah-native-popover>
        </ptah-field>
        <ptah-field label="Effort" size="sm" class="defaults-trigger-field min-w-0">
          @if (row().effort) {
            <ptah-native-popover [isOpen]="openKind() === 'effort'" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
              <button trigger ptahFieldTrigger type="button" class="default-trigger min-w-0" data-popover-kind="effort" [disabled]="!row().interactive" [attr.aria-label]="'Effort default for ' + row().name" [title]="row().effort?.value || 'default'"
                [attr.data-busy]="busy() ? '' : null" [attr.aria-disabled]="busy() ? 'true' : null" [attr.aria-busy]="busy() ? 'true' : null" [attr.aria-expanded]="openKind() === 'effort'" (click)="!busy() && requestPopover('effort')">{{ row().effort?.value || 'default' }}</button>
              @if (openKind() === 'effort') { <ptah-cli-model-effort-popover content [row]="row()" field="effort" (closed)="popoverClosed.emit()" /> }
            </ptah-native-popover>
          } @else { <button ptahFieldTrigger type="button" disabled class="default-trigger min-w-0 text-base-content-muted">n/a</button> }
        </ptah-field>
        <ptah-cli-lane-default-cell [cli]="row().cli" [name]="row().name" [manifest]="row().manifest"
          [saved]="saved()" [disabled]="busy() || !canWrite()" layout="card"
          (selected)="defaultSelected.emit($event)" (resetRequested)="defaultResetRequested.emit()" />
      </div>
      <div class="test-status min-w-0 break-words text-xs text-base-content-muted" aria-live="polite">{{ testing() ? 'Running…' : testText() }}</div>
    </div>
    <footer class="flex items-center justify-between gap-[var(--ptah-gap-controls)] border-t border-base-content/10 px-[var(--ptah-space-3)] py-[var(--ptah-space-2)]">
      <button type="button" ptahButton class="test-button" [disabled]="!row().installed || testing() || busy()"
        (click)="testRequested.emit(row().id)">{{ testing() ? 'Running…' : 'Test' }}</button>
      <div class="flex items-center gap-[var(--ptah-gap-inline)]">
        <ptah-native-popover [isOpen]="openKind() === 'info'" placement="bottom-end" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
          <button trigger type="button" ptahButton variant="ghost" size="xs" data-popover-kind="info" [attr.aria-expanded]="openKind() === 'info'" (click)="popoverRequested.emit('info')">Info</button>
          @if (openKind() === 'info') { <ptah-cli-provider-card-popovers content [row]="row()" kind="info" [detail]="testText() || row().permission.detail" (closed)="popoverClosed.emit()" /> }
        </ptah-native-popover>
        @if (!row().installed) {
          <ptah-native-popover [isOpen]="openKind() === 'install'" placement="bottom-end" [hasBackdrop]="true" backdropClass="transparent" (closed)="popoverClosed.emit()">
            <button trigger type="button" ptahButton variant="ghost" size="xs" data-popover-kind="install" [attr.aria-expanded]="openKind() === 'install'" (click)="popoverRequested.emit('install')">Install guide</button>
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
  protected readonly nativeBehaviorHint = NATIVE_BEHAVIOR_HINT;
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
  /**
   * One status per card. A system row is `ready` only when it is installed and enabled, so the
   * card says "Enabled". The other kinds keep the row label (Disabled, Not installed, Needs API key).
   */
  protected readonly statusText = computed(() => {
    const kind = this.statusKind();
    if (kind === 'running') return 'Running';
    if (kind === 'failed') return 'Test failed';
    return kind === 'ready' ? 'Enabled' : this.row().status.label;
  });
  protected readonly statusTone = computed<PtahBadgeTone>(() => {
    const kind = this.statusKind();
    if (kind === 'failed') return 'err';
    if (kind === 'ready') return 'ok';
    if (kind === 'running') return 'info';
    return kind === 'needs-key' ? 'warn' : 'neutral';
  });
}
