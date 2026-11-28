import { TestBed } from '@angular/core/testing';
import { SURFACE_ICON_TOKENS, type SurfaceLeaderboardProps } from '@ptah-extension/shared';
import { DashboardLeaderboardComponent } from './dashboard-leaderboard.component';
import { surfaceIcon } from './surface-icons';

describe('DashboardLeaderboardComponent', () => {
  function render(node: SurfaceLeaderboardProps): HTMLElement {
    const fixture = TestBed.createComponent(DashboardLeaderboardComponent);
    fixture.componentRef.setInput('node', node);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('renders grouped ranks, share widths, values and plain text details', () => {
    const element = render({
      title: 'Leaders',
      groups: [
        { title: 'Skills', icon: 'skill', entries: [
          { label: 'Build', share: 42, value: '4 runs', detail: '<b>Project</b>' },
          { label: 'Test', share: 17.5 },
        ] },
        { title: 'Servers', icon: 'server', entries: [{ label: 'Workspace', share: 10 }] },
      ],
    });
    expect(element.querySelector('h3')?.textContent).toBe('Leaders');
    expect(element.querySelector('ol[aria-label="Skills"] li')?.textContent).toContain('<b>Project</b>');
    expect(element.querySelector('li b')).toBeNull();
    expect(Array.from(element.querySelectorAll('.rounded-md'), badge => badge.textContent?.trim())).toEqual(['1', '2', '1']);
    expect(Array.from(element.querySelectorAll<HTMLElement>('[style]'), bar => bar.style.width)).toEqual(['42%', '17.5%', '10%']);
    expect(element.querySelector('li .sr-only')?.textContent).toBe('Build: 4 runs, share 42%');
    expect(element.querySelectorAll('lucide-angular[aria-hidden="true"] svg')).toHaveLength(2);
    expect(element.textContent).toContain('17.5%');
  });

  it('uses fallback names for blank titles and clamps both widths and values', () => {
    const element = render({ title: '  ', groups: [{ title: '', entries: [
      { label: 'Low', share: -1 }, { label: 'High', share: 101 }, { label: 'Invalid', share: NaN },
    ] }] });
    expect(element.querySelector('h3')).toBeNull();
    expect(element.querySelector('section')?.getAttribute('aria-label')).toBe('Leaderboard');
    expect(element.querySelector('ol')?.hasAttribute('aria-label')).toBe(false);
    expect(Array.from(element.querySelectorAll<HTMLElement>('[style]'), bar => bar.style.width)).toEqual(['0%', '100%', '0%']);
    expect(Array.from(element.querySelectorAll('.font-semibold'), value => value.textContent)).toEqual(['0%', '100%', '0%']);
  });

  it('looks up every catalog token and ignores unknown keys', () => {
    expect(SURFACE_ICON_TOKENS.map(surfaceIcon)).not.toContain(null);
    expect(surfaceIcon('unknown')).toBeNull();
    expect(surfaceIcon('constructor')).toBeNull();
  });
});
