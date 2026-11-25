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
  it('pins the footer outside the scrolling list and lets bar users remove retained selections', () => {
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
    fixture.componentRef.setInput('selected', [
      { key: 'registry:retained', name: 'Retained registry skill' },
      { key: 'registry:other', name: 'Other selected skill' },
    ]);
    const removed = jest.fn();
    fixture.componentInstance.removed.subscribe(removed);
    fixture.detectChanges();
    const disclosure = root.querySelector<HTMLButtonElement>(
      'button[aria-expanded="false"][aria-controls]',
    );
    const selectedList = root.querySelector<HTMLElement>('[data-selected-list]');
    expect(disclosure?.getAttribute('aria-controls')).toBe(selectedList?.id);
    expect(selectedList?.hidden).toBe(true);

    disclosure?.click();
    fixture.detectChanges();
    expect(disclosure?.getAttribute('aria-expanded')).toBe('true');
    expect(selectedList?.hidden).toBe(false);
    expect(selectedList?.querySelectorAll('li')).toHaveLength(2);
    selectedList
      ?.querySelector<HTMLButtonElement>('[aria-label="Remove Retained registry skill"]')
      ?.click();
    expect(removed).toHaveBeenCalledWith('registry:retained');

    disclosure?.click();
    fixture.detectChanges();
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false');
    expect(selectedList?.hidden).toBe(true);
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
  it('disables Install with a visible aria-describedby reason when installBlockedReason is set and re-enables when null', () => {
    const reason = 'Finish or cancel the open skill draft before installing';
    const { fixture, root } = setup(2);
    const primary = jest.fn();
    fixture.componentInstance.primary.subscribe(primary);

    const installButton = (): HTMLButtonElement =>
      root.querySelector<HTMLButtonElement>(
        '[data-testid="skill-install-primary"]',
      ) as HTMLButtonElement;

    // Default (unjudged / no draft open): enabled and no blocked reason.
    expect(installButton().disabled).toBe(false);
    expect(
      root.querySelector('[data-testid="skill-install-blocked-reason"]'),
    ).toBeNull();
    const defaultDescribedBy = installButton().getAttribute('aria-describedby');
    expect(defaultDescribedBy).toBeTruthy();
    expect(root.querySelector(`#${defaultDescribedBy}`)?.textContent).toContain(
      'Installs the selected skills',
    );

    // Blocked while draft editor is open (R20 / F29).
    fixture.componentRef.setInput('installBlockedReason', reason);
    fixture.detectChanges();

    expect(installButton().disabled).toBe(true);
    const reasonEl = root.querySelector<HTMLElement>(
      '[data-testid="skill-install-blocked-reason"]',
    );
    expect(reasonEl?.textContent?.trim()).toBe(reason);
    expect(reasonEl?.id).toBeTruthy();
    expect(installButton().getAttribute('aria-describedby')).toBe(reasonEl?.id);

    installButton().click();
    expect(primary).not.toHaveBeenCalled();

    // Non-install controls remain enabled when only installBlockedReason is active.
    const skipButton = root.querySelector<HTMLButtonElement>(
      '[data-selection-skip]',
    );
    const removeButton = root.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Skill 0"]',
    );
    expect(skipButton?.disabled).toBe(false);
    expect(removeButton?.disabled).toBe(false);

    // Cleared back to null: enabled, no blocked reason, helper aria-describedby restored.
    fixture.componentRef.setInput('installBlockedReason', null);
    fixture.detectChanges();

    expect(installButton().disabled).toBe(false);
    expect(
      root.querySelector('[data-testid="skill-install-blocked-reason"]'),
    ).toBeNull();
    expect(installButton().getAttribute('aria-describedby')).toBe(
      defaultDescribedBy,
    );

    // Whitespace-only string does not block.
    fixture.componentRef.setInput('installBlockedReason', '   ');
    fixture.detectChanges();
    expect(installButton().disabled).toBe(false);
    expect(
      root.querySelector('[data-testid="skill-install-blocked-reason"]'),
    ).toBeNull();
  });
  it('keeps only one primary action by disabling the primary button even with 0 selected when installBlockedReason is set', () => {
    const reason = 'Finish or cancel the open skill draft before installing';
    const { fixture, root } = setup(0);
    fixture.componentRef.setInput('installBlockedReason', reason);
    fixture.detectChanges();

    const primaryButton = root.querySelector<HTMLButtonElement>(
      '[data-testid="skill-install-primary"]',
    );
    const reasonEl = root.querySelector<HTMLElement>(
      '[data-testid="skill-install-blocked-reason"]',
    );
    expect(primaryButton?.disabled).toBe(true);
    expect(reasonEl?.textContent?.trim()).toBe(reason);
    expect(primaryButton?.getAttribute('aria-describedby')).toBe(reasonEl?.id);
  });
  it('applies sticky bar host attributes/classes in judged bar mode and preserves unjudged responsive defaults', () => {
    const { fixture, root } = setup(1);

    // Default unjudged rail state.
    expect(root.getAttribute('data-layout')).toBe('rail');
    expect(root.classList.contains('responsive')).toBe(false);
    expect(root.classList.contains('sticky')).toBe(true);
    expect(root.classList.contains('top-6')).toBe(true);

    // Unjudged team-builder responsive rail.
    fixture.componentRef.setInput('responsive', true);
    fixture.detectChanges();
    expect(root.getAttribute('data-layout')).toBe('rail');
    expect(root.classList.contains('responsive')).toBe(true);

    // Judged mode sticky bottom bar (plan 3.6 / R22).
    fixture.componentRef.setInput('responsive', false);
    fixture.componentRef.setInput('layout', 'bar');
    fixture.detectChanges();
    expect(root.getAttribute('data-layout')).toBe('bar');
    expect(root.classList.contains('responsive')).toBe(false);
    expect(root.classList.contains('sticky')).toBe(true);
    expect(root.classList.contains('bottom-0')).toBe(true);
    expect(root.classList.contains('w-full')).toBe(true);
    expect(root.classList.contains('box-border')).toBe(true);
  });
});
