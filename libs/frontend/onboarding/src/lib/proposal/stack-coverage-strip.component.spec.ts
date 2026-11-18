import { TestBed } from '@angular/core/testing';
import { StackCoverageStripComponent } from './stack-coverage-strip.component';
import type { StackCoverageItem } from './stack-coverage';
describe('StackCoverageStripComponent', () => {
  it('renders all coverage states with accessible filter buttons and evidence titles', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    const items: StackCoverageItem[] = (
      ['covered', 'available', 'none', 'failed'] as const
    ).map((state) => ({
      name: state,
      kind: 'framework',
      evidence: 'package.json',
      state,
      selectedCount: state === 'covered' ? 2 : 0,
      totalCount: 2,
    }));
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('activeItem', 'framework:covered');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const emitted = jest.fn();
    fixture.componentInstance.filterChanged.subscribe(emitted);
    const buttons = root.querySelectorAll('button');
    expect(buttons[1]?.getAttribute('aria-label')).toBe(
      'covered, covered by 2 selected skills',
    );
    expect(buttons[1]?.getAttribute('title')).toBe('framework: package.json');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    const descriptionId = buttons[1]?.getAttribute('aria-describedby');
    expect(
      root.querySelector(`[id="${descriptionId}"]`)?.textContent,
    ).toContain('framework: package.json');
    expect(root.textContent).toContain('2 available');
    expect(root.textContent).toContain('no match');
    expect(root.textContent).toContain('search failed');
    expect(root.querySelector('[data-coverage-count]')?.textContent).toContain(
      '1 of 4 stack items covered',
    );
    buttons[1]?.click();
    expect(emitted).toHaveBeenLastCalledWith(null);
    buttons[2]?.click();
    expect(emitted).toHaveBeenLastCalledWith('framework:available');
    buttons[0]?.click();
    expect(emitted).toHaveBeenLastCalledWith(null);
  });
  it('shows six skeleton chips and announces loading', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('ptah-skeleton')).toHaveLength(6);
    expect(root.textContent).toContain('Finding recommended skills');
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('[data-coverage-count]')).toBeNull();
  });
  it('collapses more than twelve stack chips and expands the full list in place', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    fixture.componentRef.setInput(
      'items',
      Array.from({ length: 14 }, (_, index): StackCoverageItem => ({
        name: `Framework ${index}`,
        kind: 'framework',
        evidence: 'package.json',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
      })),
    );
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('button[aria-label]')).toHaveLength(11);
    const more = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('+3 more'),
    );
    expect(more).toBeDefined();
    more?.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('button[aria-label]')).toHaveLength(14);
    expect(root.textContent).not.toContain('+3 more');
  });
  it('distinguishes filter keys for equal names of different kinds', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    fixture.componentRef.setInput('items', [
      {
        name: 'TypeScript',
        kind: 'language',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
        evidence: '',
      },
      {
        name: 'TypeScript',
        kind: 'library',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
        evidence: '',
      },
    ]);
    fixture.componentRef.setInput('activeItem', 'language:TypeScript');
    const changed = jest.fn();
    fixture.componentInstance.filterChanged.subscribe(changed);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const chips = root.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="TypeScript, no match"]',
    );
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(chips[1]?.getAttribute('aria-pressed')).toBe('false');
    chips[1]?.click();
    expect(changed).toHaveBeenCalledWith('library:TypeScript');
  });
});
