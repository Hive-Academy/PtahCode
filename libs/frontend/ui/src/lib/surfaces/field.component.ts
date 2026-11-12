import {
  afterEveryRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PtahFieldControlRef } from './field-control-ref';

/** `floating`: a notch label. It rests in the box and moves onto the top border. `stacked`: the label is above the box. */
export type PtahFieldAppearance = 'floating' | 'stacked';
/** Box height: md 48 px (default), lg 56 px. */
export type PtahFieldSize = 'md' | 'lg';

const CONTROLS =
  'input[ptahFieldControl], select[ptahFieldControl], textarea[ptahFieldControl], input[ptahInput], textarea[ptahTextarea], select[ptahSelect], ptah-select';

let fieldId = 0;

/**
 * The field owner of the form controls family. It composes the label, one
 * control, the leading and trailing slots (`[ptahFieldLeading]`,
 * `[ptahFieldTrailing]`), the clear and reveal actions, the hint, the error,
 * the required mark and the character count. The look is in
 * `form-controls/ptah-field.css`. State attributes on the root are absent when
 * idle: `data-invalid`, `data-busy`.
 */
@Component({
  selector: 'ptah-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<div
    class="ptah-field"
    data-ptah-field
    [attr.data-appearance]="appearance()"
    [attr.data-size]="size()"
    [attr.data-invalid]="invalidState() ? 'true' : null"
    [attr.data-busy]="busy() ? 'true' : null"
  >
    @if (appearance() === 'stacked') {
      <ng-container [ngTemplateOutlet]="labelTpl" />
    }
    <div class="ptah-field__box" (input)="readCount()">
      <ng-content select="[ptahFieldLeading]" />
      <div class="ptah-field__body">
        @if (appearance() === 'floating') {
          <ng-container [ngTemplateOutlet]="labelTpl" />
        }
        <ng-content select="${CONTROLS}" />
      </div>
      @if (clearable()) {
        <button
          type="button"
          class="ptah-field__action ptah-field__clear"
          [attr.aria-label]="'Clear ' + label()"
          (click)="clear()"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      }
      @if (revealable()) {
        <button
          type="button"
          class="ptah-field__action"
          [attr.aria-label]="revealed() ? 'Hide ' + label() : 'Show ' + label()"
          [attr.aria-pressed]="revealed()"
          (click)="toggleReveal()"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
            <circle cx="8" cy="8" r="2" />
            @if (revealed()) {
              <path d="M2.5 2.5l11 11" />
            }
          </svg>
        </button>
      }
      <ng-content select="[ptahFieldTrailing]" />
      <span class="ptah-field__rail" aria-hidden="true"></span>
    </div>
    @if (hint() || error() || counter()) {
      <div class="ptah-field__footer">
        @if (hint() || error()) {
          <p
            [id]="descriptionId"
            class="ptah-field__message"
            [attr.data-error]="error() ? 'true' : null"
          >
            {{ error() || hint() }}
          </p>
        }
        @if (counter()) {
          <span class="ptah-field__counter">{{ countText() }}</span>
        }
      </div>
    }
    <ng-template #labelTpl>
      <label class="ptah-field__label" [id]="labelId" [attr.for]="labelFor()"
        >{{ label()
        }}@if (required()) {<span class="ptah-field__required" aria-hidden="true"> *</span>}</label
      >
    </ng-template>
  </div>`,
  imports: [NgTemplateOutlet],
})
export class PtahFieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly appearance = input<PtahFieldAppearance>('floating');
  readonly size = input<PtahFieldSize>('md');
  readonly required = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  /** Shows a clear action while the control has a value. */
  readonly clearable = input(false, { transform: booleanAttribute });
  /** Shows a show/hide action for a `type="password"` input. */
  readonly revealable = input(false, { transform: booleanAttribute });
  /** Shows the character count, with `maxlength` when the control has one. */
  readonly counter = input(false, { transform: booleanAttribute });

  readonly control = contentChild(PtahFieldControlRef);
  readonly controlId = `ptah-field-control-${++fieldId}`;
  readonly labelId = `ptah-field-label-${fieldId}`;
  readonly descriptionId = `ptah-field-description-${fieldId}`;
  readonly labelFor = signal(this.controlId);
  readonly revealed = signal(false);
  private readonly length = signal(0);
  private readonly maxLength = signal<number | null>(null);
  readonly invalidState = computed(() => !!this.error());
  readonly countText = computed(() => {
    const max = this.maxLength();
    return max === null ? `${this.length()}` : `${this.length()} / ${max}`;
  });

  private observed: HTMLElement | null = null;
  private descriptionObserver: MutationObserver | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.descriptionObserver?.disconnect());
    effect(() => this.wire());
    afterEveryRender(() => this.readCount());
  }

  clear(): void {
    const el = this.nativeControl();
    if (!el) return;
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }

  toggleReveal(): void {
    const el = this.nativeControl();
    if (!el || !(el instanceof HTMLInputElement)) return;
    this.revealed.update((on) => !on);
    el.type = this.revealed() ? 'text' : 'password';
  }

  private wire(): void {
    const marked = this.control();
    const control = marked?.element.nativeElement;
    if (!control || !marked) {
      this.descriptionObserver?.disconnect();
      this.observed = null;
      return;
    }
    const id = marked.controlId ?? (control.id || this.controlId);
    if (!control.id) control.id = id;
    this.labelFor.set(id);
    this.syncDescription(control);
    this.observeDescription(control);
    this.toggleAttr(control, 'aria-required', this.required());
    this.toggleAttr(control, 'aria-busy', this.busy());
    // The floating label rests over an empty control: `:placeholder-shown`
    // needs a placeholder, so an empty one is written when the consumer gave none.
    const textControl = this.nativeControl();
    if (textControl && !textControl.hasAttribute('placeholder')) {
      textControl.setAttribute('placeholder', ' ');
    }
    marked.setFieldInvalid(!!this.error());
    marked.setFieldLabel?.(this.labelId);
  }

  /**
   * Keeps the consumer ids of `aria-describedby` and adds the id of the field
   * text. The consumer value is read from the live attribute, so a bound value
   * survives. Writes only when the value differs.
   */
  private syncDescription(control: HTMLElement): void {
    const ids = (control.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== this.descriptionId);
    if (this.error() || this.hint()) ids.push(this.descriptionId);
    const next = ids.join(' ');
    if ((control.getAttribute('aria-describedby') ?? '') === next) return;
    if (next) control.setAttribute('aria-describedby', next);
    else control.removeAttribute('aria-describedby');
  }

  /** A later change of a bound `aria-describedby` overwrites the field id: add it again. */
  private observeDescription(control: HTMLElement): void {
    if (this.observed === control) return;
    if (typeof MutationObserver === 'undefined') return;
    this.descriptionObserver?.disconnect();
    this.observed = control;
    this.descriptionObserver = new MutationObserver(() =>
      this.syncDescription(control),
    );
    this.descriptionObserver.observe(control, {
      attributes: true,
      attributeFilter: ['aria-describedby'],
    });
  }

  /** Reads the length on each input event and after each render (a value set by a form). */
  readCount(): void {
    if (!this.counter()) return;
    const el = this.nativeControl();
    if (!el) return;
    if (el.value.length !== this.length()) this.length.set(el.value.length);
    const max = el.maxLength > 0 ? el.maxLength : null;
    if (max !== this.maxLength()) this.maxLength.set(max);
  }

  private nativeControl(): HTMLInputElement | HTMLTextAreaElement | null {
    const el = this.control()?.element.nativeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? el
      : null;
  }

  private toggleAttr(el: HTMLElement, name: string, on: boolean): void {
    if (on) el.setAttribute(name, 'true');
    else el.removeAttribute(name);
  }
}
