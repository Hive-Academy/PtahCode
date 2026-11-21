/**
 * ClaudeBuiltinsGroupComponent - one collapsible group of the "Claude Code tools & skills" card (TASK_2026_2285 F26).
 *
 * Header: a disclosure button (heading, badge, "n/N on · ~tokens") and a group control. The group control looks like a
 * switch, but it is a tri-state checkbox (`role="checkbox"`, `aria-checked` true / false / mixed): WAI-ARIA maps
 * `mixed` on a switch to off. Body: the projected rows, in two
 * columns when the body is at least 704px wide. The component keeps no state: the parent owns `expanded` and the
 * switch state, and receives the requested changes.
 */

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ChevronRight, LucideAngularModule, type LucideIconData } from 'lucide-angular';
import { PtahBadgeDirective } from '@ptah-extension/ui';

export type BuiltinGroupId = 'tools' | 'terminal' | 'synced';
export type BuiltinGroupSwitchState = 'on' | 'off' | 'mixed';

@Component({
  selector: 'ptah-claude-builtins-group',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div
      class="rounded-[var(--ptah-radius-control)] [border:var(--ptah-border-width)_solid_var(--ptah-border-color)]"
      [attr.data-testid]="'claude-tools-group-' + groupId()"
    >
      <div class="flex min-h-10 items-center gap-[var(--ptah-gap-controls)] px-[var(--ptah-gap-heading)] py-[var(--ptah-gap-label)]">
        <button
          type="button"
          class="flex min-w-0 flex-1 flex-wrap items-center gap-x-[var(--ptah-gap-inline)] gap-y-[var(--ptah-gap-label)] rounded-[var(--ptah-radius-control)] py-[var(--ptah-gap-label)] text-left"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="bodyId()"
          [attr.aria-disabled]="expandLocked() ? 'true' : null"
          [attr.title]="hint()"
          (click)="onDisclosure()"
          [attr.data-testid]="'claude-tools-group-toggle-' + groupId()"
        >
          <lucide-angular
            [img]="ChevronRightIcon"
            class="size-[var(--ptah-icon-sm)] shrink-0 text-base-content-muted transition-transform motion-reduce:transition-none"
            [class.rotate-90]="expanded()"
            aria-hidden="true"
          />
          <lucide-angular [img]="icon()" class="size-[var(--ptah-icon-sm)] shrink-0 text-base-content-muted" aria-hidden="true" />
          <span class="min-w-0 truncate text-sm font-medium text-base-content">{{ heading() }}</span>
          @if (badge(); as badgeText) {
            <span ptahBadge appearance="outline" size="xs" class="shrink-0">{{ badgeText }}</span>
          }
          <span
            class="flex-1 shrink-0 whitespace-nowrap text-right text-[length:var(--ptah-text-hint-size)] tabular-nums text-base-content-muted"
            [attr.data-testid]="'claude-tools-group-meta-' + groupId()"
          >{{ onCount() }}/{{ total() }} on · {{ tokens() }} tokens</span>
        </button>
        @if (total() > 0) {
          <button
            type="button"
            role="checkbox"
            class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-base-content/30 bg-base-300 transition-colors motion-reduce:transition-none aria-checked:border-primary aria-checked:bg-primary aria-[checked=mixed]:border-primary aria-[checked=mixed]:bg-primary/60"
            [attr.aria-checked]="ariaChecked()"
            [attr.aria-label]="switchLabel()"
            [attr.aria-disabled]="busy() ? 'true' : null"
            (click)="onSwitch()"
            [attr.data-testid]="'claude-tools-group-switch-' + groupId()"
          >
            <span
              class="pointer-events-none absolute left-0.5 size-2.5 rounded-full transition-transform motion-reduce:transition-none"
              [class.translate-x-3]="switchState() === 'on'"
              [class.translate-x-1.5]="switchState() === 'mixed'"
              [class.bg-primary-content]="switchState() !== 'off'"
              [class.bg-base-content/70]="switchState() === 'off'"
              aria-hidden="true"
            ></span>
          </button>
        }
      </div>
      <div
        [id]="bodyId()"
        [hidden]="!expanded()"
        class="[container-type:inline-size] [border-top:var(--ptah-border-width)_solid_var(--ptah-border-color)] px-[var(--ptah-gap-heading)] py-[var(--ptah-gap-label)]"
        [attr.data-testid]="'claude-tools-group-body-' + groupId()"
      >
        <div class="grid grid-cols-1 gap-x-[var(--ptah-gap-group)] [@container(min-width:704px)]:grid-cols-2">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class ClaudeBuiltinsGroupComponent {
  readonly groupId = input.required<BuiltinGroupId>();
  readonly heading = input.required<string>();
  readonly icon = input.required<LucideIconData>();
  /** "Off by default" / "Hidden by default". */
  readonly badge = input<string | null>(null);
  /** Explanation of the group, shown as the tooltip of the disclosure button (F28). */
  readonly hint = input<string | null>(null);
  readonly onCount = input.required<number>();
  readonly total = input.required<number>();
  /** Pre-formatted subtotal ("~2,900"). */
  readonly tokens = input.required<string>();
  readonly expanded = input.required<boolean>();
  readonly switchState = input.required<BuiltinGroupSwitchState>();
  /** "Turn on all X", or "Turn on N shown in X" while a filter is set. */
  readonly switchLabel = input.required<string>();
  /** A save runs, or the card is read-only: the group control is `aria-disabled` (it keeps focus) and ignores clicks. */
  readonly busy = input(false);
  /**
   * The parent controls `expanded` (a filter opens each group that has a match): the disclosure is `aria-disabled`
   * and ignores activation. It keeps focus.
   */
  readonly expandLocked = input(false);
  readonly expandedChange = output<boolean>();
  /** The requested new state of the rows the switch acts on. */
  readonly groupToggled = output<boolean>();

  protected readonly ChevronRightIcon = ChevronRight;

  protected readonly bodyId = computed(() => `claude-tools-group-body-${this.groupId()}`);
  protected readonly ariaChecked = computed(() => {
    const state = this.switchState();
    return state === 'mixed' ? 'mixed' : String(state === 'on');
  });

  protected onDisclosure(): void {
    if (this.expandLocked()) return;
    this.expandedChange.emit(!this.expanded());
  }

  /** All on turns the rows off. Off or mixed turns them on. */
  protected onSwitch(): void {
    if (this.busy()) return;
    this.groupToggled.emit(this.switchState() !== 'on');
  }
}
