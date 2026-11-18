import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  NativePopoverComponent,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahFieldGridDirective,
  PtahFieldTriggerDirective,
  PtahIconButtonDirective,
  PtahRichSelectComponent,
} from '@ptah-extension/ui';
import type {
  CliAdapterManifest,
  CliLaneDefaults,
  CliType,
  LaneNetworkMode,
  LanePermissionMode,
} from '@ptah-extension/shared';
import {
  CLI_LANE_DEFAULT_SCHEMA,
  resolveCliLaneDefaultPair,
} from '@ptah-extension/shared';
import { Ellipsis, LucideAngularModule } from 'lucide-angular';

type Choice = NonNullable<CliLaneDefaults[CliType]>;
const PERMISSIONS: readonly LanePermissionMode[] = [
  'plan',
  'ask',
  'auto-edit',
  'yolo',
];
const NETWORKS: readonly LaneNetworkMode[] = ['deny', 'allow'];
const FULL_ACCESS_WARNING =
  'Full access lets Codex read and change files outside this workspace and use the network without sandbox protection. Commands may affect your computer. Choose this only for runs you trust.';

let nextTitleId = 0;

@Component({
  selector: 'ptah-cli-lane-default-cell',
  standalone: true,
  imports: [
    LucideAngularModule,
    NativePopoverComponent,
    PtahButtonDirective,
    PtahFieldTriggerDirective,
    PtahIconButtonDirective,
    PtahFieldComponent,
    PtahFieldGridDirective,
    PtahRichSelectComponent,
  ],
  // Layout comes from the host data-layout attribute, not class bindings (ui-class-audit). Spacing uses --ptah-* tokens.
  host: { '[attr.data-layout]': 'layout()' },
  styles: `
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
    :host([data-layout='wide']),
    :host([data-layout='card']) {
      width: 100%;
    }
    /* fit-content, not max-content: a long "Unavailable — reason" line wraps in a narrow table column
       instead of setting the column's minimum width. white-space: normal overrides the table control
       cell's nowrap, which otherwise lets the line run into the next columns (TASK_2026_2256, 1440). */
    :host([data-layout='compact']) {
      width: 100%;
      white-space: normal;
    }
    :host([data-layout='card']) {
      display: contents;
    }
    .defaults-reset {
      position: absolute;
      top: var(--ptah-space-2);
      right: 0;
    }
    .defaults-warning {
      grid-column: 1 / -1;
      min-width: 0;
    }
    dialog.modal:not([open]) {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (layout() === 'card') {
      @if (saved() && (layout() !== 'compact' || showCaption())) {
        <ptah-native-popover
          class="defaults-reset"
          [isOpen]="resetOpen()"
          placement="bottom-end"
          [hasBackdrop]="true"
          backdropClass="transparent"
          (closed)="resetOpen.set(false)"
        >
          <button
            trigger
            type="button"
            ptahIconButton
            size="xs"
            label="More default actions"
            [attr.aria-expanded]="resetOpen()"
            (click)="resetOpen.set(!resetOpen())"
          >
            <lucide-angular
              [img]="EllipsisIcon"
              class="size-3.5"
              aria-hidden="true"
            /><span class="sr-only">More default actions</span>
          </button>
          @if (resetOpen()) {
            <div content class="p-[var(--ptah-gap-controls)]">
              <button
                type="button"
                ptahButton
                variant="ghost"
                [disabled]="disabled() || pending() !== null"
                (click)="requestReset()"
              >
                Reset to default ({{ resetDescription() }})
              </button>
            </div>
          }
        </ptah-native-popover>
      }
      <ptah-field label="Permission" size="sm" class="min-w-0">
        @if (permissions().length) {
          <ptah-select
            #permissionSelect
            class="w-full min-w-0"
            size="sm"
            [label]="name() + ' permission default'"
            [title]="effectivePermission() ?? ''"
            [options]="permissionOptions()"
            [value]="effectivePermission() ?? null"
            placeholder="Choose"
            [disabled]="disabled() || pending() !== null"
            (valueChange)="
              choosePermission($event, permissionSelect.element.nativeElement);
              restoreSelection(permissionSelect, effectivePermission() ?? null)
            "
          />
        } @else {
          <button
            ptahFieldTrigger
            type="button"
            disabled
            class="text-base-content-muted"
            [title]="reason()"
          >
            Unavailable
          </button>
        }
      </ptah-field>
      <ptah-field
        label="Network"
        size="sm"
        class="min-w-0"
        [hint]="!networks().length ? reason() : ''"
      >
        @if (networks().length) {
          <ptah-select
            #networkSelect
            class="w-full min-w-0"
            size="sm"
            [label]="name() + ' network default'"
            [title]="effectiveNetwork() ?? ''"
            [options]="networkOptions()"
            [value]="effectiveNetwork() ?? null"
            placeholder="Choose"
            [disabled]="disabled() || pending() !== null"
            (valueChange)="
              chooseNetwork($event, networkSelect.element.nativeElement);
              restoreSelection(networkSelect, effectiveNetwork() ?? null)
            "
          />
        } @else {
          <button
            ptahFieldTrigger
            type="button"
            disabled
            class="text-base-content-muted"
            [title]="reason()"
          >
            Unavailable
          </button>
        }
      </ptah-field>
      @if (
        (networks().length || saved()) && unsupportedCombination();
        as warningText
      ) {
        <span class="defaults-warning text-base-content-muted" role="status"
          >⚠ Unsupported combination: {{ warningText }}</span
        >
      }
    } @else {
      <div
        class="flex min-w-0 max-w-full flex-col gap-[var(--ptah-gap-controls)] text-xs text-base-content [overflow-wrap:anywhere]"
      >
        @if (showCaption() && cli() === 'ptah-cli') {
          <span>Shared by all Ptah CLI providers</span>
        }
        @if (showCaption() && cli() === 'codex') {
          <span
            >Same setting as Codex sandbox in Providers › OpenAI Codex ›
            Credentials.</span
          >
        }
        @if (showCaption()) {
          <span>{{
            saved() ? 'Saved default' : 'Auto (default) · built-in'
          }}</span>
        }
        @if (saved() && (layout() !== 'compact' || showCaption())) {
          <ptah-native-popover
            [isOpen]="resetOpen()"
            placement="bottom-start"
            [hasBackdrop]="true"
            backdropClass="transparent"
            (closed)="resetOpen.set(false)"
          >
            <button
              trigger
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              [attr.aria-expanded]="resetOpen()"
              (click)="resetOpen.set(!resetOpen())"
            >
              More default actions
            </button>
            @if (resetOpen()) {
              <div content class="p-[var(--ptah-gap-controls)]">
                <button
                  type="button"
                  ptahButton
                  variant="ghost"
                  [disabled]="disabled() || pending() !== null"
                  (click)="requestReset()"
                >
                  Reset to default ({{ resetDescription() }})
                </button>
              </div>
            }
          </ptah-native-popover>
        }
        @if (
          (layout() !== 'compact' || showCaption()) && unsupportedCombination();
          as reason
        ) {
          <span role="status" [title]="'Unsupported combination: ' + reason"
            ><span aria-hidden="true">&#9888;</span
            ><span class="sr-only"
              >Unsupported combination: {{ reason }}</span
            ></span
          >
        }
        <div ptahFieldGrid>
          @if (field() !== 'network' && permissions().length) {
            <!-- Visible label from ptah-field; the aria-label keeps the provider name in the accessible name. -->
            @if (layout() === 'compact') {
              <ptah-select
                #permissionSelect
                class="w-full min-w-0"
                size="sm"
                [label]="name() + ' permission default'"
                [title]="effectivePermission() ?? ''"
                [options]="permissionOptions()"
                [value]="effectivePermission() ?? null"
                placeholder="Choose"
                [disabled]="disabled() || pending() !== null"
                (valueChange)="
                  choosePermission(
                    $event,
                    permissionSelect.element.nativeElement
                  );
                  restoreSelection(
                    permissionSelect,
                    effectivePermission() ?? null
                  )
                "
              />
            } @else {
              <ptah-field label="Permission" class="min-w-0"
                ><ptah-select
                  #permissionSelect
                  class="w-full min-w-0"
                  size="sm"
                  [label]="name() + ' permission default'"
                  [title]="effectivePermission() ?? ''"
                  [options]="permissionOptions()"
                  [value]="effectivePermission() ?? null"
                  placeholder="Choose"
                  [disabled]="disabled() || pending() !== null"
                  (valueChange)="
                    choosePermission(
                      $event,
                      permissionSelect.element.nativeElement
                    );
                    restoreSelection(
                      permissionSelect,
                      effectivePermission() ?? null
                    )
                  "
              /></ptah-field>
            }
            @if (cli() === 'cursor' && layout() !== 'compact') {
              @for (mode of unavailablePermissions(); track mode.mode) {
                <span class="text-base-content" tabindex="0"
                  >{{ mode.mode }} unavailable: {{ mode.reason }}</span
                >
              }
            }
          } @else if (field() !== 'network') {
            <span
              class="text-xs text-base-content-muted"
              tabindex="0"
              [title]="reason()"
              >Unavailable<span class="sr-only">{{ reason() }}</span></span
            >
          }
          @if (field() !== 'permission' && networks().length) {
            @if (layout() === 'compact') {
              <ptah-select
                #networkSelect
                class="w-full min-w-0"
                size="sm"
                [label]="name() + ' network default'"
                [title]="effectiveNetwork() ?? ''"
                [options]="networkOptions()"
                [value]="effectiveNetwork() ?? null"
                placeholder="Choose"
                [disabled]="disabled() || pending() !== null"
                (valueChange)="
                  chooseNetwork($event, networkSelect.element.nativeElement);
                  restoreSelection(networkSelect, effectiveNetwork() ?? null)
                "
              />
            } @else {
              <ptah-field label="Network" class="min-w-0"
                ><ptah-select
                  #networkSelect
                  class="w-full min-w-0"
                  size="sm"
                  [label]="name() + ' network default'"
                  [title]="effectiveNetwork() ?? ''"
                  [options]="networkOptions()"
                  [value]="effectiveNetwork() ?? null"
                  placeholder="Choose"
                  [disabled]="disabled() || pending() !== null"
                  (valueChange)="
                    chooseNetwork($event, networkSelect.element.nativeElement);
                    restoreSelection(networkSelect, effectiveNetwork() ?? null)
                  "
              /></ptah-field>
            }
          } @else if (field() !== 'permission') {
            <span
              class="text-xs text-base-content-muted"
              tabindex="0"
              [title]="reason()"
              >Unavailable<span class="sr-only">{{ reason() }}</span></span
            >
          }
        </div>
      </div>
    }
    <dialog
      #confirmation
      class="modal"
      (cancel)="cancel($event)"
      (close)="cancel()"
      [attr.aria-labelledby]="titleId"
    >
      <div
        class="modal-box border border-base-content/60 bg-base-100 text-base-content"
      >
        <h3 [id]="titleId" tabindex="-1" class="text-base font-semibold">
          Confirm full access
        </h3>
        <p class="mt-[var(--ptah-gap-heading)] text-sm">
          {{
            cli() === 'codex'
              ? warning
              : 'Full auto can approve every action. Network access may let the lane reach external services. Choose this only for runs you trust.'
          }}
        </p>
        <div class="modal-action">
          <button type="button" ptahButton variant="ghost" (click)="cancel()">
            Cancel</button
          ><button
            type="button"
            class="btn btn-warning btn-sm"
            (click)="confirm()"
          >
            Confirm
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class CliLaneDefaultCellComponent {
  protected readonly EllipsisIcon = Ellipsis;
  readonly cli = input.required<CliType>();
  readonly name = input.required<string>();
  readonly manifest = input<CliAdapterManifest>();
  readonly saved = input<Choice>();
  readonly disabled = input(false);
  /** `compact`: one column at its content width. `wide`: settings row. `card`: full card width, Permission and Network side by side. */
  readonly layout = input<'compact' | 'wide' | 'card'>('compact');
  readonly field = input<'both' | 'permission' | 'network'>('both');
  readonly showCaption = input(true);
  readonly selected = output<Choice>();
  readonly resetRequested = output<void>();
  /** Unique per instance: every provider card renders its own dialog. */
  protected readonly titleId = `cli-full-access-title-${++nextTitleId}`;
  protected readonly warning = FULL_ACCESS_WARNING;
  protected readonly pending = signal<
    { kind: 'choice'; value: Choice } | { kind: 'reset' } | null
  >(null);
  protected readonly resetOpen = signal(false);
  private readonly dialog =
    viewChild<ElementRef<HTMLDialogElement>>('confirmation');
  private returnFocus: HTMLElement | null = null;
  readonly defaultPair = computed(() =>
    this.manifest() ? resolveCliLaneDefaultPair(this.manifest()!, {}) : {},
  );
  readonly effectivePair = computed(() =>
    this.manifest()
      ? resolveCliLaneDefaultPair(this.manifest()!, this.saved())
      : {},
  );
  readonly defaultPermission = computed(() => {
    const pair = this.defaultPair();
    return 'permission' in pair ? pair.permission : undefined;
  });
  readonly resetDescription = computed(() =>
    this.defaultPermission() === 'yolo'
      ? 'Auto — full access'
      : (this.defaultPermission() ?? 'Auto'),
  );
  readonly unsupportedCombination = computed(() => {
    const pair = this.effectivePair();
    return 'unsupported' in pair ? pair.unsupported : null;
  });
  readonly permissions = computed(() =>
    PERMISSIONS.filter(
      (mode) =>
        this.manifest()?.permissionModes[mode]?.state === 'supported' &&
        NETWORKS.some(
          (network) =>
            this.manifest()?.networkModes[network].state === 'supported' &&
            this.manifest()?.permissionModes[mode]?.networkModes.includes(
              network,
            ),
        ),
    ),
  );
  readonly unavailablePermissions = computed(() =>
    PERMISSIONS.flatMap((mode) => {
      const capability = this.manifest()?.permissionModes[mode];
      return capability?.state === 'unsupported'
        ? [{ mode, reason: capability.reason }]
        : [];
    }),
  );
  readonly effectivePermission = computed(() => {
    const pair = this.effectivePair();
    return 'permission' in pair ? pair.permission : undefined;
  });
  readonly networks = computed(() => {
    const permission = this.effectivePermission();
    return permission
      ? NETWORKS.filter(
          (mode) =>
            this.manifest()?.networkModes[mode].state === 'supported' &&
            this.manifest()?.permissionModes[permission]?.networkModes.includes(
              mode,
            ),
        )
      : [];
  });
  readonly effectiveNetwork = computed(() => {
    const pair = this.effectivePair();
    return 'network' in pair ? pair.network : undefined;
  });
  readonly reason = computed(
    () =>
      Object.values(this.manifest()?.permissionModes ?? {}).find(
        (value) => value?.reason,
      )?.reason ??
      Object.values(this.manifest()?.networkModes ?? {}).find(
        (value) => value?.reason,
      )?.reason ??
      'No verified mode is available.',
  );
  readonly cardWarning = computed(() =>
    this.unsupportedCombination()
      ? `Unsupported combination: ${this.unsupportedCombination()}`
      : this.permissions().length === 0 || this.networks().length === 0
        ? this.reason()
        : null,
  );
  readonly permissionOptions = computed(() =>
    this.permissions().map((value) => ({ value, label: value })),
  );
  readonly networkOptions = computed(() =>
    this.networks().map((value) => ({ value, label: value })),
  );
  private restoring = false;
  protected restoreSelection<T>(
    select: PtahRichSelectComponent<T>,
    value: T | null,
  ): void {
    this.restoring = true;
    try {
      select.value.set(value);
    } finally {
      this.restoring = false;
    }
  }
  protected choosePermission(value: unknown, trigger?: HTMLElement): void {
    if (this.restoring) return;
    this.returnFocus =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const parsed = CLI_LANE_DEFAULT_SCHEMA.shape.permission.safeParse(value);
    if (
      !parsed.success ||
      !parsed.data ||
      !this.permissions().includes(parsed.data)
    )
      return;
    const permission = parsed.data;
    const network = NETWORKS.find(
      (mode) =>
        this.manifest()?.networkModes[mode].state === 'supported' &&
        this.manifest()?.permissionModes[permission]?.networkModes.includes(
          mode,
        ),
    );
    const currentNetwork = this.effectiveNetwork();
    this.propose({
      permission,
      ...(network
        ? {
            network:
              currentNetwork &&
              this.manifest()?.permissionModes[
                permission
              ]?.networkModes.includes(currentNetwork)
                ? currentNetwork
                : network,
          }
        : {}),
    });
  }
  protected chooseNetwork(value: unknown, trigger?: HTMLElement): void {
    if (this.restoring) return;
    this.returnFocus =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const parsed = CLI_LANE_DEFAULT_SCHEMA.shape.network.safeParse(value);
    if (parsed.success && parsed.data && this.networks().includes(parsed.data))
      this.propose({
        permission: this.effectivePermission(),
        network: parsed.data,
      });
  }
  private propose(choice: Choice): void {
    if (choice.permission === 'yolo')
      this.openConfirmation({ kind: 'choice', value: choice });
    else this.selected.emit(choice);
  }
  protected requestReset(): void {
    this.resetOpen.set(false);
    if (this.defaultPermission() === 'yolo')
      this.openConfirmation({ kind: 'reset' });
    else this.resetRequested.emit();
  }
  private openConfirmation(
    action: { kind: 'choice'; value: Choice } | { kind: 'reset' },
  ): void {
    this.pending.set(action);
    this.dialog()?.nativeElement.showModal();
    this.dialog()
      ?.nativeElement.querySelector<HTMLElement>(`#${this.titleId}`)
      ?.focus();
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
