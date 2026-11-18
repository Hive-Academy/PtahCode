import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PtahRichSelectComponent } from '@ptah-extension/ui';
import { GraphToolbarComponent } from './graph-toolbar.component';

describe('GraphToolbarComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(GraphToolbarComponent);
    for (const [name, value] of Object.entries({
      searchQuery: '',
      matchCount: 3,
      mode: 'nodes',
      colorBy: 'kind',
      sizeBy: 'salience',
      frozen: false,
      layoutRunning: false,
      showFiltersButton: true,
      filtersOpen: false,
    }))
      fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }
  it('emits color and size changes from the selects', () => {
    const fixture = create();
    const colors: string[] = [];
    const sizes: string[] = [];
    fixture.componentInstance.colorByChange.subscribe((value) =>
      colors.push(value),
    );
    fixture.componentInstance.sizeByChange.subscribe((value) =>
      sizes.push(value),
    );
    const selects = fixture.debugElement.queryAll(
      By.directive(PtahRichSelectComponent),
    );
    selects[0].componentInstance.value.set('tier');
    selects[1].componentInstance.value.set('hits');
    expect(colors).toEqual(['tier']);
    expect(sizes).toEqual(['hits']);
  });
  it('emits search, mode, layout, freeze and filters actions with ARIA states', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;
    const searches: string[] = [];
    const modes: string[] = [];
    const frozen: boolean[] = [];
    let layouts = 0,
      filters = 0;
    component.searchQueryChange.subscribe((value) => searches.push(value));
    component.modeChange.subscribe((value) => modes.push(value));
    component.frozenChange.subscribe((value) => frozen.push(value));
    component.relayout.subscribe(() => layouts++);
    component.filtersToggle.subscribe(() => filters++);
    const search = host.querySelector(
      '[data-testid="memory-graph-search"]',
    ) as HTMLInputElement;
    search.value = 'alpha';
    search.dispatchEvent(new Event('input'));
    (host.querySelectorAll('[role="radio"]')[1] as HTMLButtonElement).click();
    (
      host.querySelector(
        '[data-testid="memory-graph-relayout"]',
      ) as HTMLButtonElement
    ).click();
    (
      host.querySelector(
        '[data-testid="memory-graph-freeze"]',
      ) as HTMLButtonElement
    ).click();
    (
      host.querySelector(
        '[data-testid="memory-graph-filters"]',
      ) as HTMLButtonElement
    ).click();
    expect(searches).toEqual(['alpha']);
    expect(modes).toEqual(['clusters']);
    expect(frozen).toEqual([true]);
    expect(layouts).toBe(1);
    expect(filters).toBe(1);
    expect(
      host.querySelector('[role="radio"]')?.getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      host
        .querySelector('[data-testid="memory-graph-freeze"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      host.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'),
    ).toBe('false');
  });
});
