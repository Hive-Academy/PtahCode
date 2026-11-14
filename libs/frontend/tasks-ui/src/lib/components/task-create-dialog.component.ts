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
import { FormsModule } from '@angular/forms';
import {
  TASK_STATUSES,
  TASK_TYPES,
  type TaskStatus,
  type TaskType,
} from '@ptah-extension/shared';
import { TASK_STATUS_LABELS } from '../task-presentation';
import {
  NativeModalComponent,
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

/**
 * TaskCreateDialogComponent
 *
 * The New Task modal: title, type, status, optional description, inline
 * validation, Cancel/Create.
 *
 * The parent renders it inside an `@if`, so opening is construction and
 * closing is destruction. The native modal owns focus trapping and restoration.
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
    NativeModalComponent,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'onClick($event)' },
  template: `
    <ptah-native-modal
      [isOpen]="true"
      ariaLabelledby="task-create-title"
      size="sm"
      data-testid="tasks-create-dialog"
      (closed)="cancelIfIdle()"
    >
      <h2
        modal-header
        id="task-create-title"
        class="mb-[var(--ptah-gap-heading)] text-lg font-semibold"
      >
        New Task
      </h2>

      <form
        class="flex flex-col gap-[var(--ptah-gap-field)]"
        (ngSubmit)="submit()"
      >
        <ptah-field
          label="Title"
          [error]="titleError() ? 'A task needs a title.' : null"
          [attr.data-testid]="titleError() ? 'tasks-create-title-error' : null"
        >
          <input
            #titleInput
            type="text"
            name="title"
            ptahInput
            placeholder="Short imperative title"
            aria-label="Task title"
            data-testid="tasks-create-title"
            [invalid]="!!titleError()"
            [ngModel]="title()"
            (ngModelChange)="title.set($event)"
            (blur)="touched.set(true)"
          />
        </ptah-field>

        <div class="grid grid-cols-2 gap-[var(--ptah-gap-controls)]">
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

        <div
          class="mt-[var(--ptah-gap-group)] flex justify-end gap-[var(--ptah-gap-controls)]"
        >
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
    </ptah-native-modal>
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

  private readonly titleInput =
    viewChild.required<ElementRef<HTMLInputElement>>('titleInput');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  public constructor() {
    afterNextRender(() => {
      this.titleInput().nativeElement.focus();
      this.guardNativeCancel();
    });
  }

  /**
   * Escape fires the native `cancel` event on the inner dialog even when focus
   * has left the form (a disabled submit button drops focus to the body), so
   * the guard sits on that event and not on a keydown handler.
   */
  private guardNativeCancel(): void {
    const dialog = this.host.nativeElement.querySelector('dialog');
    if (!dialog) return;
    const onCancel = (event: Event): void => {
      if (this.creating()) event.preventDefault();
    };
    dialog.addEventListener('cancel', onCancel);
    this.destroyRef.onDestroy(() =>
      dialog.removeEventListener('cancel', onCancel),
    );
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

  protected onClick(event: MouseEvent): void {
    if (
      this.creating() &&
      (event.target as HTMLElement).closest('.modal-backdrop')
    ) {
      event.preventDefault();
    }
  }
}
