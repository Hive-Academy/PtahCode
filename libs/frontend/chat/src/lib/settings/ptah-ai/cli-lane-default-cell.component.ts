import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { NativePopoverComponent } from '@ptah-extension/ui';
import type { CliAdapterManifest, CliLaneDefaults, CliType, LaneNetworkMode, LanePermissionMode } from '@ptah-extension/shared';
import { CLI_LANE_DEFAULT_SCHEMA, resolveCliLaneDefaultPair } from '@ptah-extension/shared';

type Choice = NonNullable<CliLaneDefaults[CliType]>;
const PERMISSIONS: readonly LanePermissionMode[] = ['plan', 'ask', 'auto-edit', 'yolo'];
const NETWORKS: readonly LaneNetworkMode[] = ['deny', 'allow'];
const FULL_ACCESS_WARNING = 'Full access lets Codex read and change files outside this workspace and use the network without sandbox protection. Commands may affect your computer. Choose this only for runs you trust.';

@Component({
  selector: 'ptah-cli-lane-default-cell',
  standalone: true,
  imports: [NativePopoverComponent],
  styles: `:host { display: block; } dialog.modal:not([open]) { display: none; } .compact { width: 4.75rem; } .wide, .card-layout { width: 100%; } .wide select { max-width: 20rem; min-width: 9rem; } @container (max-width: 479px) { .wide > .grid { grid-template-columns: minmax(0, 1fr); } }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-w-0 max-w-full flex-col gap-1 text-xs text-base-content [overflow-wrap:anywhere]" [class.compact]="layout() === 'compact'" [class.wide]="layout() === 'wide'" [class.card-layout]="layout() === 'card'">
      @if (cli() === 'ptah-cli') { <span>Shared by all Ptah CLI providers</span> }
      @if (cli() === 'codex') { <span>Same setting as Codex sandbox in Providers › OpenAI Codex › Credentials.</span> }
      @if (showCaption()) { <span>{{ saved() ? 'Saved default' : 'Auto (default) · built-in' }}</span> }
      @if (saved()) {
        <ptah-native-popover [isOpen]="resetOpen()" placement="bottom-start" [hasBackdrop]="true" backdropClass="transparent" (closed)="resetOpen.set(false)">
          <button trigger type="button" class="btn btn-ghost btn-xs" [attr.aria-expanded]="resetOpen()" (click)="resetOpen.set(!resetOpen())">More default actions</button>
          @if (resetOpen()) { <div content class="p-2"><button type="button" class="btn btn-ghost btn-sm" [disabled]="disabled() || pending() !== null" (click)="requestReset()">Reset to default ({{ resetDescription() }})</button></div> }
        </ptah-native-popover>
      }
      @if (unsupportedCombination(); as reason) { <span role="status">Unsupported combination: {{ reason }}</span> }
      <div class="grid min-w-0 grid-cols-1" [class.gap-3]="layout() !== 'card'" [class.gap-2]="layout() === 'card'" [class.grid-cols-2]="layout() !== 'compact'">
      @if (permissions().length) {
        <label class="flex flex-col gap-0.5">Permission
          <select class="select select-bordered w-full min-w-0 max-w-full border-base-content/60 text-base-content" [class.select-sm]="layout() === 'wide'" [class.select-xs]="layout() !== 'wide'" [attr.aria-label]="name() + ' permission default'" [title]="effectivePermission()"
            [value]="effectivePermission()" [disabled]="disabled() || pending() !== null" (change)="choosePermission($event)">
            @for (mode of permissions(); track mode) { <option [value]="mode">{{ mode }}</option> }
          </select>
        </label>
        @if (cli() === 'cursor') {
          @for (mode of unavailablePermissions(); track mode.mode) {
            <span class="text-base-content" tabindex="0">{{ mode.mode }} unavailable: {{ mode.reason }}</span>
          }
        }
      } @else { <span tabindex="0" [title]="reason()">Permission: Unavailable — {{ reason() }}</span> }
      @if (networks().length) {
        <label class="flex flex-col gap-0.5">Network
          <select class="select select-bordered w-full min-w-0 max-w-full border-base-content/60 text-base-content" [class.select-sm]="layout() === 'wide'" [class.select-xs]="layout() !== 'wide'" [attr.aria-label]="name() + ' network default'" [title]="effectiveNetwork()"
            [value]="effectiveNetwork()" [disabled]="disabled() || pending() !== null" (change)="chooseNetwork($event)">
            @for (mode of networks(); track mode) { <option [value]="mode">{{ mode }}</option> }
          </select>
        </label>
      } @else { <span tabindex="0" [title]="reason()">Network: Unavailable — {{ reason() }}</span> }
      </div>
      <dialog #confirmation class="modal" (cancel)="cancel($event)" (close)="cancel()" aria-labelledby="cli-full-access-title">
        <div class="modal-box border border-base-content/60 bg-base-100 text-base-content">
          <h3 id="cli-full-access-title" tabindex="-1" class="text-base font-semibold">Confirm full access</h3>
          <p class="mt-3 text-sm">{{ cli() === 'codex' ? warning : 'Full auto can approve every action. Network access may let the lane reach external services. Choose this only for runs you trust.' }}</p>
          <div class="modal-action"><button type="button" class="btn btn-ghost btn-sm" (click)="cancel()">Cancel</button><button type="button" class="btn btn-warning btn-sm" (click)="confirm()">Confirm</button></div>
        </div>
      </dialog>
    </div>
  `,
})
export class CliLaneDefaultCellComponent {
  readonly cli = input.required<CliType>();
  readonly name = input.required<string>();
  readonly manifest = input<CliAdapterManifest>();
  readonly saved = input<Choice>();
  readonly disabled = input(false);
  /** `compact`: narrow column. `wide`: settings row. `card`: full card width, Permission and Network side by side. */
  readonly layout = input<'compact' | 'wide' | 'card'>('compact');
  readonly showCaption = input(true);
  readonly selected = output<Choice>();
  readonly resetRequested = output<void>();
  protected readonly warning = FULL_ACCESS_WARNING;
  protected readonly pending = signal<{ kind: 'choice'; value: Choice } | { kind: 'reset' } | null>(null);
  protected readonly resetOpen = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('confirmation');
  private returnFocus: HTMLSelectElement | HTMLButtonElement | null = null;
  readonly defaultPair = computed(() => this.manifest() ? resolveCliLaneDefaultPair(this.manifest()!, {}) : {});
  readonly effectivePair = computed(() => this.manifest() ? resolveCliLaneDefaultPair(this.manifest()!, this.saved()) : {});
  readonly defaultPermission = computed(() => { const pair = this.defaultPair(); return 'permission' in pair ? pair.permission : undefined; });
  readonly resetDescription = computed(() => this.defaultPermission() === 'yolo' ? 'Auto — full access' : this.defaultPermission() ?? 'Auto');
  readonly unsupportedCombination = computed(() => { const pair = this.effectivePair(); return 'unsupported' in pair ? pair.unsupported : null; });
  readonly permissions = computed(() => PERMISSIONS.filter(mode => this.manifest()?.permissionModes[mode]?.state === 'supported' &&
    NETWORKS.some(network => this.manifest()?.networkModes[network].state === 'supported' && this.manifest()?.permissionModes[mode]?.networkModes.includes(network))));
  readonly unavailablePermissions = computed(() => PERMISSIONS.flatMap(mode => {
    const capability = this.manifest()?.permissionModes[mode];
    return capability?.state === 'unsupported' ? [{ mode, reason: capability.reason }] : [];
  }));
  readonly effectivePermission = computed(() => { const pair = this.effectivePair(); return 'permission' in pair ? pair.permission : undefined; });
  readonly networks = computed(() => {
    const permission = this.effectivePermission();
    return permission ? NETWORKS.filter(mode => this.manifest()?.networkModes[mode].state === 'supported' &&
      this.manifest()?.permissionModes[permission]?.networkModes.includes(mode)) : [];
  });
  readonly effectiveNetwork = computed(() => { const pair = this.effectivePair(); return 'network' in pair ? pair.network : undefined; });
  readonly reason = computed(() => Object.values(this.manifest()?.permissionModes ?? {}).find(value => value?.reason)?.reason ??
    Object.values(this.manifest()?.networkModes ?? {}).find(value => value?.reason)?.reason ?? 'No verified mode is available.');
  protected choosePermission(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    this.returnFocus = event.target;
    const parsed = CLI_LANE_DEFAULT_SCHEMA.shape.permission.safeParse(event.target.value);
    event.target.value = this.effectivePermission() ?? '';
    if (!parsed.success || !parsed.data || !this.permissions().includes(parsed.data)) return;
    const value = parsed.data;
    const network = NETWORKS.find(mode => this.manifest()?.networkModes[mode].state === 'supported' && this.manifest()?.permissionModes[value]?.networkModes.includes(mode));
    const currentNetwork = this.effectiveNetwork();
    this.propose({ permission: value, ...(network ? { network: currentNetwork && this.manifest()?.permissionModes[value]?.networkModes.includes(currentNetwork) ? currentNetwork : network } : {}) });
  }
  protected chooseNetwork(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    this.returnFocus = event.target;
    const parsed = CLI_LANE_DEFAULT_SCHEMA.shape.network.safeParse(event.target.value);
    event.target.value = this.effectiveNetwork() ?? '';
    if (parsed.success && parsed.data && this.networks().includes(parsed.data)) this.propose({ permission: this.effectivePermission(), network: parsed.data });
  }
  private propose(choice: Choice): void {
    if (choice.permission === 'yolo') this.openConfirmation({ kind: 'choice', value: choice });
    else this.selected.emit(choice);
  }
  protected requestReset(): void {
    this.resetOpen.set(false);
    if (this.defaultPermission() === 'yolo') this.openConfirmation({ kind: 'reset' });
    else this.resetRequested.emit();
  }
  private openConfirmation(action: { kind: 'choice'; value: Choice } | { kind: 'reset' }): void {
    this.pending.set(action);
    this.dialog()?.nativeElement.showModal();
    this.dialog()?.nativeElement.querySelector<HTMLElement>('#cli-full-access-title')?.focus();
  }
  protected cancel(event?: Event): void {
    event?.preventDefault();
    this.pending.set(null);
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.returnFocus?.focus();
  }
  protected confirm(): void {
    const action = this.pending();
    this.pending.set(null);
    this.dialog()?.nativeElement.close();
    this.returnFocus?.focus();
    if (action?.kind === 'reset') this.resetRequested.emit();
    else if (action?.kind === 'choice') this.selected.emit(action.value);
  }
}
