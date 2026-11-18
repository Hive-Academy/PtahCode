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
} from '@angular/core';
import type { CliType } from '@ptah-extension/shared';
import {
  NativePopoverComponent,
  PtahButtonDirective,
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
import { CliCapabilityCellsComponent } from './cli-capability-cells.component';
import { cliCapabilityView } from './cli-capability-view';

@Component({
  selector: 'ptah-lanes-table-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NativePopoverComponent,
    PtahButtonDirective,
    PtahTableDetailLayoutComponent,
    ClaudeLaneAccountCellComponent,
    CursorCredentialPopoverComponent,
    CliProviderCardPopoversComponent,
    CliCapabilityCellsComponent,
  ],
  styles: `
    :host {
      display: block;
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    :host dl[ptahDetailFacts] {
      grid-template-columns: fit-content(9rem) minmax(0, 1fr);
      font-size: 0.875rem;
      color: var(--color-base-content);
      align-items: center;
    }
    dt,
    dd {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    [ptahDetailActions] {
      min-width: 0;
    }
    .quiet-actions {
      display: contents;
      flex-wrap: nowrap;
      align-items: center;
      gap: var(--ptah-gap-inline);
      min-width: 0;
    }
    .quiet-actions.system-actions {
      display: contents;
    }
    .test-action {
      display: contents;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ptah-gap-inline);
      min-width: 0;
    }
  `,
  template: `
    <ptah-table-detail-layout mode="list">
      <dl
        ptahDetailFacts
        [attr.aria-label]="row().name + ' details'"
        data-testid="cli-provider-facts"
      >
        <ng-content select="[laneFacts]" />
        @if (systemRow(); as system) {
          @if (system.versionLabel) {
            <dt>Version</dt>
            <dd>
              <span [title]="system.version ?? ''">{{
                system.versionLabel
              }}</span>
            </dd>
          }
          @if (system.codexStatusLine) {
            <dt>Executable</dt>
            <dd>{{ system.codexStatusLine }}</dd>
          }
          <dt>Provider</dt>
          <dd>{{ system.provider ?? 'CLI default' }}</dd>
          <dt>Native CLI behavior</dt>
          <dd
            title="Built-in behavior of this CLI. Lanes that Ptah spawns use the Lane default below; a parent session in Plan Mode caps them to Plan."
          >
            <ptah-native-popover
              [isOpen]="isOpen('permission')"
              [keepInViewport]="true"
              placement="bottom-start"
              [hasBackdrop]="true"
              backdropClass="transparent"
              (closed)="popoverClosed.emit()"
            >
              <button
                trigger
                type="button"
                ptahButton
                variant="link"
                noPadding
                size="sm"
                data-popover-kind="permission"
                [title]="system.permission.detail"
                [attr.aria-expanded]="isOpen('permission')"
                (click)="kindToggled.emit('permission')"
              >
                {{ system.permission.badge }}
              </button>
              @if (isOpen('permission')) {
                <ptah-cli-provider-card-popovers
                  content
                  [row]="system"
                  kind="permission"
                  (closed)="popoverClosed.emit()"
                />
              }
            </ptah-native-popover>
          </dd>

          @if (system.cli === 'claude' && system.installed) {
            @if (accountCell.visible()) {
              <dt>Account</dt>
            }
            <dd
              class="ptah-table-control-cell"
              [hidden]="!accountCell.visible()"
            >
              <ptah-claude-lane-account-cell #accountCell [showLabel]="false" />
            </dd>
          }
        } @else if (instanceRow(); as instance) {
          <dt>Provider</dt>
          <dd>{{ instance.provider }}</dd>
          @if (
            instance.keyStatus?.kind !== 'missing' && instance.keyStatus;
            as keyStatus
          ) {
            <dt>Key</dt>
            <dd data-testid="cli-matrix-key-status">{{ keyStatus.label }}</dd>
          }
          <dt>Tier models</dt>
          <dd>
            <span
              data-testid="cli-matrix-tier-summary"
              class="text-base-content-muted"
            >
              {{
                instance.tiers === null
                  ? 'loading'
                  : instance.tiers.length + ' of 3 set'
              }}
            </span>
            @for (tier of instance.tiers ?? []; track tier.tier) {
              <span class="block" [attr.data-tier]="tier.tier"
                >{{ tier.label }}: {{ tier.model }}</span
              >
            }
          </dd>
        }
      </dl>
      <div ptahDetailChips>
        <ptah-cli-capability-cells
          [manifest]="row().manifest"
          [compact]="true"
        />
      </div>
      <ng-content />
      <div ptahDetailActions>
        <span class="test-action">
          <button
            type="button"
            ptahButton
            variant="outline"
            size="sm"
            [disabled]="busy() || testing() || systemRow()?.installed === false"
            (click)="test.emit()"
          >
            Test
          </button>
          <span
            class="text-sm text-base-content-muted"
            data-testid="cli-matrix-test-result"
            >{{ testing() ? 'Running…' : testResult() || 'Not run yet' }}</span
          >
        </span>
        <div
          class="quiet-actions"
          [class.system-actions]="systemRow() !== null"
        >
          @if (systemRow(); as system) {
            @for (kind of infoKinds; track kind) {
              @if (kind !== 'install' || !system.installed) {
                <ptah-native-popover
                  [isOpen]="isOpen(kind)"
                  [keepInViewport]="true"
                  placement="bottom-start"
                  [hasBackdrop]="true"
                  backdropClass="transparent"
                  (closed)="popoverClosed.emit()"
                >
                  <button
                    trigger
                    type="button"
                    ptahButton
                    variant="ghost"
                    size="sm"
                    [attr.data-popover-kind]="kind"
                    [attr.aria-expanded]="isOpen(kind)"
                    (click)="kindToggled.emit(kind)"
                  >
                    {{
                      kind === 'install'
                        ? 'Install guide'
                        : kind === 'info'
                          ? 'Info'
                          : 'All capabilities'
                    }}
                  </button>
                  @if (isOpen(kind)) {
                    <ptah-cli-provider-card-popovers
                      content
                      [row]="system"
                      [kind]="kind"
                      [detail]="testResult() || system.permission.detail"
                      [guide]="guides()[system.cli]"
                      [busy]="busy()"
                      (redetectRequested)="redetect.emit($event)"
                      (closed)="popoverClosed.emit()"
                    />
                  }
                </ptah-native-popover>
              }
            }
            @if (system.credentialAction) {
              <ptah-native-popover
                [isOpen]="isOpen('credentials')"
                [keepInViewport]="true"
                placement="bottom-start"
                [hasBackdrop]="true"
                backdropClass="transparent"
                (opened)="focusCredentialKey()"
                (closed)="popoverClosed.emit()"
              >
                <button
                  trigger
                  type="button"
                  ptahButton
                  variant="ghost"
                  size="sm"
                  data-popover-kind="credentials"
                  [attr.aria-expanded]="isOpen('credentials')"
                  (click)="kindToggled.emit('credentials')"
                >
                  Credentials
                </button>
                @if (isOpen('credentials')) {
                  <ptah-cursor-credential-popover
                    content
                    (closed)="popoverClosed.emit()"
                  />
                }
              </ptah-native-popover>
            } @else if (system.cli === 'codex') {
              <button
                type="button"
                ptahButton
                variant="ghost"
                size="sm"
                (click)="codexSettings.emit()"
              >
                Codex settings
              </button>
            }
          } @else if (instanceRow(); as instance) {
            <ptah-native-popover
              [isOpen]="isOpen('capabilities')"
              [keepInViewport]="true"
              placement="bottom-start"
              [hasBackdrop]="true"
              backdropClass="transparent"
              (closed)="popoverClosed.emit()"
            >
              <button
                trigger
                type="button"
                ptahButton
                variant="ghost"
                size="sm"
                data-popover-kind="capabilities"
                [attr.aria-expanded]="isOpen('capabilities')"
                [attr.aria-controls]="'instance-capabilities-' + instance.id"
                (click)="kindToggled.emit('capabilities')"
              >
                All capabilities
              </button>
              @if (isOpen('capabilities')) {
                <div
                  content
                  [id]="'instance-capabilities-' + instance.id"
                  class="max-h-72 w-72 overflow-auto text-xs"
                  style="padding: var(--ptah-gap-field)"
                >
                  @for (
                    group of capabilityView(instance).groups;
                    track group.heading
                  ) {
                    <h4
                      class="font-semibold"
                      style="margin-top: var(--ptah-gap-field)"
                    >
                      {{ group.heading }}
                    </h4>
                    @for (line of group.lines; track line.label) {
                      <p
                        style="margin-top: calc(var(--ptah-gap-field) / 2)"
                        [title]="line.reason || ''"
                      >
                        {{ line.label }}: {{ line.value }}
                        @if (line.reason) {
                          · {{ line.reason }}
                        }
                      </p>
                    }
                  }
                </div>
              }
            </ptah-native-popover>
            <button
              type="button"
              ptahButton
              variant="ghost"
              size="sm"
              (click)="tiers.emit(instance)"
            >
              Edit tiers
            </button>
          }
          <ng-content select="[laneActions]" />
        </div>
      </div>
    </ptah-table-detail-layout>
  `,
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
  protected capabilityView(row: InstanceCliMatrixRow) {
    return cliCapabilityView(row.manifest);
  }
}
