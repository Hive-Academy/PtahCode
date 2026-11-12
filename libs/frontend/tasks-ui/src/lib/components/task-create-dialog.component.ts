import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TASK_STATUSES,
  TASK_TYPES,
  type TaskStatus,
  type TaskType,
} from '@ptah-extension/shared';
import { TASK_STATUS_LABELS } from '../task-presentation';
import {
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahSelectDirective,
  PtahTextareaDirective,
} from '@ptah-extension/ui';

/** What the dialog hands back; the parent turns it into `tasks:create`. */
export interface TaskCreateDraft {
  readonly title: string;
  readonly type: TaskType;
  readonly status: TaskStatus;
  /** Trimmed; empty when the user left it blank. */
  readonly description: string;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * TaskCreateDialogComponent
 *
 * The New Task modal: title, type, status, optional description, inline
 * validation, Cancel/Create.
 *
 * The parent renders it inside an `@if`, so opening is construction and
 * closing is destruction. Construction captures the element that opened it;
 * destruction gives focus back to that element. Tab is trapped inside the box
 * and Escape cancels, unless a create is in flight.
 *
 * It does not call the store: `submitted` carries the draft and the parent
 * owns the write and closes the dialog only when the host accepted it.
 */
@Component({
  selector: 'ptah-task-create-dialog',
  standalone: true,
  imports: [
    PtahButtonDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahSelectDirective,
    PtahTextareaDirective,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKeyDown($event)' },
  template: `
    <dialog
      class="modal modal-open"
      aria-labelledby="task-create-title"
      data-testid="tasks-create-dialog"
    >
      <div
        #box
        class="modal-box max-w-md bg-surface-2 border border-surface-border rounded-box p-5 text-base-content shadow-[var(--elev-shadow-raised)]"
      >
        <h2 id="task-create-title" class="mb-4 text-lg font-semibold">
          New Task
        </h2>

        <form class="flex flex-col gap-3" (ngSubmit)="submit()">
          <div>
            <ptah-field label="Title">
              <input
                #titleInput
                type="text"
                name="title"
                ptahInput
                placeholder="Short imperative title"
                aria-label="Task title"
                data-testid="tasks-create-title"
                [invalid]="!!titleError()"
                [attr.aria-describedby]="
                  titleError() ? 'task-create-title-error' : null
                "
                [ngModel]="title()"
                (ngModelChange)="title.set($event)"
                (blur)="touched.set(true)"
              />
            </ptah-field>
            @if (titleError()) {
              <span
                id="task-create-title-error"
                class="mt-1 text-sm text-error"
                data-testid="tasks-create-title-error"
              >
                A task needs a title.
              </span>
            }
          </div>

          <div class="grid grid-cols-2 gap-3">
            <ptah-field label="Type">
              <select
                name="type"
                ptahSelect
                aria-label="Task type"
                data-testid="tasks-create-type"
                [ngModel]="type()"
                (ngModelChange)="setType($event)"
              >
                @for (option of taskTypes; track option) {
                  <option [value]="option">{{ option }}</option>
                }
              </select>
            </ptah-field>

            <ptah-field label="Status">
              <select
                name="status"
                ptahSelect
                aria-label="Task status"
                data-testid="tasks-create-status"
                [ngModel]="status()"
                (ngModelChange)="setStatus($event)"
              >
                @for (option of taskStatuses; track option) {
                  <option [value]="option">{{ statusLabel(option) }}</option>
                }
              </select>
            </ptah-field>
          </div>

          <ptah-field label="Description (optional)">
            <textarea
              name="description"
              ptahTextarea
              rows="3"
              placeholder="One-line summary"
              aria-label="Task description"
              [ngModel]="description()"
              (ngModelChange)="description.set($event)"
            ></textarea>
          </ptah-field>

          <div class="mt-2 flex justify-end gap-2">
            <button
              type="button"
              ptahButton
              variant="ghost"
              data-testid="tasks-create-cancel"
              [disabled]="creating()"
              (click)="cancelled.emit()"
            >
              Cancel
            </button>
            <button
              type="submit"
              ptahButton
              variant="primary"
              data-testid="tasks-create-submit"
              [disabled]="!canCreate() || creating()"
            >
              @if (creating()) {
                <span
                  class="loading loading-spinner loading-xs"
                  aria-hidden="true"
                ></span>
              }
              Create
            </button>
          </div>
        </form>
      </div>
      <button
        type="button"
        class="modal-backdrop"
        tabindex="-1"
        aria-label="Close"
        (click)="cancelIfIdle()"
      ></button>
    </dialog>
  `,
})
export class TaskCreateDialogComponent {
  /** Status the draft opens in — set by whichever lane `+` was pressed. */
  public readonly initialStatus = input<TaskStatus>('backlog');
  /** True while the parent's `tasks:create` call is in flight. */
  public readonly creating = input(false);

  public readonly submitted = output<TaskCreateDraft>();
  public readonly cancelled = output<void>();

  protected readonly taskTypes = TASK_TYPES;
  protected readonly taskStatuses = TASK_STATUSES;

  protected readonly title = signal('');
  protected readonly type = signal<TaskType>('FEATURE');
  /** `null` until the user picks one, so `initialStatus` stays authoritative. */
  private readonly pickedStatus = signal<TaskStatus | null>(null);
  protected readonly status = computed(
    () => this.pickedStatus() ?? this.initialStatus(),
  );
  protected readonly description = signal('');
  protected readonly touched = signal(false);

  protected readonly canCreate = computed(() => this.title().trim().length > 0);
  protected readonly titleError = computed(
    () => this.touched() && !this.canCreate(),
  );

  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private readonly titleInput =
    viewChild.required<ElementRef<HTMLInputElement>>('titleInput');

  public constructor() {
    const opener = inject(DOCUMENT).activeElement;
    afterNextRender(() => this.titleInput().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    });
  }

  protected statusLabel(status: TaskStatus): string {
    return TASK_STATUS_LABELS[status];
  }

  protected setType(value: string): void {
    const match = TASK_TYPES.find((option) => option === value);
    if (match) this.type.set(match);
  }

  protected setStatus(value: string): void {
    const match = TASK_STATUSES.find((option) => option === value);
    if (match) this.pickedStatus.set(match);
  }

  protected submit(): void {
    this.touched.set(true);
    if (!this.canCreate() || this.creating()) return;
    this.submitted.emit({
      title: this.title().trim(),
      type: this.type(),
      status: this.status(),
      description: this.description().trim(),
    });
  }

  protected cancelIfIdle(): void {
    if (!this.creating()) this.cancelled.emit();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelIfIdle();
      return;
    }
    if (event.key === 'Tab') this.trapTab(event);
  }

  /** Keep Tab and Shift+Tab inside the modal box. */
  private trapTab(event: KeyboardEvent): void {
    const focusables = Array.from(
      this.box().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
