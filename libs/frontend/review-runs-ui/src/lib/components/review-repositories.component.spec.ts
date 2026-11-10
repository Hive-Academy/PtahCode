import { TestBed } from '@angular/core/testing';
import type { RepositorySettings } from '@ptah-extension/review-contracts';
import { ReviewRepositoriesComponent } from './review-repositories.component';

function makeRepo(overrides: Partial<RepositorySettings>): RepositorySettings {
  return {
    owner: 'Hive-Academy',
    name: 'api',
    enabled: true,
    dryRun: false,
    publicationPaused: false,
    ...overrides,
  };
}

describe('ReviewRepositoriesComponent', () => {
  it('offers All repositories first, inks each publication state and emits the chosen filter', () => {
    TestBed.configureTestingModule({ imports: [ReviewRepositoriesComponent] });
    const fixture = TestBed.createComponent(ReviewRepositoriesComponent);
    const chosen: string[] = [];
    fixture.componentRef.setInput('repositories', [
      makeRepo({}),
      makeRepo({ name: 'docs', dryRun: true }),
      makeRepo({ name: 'web', publicationPaused: true }),
      makeRepo({ name: 'legacy', enabled: false }),
    ]);
    fixture.componentRef.setInput('selected', 'all');
    fixture.componentRef.setInput('runCount', 7);
    fixture.componentInstance.choose.subscribe((value) => chosen.push(value));
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('button[role="option"]') as NodeListOf<HTMLButtonElement>;
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain('All repositories');
    expect(rows[0].textContent).toContain('7');
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[1].getAttribute('aria-selected')).toBe('false');
    const badges = fixture.nativeElement.querySelectorAll('.badge');
    expect(badges[0].textContent?.trim()).toBe('Live');
    expect(badges[0].classList).toContain('text-state-done');
    expect(badges[1].textContent?.trim()).toBe('Dry run');
    expect(badges[1].classList).toContain('text-state-run');
    expect(badges[2].textContent?.trim()).toBe('Paused');
    expect(badges[2].classList).toContain('text-state-need');
    expect(badges[3].textContent?.trim()).toBe('Disabled');
    expect(badges[3].classList).toContain('text-state-idle');
    rows[0].click();
    rows[1].click();
    expect(chosen).toEqual(['all', 'Hive-Academy/api']);
  });

  it('keeps the empty state text when no repositories are configured', () => {
    TestBed.configureTestingModule({ imports: [ReviewRepositoriesComponent] });
    const fixture = TestBed.createComponent(ReviewRepositoriesComponent);
    fixture.componentRef.setInput('repositories', []);
    fixture.componentRef.setInput('selected', 'all');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No repositories');
    expect(fixture.nativeElement.textContent).toContain('Add an allowed repository in review settings.');
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain('Repositories');
  });
});
