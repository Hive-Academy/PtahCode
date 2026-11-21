import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { ConnectionOption, ConnectionRole } from './connection-options';

/**
 * The icon, name, description and role badge of one connection option. The
 * radio card and the detail card both render it, so every provider reads the
 * same way in both places. Phrasing content only: it sits inside a `<label>`.
 */
@Component({
  selector: 'ptah-connection-option-heading',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-1 items-start gap-[var(--ptah-gap-heading)]' },
  template: `
    <span
      class="grid size-9 flex-none place-items-center rounded-lg border border-base-300 bg-base-100"
      data-glass-surface="tile"
      aria-hidden="true"
    >
      <lucide-angular [img]="option().icon" class="size-5" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span
        class="block font-semibold"
        [class.text-lg]="headingLevel() !== null"
        [attr.role]="headingLevel() !== null ? 'heading' : null"
        [attr.aria-level]="headingLevel()"
        data-testid="connection-option-name"
        >{{ option().name }}</span
      >
      <span
        class="block text-[13px] text-base-content-muted"
        data-testid="connection-option-description"
        >{{ option().description }}</span
      >
      @if (connectionRole() === 'main') {
        <span
          class="mt-1 inline-block rounded-full border border-primary px-2 text-xs font-semibold"
          data-testid="connection-option-role"
          >Main connection</span
        >
      } @else if (connectionRole() === 'information') {
        <span
          class="mt-1 inline-block rounded-full border border-[var(--ptah-border-color-strong)] px-2 text-xs text-base-content-muted"
          data-testid="connection-option-role"
          >Not your main connection</span
        >
      }
    </span>
  `,
})
export class ConnectionOptionHeadingComponent {
  readonly option = input.required<ConnectionOption>();
  readonly connectionRole = input.required<ConnectionRole>();
  /** ARIA heading level for the name; null inside a radio label. */
  readonly headingLevel = input<number | null>(null);
}
