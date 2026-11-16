import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

let nextDisclosureId = 0;

/** A compact disclosure with a labelled, keyboard accessible button. */
@Component({
  selector: 'ptah-disclosure',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-ptah-pattern': 'disclosure' },
  template: `
    <div class="flex items-center gap-[var(--ptah-gap-inline)]">
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
        ><path d="m6 9 6 6 6-6" /></svg>
        <span>{{ label() }}</span>
      </button>
      <ng-content select="[ptahDisclosureMeta]" />
    </div>
    <div [id]="bodyId" role="region" [attr.aria-labelledby]="buttonId" [hidden]="!open()">
      <ng-content />
    </div>
  `,
})
export class PtahDisclosureComponent {
  readonly label = input.required<string>();
  readonly open = model(false);
  readonly size = input<'md' | 'sm'>('md');

  private readonly instanceId = ++nextDisclosureId;
  protected readonly buttonId = `ptah-disclosure-button-${this.instanceId}`;
  protected readonly bodyId = `ptah-disclosure-body-${this.instanceId}`;
}
