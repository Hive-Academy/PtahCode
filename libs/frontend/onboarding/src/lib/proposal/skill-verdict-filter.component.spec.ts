import { TestBed } from '@angular/core/testing';
import {
  SkillVerdictFilterComponent,
  type SkillVerdictFilterOption,
} from './skill-verdict-filter.component';

const allOptions: SkillVerdictFilterOption[] = [
  { value: 'all', count: 12 },
  { value: 'install', count: 8 },
  { value: 'build', count: 2 },
  { value: 'no-skill', count: 1 },
  { value: 'not-judged', count: 1 },
];

function setup(
  active: 'all' | 'install' | 'build' | 'no-skill' | 'not-judged',
  options: readonly SkillVerdictFilterOption[] = allOptions,
  hiddenCandidateCount?: number,
) {
  const fixture = TestBed.createComponent(SkillVerdictFilterComponent);
  fixture.componentRef.setInput('active', active);
  fixture.componentRef.setInput('options', options);
  if (hiddenCandidateCount !== undefined) {
    fixture.componentRef.setInput('hiddenCandidateCount', hiddenCandidateCount);
  }
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('SkillVerdictFilterComponent', () => {
  it('renders every option with its label and item count', () => {
    const { root } = setup('all');
    expect(root.textContent).toContain('All (12 items)');
    expect(root.textContent).toContain('Install (8 items)');
    expect(root.textContent).toContain('Build (2 items)');
    expect(root.textContent).toContain('No skill needed (1 item)');
    expect(root.textContent).toContain('Not judged (1 item)');
  });

  it('marks the active option and emits the clicked filter value', () => {
    const { fixture, root } = setup('all');
    const filterChange = jest.fn();
    fixture.componentInstance.filterChange.subscribe(filterChange);
    const groupButtons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[aria-pressed]'),
    );
    expect(
      groupButtons.find((button) => button.textContent?.includes('All')),
    ).toBeTruthy();
    expect(
      groupButtons.find((button) =>
        button.textContent?.includes('Install'),
      )?.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      groupButtons
        .find((button) => button.textContent?.includes('All'))
        ?.getAttribute('aria-pressed'),
    ).toBe('true');

    groupButtons
      .find((button) => button.textContent?.includes('Install'))
      ?.click();
    expect(filterChange).toHaveBeenCalledWith('install');
  });

  it('requests all candidates through an action distinct from setting a verdict', () => {
    const { fixture, root } = setup('install', allOptions, 5);
    const filterChange = jest.fn();
    const showAllRequested = jest.fn();
    fixture.componentInstance.filterChange.subscribe(filterChange);
    fixture.componentInstance.showAllRequested.subscribe(showAllRequested);
    expect(root.textContent).toContain('5 more candidates - Show all');

    const showAll = Array.from(
      root.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes('Show all'));
    showAll?.click();
    expect(showAllRequested).toHaveBeenCalledTimes(1);
    expect(filterChange).not.toHaveBeenCalled();
  });

  it('pluralizes one hidden candidate and hides the F28 line under All or zero', () => {
    const { root: singleRoot } = setup('build', allOptions, 1);
    expect(singleRoot.textContent).toContain('1 more candidate - Show all');

    const { root: allRoot } = setup('all', allOptions, 7);
    expect(allRoot.textContent).not.toContain('more candidates');
    expect(allRoot.textContent).not.toContain('Show all');

    const { root: zeroRoot } = setup('not-judged', allOptions, 0);
    expect(zeroRoot.textContent).not.toContain('Show all');
  });
});
