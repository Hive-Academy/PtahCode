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
import type { BotSkillRef, InstalledSkill } from '@ptah-extension/shared';
import {
  NativePopoverComponent,
  PtahCheckboxDirective,
  PtahFieldComponent,
  PtahInputDirective,
} from '@ptah-extension/ui';

@Component({
  selector: 'ptah-bot-skills-picker',
  standalone: true,
  imports: [
    NativePopoverComponent,
    PtahCheckboxDirective,
    PtahFieldComponent,
    PtahInputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-wrap items-center gap-1.5"
      aria-label="Selected skills"
      role="group"
    >
      @for (skill of displaySkills(); track skill.id) {
        <span
          class="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
          [style.background]="'var(--surface-2)'"
        >
          {{ skill.id }}
          @if (!installedIds().has(skill.id)) {
            <span>(unavailable)</span>
          }
          <button
            #removeButton
            type="button"
            [disabled]="readonly()"
            [attr.aria-label]="'Remove skill ' + skill.id"
            (click)="removeChip(skill.id)"
            (keydown)="navigate($event, skill.id)"
          >
            ×
          </button>
        </span>
      }
      <ptah-native-popover
        [isOpen]="open() && !readonly()"
        (closed)="open.set(false)"
      >
        <button
          #addButton
          trigger
          type="button"
          [disabled]="readonly()"
          aria-haspopup="dialog"
          [attr.aria-expanded]="open() && !readonly()"
          (click)="open.set(!open())"
        >
          Add skills
        </button>
        <div content role="dialog" aria-label="Add skills" class="p-3">
          <ptah-field label="Search installed skills">
            <input
              #search
              ptahInput
              [value]="query()"
              (input)="query.set(search.value)"
            />
          </ptah-field>
          @for (skill of filtered(); track skill.name) {
            <label class="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                ptahCheckbox
                [checked]="selectedIds().has(skill.name)"
                [disabled]="readonly()"
                (change)="toggle(skill.name)"
              />
              <span
                >{{ skill.name
                }}<small class="block">{{ skill.description }}</small></span
              >
            </label>
          } @empty {
            <p>No installed skills found.</p>
          }
          <button type="button" (click)="open.set(false)">Done</button>
        </div>
      </ptah-native-popover>
    </div>
  `,
})
export class BotSkillsPickerComponent {
  public readonly skills = input<readonly BotSkillRef[]>([]);
  public readonly installedSkills = input<readonly InstalledSkill[]>([]);
  public readonly readonly = input(false);
  public readonly skillsChange = output<BotSkillRef[]>();
  // Show the first occurrence of each selected ID without mutating parent state.
  protected readonly displaySkills = computed(() =>
    this.skills().filter(
      (skill, index, skills) =>
        skills.findIndex((value) => value.id === skill.id) === index,
    ),
  );
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly selectedIds = computed(
    () => new Set(this.skills().map((skill) => skill.id)),
  );
  protected readonly installedIds = computed(
    () => new Set(this.installedSkills().map((skill) => skill.name)),
  );
  // The bot wire contract identifies skills by slug; collapse duplicate source copies.
  protected readonly filtered = computed(() =>
    [
      ...new Map(
        this.installedSkills().map((skill) => [skill.name, skill]),
      ).values(),
    ].filter((skill) =>
      `${skill.name} ${skill.description}`
        .toLowerCase()
        .includes(this.query().toLowerCase()),
    ),
  );
  private readonly buttons =
    viewChildren<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly addButton =
    viewChild<ElementRef<HTMLButtonElement>>('addButton');
  public toggle(id: string): void {
    if (this.readonly()) return;
    if (this.selectedIds().has(id)) this.remove(id);
    else this.skillsChange.emit([...this.skills(), { id }]);
  }
  public remove(id: string): void {
    if (this.readonly()) return;
    this.skillsChange.emit(this.skills().filter((skill) => skill.id !== id));
  }
  public removeChip(id: string): void {
    if (this.readonly()) return;
    const index = this.displaySkills().findIndex((skill) => skill.id === id);
    const target =
      this.buttons()[index + 1] ??
      this.buttons()[index - 1] ??
      this.addButton();
    target?.nativeElement.focus();
    this.remove(id);
  }
  public navigate(event: KeyboardEvent, id: string): void {
    const index = this.displaySkills().findIndex((skill) => skill.id === id);
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const target =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? this.displaySkills().length - 1
            : index + (event.key === 'ArrowLeft' ? -1 : 1);
      this.buttons()[target]?.nativeElement.focus();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeChip(id);
    }
  }
}
