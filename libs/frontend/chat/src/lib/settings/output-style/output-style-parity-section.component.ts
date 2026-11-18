/**
 * OutputStyleParitySectionComponent — Command-line parity (<details>) for output styles (A24, P9).
 *
 * Encapsulates the collapsible command-line parity controls:
 *  - Checkbox to opt-in to writing settings files for the claude CLI (default OFF)
 *  - Scope / tier select (.claude/settings.json, .claude/settings.local.json, ~/.claude/settings.json)
 *  - S-confirm inline alertdialog before writing outside Ptah
 *  - Success status and warning notifications
 *
 * The `<details>` opens itself whenever it has a confirm or a warning to show,
 * and collapsing it while a confirm is pending cancels that confirm: a pending
 * radio choice is never left on screen without a visible prompt.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  signal,
  output,
  viewChild,
} from '@angular/core';
import {
  LucideAngularModule,
  AlertTriangle,
  ChevronRight,
  Info,
} from 'lucide-angular';
import type { SettingsTier } from '@ptah-extension/shared';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { PtahButtonDirective, PtahCheckboxDirective, PtahRichSelectComponent, PtahFieldComponent, NativePopoverComponent, PtahIconButtonDirective, type PtahSelectOption } from '@ptah-extension/ui';

export interface ParityTierOption {
  readonly tier: SettingsTier;
  readonly displayPath: string;
  readonly scope: string;
}

export const PARITY_TIERS: readonly ParityTierOption[] = [
  {
    tier: 'project',
    displayPath: '.claude/settings.json',
    scope: 'this project, shared with anyone who clones it',
  },
  {
    tier: 'local',
    displayPath: '.claude/settings.local.json',
    scope: 'this project, only on this machine',
  },
  {
    tier: 'user',
    displayPath: '~/.claude/settings.json',
    scope: 'every project on this machine',
  },
] as const;

@Component({
  selector: 'ptah-output-style-parity-section',
  standalone: true,
  imports: [SettingsBusyDisabledDirective, LucideAngularModule, PtahButtonDirective, PtahCheckboxDirective, PtahRichSelectComponent, PtahFieldComponent, NativePopoverComponent, PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details
      #details
      class="mt-3 border-t border-base-content/10 pt-3 text-xs text-base-content"
      data-testid="output-style-parity-details"
      (toggle)="onDetailsToggle()"
    >
      <summary
        class="flex list-none items-center gap-[var(--ptah-gap-controls)] cursor-pointer rounded font-medium select-none text-xs text-base-content [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
        data-testid="output-style-parity-summary">
        <lucide-angular [img]="ChevronRightIcon" class="h-3.5 w-3.5 shrink-0" [class.rotate-90]="details.open" aria-hidden="true" />
        Command-line parity
      </summary>

      <div class="flex items-start gap-[var(--ptah-gap-controls)] mt-2">
        <label class="flex min-w-0 items-start gap-[var(--ptah-gap-controls)] cursor-pointer">
          <input
            type="checkbox"
            ptahCheckbox size="xs"
            class="mt-0.5"
            [checked]="parityEnabled()"
            (change)="onToggle($event)"
            data-testid="output-style-parity-checkbox"
          />
          <span class="flex-1">
            <span class="text-xs text-base-content">
              Also apply this style when I run <code>claude</code> in this project
            </span>
            <span class="block text-xs text-base-content-muted mt-0.5 leading-relaxed">
              Write the selected style to <code>{{ parityDisplayPath() }}</code>.
            </span>
          </span>
        </label>
        <ptah-native-popover [isOpen]="helpOpen()" [keepInViewport]="true" (closed)="helpOpen.set(false)">
          <button trigger type="button" ptahIconButton variant="ghost" size="xs" label="About command-line parity" (click)="helpOpen.set(true)">
            <lucide-angular [img]="InfoIcon" class="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <p content class="max-w-xs p-[var(--ptah-gap-field)] text-xs leading-relaxed">
            Ptah applies your choice on its own. Tick this to additionally write
            <code>{{ parityDisplayPath() }}</code> so the command-line tool picks up
            the same style. Ptah keeps every other setting in that file as it is.
          </p>
        </ptah-native-popover>
      </div>

      @if (parityEnabled()) {
        <div class="mt-2 pl-6">
          <ptah-field label="Where to write it">
            <ptah-select
              id="output-style-parity-tier"
              triggerId="output-style-parity-tier-trigger"
              [options]="tierOptions"
              [value]="parityTier()"
              (valueChange)="onTierChange($event)"
              data-testid="output-style-parity-select"
            />
          </ptah-field>
          <p class="text-xs text-base-content-muted mt-1 leading-relaxed">
            The file is written the next time you pick a style. Nothing is
            written while this box is unticked.
          </p>
        </div>
      }

      <!-- S-confirm for Parity File Write (A24) -->
      @if (pendingParitySelection() !== undefined) {
        <div
          class="mt-2 flex items-center gap-[var(--ptah-gap-controls)] rounded border border-base-300 p-2 text-xs text-base-content"
          role="group"
          aria-label="Confirm command-line settings write"
          data-testid="parity-confirm"
          (keydown.escape)="cancel($event)"
        >
          <lucide-angular
            [img]="AlertTriangleIcon"
            class="w-3.5 h-3.5 text-warning shrink-0"
            aria-hidden="true"
          />
          <span class="flex-1">
            Write style to
            <code class="text-base-content-muted">{{ parityDisplayPath() }}</code>
            for <code>claude</code>? This modifies the file outside Ptah.
          </span>
          <button
            type="button"
            ptahButton variant="outline" size="xs" class="border-error text-base-content"
            [ptahBusyDisabled]="saving()"
            (click)="confirmed.emit()"
            data-testid="parity-confirm-button"
          >
            Confirm
          </button>
          <button
            #parityCancel
            type="button"
            ptahButton variant="ghost" size="xs"
            (click)="cancel()"
            data-testid="parity-cancel-button"
          >
            Cancel
          </button>
        </div>
      }

      @if (parityWarning(); as warning) {
        <div
          class="flex items-start gap-[var(--ptah-gap-controls)] rounded border border-warning/40 bg-warning/10 p-2 mt-2 text-xs text-base-content"
          role="status"
          data-testid="output-style-parity-warning"
        >
          <lucide-angular
            [img]="AlertTriangleIcon"
            class="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div class="flex-1">
            <p class="text-xs text-base-content leading-relaxed">{{ warning }}</p>
            <p class="text-xs text-base-content-muted mt-0.5">
              Your chosen style is still active in Ptah — only the extra copy
              for the command line was skipped.
            </p>
          </div>
          <button
            type="button"
            ptahButton variant="ghost" size="xs"
            (click)="dismissParity.emit()"
          >
            Dismiss
          </button>
        </div>
      }
    </details>
  `,
})
export class OutputStyleParitySectionComponent {
  readonly parityEnabled = input(false);
  readonly parityTier = input<SettingsTier>('project');
  readonly parityDisplayPath = input.required<string>();
  readonly pendingParitySelection = input<string | null | undefined>(undefined);
  readonly parityWarning = input<string | null>(null);
  readonly saving = input(false);

  readonly parityToggled = output<boolean>();
  readonly tierChanged = output<SettingsTier>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  readonly dismissParity = output<void>();

  readonly AlertTriangleIcon = AlertTriangle;
  readonly InfoIcon = Info;
  readonly ChevronRightIcon = ChevronRight;
  readonly helpOpen = signal(false);
  readonly tierOptions: readonly PtahSelectOption<SettingsTier>[] = PARITY_TIERS.map(option => ({
    value: option.tier, label: option.displayPath, description: option.scope,
  }));

  private readonly details = viewChild<ElementRef<HTMLDetailsElement>>('details');
  private readonly parityCancel = viewChild<ElementRef<HTMLButtonElement>>('parityCancel');

  constructor() {
    // Serious 2: a pending confirm or a parity warning opens the section, and the confirm takes focus on Cancel.
    effect(() => {
      const pending = this.pendingParitySelection() !== undefined;
      const details = this.details()?.nativeElement;
      if (details && (pending || this.parityWarning() !== null)) details.open = true;
      if (pending) this.parityCancel()?.nativeElement.focus();
    });
  }

  /** Collapsing the section while a confirm is pending cancels it, so no unsaved radio stays checked. */
  onDetailsToggle(): void {
    const details = this.details()?.nativeElement;
    if (details && !details.open && this.pendingParitySelection() !== undefined) {
      this.cancelled.emit();
    }
  }

  /** Cancel and Esc dismiss the confirm here; Esc stops so an enclosing overlay does not also close. */
  cancel(event?: Event): void {
    event?.stopPropagation();
    this.cancelled.emit();
  }

  onToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.parityToggled.emit(checked);
  }

  onTierChange(value: SettingsTier | null): void {
    if (value !== null) this.tierChanged.emit(value);
  }
}
