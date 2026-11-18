import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { PtahFieldComponent, PtahInputDirective } from '@ptah-extension/ui';

let toolInputId = 0;

@Component({
  selector: 'ptah-tool-id-chip-input',
  standalone: true,
  imports: [PtahFieldComponent, PtahInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="group"
      class="flex flex-wrap items-center gap-1.5"
      [attr.aria-label]="label() + ' selections'"
    >
      @for (id of displayIds(); track id) {
        <span
          class="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
          [style.background]="'var(--surface-2)'"
        >
          {{ id }}
          @if (catalogLoaded() && !knownIds().includes(id)) {
            <span>(unresolved)</span>
          }
          @if (overlapIds().includes(id)) {
            <span>in both lists</span>
          }
          <button
            #removeButton
            type="button"
            [disabled]="readonly()"
            [attr.aria-label]="'Remove tool ' + id"
            [attr.aria-describedby]="
              overlapIds().includes(id) ? warningId : null
            "
            (click)="remove(id)"
            (keydown)="navigate($event, id)"
          >
            ×
          </button>
        </span>
      }
    </div>
    <ptah-field [label]="label()" hint="Enter a tool id, then press Enter.">
      <input
        #entry
        ptahInput
        [value]="draft()"
        [disabled]="readonly()"
        (input)="draft.set(entry.value)"
        (keydown.enter)="$event.preventDefault(); add()"
        (keydown.arrowleft)="focusLast($event)"
        [attr.aria-describedby]="overlap().length ? warningId : null"
      />
    </ptah-field>
    <button
      type="button"
      [disabled]="readonly() || !draft().trim()"
      (click)="add()"
    >
      Add tool
    </button>
    @if (overlap().length) {
      <p
        [id]="warningId"
        role="status"
        class="text-xs"
        [style.color]="'var(--state-ink-need)'"
      >
        {{ overlap().join(', ') }}: in both lists. Deny takes precedence.
      </p>
    }
  `,
})
export class ToolIdChipInputComponent {
  public readonly ids = input<readonly string[]>([]);
  public readonly knownIds = input<readonly string[]>([]);
  public readonly catalogLoaded = input(true);
  public readonly overlapIds = input<readonly string[]>([]);
  public readonly label = input('Tool id');
  public readonly readonly = input(false);
  public readonly idsChange = output<string[]>();
  // Set preserves first-occurrence order; parent input arrays stay untouched.
  protected readonly displayIds = computed(() => [...new Set(this.ids())]);
  protected readonly draft = signal('');
  protected readonly warningId = `bot-tool-overlap-${++toolInputId}`;
  protected readonly overlap = computed(() =>
    this.displayIds().filter((id) => this.overlapIds().includes(id)),
  );
  private readonly buttons =
    viewChildren<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly entry = viewChild<ElementRef<HTMLInputElement>>('entry');

  public add(): void {
    const id = this.draft().trim();
    if (this.readonly() || !id) return;
    if (!this.ids().includes(id)) this.idsChange.emit([...this.ids(), id]);
    this.draft.set('');
  }
  public remove(id: string): void {
    if (this.readonly()) return;
    const index = this.displayIds().indexOf(id);
    const target =
      this.buttons()[index + 1] ?? this.buttons()[index - 1] ?? this.entry();
    target?.nativeElement.focus();
    this.idsChange.emit(this.ids().filter((value) => value !== id));
  }
  public navigate(event: KeyboardEvent, id: string): void {
    const index = this.displayIds().indexOf(id);
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      event.preventDefault();
      const target =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? this.displayIds().length - 1
            : index + (event.key === 'ArrowLeft' ? -1 : 1);
      this.buttons()[target]?.nativeElement.focus();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(id);
    }
  }
  public focusLast(event: Event): void {
    if (!this.draft()) {
      event.preventDefault();
      this.buttons().at(-1)?.nativeElement.focus();
    }
  }
}
