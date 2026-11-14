import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahSelectDirective,
} from '@ptah-extension/ui';

export type MemoryPurgeMode = 'substring' | 'like';

export interface MemoryPurgeRequest {
  readonly pattern: string;
  readonly mode: MemoryPurgeMode;
}

@Component({
  selector: 'ptah-memory-danger-zone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahButtonDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahSelectDirective,
    CommonModule,
  ],
  template: `
    <div class="rounded-xl border border-error/40 p-[var(--ptah-surface-pad)]">
      <h2 class="text-sm font-semibold text-error">Danger zone</h2>
      <p class="mt-0.5 text-xs text-base-content-muted">
        Permanently delete memory entries whose subject matches a pattern. This
        cannot be undone.
      </p>

      <section
        class="mt-[var(--ptah-gap-group)] flex flex-col gap-[var(--ptah-gap-field)] md:flex-row md:items-end"
        aria-label="Purge memory entries by subject pattern"
      >
        <ptah-field label="Purge by subject pattern" hint="Match memory subjects in this workspace" class="flex-1">
          <input
            ptahInput
            size="md"
            id="memory-purge-pattern"
            type="text"
            class="w-full"
            placeholder="e.g. preferences  (substring)  or  alice@%  (like)"
            [value]="pattern()"
            (input)="onPatternInput($event)"
            [disabled]="purging()"
            aria-label="Pattern to match against memory subject"
          />
        </ptah-field>
        <ptah-field label="Mode" hint="Substring or SQL LIKE pattern">
          <select
            ptahSelect
            size="md"
            id="memory-purge-mode"
            [value]="mode()"
            (change)="onModeChange($event)"
            [disabled]="purging()"
            aria-label="Pattern match mode"
          >
            <option value="substring" [selected]="mode() === 'substring'">
              substring
            </option>
            <option value="like" [selected]="mode() === 'like'">like</option>
          </select>
        </ptah-field>
        <button
          type="button"
          ptahButton
          variant="danger"
          class="md:self-end"
          [disabled]="purgeDisabled()"
          [attr.title]="
            !hasWorkspace() ? 'Open a workspace to purge memory.' : null
          "
          (click)="onPurge()"
        >
          @if (purging()) {
            <span class="loading loading-spinner loading-xs"></span>
          }
          Purge
        </button>
      </section>

      @if (!hasWorkspace()) {
        <p class="mt-2 text-xs text-base-content-muted">
          Open a workspace to purge memory.
        </p>
      }
      @if (scopeIsAll()) {
        <p class="mt-1 text-xs text-warning">
          Switch to 'This workspace' to purge.
          <button
            type="button"
            ptahButton
            variant="link"
            size="xs"
            (click)="switchScope.emit()"
          >
            Switch
          </button>
        </p>
      }

      @if (error()) {
        <div
          class="mt-[var(--ptah-gap-field)] rounded-xl border border-error/40 bg-error/5 p-[var(--ptah-surface-pad)]"
          role="alert"
        >
          <span class="text-sm text-error">{{ error() }}</span>
        </div>
      }
      @if (info()) {
        <div
          class="mt-3 rounded-xl border border-success/40 bg-success/5 px-4 py-2"
          role="status"
        >
          <span class="text-sm text-success">{{ info() }}</span>
        </div>
      }
    </div>
  `,
})
export class MemoryDangerZoneComponent {
  public readonly purging = input<boolean>(false);
  public readonly error = input<string | null>(null);
  public readonly info = input<string | null>(null);
  public readonly hasWorkspace = input<boolean>(false);
  public readonly scopeIsAll = input<boolean>(false);

  public readonly purge = output<MemoryPurgeRequest>();
  public readonly inputChanged = output<void>();
  public readonly switchScope = output<void>();

  protected readonly pattern = signal<string>('');
  protected readonly mode = signal<MemoryPurgeMode>('substring');

  protected readonly purgeDisabled = computed(
    () =>
      !this.pattern().trim() ||
      this.purging() ||
      !this.hasWorkspace() ||
      this.scopeIsAll(),
  );

  public clearPattern(): void {
    this.pattern.set('');
  }

  protected onPatternInput(event: Event): void {
    this.pattern.set((event.target as HTMLInputElement).value);
    this.inputChanged.emit();
  }

  protected onModeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'substring' || value === 'like') {
      this.mode.set(value);
    }
    this.inputChanged.emit();
  }

  protected onPurge(): void {
    const pattern = this.pattern().trim();
    if (pattern === '') return;
    this.purge.emit({ pattern, mode: this.mode() });
  }
}
