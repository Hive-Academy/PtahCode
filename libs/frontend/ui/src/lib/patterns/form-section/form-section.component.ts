import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';
import { PtahSectionLevel } from '../../card/card.types';

/** Same transform as `PtahSectionHeaderComponent`: 2 and 4 stay, all else is 3. */
function toSectionLevel(value: unknown): PtahSectionLevel {
  const level = numberAttribute(value, 3);
  return level === 2 || level === 4 ? level : 3;
}

let nextFormSectionId = 0;

/**
 * Form section pattern (TASK_2026_1177_9109, `pattern-spec.md` section 1).
 * A two-column row: the title and the description on the left, the fields on
 * the right. Below the `form-split` width (640px of its own container) it
 * stacks to one column. All spacing comes from `--ptah-*` tokens.
 *
 * Slots: `[aside]` under the description, the default slot for the fields,
 * `[footer]` under the fields.
 *
 * @example
 * ```html
 * <ptah-form-section heading="Profile" description="Shown to other users">
 *   <span ptahBadge aside>Beta</span>
 *   <ptah-field label="Name">...</ptah-field>
 *   <button ptahButton footer>Delete</button>
 * </ptah-form-section>
 * ```
 */
@Component({
  selector: 'ptah-form-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-pattern': 'form-section',
    class: 'block [container-type:inline-size]',
  },
  template: `
    <section
      class="grid grid-cols-1 py-[var(--ptah-gap-group)] gap-[var(--ptah-gap-heading)] [@container(min-width:640px)]:grid-cols-[var(--ptah-form-section-aside-w)_minmax(0,var(--ptah-form-section-fields-max-w))] [@container(min-width:640px)]:gap-x-[var(--ptah-gap-section)]"
      [attr.aria-labelledby]="headingId"
      [attr.aria-describedby]="describedBy()"
      [style.border-bottom]="
        divider()
          ? 'var(--ptah-border-width) solid var(--ptah-border-color)'
          : null
      "
      data-testid="form-section"
    >
      <div class="flex min-w-0 flex-col" data-testid="form-section-aside">
        <div class="flex flex-col gap-[var(--ptah-gap-label)]">
          @switch (level()) {
            @case (2) {
              <h2 [id]="headingId" [style]="titleStyle">{{ heading() }}</h2>
            }
            @case (4) {
              <h4 [id]="headingId" [style]="titleStyle">{{ heading() }}</h4>
            }
            @default {
              <h3 [id]="headingId" [style]="titleStyle">{{ heading() }}</h3>
            }
          }
          @if (description(); as descriptionText) {
            <p
              class="text-base-content-muted"
              [id]="descriptionId"
              [style]="hintStyle"
              data-testid="form-section-description"
            >
              {{ descriptionText }}
            </p>
          }
        </div>
        <div class="mt-[var(--ptah-gap-controls)] empty:hidden"><ng-content select="[aside]" /></div>
      </div>
      <div
        class="flex min-w-0 flex-col gap-[var(--ptah-gap-field)]"
        [attr.inert]="disabled() ? '' : null"
        [attr.aria-disabled]="disabled() ? 'true' : null"
        [class]="disabled() ? 'opacity-[var(--ptah-field-disabled-opacity)]' : ''"
        data-testid="form-section-fields"
      >
        @if (error(); as errorText) {
          <div class="alert alert-error" role="alert" [id]="errorId" data-testid="form-section-error">
            {{ errorText }}
          </div>
        }
        <ng-content />
        <div class="mt-[var(--ptah-gap-group)] empty:hidden"><ng-content select="[footer]" /></div>
      </div>
    </section>
  `,
})
export class PtahFormSectionComponent {
  /** The heading text. */
  readonly heading = input.required<string>();
  /** Muted hint text below the heading. */
  readonly description = input<string | null>(null);
  /** The heading tag (h2, h3 or h4). Default 3. */
  readonly level = input<PtahSectionLevel, unknown>(3, {
    transform: toSectionLevel,
  });
  /** Draws a bottom border under the section. */
  readonly divider = input(false, { transform: booleanAttribute });
  /** Makes the fields column inert. The title stays at full contrast. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Error text shown at the top of the fields column. */
  readonly error = input<string | null>(null);

  private readonly baseId = `ptah-form-section-${nextFormSectionId++}`;
  /** Read by ptah-editable-section to label its region. */
  readonly headingId = `${this.baseId}-title`;
  protected readonly descriptionId = `${this.baseId}-description`;
  protected readonly errorId = `${this.baseId}-error`;

  protected readonly titleStyle = {
    'font-size': 'var(--ptah-text-section-title-size)',
    'line-height': 'var(--ptah-text-section-title-leading)',
    'font-weight': 'var(--ptah-text-section-title-weight)',
  };
  protected readonly hintStyle = {
    'font-size': 'var(--ptah-text-hint-size)',
    'line-height': 'var(--ptah-text-hint-leading)',
    'font-weight': 'var(--ptah-text-hint-weight)',
  };

  protected readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.description()) ids.push(this.descriptionId);
    if (this.error()) ids.push(this.errorId);
    return ids.length > 0 ? ids.join(' ') : null;
  });
}
