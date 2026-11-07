import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CliAdapterManifest, CliLaneDefaults, CliType, LaneNetworkMode, LanePermissionMode } from '@ptah-extension/shared';
import { CLI_LANE_DEFAULT_SCHEMA, resolveCliLaneDefaultPair } from '@ptah-extension/shared';

type Choice = NonNullable<CliLaneDefaults[CliType]>;
const PERMISSIONS: readonly LanePermissionMode[] = ['plan', 'ask', 'auto-edit', 'yolo'];
const NETWORKS: readonly LaneNetworkMode[] = ['deny', 'allow'];
const FULL_ACCESS_WARNING = 'Full access lets Codex read and change files outside this workspace and use the network without sandbox protection. Commands may affect your computer. Choose this only for runs you trust.';

@Component({
  selector: 'ptah-cli-lane-default-cell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex w-[4.75rem] min-w-0 max-w-full flex-col gap-1 text-xs text-base-content [overflow-wrap:anywhere]">
      @if (cli() === 'ptah-cli') { <span>Shared by all Ptah CLI providers</span> }
      @if (cli() === 'codex') { <span>This is the same setting as Codex sandbox in Orchestration.</span> }
      <span>{{ saved() ? 'Saved default' : 'Auto (default) · built-in' }}</span>
      @if (saved()) { <button type="button" class="btn btn-ghost btn-xs h-auto min-h-6 max-w-full whitespace-normal px-1 py-0.5" [disabled]="disabled() || pending() !== null" (click)="requestReset()">Reset to default ({{ resetDescription() }})</button> }
      @if (unsupportedCombination(); as reason) { <span role="status">Unsupported combination: {{ reason }}</span> }
      @if (permissions().length) {
        <label class="flex flex-col gap-0.5">Permission
          <select class="select select-bordered select-xs w-full min-w-0 max-w-full text-base-content" [attr.aria-label]="name() + ' permission default'" [title]="effectivePermission()"
            [value]="effectivePermission()" [disabled]="disabled() || pending() !== null" (change)="choosePermission($event)">
            @for (mode of permissions(); track mode) { <option [value]="mode">{{ mode }}</option> }
          </select>
        </label>
      } @else { <span tabindex="0" [title]="reason()">Permission: Unavailable — {{ reason() }}</span> }
      @if (networks().length) {
        <label class="flex flex-col gap-0.5">Network
          <select class="select select-bordered select-xs w-full min-w-0 max-w-full text-base-content" [attr.aria-label]="name() + ' network default'" [title]="effectiveNetwork()"
            [value]="effectiveNetwork()" [disabled]="disabled() || pending() !== null" (change)="chooseNetwork($event)">
            @for (mode of networks(); track mode) { <option [value]="mode">{{ mode }}</option> }
          </select>
        </label>
      } @else { <span tabindex="0" [title]="reason()">Network: Unavailable — {{ reason() }}</span> }
      @if (pending()) {
        <div role="alert" class="rounded border border-warning p-2 text-base-content">
          <p>{{ cli() === 'codex' ? warning : 'Full auto can approve every action. Network access may let the lane reach external services. Choose this only for runs you trust.' }}</p>
          <button type="button" class="btn btn-warning btn-xs" (click)="confirm()">Confirm</button>
          <button type="button" class="btn btn-ghost btn-xs" (click)="pending.set(null)">Cancel</button>
        </div>
      }
    </div>
  `,
})
export class CliLaneDefaultCellComponent {
  readonly cli = input.required<CliType>();
  readonly name = input.required<string>();
  readonly manifest = input<CliAdapterManifest>();
  readonly saved = input<Choice>();
  readonly disabled = input(false);
  readonly selected = output<Choice>();
  readonly resetRequested = output<void>();
  protected readonly warning = FULL_ACCESS_WARNING;
  protected readonly pending = signal<{ kind: 'choice'; value: Choice } | { kind: 'reset' } | null>(null);
  readonly defaultPair = computed(() => this.manifest() ? resolveCliLaneDefaultPair(this.manifest()!, {}) : {});
  readonly effectivePair = computed(() => this.manifest() ? resolveCliLaneDefaultPair(this.manifest()!, this.saved()) : {});
  readonly defaultPermission = computed(() => { const pair = this.defaultPair(); return 'permission' in pair ? pair.permission : undefined; });
  readonly resetDescription = computed(() => this.defaultPermission() === 'yolo' ? 'Auto — full access' : this.defaultPermission() ?? 'Auto');
  readonly unsupportedCombination = computed(() => { const pair = this.effectivePair(); return 'unsupported' in pair ? pair.unsupported : null; });
  readonly permissions = computed(() => PERMISSIONS.filter(mode => this.manifest()?.permissionModes[mode]?.state === 'supported' &&
    NETWORKS.some(network => this.manifest()?.networkModes[network].state === 'supported' && this.manifest()?.permissionModes[mode]?.networkModes.includes(network))));
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
    const parsed = CLI_LANE_DEFAULT_SCHEMA.shape.network.safeParse(event.target.value);
    event.target.value = this.effectiveNetwork() ?? '';
    if (parsed.success && parsed.data && this.networks().includes(parsed.data)) this.propose({ permission: this.effectivePermission(), network: parsed.data });
  }
  private propose(choice: Choice): void {
    if (choice.permission === 'yolo') this.pending.set({ kind: 'choice', value: choice });
    else this.selected.emit(choice);
  }
  protected requestReset(): void {
    if (this.defaultPermission() === 'yolo') this.pending.set({ kind: 'reset' });
    else this.resetRequested.emit();
  }
  protected confirm(): void {
    const action = this.pending();
    this.pending.set(null);
    if (action?.kind === 'reset') this.resetRequested.emit();
    else if (action?.kind === 'choice') this.selected.emit(action.value);
  }
}
