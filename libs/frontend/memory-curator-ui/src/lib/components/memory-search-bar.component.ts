import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {
  PtahFieldComponent,
  PtahInputDirective,
  PtahRichSelectComponent,
  type PtahSelectOption,
} from '@ptah-extension/ui';
import type {
  MemoryScopeFilter,
  MemoryTierFilter,
} from '../services/memory-state.service';

@Component({
  selector: 'ptah-memory-search-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahFieldComponent, PtahInputDirective, PtahRichSelectComponent],
  template: `
    <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <ptah-field
        label="Search memory entries"
        size="sm"
        class="w-full max-w-sm"
      >
        <input
          type="search"
          ptahInput
          size="sm"
          data-testid="memory-search-input"
          class="w-full"
          placeholder="Search memory (BM25 + vector hybrid)..."
          [value]="searchValue()"
          (input)="onSearchInput($event)"
          aria-label="Search memory entries"
        />
      </ptah-field>
      <ptah-select
        label="Memory tier filter"
        aria-label="Memory tier filter"
        size="sm"
        [options]="tierOptions"
        [value]="tier()"
        (valueChange)="onTierChange($event)"
      />
      <ptah-select
        label="Memory workspace scope"
        aria-label="Memory workspace scope"
        size="sm"
        class="md:ml-auto"
        [options]="scopeOptions"
        [value]="scope()"
        (valueChange)="onScopeChange($event)"
      />
    </div>
  `,
})
export class MemorySearchBarComponent {
  public readonly searchValue = input<string>('');
  public readonly tier = input.required<MemoryTierFilter>();
  public readonly scope = input.required<MemoryScopeFilter>();

  public readonly searchInput = output<string>();
  public readonly tierChange = output<MemoryTierFilter>();
  public readonly scopeChange = output<MemoryScopeFilter>();

  protected readonly tierOptions: readonly PtahSelectOption<MemoryTierFilter>[] =
    [
      { value: 'all', label: 'All' },
      { value: 'core', label: 'Core' },
      { value: 'recall', label: 'Recall' },
      { value: 'archival', label: 'Archival' },
    ];
  protected readonly scopeOptions: readonly PtahSelectOption<MemoryScopeFilter>[] =
    [
      { value: 'workspace', label: 'This workspace' },
      { value: 'all', label: 'All workspaces' },
    ];

  protected onSearchInput(event: Event): void {
    this.searchInput.emit((event.target as HTMLInputElement).value);
  }

  protected onTierChange(value: MemoryTierFilter | null): void {
    if (value !== null) this.tierChange.emit(value);
  }

  protected onScopeChange(value: MemoryScopeFilter | null): void {
    if (value !== null) this.scopeChange.emit(value);
  }
}
