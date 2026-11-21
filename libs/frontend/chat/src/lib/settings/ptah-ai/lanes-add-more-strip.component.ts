import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import type { CliType } from '@ptah-extension/shared';
import {
  NativePopoverComponent,
  PtahButtonDirective,
  PtahDisclosureComponent,
} from '@ptah-extension/ui';
import {
  BookOpen,
  CircleDashed,
  LucideAngularModule,
  PackagePlus,
} from 'lucide-angular';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import { CliCapabilityDetailComponent } from './cli-capability-detail.component';
import { CliProviderCardPopoversComponent } from './cli-provider-card-popovers.component';
import { LanesRedetectButtonComponent } from './lanes-redetect-button.component';

/**
 * "Add more CLI agents" (decision 8): the system CLIs that detection reports as not installed, as small cards
 * under the Lanes table. Each card has an Install guide popover (command, note, Re-detect; U-2..U-7) and a
 * read-only "Details" disclosure (provider, native behavior, capabilities; decision 20, U-8, U-10, U-14).
 * The strip owns which popover is open and the focus return when it closes without a successful re-detect.
 * The host hides the strip in Reorder mode.
 */
@Component({
  selector: 'ptah-lanes-add-more-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    NativePopoverComponent,
    PtahButtonDirective,
    PtahDisclosureComponent,
    CliCapabilityDetailComponent,
    CliProviderCardPopoversComponent,
    LanesRedetectButtonComponent,
  ],
  host: { class: 'block' },
  styles: `
    .lanes-strip {
      display: flex;
      flex-direction: column;
      gap: var(--ptah-gap-controls);
      padding-block-start: var(--ptah-gap-controls);
      border-top: var(--ptah-border-width) solid var(--ptah-card-border);
    }
    .lanes-strip-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ptah-gap-inline);
      margin: 0;
      font-size: var(--ptah-text-group-title-size);
      font-weight: 600;
    }
    .lanes-strip-count {
      color: var(--color-base-content-muted);
      font-weight: 400;
    }
    .lanes-strip-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
      gap: var(--ptah-gap-inline);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .lanes-strip-card {
      display: flex;
      flex-direction: column;
      gap: var(--ptah-gap-inline);
      min-width: 0;
      padding: var(--ptah-gap-controls);
      background: var(--ptah-card-bg-inset);
      border: var(--ptah-border-width) solid var(--ptah-card-border);
      border-radius: var(--ptah-card-radius-inset);
    }
    .lanes-strip-identity {
      display: flex;
      align-items: center;
      gap: var(--ptah-gap-inline);
      min-width: 0;
    }
    .lanes-strip-monogram {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: var(--ptah-card-radius-inset);
      border: var(--ptah-border-width) solid var(--ptah-card-border);
      font-size: var(--ptah-text-caption-size);
      font-weight: 600;
      color: var(--color-base-content-muted);
    }
    .lanes-strip-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }
    .lanes-strip-state {
      display: inline-flex;
      align-items: center;
      gap: var(--ptah-gap-inline);
      font-size: var(--ptah-text-caption-size);
      color: var(--color-base-content-muted);
    }
    .lanes-strip-icon {
      display: inline-flex;
      flex-shrink: 0;
      width: 0.875rem;
      height: 0.875rem;
    }
    .lanes-strip-details {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ptah-gap-inline);
      margin: 0;
      font-size: var(--ptah-text-caption-size);
    }
    .lanes-strip-details dt {
      color: var(--color-base-content-muted);
    }
    .lanes-strip-details dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .lanes-strip-capabilities {
      position: static;
      max-width: none;
    }
  `,
  template: `
    @if (rows().length > 0) {
      <section
        class="lanes-strip"
        data-testid="lanes-strip"
        aria-labelledby="lanes-strip-title"
      >
        <h3 id="lanes-strip-title" class="lanes-strip-header">
          <lucide-angular [img]="PackageIcon" class="lanes-strip-icon" aria-hidden="true" />
          Add more CLI agents
          <span class="lanes-strip-count" data-testid="lanes-strip-count">{{ rows().length }}</span>
          <ptah-lanes-redetect-button testId="lanes-strip-redetect" />
        </h3>
        <ul class="lanes-strip-grid">
          @for (row of rows(); track row.id) {
            <li
              class="lanes-strip-card"
              [attr.data-testid]="'cli-provider-card-' + row.id"
            >
              <div class="lanes-strip-identity">
                <span class="lanes-strip-monogram" aria-hidden="true">{{ monogram(row.name) }}</span>
                <span class="lanes-strip-name" [title]="row.name">{{ row.name }}</span>
              </div>
              <span class="lanes-strip-state">
                <lucide-angular [img]="DashedIcon" class="lanes-strip-icon" aria-hidden="true" />
                Not installed
              </span>
              <ptah-native-popover
                [isOpen]="openId() === row.id"
                [keepInViewport]="true"
                placement="bottom-start"
                [hasBackdrop]="true"
                backdropClass="transparent"
                (closed)="close(row.id)"
              >
                <button
                  trigger
                  type="button"
                  ptahButton
                  variant="outline"
                  size="sm"
                  data-popover-kind="install"
                  [attr.data-testid]="'lanes-strip-install-' + row.id"
                  [attr.aria-expanded]="openId() === row.id"
                  (click)="toggle(row.id)"
                >
                  <lucide-angular [img]="InstallIcon" class="lanes-strip-icon" aria-hidden="true" />
                  Install
                </button>
                @if (openId() === row.id) {
                  <ptah-cli-provider-card-popovers
                    content
                    [row]="row"
                    kind="install"
                    [guide]="guides()[row.cli]"
                    [busy]="busy()"
                    (redetectRequested)="redetect.emit($event)"
                    (closed)="close(row.id)"
                  />
                }
              </ptah-native-popover>
              <ptah-disclosure label="Details" size="sm" [attr.data-strip-details]="row.id">
                <dl class="lanes-strip-details">
                  <dt>Provider</dt>
                  <dd>{{ row.provider ?? 'CLI default' }}</dd>
                  <dt>Native behavior</dt>
                  <dd>{{ row.permission.detail }}</dd>
                </dl>
                <ptah-cli-capability-detail class="lanes-strip-capabilities" [manifest]="row.manifest" />
              </ptah-disclosure>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class LanesAddMoreStripComponent {
  protected readonly PackageIcon = PackagePlus;
  protected readonly DashedIcon = CircleDashed;
  protected readonly InstallIcon = BookOpen;

  /** System CLIs with `status.kind === 'not-installed'`, in detection order (`CliMatrixRows.uninstalled`). */
  readonly rows = input.required<readonly SystemCliMatrixRow[]>();
  readonly guides = input.required<
    Readonly<
      Partial<
        Record<
          CliType,
          { readonly command: string | null; readonly note: string }
        >
      >
    >
  >();
  readonly busy = input(false);
  /** Row id, from the install popover's Re-detect (U-6). */
  readonly redetect = output<string>();

  /** The card whose install popover is open (one at a time). */
  protected readonly openId = signal<string | null>(null);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Closes the popover of that card when it is open (U-7: the host calls it after a successful re-detect). */
  closeGuide(rowId: string): void {
    if (this.openId() === rowId) this.openId.set(null);
  }

  protected toggle(rowId: string): void {
    if (this.openId() === rowId) this.close(rowId);
    else this.openId.set(rowId);
  }

  /** Close without a re-detect (Close, Esc, backdrop): focus returns to the card's Install button. */
  protected close(rowId: string): void {
    if (this.openId() !== rowId) return;
    this.openId.set(null);
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLElement>(`[data-testid="lanes-strip-install-${rowId}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected monogram(name: string): string {
    return name.trim().slice(0, 1).toUpperCase();
  }
}
