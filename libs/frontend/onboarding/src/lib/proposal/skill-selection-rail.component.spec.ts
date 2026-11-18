import { TestBed } from '@angular/core/testing';
import { SkillSelectionRailComponent } from './skill-selection-rail.component';
function setup(count = 0) {
  const fixture = TestBed.createComponent(SkillSelectionRailComponent);
  fixture.componentRef.setInput(
    'selected',
    Array.from({ length: count }, (_, key) => ({
      key: String(key),
      name: `Skill ${key}`,
    })),
  );
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}
describe('SkillSelectionRailComponent', () => {
  it.each([
    [0, 'Continue without skills'],
    [1, 'Install 1 skill and continue'],
    [2, 'Install 2 skills and continue'],
  ])('labels the primary for %s selections', (count, label) => {
    const { root } = setup(Number(count));
    expect(
      root
        .querySelector('[data-testid="skill-install-primary"]')
        ?.textContent?.trim(),
    ).toBe(label);
    expect(root.textContent?.includes('Skip skills')).toBe(Number(count) > 0);
    expect(root.textContent).toContain(
      Number(count)
        ? 'Installs the selected skills in this workspace, then opens the next step.'
        : 'Opens the next step. No skill is installed.',
    );
  });
  it('emits primary, skip and canonical remove keys', () => {
    const { fixture, root } = setup(1);
    const primary = jest.fn();
    const skip = jest.fn();
    const removed = jest.fn();
    fixture.componentInstance.primary.subscribe(primary);
    fixture.componentInstance.skip.subscribe(skip);
    fixture.componentInstance.removed.subscribe(removed);
    root
      .querySelector<HTMLButtonElement>('[data-testid="skill-install-primary"]')
      ?.click();
    root
      .querySelector<HTMLButtonElement>('[aria-label="Remove Skill 0"]')
      ?.click();
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Skip skills'))
      ?.click();
    expect(primary).toHaveBeenCalledTimes(1);
    expect(skip).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledWith('0');
  });
  it.each(['busy', 'loading', 'previewing'])(
    'blocks actions while %s',
    (state) => {
      const { fixture, root } = setup(1);
      fixture.componentRef.setInput(state, true);
      fixture.detectChanges();
      expect(
        [...root.querySelectorAll('button')].every((button) => button.disabled),
      ).toBe(true);
      if (state === 'previewing')
        expect(root.textContent).toContain('Preparing install…');
      if (state === 'loading') {
        expect(root.textContent).toContain('Finding skills…');
        expect(root.textContent).not.toContain('Installs the selected');
      }
    },
  );
  it('shows each script helper state and resets via the preview input', () => {
    const { fixture, root } = setup(2);
    expect(root.textContent).toContain(
      'You approve skills that contain scripts before the install.',
    );
    fixture.componentRef.setInput('previewScriptCount', 1);
    fixture.detectChanges();
    expect(root.textContent).toContain(
      '1 selected skill contains scripts. You approve it before the install.',
    );
    fixture.componentRef.setInput('previewScriptCount', 2);
    fixture.detectChanges();
    expect(root.textContent).toContain(
      '2 selected skills contain scripts. You approve them before the install.',
    );
    fixture.componentRef.setInput('previewScriptCount', 0);
    fixture.detectChanges();
    expect(root.textContent).not.toContain('scripts');
    fixture.componentRef.setInput('previewScriptCount', null);
    fixture.detectChanges();
    expect(root.textContent).toContain(
      'You approve skills that contain scripts before the install.',
    );
  });
  it('pins the footer outside the scrolling list and supports bar layout', () => {
    const { fixture, root } = setup(2);
    expect(
      root
        .querySelector('footer')
        ?.parentElement?.querySelector('.overflow-y-auto'),
    ).toBeTruthy();
    expect(
      root.querySelector('footer')?.closest('.overflow-y-auto'),
    ).toBeNull();
    fixture.componentRef.setInput('layout', 'bar');
    fixture.detectChanges();
    expect(root.querySelector('ul')).toBeNull();
    expect(
      root.querySelector('ptah-form-actions')?.hasAttribute('data-sticky'),
    ).toBe(false);
    expect(
      root.querySelectorAll('[data-testid="skill-install-primary"]'),
    ).toHaveLength(1);
    const buttons = [...root.querySelectorAll('button')];
    expect(
      buttons.find((button) => button.textContent?.includes('Skip skills')),
    ).toBeTruthy();
  });
  it('announces selection and stack coverage together in one polite region', () => {
    const { fixture, root } = setup(1);
    fixture.componentRef.setInput('total', 3);
    fixture.componentRef.setInput('coveredCount', 2);
    fixture.componentRef.setInput('stackCount', 4);
    fixture.detectChanges();
    const live = root.querySelector('[aria-live="polite"]');
    expect(live?.textContent?.replace(/\s+/g, ' ').trim()).toContain(
      '1 of 3 selected Covers 2 of 4 stack items',
    );
  });
});
