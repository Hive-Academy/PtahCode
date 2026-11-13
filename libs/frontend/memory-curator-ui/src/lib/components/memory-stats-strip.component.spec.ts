import { TestBed } from '@angular/core/testing';

import { MemoryStatsStripComponent } from './memory-stats-strip.component';

describe('MemoryStatsStripComponent', () => {
  it('uses a container-sized grid for its five tiles', () => {
    TestBed.configureTestingModule({ imports: [MemoryStatsStripComponent] });
    const fixture = TestBed.createComponent(MemoryStatsStripComponent);
    fixture.componentRef.setInput('counts', {
      core: 1,
      recall: 2,
      archival: 3,
      codeIndex: 4,
    });
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector(
      '[aria-label="Memory tier statistics"]',
    ) as HTMLElement;
    expect(grid.classList.contains('grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]')).toBe(true);
    expect(grid.className).not.toContain('xl:grid-cols-');
    expect(grid.children).toHaveLength(5);
    for (const [id, label, value, tone] of [
      ['memory-stat-core', 'Core', '1', 'text-primary'],
      ['memory-stat-archival', 'Archival', '3', 'text-base-content-muted'],
      ['memory-stat-code-index', 'Code index', '4', 'text-secondary'],
      ['memory-stat-last-curated', 'Last curated', 'never', 'text-base-content-muted'],
    ]) {
      const stat = grid.querySelector(`ptah-stat[data-testid="${id}"]`);
      expect(stat?.textContent).toContain(label);
      expect(stat?.querySelector('.tabular-nums')?.textContent?.trim()).toBe(value);
      expect(stat?.querySelector('.tabular-nums')?.classList.contains(tone)).toBe(true);
      expect(stat?.getAttribute('title')).toBeNull();
    }
    const code = grid.querySelector('[data-testid="memory-stat-code-index"]');
    expect(code?.getAttribute('title')).toBe('Indexed code symbols (functions, classes, methods) — shown separately from curated memory');
    const recall = grid.querySelector('[data-testid="memory-stat-recall"]');
    expect(recall?.textContent).toContain('Recall');
    expect(recall?.textContent).toContain('2');
    expect(recall?.querySelector('.stat-value')?.classList.contains('text-info')).toBe(true);
    expect(recall?.getAttribute('title')).toBeNull();
  });
});
