import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  ReviewLaneEntry,
  ReviewLaneListing,
  ReviewLaneListState,
  ReviewLanePins,
  ReviewLaneSettings,
} from '@ptah-extension/review-contracts';
import {
  NativePopoverComponent,
  PtahAlertComponent,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahSkeletonComponent,
} from '@ptah-extension/ui';
import { Info, LucideAngularModule, Route } from 'lucide-angular';
import { ReviewLanePinsComponent } from './review-lane-pins.component';
import { ReviewLanePoolComponent } from './review-lane-pool.component';
import {
  LANE_HINTS,
  allCatalogsFailed,
  usableListing,
} from './review-lane-options';

/**
 * "Review lanes" section of the review settings drawer: header with info popover, lane-list
 * status, the ordered pool, the six pins and the section save error. Presentational: it emits the
 * whole next `ReviewLaneSettings` value and never mutates its input.
 */
@Component({
  selector: 'ptah-review-lanes-section',
  standalone: true,
  imports: [
    LucideAngularModule,
    NativePopoverComponent,
    PtahAlertComponent,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahSkeletonComponent,
    ReviewLanePinsComponent,
    ReviewLanePoolComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="mt-5 min-w-0 border-t border-base-300 pt-5" [disabled]="saving()">
      <section aria-labelledby="review-lanes-h">
        <div class="flex items-center gap-2">
          <lucide-angular [img]="RouteIcon" class="size-4 text-base-content-muted" aria-hidden="true" />
          <h3 id="review-lanes-h" class="text-sm font-semibold">Review lanes</h3>
          <ptah-native-popover [isOpen]="infoOpen()" placement="bottom-start" (closed)="infoOpen.set(false)">
            <button
              trigger
              type="button"
              ptahIconButton
              variant="ghost"
              size="xs"
              label="About review lanes"
              aria-haspopup="dialog"
              [attr.aria-expanded]="infoOpen()"
              [attr.aria-controls]="infoOpen() ? infoPanelId : null"
              (click)="toggleInfo($event)"
            >
              <lucide-angular [img]="InfoIcon" class="size-3.5" aria-hidden="true" />
            </button>
            <div
              content
              role="dialog"
              aria-label="About review lanes"
              class="max-w-xs p-2 text-xs"
              [id]="infoPanelId"
            >
              {{ infoText }}
            </div>
          </ptah-native-popover>
        </div>

        @if (storedCorrupt()) {
          <div class="mt-2" data-testid="review-lanes-corrupt">
            <ptah-alert tone="warning" [compact]="true" live="polite">{{ storedCorruptText }}</ptah-alert>
          </div>
        }
        @if (listState() === 'loading') {
          <div class="mt-2" role="status" aria-label="Loading review lanes">
            <ptah-skeleton [lines]="1" size="sm" />
          </div>
        } @else {
          @if (listState() === 'error') {
            <div class="mt-2">
              <ptah-alert tone="error" [compact]="true" live="assertive">
                {{ listErrorText }}
                <button alertAction type="button" ptahButton variant="ghost" size="xs" (click)="retry.emit()">
                  Retry
                </button>
              </ptah-alert>
            </div>
          } @else if (catalogsFailed()) {
            <p class="mt-2 text-xs text-base-content-muted">{{ catalogsFailedText }}</p>
          }
          @if (empty()) {
            <p class="mt-2 text-xs text-base-content-muted">{{ emptyText }}</p>
          }

          <ptah-review-lane-pool
            [pool]="lanes().pool"
            [listing]="rowListing()"
            [showDuplicates]="saveError() !== null"
            (poolChanged)="setPool($event)"
            (announced)="announcement.set($event)"
          />
          <ptah-review-lane-pins
            [pins]="lanes().pins"
            [listing]="rowListing()"
            (pinsChanged)="setPins($event)"
            (announced)="announcement.set($event)"
          />

          @if (saveError()) {
            <p class="mt-3 flex items-center gap-1.5 text-xs text-base-content" role="alert">
              <span class="inline-block size-2 shrink-0 bg-state-err" aria-hidden="true"></span>{{ saveError() }}
            </p>
          }
        }
        <p class="sr-only" role="status" aria-live="polite">{{ announcement() }}</p>
      </section>
    </fieldset>
  `,
})
export class ReviewLanesSectionComponent {
  readonly lanes = input.required<ReviewLaneSettings>();
  readonly listing = input<ReviewLaneListing | null>(null);
  readonly listState = input<ReviewLaneListState>('idle');
  readonly saving = input(false, { transform: booleanAttribute });
  /** The host could not read the stored lane document; saving replaces it. */
  readonly storedCorrupt = input(false, { transform: booleanAttribute });
  /** The lanes save error ("Review lanes were not saved: …"), or `null`. */
  readonly saveError = input<string | null>(null);
  readonly lanesChanged = output<ReviewLaneSettings>();
  readonly retry = output<void>();

  protected readonly RouteIcon = Route;
  protected readonly InfoIcon = Info;
  protected readonly infoPanelId = 'review-lanes-info-panel';
  protected readonly infoText =
    'Choose which lanes review a pull request. Lenses spread across lane families when the pool has more ' +
    'than one. The verifier avoids the families that wrote its candidates. A lane turned off in global ' +
    'settings stays off.';
  protected readonly listErrorText = LANE_HINTS.listError;
  protected readonly storedCorruptText = LANE_HINTS.storedCorrupt;
  protected readonly catalogsFailedText = LANE_HINTS.allCatalogsFailed;
  protected readonly emptyText = LANE_HINTS.empty;

  protected readonly infoOpen = signal(false);
  protected readonly announcement = signal('');
  protected readonly rowListing = computed(() => usableListing(this.listing(), this.listState()));
  protected readonly catalogsFailed = computed(() => allCatalogsFailed(this.rowListing()));
  protected readonly empty = computed(
    () => this.lanes().pool.length === 0 && Object.keys(this.lanes().pins).length === 0,
  );

  toggleInfo(event: MouseEvent): void {
    // The popover restores the element focused on open, so focus the trigger first (as ptah-field does).
    if (event.currentTarget instanceof HTMLButtonElement) event.currentTarget.focus();
    this.infoOpen.update((open) => !open);
  }

  setPool(pool: ReviewLaneEntry[]): void {
    this.lanesChanged.emit({ pool, pins: this.lanes().pins });
  }

  setPins(pins: ReviewLanePins): void {
    this.lanesChanged.emit({ pool: this.lanes().pool, pins });
  }
}
