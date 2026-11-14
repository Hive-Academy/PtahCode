import { NgTemplateOutlet } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { PtahButtonDirective } from '../../button/button.directive';
import { PtahSectionLevel, toSectionLevel } from '../../card/card.types';
import { PtahSectionHeaderComponent } from '../../card/section-header.component';
import { PtahAlertComponent } from '../../foundation/alert.component';
import { NativeModalComponent } from '../../native/modal/native-modal.component';
import { PtahFormActionsComponent } from '../form-actions/form-actions.component';

let nextEditableSectionId = 0;

/** Candidates for the first field (spec section 4.4 step 9). */
const FIRST_FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

const MODE_CLASS =
  'transition-opacity duration-[var(--ptah-duration-fast)] ease-[var(--ptah-ease-standard)] motion-reduce:transition-none';

const SURFACE_CLASS = [
  '[background:var(--ptah-card-bg)]',
  '[border:var(--ptah-border-width)_solid_var(--ptah-card-border)]',
  'rounded-[var(--ptah-card-radius)]',
  'p-[var(--ptah-surface-pad)]',
].join(' ');

const BODY_TEXT_CLASS =
  'text-[length:var(--ptah-text-body-size)] leading-[var(--ptah-text-body-leading)] font-[number:var(--ptah-text-body-weight)]';

/**
 * Marks the edit-mode fields of `ptah-editable-section`. The section renders
 * the template only in edit mode, so a draft signal in the template resets
 * each time the section opens.
 *
 * @example
 * ```html
 * <ng-template ptahEditTemplate>
 *   <ptah-field label="Name"><input ptahInput [value]="draft()" (input)="onInput($event)" /></ptah-field>
 * </ng-template>
 * ```
 */
@Directive({
  selector: 'ng-template[ptahEditTemplate]',
  standalone: true,
})
export class PtahEditTemplateDirective {
  readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
}

/**
 * One section with a view mode and an edit mode (TASK_2026_1177_9109, pattern
 * spec section 4). The parent owns `editing`, `dirty`, `saving` and `error`.
 * The section emits `edit`, `save` and `cancel`, moves focus on mode changes
 * and asks for confirmation before it discards dirty edits.
 *
 * @example
 * ```html
 * <ptah-editable-section heading="Profile" [editing]="editing()" [dirty]="dirty()"
 *   [saving]="saving()" [error]="error()" (edit)="editing.set(true)"
 *   (save)="save()" (cancel)="editing.set(false)">
 *   <ptah-description-list view [items]="rows()" />
 *   <ng-template ptahEditTemplate>…fields…</ng-template>
 * </ptah-editable-section>
 * ```
 */
@Component({
  selector: 'ptah-editable-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    PtahSectionHeaderComponent,
    PtahButtonDirective,
    PtahFormActionsComponent,
    PtahAlertComponent,
    NativeModalComponent,
  ],
  host: {
    'data-ptah-pattern': 'editable-section',
    class: 'block',
    '[attr.data-editing]': 'editing() ? "" : null',
  },
  template: `
    <section
      role="region"
      data-ptah-editable-section
      [attr.aria-labelledby]="headingId"
      [class]="sectionClass()"
    >
      <ptah-section-header [heading]="heading()" [description]="description()" [level]="level()">
        <ng-container ngProjectAs="[status]"><ng-content select="[status]" /></ng-container>
        @if (!editing()) {
          <button
            #editButton
            actions
            ptahButton
            variant="secondary"
            size="sm"
            type="button"
            data-ptah-editable-edit
            [attr.aria-label]="editAriaLabel()"
            [attr.aria-disabled]="disabled() ? 'true' : null"
            [attr.aria-describedby]="disabled() && disabledReason() ? reasonId : null"
            [attr.title]="disabled() ? disabledReason() : null"
            (click)="onEdit()"
          >{{ editText() }}</button>
        }
      </ptah-section-header>
      @if (disabled() && disabledReason(); as reason) {
        <span hidden [id]="reasonId">{{ reason }}</span>
      }

      <div #viewSlot data-ptah-editable-view [class]="modeClass" [hidden]="editing() || viewEmpty()">
        <ng-content select="[view]" />
      </div>
      @if (!editing() && viewEmpty()) {
        <p data-ptah-editable-empty [class]="emptyClass">{{ emptyText() }}</p>
      }

      @if (editing()) {
        <form
          novalidate
          data-ptah-editable-form
          class="flex min-w-0 flex-col gap-[var(--ptah-gap-field)]"
          [class]="modeClass"
          [attr.aria-labelledby]="headingId"
          [attr.aria-describedby]="error() ? errorId : null"
          [attr.aria-busy]="saving() ? 'true' : null"
          (submit)="onSubmit($event)"
          (keydown.escape)="onEscape($event)"
        >
          @if (error(); as errorText) {
            <ptah-alert
              #errorAlert
              tone="error"
              live="assertive"
              tabindex="-1"
              data-ptah-editable-error
              [id]="errorId"
            >{{ errorText }}</ptah-alert>
          }
          <fieldset
            #editSlot
            data-ptah-editable-fields
            class="flex min-w-0 flex-col gap-[var(--ptah-gap-field)]"
            [disabled]="saving()"
          >
            <ng-container [ngTemplateOutlet]="editTemplate()?.templateRef ?? null" />
            <ng-content select="[edit]" />
          </fieldset>
          <ptah-form-actions
            [dirty]="dirty()"
            [saving]="saving()"
            [disabled]="disabled()"
            [sticky]="stickyActions()"
          >
            <ng-container ngProjectAs="[start]"><ng-content select="[actions-start]" /></ng-container>
            <button
              #cancelButton
              ptahButton
              variant="ghost"
              size="sm"
              type="button"
              data-ptah-editable-cancel
              [disabled]="saving()"
              (click)="requestCancel()"
            >{{ cancelLabel() }}</button>
            <button
              ptahButton
              variant="primary"
              size="sm"
              type="submit"
              data-ptah-editable-save
              [busy]="saving()"
              [disabled]="!dirty()"
            >{{ saveLabel() }}</button>
          </ptah-form-actions>
        </form>
      }

      <ptah-native-modal
        size="sm"
        [isOpen]="confirmOpen()"
        [ariaLabelledby]="dialogTitleId"
        (closed)="keepEditing()"
      >
        <h2 modal-header [id]="dialogTitleId" [class]="dialogTitleClass">Discard changes?</h2>
        <p data-ptah-editable-confirm-body [class]="dialogBodyClass">
          Your edits to {{ heading() }} will be lost.
        </p>
        <!-- Keep editing is the first control, so showModal() gives it the default focus. -->
        <div
          modal-footer
          class="mt-[var(--ptah-gap-group)] flex flex-wrap justify-end gap-[var(--ptah-gap-controls)]"
        >
          <button
            ptahButton
            variant="ghost"
            size="sm"
            type="button"
            data-ptah-editable-keep
            (click)="keepEditing()"
          >Keep editing</button>
          <button
            ptahButton
            variant="danger"
            size="sm"
            type="button"
            data-ptah-editable-discard
            (click)="discard()"
          >Discard</button>
        </div>
      </ptah-native-modal>
    </section>
  `,
})
export class PtahEditableSectionComponent {
  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
  readonly level = input<PtahSectionLevel, unknown>(3, { transform: toSectionLevel });
  readonly surface = input(false, { transform: booleanAttribute });

  readonly editing = input(false, { transform: booleanAttribute });
  readonly dirty = input(false, { transform: booleanAttribute });
  readonly saving = input(false, { transform: booleanAttribute });
  readonly error = input<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly disabledReason = input<string | null>(null);

  readonly editLabel = input('Edit');
  readonly saveLabel = input('Save');
  readonly cancelLabel = input('Cancel');
  readonly emptyText = input('Nothing set yet');
  readonly emptyActionLabel = input('Add');
  readonly stickyActions = input(false, { transform: booleanAttribute });

  readonly edit = output<void>();
  readonly save = output<void>();
  // Spec section 4.6 names this output. A dialog `cancel` event does not bubble, so none reaches the host.
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly cancel = output<void>();

  private readonly id = `ptah-editable-section-${nextEditableSectionId++}`;
  protected readonly headingId = `${this.id}-heading`;
  protected readonly errorId = `${this.id}-error`;
  protected readonly reasonId = `${this.id}-reason`;
  protected readonly dialogTitleId = `${this.id}-discard-title`;

  protected readonly modeClass = MODE_CLASS;
  protected readonly emptyClass = `${BODY_TEXT_CLASS} text-base-content-muted`;
  protected readonly dialogTitleClass =
    'mb-[var(--ptah-gap-heading)] text-[length:var(--ptah-text-body-size)] font-semibold';
  protected readonly dialogBodyClass = BODY_TEXT_CLASS;

  /** True while the confirm-discard dialog is open. */
  protected readonly confirmOpen = signal(false);
  /** True when the `[view]` slot has no rendered content. */
  protected readonly viewEmpty = signal(false);

  protected readonly editTemplate = contentChild(PtahEditTemplateDirective);
  protected readonly editText = computed(() =>
    this.viewEmpty() ? this.emptyActionLabel() : this.editLabel(),
  );
  protected readonly editAriaLabel = computed(() => `${this.editText()} ${this.heading()}`);
  protected readonly sectionClass = computed(() =>
    ['flex flex-col gap-[var(--ptah-gap-heading)]', this.surface() ? SURFACE_CLASS : '']
      .filter(Boolean)
      .join(' '),
  );

  private readonly injector = inject(Injector);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewSlot = viewChild.required<ElementRef<HTMLElement>>('viewSlot');
  private readonly editSlot = viewChild<ElementRef<HTMLElement>>('editSlot');
  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>('editButton');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly errorAlert = viewChild('errorAlert', { read: ElementRef<HTMLElement> });

  constructor() {
    afterEveryRender({
      // The section header owns the heading tag. The pattern gives it the id
      // that `aria-labelledby` names, and makes it a focus target for step 9.
      write: () => {
        const heading = this.headingElement();
        if (heading && heading.id !== this.headingId) heading.id = this.headingId;
        if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      },
      // The view slot is read only in view mode. One walk of its direct child nodes per render.
      read: () => {
        if (this.editing()) return;
        const empty = !hasRenderedContent(this.viewSlot().nativeElement);
        if (empty !== this.viewEmpty()) this.viewEmpty.set(empty);
      },
    });

    let wasEditing: boolean | undefined;
    effect(() => {
      const editing = this.editing();
      const previous = wasEditing;
      wasEditing = editing;
      if (previous === undefined || previous === editing) return;
      if (!editing) untracked(() => this.confirmOpen.set(false));
      afterNextRender(
        { write: () => (editing ? this.focusFirstField() : this.editButton()?.nativeElement.focus()) },
        { injector: this.injector },
      );
    });

    let wasSaving = false;
    effect(() => {
      const saving = this.saving();
      const failed = wasSaving && !saving;
      wasSaving = saving;
      if (!failed || !untracked(this.editing) || !untracked(this.error)) return;
      afterNextRender(
        { write: () => this.errorAlert()?.nativeElement.focus() },
        { injector: this.injector },
      );
    });
  }

  protected onEdit(): void {
    if (this.disabled()) return;
    this.edit.emit();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.saving() || !this.dirty()) return;
    this.save.emit();
  }

  protected onEscape(event: Event): void {
    // An open child panel (for example `ptah-select`) handles its own Escape first.
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.requestCancel();
  }

  protected requestCancel(): void {
    if (this.saving()) return;
    if (this.dirty()) {
      this.confirmOpen.set(true);
      return;
    }
    this.cancel.emit();
  }

  protected keepEditing(): void {
    if (!this.confirmOpen()) return;
    this.confirmOpen.set(false);
    afterNextRender(
      { write: () => this.cancelButton()?.nativeElement.focus() },
      { injector: this.injector },
    );
  }

  protected discard(): void {
    this.confirmOpen.set(false);
    this.cancel.emit();
  }

  private headingElement(): HTMLElement | null {
    return this.hostRef.nativeElement.querySelector<HTMLElement>(
      'ptah-section-header .ptah-section-title',
    );
  }

  private focusFirstField(): void {
    const slot = this.editSlot()?.nativeElement;
    const first = Array.from(slot?.querySelectorAll<HTMLElement>(FIRST_FOCUSABLE) ?? []).find(
      (node) => !node.matches(':disabled, [disabled]') && node.closest('[inert]') === null,
    );
    (first ?? this.headingElement())?.focus();
  }
}

function hasRenderedContent(slot: HTMLElement): boolean {
  return Array.from(slot.childNodes).some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE ||
      (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''),
  );
}
