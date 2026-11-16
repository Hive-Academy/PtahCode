import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  input,
  linkedSignal,
  model,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PtahDisclosureLazyDirective } from './disclosure-lazy.directive';

let nextDisclosureId = 0;

/**
 * A compact disclosure with a labelled, keyboard accessible button.
 * Lead and summary slots accept inline, non-interactive content only.
 * Lazy template content is not rendered until first open; default projection is unchanged.
 */
@Component({
  selector: 'ptah-disclosure',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-ptah-pattern': 'disclosure' },
  template: `
    <div
      class="flex items-center gap-[var(--ptah-gap-inline)]"
      [class.justify-center]="align() === 'center'"
    >
      <button
        type="button"
        class="flex min-w-0 items-center gap-[var(--ptah-gap-inline)] rounded-[var(--ptah-card-radius)] text-left font-semibold focus-visible:outline focus-visible:outline-[length:var(--ptah-focus-ring-width)] focus-visible:outline-offset-[length:var(--ptah-focus-ring-offset)] focus-visible:outline-[color:var(--ptah-focus-ring-color)]"
        [class.text-sm]="size() === 'md'"
        [class.text-xs]="size() === 'sm'"
        [id]="buttonId"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="bodyId"
        (click)="open.set(!open())"
      >
        <svg
          aria-hidden="true"
          class="h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none"
          [class.rotate-180]="open()"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <ng-content select="[ptahDisclosureLead]" />
        <span>{{ label() }}</span>
        @if (description(); as text) {
          <span class="min-w-0 truncate font-normal text-base-content-muted">{{
            text
          }}</span>
        }
        <ng-content select="[ptahDisclosureSummary]" />
      </button>
      <ng-content select="[ptahDisclosureMeta]" />
    </div>
    <div
      [id]="bodyId"
      [attr.role]="region() ? 'region' : null"
      [attr.aria-labelledby]="region() ? buttonId : null"
      [hidden]="!open()"
    >
      <ng-content />
      @if (lazy(); as lazyTemplate) {
        @if (hasOpened() && (keepAlive() || open())) {
          <ng-container [ngTemplateOutlet]="lazyTemplate.templateRef" />
        }
      }
    </div>
  `,
})
export class PtahDisclosureComponent {
  readonly label = input.required<string>();
  readonly description = input<string | null>(null);
  readonly open = model(false);
  readonly keepAlive = input(true);
  protected readonly lazy = contentChild(PtahDisclosureLazyDirective);

  readonly size = input<'md' | 'sm'>('md');
  /** Horizontal position of the trigger row. */
  readonly align = input<'start' | 'center'>('start');
  /** Set true to expose the body as a region landmark (use for a few major sections only). */
  readonly region = input(false);

  /** True once the body was open; correct in the first pass. */
  protected readonly hasOpened = linkedSignal<boolean, boolean>({
    source: this.open,
    computation: (open, previous) => open || (previous?.value ?? false),
  });

  private readonly instanceId = ++nextDisclosureId;
  protected readonly buttonId = `ptah-disclosure-button-${this.instanceId}`;
  protected readonly bodyId = `ptah-disclosure-body-${this.instanceId}`;
}
