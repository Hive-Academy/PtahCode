import { TestBed } from '@angular/core/testing';

import { MemoryStatsStripComponent } from './memory-stats-strip.component';

describe('MemoryStatsStripComponent', () => {
  it('renders five instrument segments with the existing test ids and values', () => {
    TestBed.configureTestingModule({ imports: [MemoryStatsStripComponent] });
    const fixture = TestBed.createComponent(MemoryStatsStripComponent);
    fixture.componentRef.setInput('counts', {
      core: 1,
      recall: 2,
      archival: 3,
      codeIndex: 4,
    });
    fixture.detectChanges();

    const band = fixture.nativeElement.querySelector(
      'ptah-instrument-band',
    ) as HTMLElement;
    expect(band.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Memory tier statistics',
    );
    expect(band.querySelectorAll('li')).toHaveLength(5);
    for (const [id, label, value] of [
      ['memory-stat-core', 'Core', '1'],
      ['memory-stat-recall-tile', 'Recall', '2'],
      ['memory-stat-archival', 'Archival', '3'],
      ['memory-stat-code-index', 'Code index', '4'],
      ['memory-stat-last-curated', 'Last curated', 'never'],
    ]) {
      const segment = band.querySelector(`[data-testid="${id}"]`);
      expect(segment?.textContent).toContain(label);
      expect(segment?.textContent).toContain(value);
    }
    expect(
      band
        .querySelector('[data-testid="memory-stat-recall"]')
        ?.textContent?.trim(),
    ).toBe('2');
    expect(
      band
        .querySelector('[data-testid="memory-stat-code-index"]')
        ?.getAttribute('title'),
    ).toBe(
      'Indexed code symbols (functions, classes, methods) — shown separately from curated memory',
    );
  });
});
