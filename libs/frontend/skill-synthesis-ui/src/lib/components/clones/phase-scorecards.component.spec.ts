import { TestBed } from '@angular/core/testing';
import type { PhaseScorecard } from '@ptah-extension/shared';

import { PhaseScorecardsComponent } from './phase-scorecards.component';

function render(cards: readonly PhaseScorecard[]): HTMLElement {
  const fixture = TestBed.createComponent(PhaseScorecardsComponent);
  fixture.componentRef.setInput('scorecards', cards);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PhaseScorecardsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PhaseScorecardsComponent] });
  });

  it('renders nothing when there are no phase scorecards', () => {
    expect(render([]).querySelector('[data-testid="phase-scorecards"]')).toBeNull();
  });

  it('renders phase and legacy rows apart with the alias label', () => {
    const el = render([
      {
        phaseKind: 'implement',
        source: 'phase',
        legacy: false,
        aliasedRoles: [],
        gradedCount: 4,
        passedCount: 3,
        gradedSuccessRate: 0.75,
      },
      {
        phaseKind: 'implement',
        source: 'role-alias',
        legacy: true,
        aliasedRoles: ['backend-developer', 'frontend-developer'],
        gradedCount: 2,
        passedCount: 0,
        gradedSuccessRate: null,
      },
    ]);
    const rows = el.querySelectorAll('[data-testid="phase-scorecard-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('75%');
    expect(rows[0].querySelector('[data-testid="phase-scorecard-legacy"]')).toBeNull();
    expect(rows[1].textContent).toContain(
      'legacy (role alias: backend-developer, frontend-developer)',
    );
    expect(rows[1].textContent).toContain('No grade');
  });
});
