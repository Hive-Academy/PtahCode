/**
 * ClaudeBuiltinsRowComponent - one dense row of the "Claude Code tools & skills" card (TASK_2026_2285 F31, F32).
 *
 * The same row serves a tool and a skill: switch, name, token chip, an optional dependency chip and a one-line
 * description. The switch stays a native checkbox element (`ptahToggle` gives it `role="switch"`), so the parent reads
 * `event.target.checked` and can set it back after a refused write.
 */

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideAngularModule, TriangleAlert } from 'lucide-angular';
import { PtahBadgeDirective, PtahToggleDirective } from '@ptah-extension/ui';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';

export type BuiltinKind = 'tool' | 'skill';

/**
 * An item id as part of an element id: a synced skill id has a colon (`anthropic-skills:docx`). Each character outside
 * `[A-Za-z0-9-]`, the underscore included, becomes `_<hex code>_`. So two different ids never give the same element id
 * (`release.notes` and `release_notes` stay different).
 */
export const toIdPart = (value: string): string =>
  value.replace(/[^A-Za-z0-9-]/gu, (char) => `_${(char.codePointAt(0) ?? 0).toString(16)}_`);

@Component({
  selector: 'ptah-claude-builtins-row',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective, PtahToggleDirective, SettingsBusyDisabledDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div
      class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-[var(--ptah-gap-controls)] gap-y-[var(--ptah-gap-label)] py-[var(--ptah-gap-controls)]"
      data-testid="claude-builtins-row"
    >
      <input
        type="checkbox"
        ptahToggle
        size="xs"
        [checked]="on()"
        (change)="toggled.emit($event)"
        [ptahBusyDisabled]="disabled()"
        [attr.aria-labelledby]="nameId()"
        [attr.aria-describedby]="blockedReason() ? reasonId() : null"
        [attr.data-testid]="'settings-toggle-claude-' + kind() + '-' + itemId()"
      />
      <span [id]="nameId()" class="min-w-0 truncate text-sm font-medium text-base-content" [attr.title]="name()">{{ name() }}</span>
      <span class="flex shrink-0 items-center gap-[var(--ptah-gap-label)]">
        @if (blockedReason(); as reason) {
          <span
            ptahBadge
            tone="warn"
            appearance="outline"
            size="xs"
            class="shrink-0 whitespace-nowrap"
            [id]="reasonId()"
            [attr.title]="'This ' + kind() + ' is on but not available: ' + reason + '.'"
            [attr.data-testid]="'claude-skill-dependency-' + itemId()"
          >
            <lucide-angular [img]="TriangleAlertIcon" class="size-[var(--ptah-icon-xs)]" aria-hidden="true" />
            {{ reason }}
          </span>
        }
        <span ptahBadge appearance="outline" size="xs" class="shrink-0 tabular-nums" data-testid="claude-builtins-row-tokens">{{ tokens() }}</span>
      </span>
      @if (description(); as text) {
        <span
          class="col-span-2 col-start-2 truncate text-[length:var(--ptah-text-hint-size)] text-base-content-muted"
          [attr.title]="text"
          data-testid="claude-builtins-row-description"
        >{{ text }}</span>
      }
    </div>
  `,
})
export class ClaudeBuiltinsRowComponent {
  readonly kind = input.required<BuiltinKind>();
  readonly itemId = input.required<string>();
  readonly name = input.required<string>();
  readonly description = input<string | null>(null);
  /** Pre-formatted by the parent ("~2,000"). */
  readonly tokens = input.required<string>();
  readonly on = input.required<boolean>();
  /** Busy or read-only, not natively disabled: the switch keeps focus and refuses the click. */
  readonly disabled = input(false);
  /** Text of the dependency chip ("ReportFindings is off"); the switch refers to it with `aria-describedby`. */
  readonly blockedReason = input<string | null>(null);
  /** The native `change` event of the switch; its target is the checkbox element. */
  readonly toggled = output<Event>();

  protected readonly TriangleAlertIcon = TriangleAlert;

  private readonly idBase = computed(() => `claude-${this.kind()}-${toIdPart(this.itemId())}`);
  protected readonly nameId = computed(() => `${this.idBase()}-name`);
  protected readonly reasonId = computed(() => `${this.idBase()}-blocked`);
}
