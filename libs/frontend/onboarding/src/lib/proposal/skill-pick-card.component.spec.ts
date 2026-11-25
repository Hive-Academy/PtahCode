import { TestBed } from '@angular/core/testing';
import type { SkillShEntry } from '@ptah-extension/shared';
import { SkillPickCardComponent } from './skill-pick-card.component';
const skill: SkillShEntry = {
  source: 'acme/repo',
  skillId: 'angular',
  name: 'Angular skill',
  description: '',
  installs: 12400,
  isInstalled: false,
  url: 'https://skills.sh/acme/repo/angular',
};
function setup(value = skill) {
  const fixture = TestBed.createComponent(SkillPickCardComponent);
  fixture.componentRef.setInput('skill', value);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}
describe('SkillPickCardComponent', () => {
  it('shows compact installs, full accessible installs, and the description fallback', () => {
    const { root } = setup();
    expect(root.textContent).toContain('12.4k');
    expect(root.textContent).toContain('acme/repo - 12,400 installs');
    expect(root.querySelector('[aria-label="12,400 installs"]')).toBeTruthy();
    expect(root.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Select Angular skill',
    );
  });
  it('keeps installed skills selectable with a badge and reinstall hint', () => {
    const { fixture, root } = setup({
      ...skill,
      isInstalled: true,
      installs: 0,
    });
    expect(root.textContent).toContain('Installed');
    expect(root.textContent).toContain('New');
    expect(root.textContent).toContain('Select to reinstall this version.');
    const toggled = jest.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    root.querySelector('input')?.click();
    expect(toggled).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('selected', true);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(root.querySelector('label')?.hasAttribute('data-selected')).toBe(
      true,
    );
    expect(root.querySelector('input')?.disabled).toBe(true);
  });
  it('limits chips to three and highlights the filtered item, or shows raw evidence', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('coveredItems', [
      'Angular',
      'Jest',
      'Nx',
      'Electron',
    ]);
    fixture.componentRef.setInput('highlightItem', 'Angular');
    fixture.detectChanges();
    expect(root.textContent).toContain('+1');
    expect(root.textContent).not.toContain('Electron');
    expect(root.querySelector('[data-tone="accent"]')?.textContent).toContain(
      'Angular',
    );
    fixture.componentRef.setInput('coveredItems', []);
    fixture.componentRef.setInput('rawEvidence', 'Project tooling');
    fixture.detectChanges();
    expect(root.textContent).toContain('Project tooling');
  });
  it('opens the external link without toggling selection, and omits unsafe URLs', () => {
    const { fixture, root } = setup();
    const toggled = jest.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    root.querySelector('a')?.click();
    expect(toggled).not.toHaveBeenCalled();
    expect(root.querySelector('a')?.target).toBe('_blank');
    fixture.componentRef.setInput('skill', {
      ...skill,
      url: 'javascript:alert(1)',
      description: '<img src=x>',
    });
    fixture.detectChanges();
    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x>');
  });
  it('includes the active fourth badge while retaining the first two', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('coveredItems', ['A', 'B', 'C', 'D']);
    fixture.componentRef.setInput('highlightItem', 'D');
    fixture.detectChanges();
    expect(root.querySelector('[data-tone="accent"]')?.textContent).toContain(
      'D',
    );
    expect(root.textContent).toContain('+1');
    fixture.componentRef.setInput('highlightItem', null);
    fixture.detectChanges();
    expect(root.querySelector('[data-tone="accent"]')).toBeNull();
  });

  describe('compact judged card', () => {
    const long = 'Full reason '.repeat(20).trim();
    function compactSetup() {
      const ctx = setup({ ...skill, description: 'Angular patterns' });
      ctx.fixture.componentRef.setInput('compact', true);
      ctx.fixture.componentRef.setInput('reason', long);
      ctx.fixture.componentRef.setInput(
        'scriptNote',
        'Runs scripts/install.sh',
      );
      ctx.fixture.componentRef.setInput('coveredItems', ['A', 'B', 'C', 'D']);
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('shows name, source, one-line description, covers and a one-line reason', () => {
      const { root } = compactSetup();
      expect(root.querySelector('strong')?.textContent).toContain(
        'Angular skill',
      );
      expect(root.textContent).toContain('acme/repo');
      const description = root.querySelector('span.truncate.text-sm');
      expect(description?.textContent).toContain('Angular patterns');
      expect(root.textContent).toContain('+1');
      const reasonLine = [...root.querySelectorAll('span.truncate')].find(
        (el) => el.textContent?.includes('Full reason'),
      );
      expect(reasonLine).toBeTruthy();
    });

    it('reveals the full reason and the script note with a native More button', () => {
      const { fixture, root } = compactSetup();
      const more = [...root.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'More',
      ) as HTMLButtonElement;
      expect(more.getAttribute('aria-expanded')).toBe('false');
      const region = root.querySelector(
        `#${more.getAttribute('aria-controls')}`,
      ) as HTMLElement;
      expect(region.hidden).toBe(true);
      const toggled = jest.fn();
      fixture.componentInstance.toggled.subscribe(toggled);
      more.click();
      fixture.detectChanges();
      expect(toggled).not.toHaveBeenCalled();
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(more.textContent?.trim()).toBe('Less');
      expect(region.hidden).toBe(false);
      expect(region.textContent).toContain(long);
      expect(region.textContent).toContain('Runs scripts/install.sh');
      expect(region.textContent).toContain('A, B, C, D');
    });

    it('gives each rendering of the same skill a unique description id', () => {
      const first = compactSetup();
      const second = compactSetup();
      const id = (root: HTMLElement) =>
        root.querySelector('input')?.getAttribute('aria-describedby');
      expect(id(first.root)).toBeTruthy();
      expect(id(first.root)).not.toBe(id(second.root));
      expect(first.root.querySelector(`#${id(first.root)}`)).toBeTruthy();
    });

    it('keeps the unjudged card without a More button or reason', () => {
      const { root } = setup();
      expect(root.querySelector('button')).toBeNull();
      expect(root.querySelector('.card-details')).toBeNull();
    });
  });
});
