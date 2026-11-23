/**
 * ComposerEffortPickerComponent - the composer's reasoning-effort pill and
 * its menu.
 *
 * Presentational only: the owner passes the levels, the selected level and
 * the pending / gated state, and gets the chosen level back. It injects
 * nothing tab- or lane-bound, so main chat (`EffortSelectorComponent`) and the
 * lane composer render the same control without sharing selection state.
 *
 * Markup and classes are main chat's effort selector: the level bars are the
 * pill's icon and the only place the effort colour appears. A gated picker
 * (design-spec 5.1) keeps focus, shows the info glyph in place of the chevron
 * and never opens its menu.
 */

import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { Check, ChevronDown, Info, LucideAngularModule } from 'lucide-angular';
import type { EffortLevel } from '@ptah-extension/shared';
import {
  KeyboardNavigationService,
  NativeDropdownComponent,
  NativeOptionComponent,
} from '@ptah-extension/ui';
import { ComposerGatedControlDirective } from './composer-gated-control.directive';

let nextEffortPickerId = 0;

/** One effort level. `''` is the SDK default. */
export interface ComposerEffortOption {
  readonly value: EffortLevel | '';
  readonly label: string;
  readonly description: string;
  /** Tailwind color class for the level indicator dot and bars. */
  readonly dotColor: string;
  /** Tailwind text color for the selected option's label in the menu. */
  readonly textColor: string;
  /** Number of filled bars (0-5) for the level meter. */
  readonly bars: number;
}

/** Main chat's effort levels, in menu order. */
export const COMPOSER_EFFORT_OPTIONS: readonly ComposerEffortOption[] = [
  {
    value: '',
    label: 'Default',
    description: 'SDK default reasoning effort',
    dotColor: 'bg-base-content/40',
    textColor: 'text-base-content-muted',
    bars: 0,
  },
  {
    value: 'low',
    label: 'Low',
    description: 'Faster responses, less reasoning',
    dotColor: 'bg-info',
    textColor: 'text-info',
    bars: 1,
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Balanced speed and reasoning',
    dotColor: 'bg-success',
    textColor: 'text-success',
    bars: 2,
  },
  {
    value: 'high',
    label: 'High',
    description: 'More thorough reasoning',
    dotColor: 'bg-warning',
    textColor: 'text-warning',
    bars: 3,
  },
  {
    value: 'xhigh',
    label: 'X-High',
    description: 'Extra-deep reasoning (Opus tier)',
    dotColor: 'bg-error/80',
    textColor: 'text-error/90',
    bars: 4,
  },
  {
    value: 'max',
    label: 'Max',
    description: 'Maximum reasoning depth (Opus tier)',
    dotColor: 'bg-error',
    textColor: 'text-error',
    bars: 5,
  },
];

/**
 * Main chat's composer pill. Focus keeps main chat's current pill look (the
 * 1 px ring), not the outline of `COMPOSER_PILL_CLASS` (batch-4-report).
 */
const EFFORT_PILL_CLASS =
  'inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-xs font-normal min-w-0 text-base-content-muted hover:text-base-content hover:bg-base-content/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-base-content/30';

@Component({
  selector: 'ptah-composer-effort-picker',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    NativeDropdownComponent,
    NativeOptionComponent,
    ComposerGatedControlDirective,
  ],
  providers: [KeyboardNavigationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Pill content, shared by the enabled and the gated trigger. -->
    <ng-template #pillContent>
      <!-- Level bars indicator (w-3.5 h-3.5 icon box). Only the fill color
           changes, so transition colors only: transition-all also started
           non-composited scrollbar-color transitions. -->
      <div
        class="flex items-end justify-center gap-px w-3.5 h-3.5 flex-shrink-0"
        aria-hidden="true"
      >
        @for (bar of barSlots; track bar) {
          <div
            [class]="
              'w-[2px] rounded-[1px] transition-colors ' +
              (bar < selectedOption().bars
                ? selectedOption().dotColor
                : 'bg-base-content/20')
            "
            [style.height.px]="4 + bar * 2.5"
          ></div>
        }
      </div>
      @if (pending()) {
        <span
          class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"
          aria-hidden="true"
          data-testid="composer-effort-pending-dot"
        ></span>
      }
      <span class="ptah-composer-label truncate">{{ selectedLabel() }}</span>
      @if (gated()) {
        <lucide-angular
          [img]="InfoIcon"
          class="w-3 h-3 flex-shrink-0 opacity-80"
          aria-hidden="true"
        />
      } @else {
        <lucide-angular
          [img]="ChevronDownIcon"
          class="w-3 h-3 flex-shrink-0 opacity-60"
        />
      }
    </ng-template>

    <ptah-native-dropdown
      [isOpen]="menuOpen()"
      [placement]="'bottom-end'"
      [closeOnBackdropClick]="true"
      (closed)="close()"
      (backdropClicked)="close()"
    >
      <!-- Composer toolbar pill (h-7). The label stays neutral. -->
      @if (gated()) {
        <!-- Gated: focusable, aria-disabled, the reason as title and
             description; a click only reveals the reason. -->
        <button
          trigger
          type="button"
          class="${EFFORT_PILL_CLASS}"
          [ptahComposerGated]="disabledReason()"
          (reasonRevealed)="revealReason($event)"
          (reasonCleared)="clearReason()"
          aria-label="Select reasoning effort level"
          data-testid="composer-effort-pill"
        >
          <ng-container [ngTemplateOutlet]="pillContent" />
        </button>
      } @else {
        <button
          trigger
          type="button"
          class="${EFFORT_PILL_CLASS}"
          [class.bg-base-300]="isOpen()"
          [class.text-base-content]="isOpen()"
          (click)="toggle()"
          aria-label="Select reasoning effort level"
          aria-haspopup="listbox"
          [attr.aria-expanded]="isOpen()"
          [title]="'Reasoning effort: ' + selectedLabel()"
          data-testid="composer-effort-pill"
        >
          <ng-container [ngTemplateOutlet]="pillContent" />
        </button>
      }

      <div content class="w-56 max-h-80 flex flex-col">
        <!-- Header -->
        <div class="px-2 py-1.5 border-b border-base-300">
          <span
            class="text-[11px] font-semibold text-base-content-muted uppercase tracking-wide"
          >
            Reasoning Effort
          </span>
        </div>

        <!-- Effort Options -->
        <div
          class="flex flex-col overflow-y-auto overflow-x-hidden max-h-64 p-1"
        >
          @for (option of options(); track option.value; let i = $index) {
            <ptah-native-option
              [optionId]="'effort-' + instanceId + '-' + i"
              [value]="option"
              [isActive]="i === activeIndex()"
              (selected)="choose(option)"
              (hovered)="onHover(i)"
            >
              <div class="flex items-center gap-2.5 py-0.5">
                <!-- Checkmark for selected -->
                <div
                  class="w-4 h-4 flex-shrink-0 flex items-center justify-center"
                >
                  @if (option.value === selectedOption().value) {
                    <lucide-angular [img]="CheckIcon" class="w-4 h-4" />
                  }
                </div>

                <!-- Color dot indicator -->
                <div
                  [class]="
                    'w-2 h-2 rounded-full flex-shrink-0 ' + option.dotColor
                  "
                ></div>

                <!-- Option Info -->
                <div class="flex flex-col items-start flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span
                      [class]="
                        'font-medium text-xs ' +
                        (option.value === selectedOption().value
                          ? option.textColor
                          : '')
                      "
                      >{{ option.label }}</span
                    >
                    <!-- Mini level bars in the menu -->
                    <div class="flex items-end gap-px h-2.5">
                      @for (bar of barSlots; track bar) {
                        <div
                          [class]="
                            'w-[2px] rounded-[1px] ' +
                            (bar < option.bars
                              ? option.dotColor
                              : 'bg-base-content/15')
                          "
                          [style.height.px]="3 + bar * 1.5"
                        ></div>
                      }
                    </div>
                  </div>
                  <span class="text-[11px] mt-0.5 text-base-content-muted">
                    {{ option.description }}
                  </span>
                </div>
              </div>
            </ptah-native-option>
          }
        </div>

        @if (footer()) {
          <!-- When the choice applies (design-spec 5.4). -->
          <div
            class="border-t border-surface-border px-2 py-1.5 text-[11px] text-base-content-muted"
            data-testid="composer-effort-footer"
          >
            {{ footer() }}
          </div>
        }
      </div>
    </ptah-native-dropdown>
  `,
})
export class ComposerEffortPickerComponent {
  /** The levels the owner offers, in menu order. */
  readonly options = input<readonly ComposerEffortOption[]>(
    COMPOSER_EFFORT_OPTIONS,
  );
  /** The level the next turn uses; `''` or unset = the first option. */
  readonly selectedId = input<EffortLevel | '' | null | undefined>(null);
  /** A change waits for the provider's confirmation: 6 px primary dot. */
  readonly pending = input<boolean>(false);
  /** One line at the foot of the menu that says when the choice applies. */
  readonly footer = input<string | null | undefined>(null);
  /** Why the owner cannot honour a change; set = gated (design-spec 5.1). */
  readonly disabledReason = input<string | null | undefined>(null);

  /** The chosen level. */
  readonly selected = output<ComposerEffortOption>();
  /** For the status line: the gated pill was clicked, focused or hovered. */
  readonly reasonRevealed = output<string>();
  /** Focus or the pointer left the gated pill. */
  readonly reasonCleared = output<void>();

  readonly instanceId = nextEffortPickerId++;
  readonly barSlots = [0, 1, 2, 3, 4];

  private readonly keyboardNav = inject(KeyboardNavigationService);
  readonly activeIndex = this.keyboardNav.activeIndex;

  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly CheckIcon = Check;
  protected readonly InfoIcon = Info;

  readonly gated = computed(
    () => (this.disabledReason() ?? '').trim().length > 0,
  );

  /**
   * Open state. Every gate change closes it, so a menu that was open when a
   * reason arrived stays closed after the reason clears.
   */
  private readonly _isOpen = linkedSignal({
    source: this.gated,
    computation: () => false,
  });
  readonly isOpen = this._isOpen.asReadonly();

  /**
   * The status line shows this picker's reason. The gated pill is destroyed
   * when the reason clears, so its blur / leave never fire; the picker then
   * sends `reasonCleared` itself.
   */
  private reasonShown = false;

  constructor() {
    effect(() => {
      if (!this.gated() && this.reasonShown) {
        this.reasonShown = false;
        this.reasonCleared.emit();
      }
    });
  }

  /** A gated picker never shows its menu, even if it was open when gated. */
  protected readonly menuOpen = computed(() => this._isOpen() && !this.gated());

  /** The selected level; an unknown or unset id falls back to the first. */
  readonly selectedOption = computed((): ComposerEffortOption => {
    const options = this.options();
    const value = this.selectedId() ?? '';
    return (
      options.find((option) => option.value === value) ??
      options[0] ??
      COMPOSER_EFFORT_OPTIONS[0]
    );
  });

  readonly selectedLabel = computed(() => this.selectedOption().label);

  toggle(): void {
    this._isOpen.set(!this._isOpen());
  }

  close(): void {
    this._isOpen.set(false);
  }

  protected revealReason(reason: string): void {
    this.reasonShown = true;
    this.reasonRevealed.emit(reason);
  }

  protected clearReason(): void {
    this.reasonShown = false;
    this.reasonCleared.emit();
  }

  choose(option: ComposerEffortOption): void {
    this.close();
    this.selected.emit(option);
  }

  onHover(index: number): void {
    this.keyboardNav.setActiveIndex(index);
  }
}
