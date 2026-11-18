import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NativeDrawerComponent, PtahButtonDirective } from '@ptah-extension/ui';
import type { BotEditable } from '@ptah-extension/shared';
import type { BotConflict } from './bots.store';

const FIELDS: readonly { key: keyof BotEditable; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'instructions', label: 'Instructions' },
  { key: 'scope', label: 'Scope' },
  { key: 'avatar', label: 'Avatar' },
  { key: 'runtime', label: 'Runtime / Model' },
  { key: 'skills', label: 'Skills' },
  { key: 'toolRequirements', label: 'Tools' },
  { key: 'memoryScope', label: 'Memory' },
  { key: 'approvalRules', label: 'Approval rules' },
  { key: 'triggers', label: 'Triggers' },
];
function display(value: unknown): string {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value, null, 2) ?? 'Not set');
}
@Component({
  selector: 'ptah-bot-conflict-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NativeDrawerComponent, PtahButtonDirective],
  template: `@if (conflict(); as c) {
    <div role="alert" class="border border-error rounded-lg p-4 my-4">
      <h3 class="font-semibold">A newer revision exists</h3>
      <p>
        Revision {{ c.latest.revision }} was saved after you opened revision
        {{ c.mine.revision }}. Your changes are not saved yet.
      </p>
      <p>Different fields: {{ changedLabels() || 'None' }}.</p>
      <div class="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          ptahButton
          [disabled]="busy()"
          (click)="compare.emit()"
        >
          Compare with revision {{ c.latest.revision }}
        </button>
        <button
          type="button"
          ptahButton
          [disabled]="busy()"
          (click)="resubmit.emit()"
        >
          Save mine as revision {{ c.latest.revision + 1 }}
        </button>
        <button
          type="button"
          ptahButton
          variant="ghost"
          [disabled]="busy()"
          (click)="loadLatest.emit()"
        >
          Discard mine and load revision {{ c.latest.revision }}
        </button>
        <button
          type="button"
          ptahButton
          variant="ghost"
          [disabled]="busy()"
          (click)="editMine.emit()"
        >
          Edit mine
        </button>
      </div>
    </div>
    <ptah-native-drawer
      [isOpen]="isOpen()"
      ariaLabel="Compare bot revisions"
      (closed)="closed.emit()"
    >
      <h2 drawer-header>Compare with revision {{ c.latest.revision }}</h2>
      @for (row of comparison(); track row.key) {
        <section class="border-b border-base-300 py-4">
          <h3 class="font-semibold">{{ row.label }}</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <h4>Revision {{ c.latest.revision }}</h4>
              <pre class="whitespace-pre-wrap break-words text-xs">{{
                row.latest
              }}</pre>
            </div>
            <div>
              <h4>Your changes</h4>
              <pre class="whitespace-pre-wrap break-words text-xs">{{
                row.mine
              }}</pre>
            </div>
          </div>
        </section>
      } @empty {
        <p>No field differences.</p>
      }
      <div drawer-footer class="p-4">
        <button
          type="button"
          ptahButton
          [disabled]="busy()"
          (click)="editMine.emit()"
        >
          Edit mine
        </button>
      </div>
    </ptah-native-drawer>
  }`,
})
export class BotConflictDrawerComponent {
  public readonly conflict = input<BotConflict | null>(null);
  public readonly isOpen = input(false);
  public readonly busy = input(false);
  public readonly compare = output<void>();
  public readonly editMine = output<void>();
  public readonly resubmit = output<void>();
  public readonly loadLatest = output<void>();
  public readonly closed = output<void>();
  protected readonly comparison = computed(() => {
    const c = this.conflict();
    return c
      ? FIELDS.map((field) => ({
          ...field,
          latest: display(c.latest[field.key]),
          mine: display(c.mine.definition[field.key]),
        })).filter((row) => row.latest !== row.mine)
      : [];
  });
  protected readonly changedLabels = computed(() =>
    this.comparison()
      .map((row) => row.label)
      .join(', '),
  );
}
