import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { StackSkillConsentComponent } from './stack-skill-consent.component';

function overlay(): HTMLElement {
  return TestBed.inject(OverlayContainer).getContainerElement();
}

describe('StackSkillConsentComponent', () => {
  it('explains hooks when a flagged skill has no listed scripts', () => {
    const fixture = TestBed.createComponent(StackSkillConsentComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('previews', [
      {
        skillName: 'owner/repo/skill',
        files: ['SKILL.md'],
        scriptFiles: [],
        hasScripts: true,
        contentHash: 'abc123',
      },
    ]);
    fixture.componentRef.setInput('approvedIds', new Set());
    fixture.detectChanges();
    expect(overlay().textContent).toContain(
      'Also contains hooks or executable files. Review all files.',
    );
  });
  it('keeps the consent dialog open on Escape during installation', async () => {
    const fixture = TestBed.createComponent(StackSkillConsentComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('previews', []);
    fixture.componentRef.setInput('approvedIds', new Set());
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const cancelled = jest.fn();
    fixture.componentInstance.cancelRequested.subscribe(cancelled);
    const dialog = overlay().querySelector<HTMLElement>('[role="dialog"][aria-labelledby="skill-consent-title"]');
    expect(dialog).not.toBeNull();
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(dialog?.isConnected).toBe(true);
    expect(cancelled).not.toHaveBeenCalled();
  });
  it('requires explicit approval for scripts and shows previewed files as text', () => {
    const fixture = TestBed.createComponent(StackSkillConsentComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('previews', [
      {
        skillName: 'owner/repo/skill',
        files: ['<img src=x>'],
        scriptFiles: ['run.sh'],
        hasScripts: true,
        contentHash: 'abc123',
      },
    ]);
    fixture.componentRef.setInput('approvedIds', new Set());
    fixture.detectChanges();
    expect(fixture.componentInstance.allApproved()).toBe(false);
    fixture.componentRef.setInput('approvedIds', new Set(['owner/repo/skill']));
    fixture.detectChanges();
    expect(fixture.componentInstance.allApproved()).toBe(true);
    const root = overlay();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x>');
  });
  it.each([1, 2])(
    'labels installation of %s previewed skills and retains approval gating',
    (count) => {
      const fixture = TestBed.createComponent(StackSkillConsentComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput(
        'previews',
        Array.from({ length: count }, (_, index) => ({
          skillName: `owner/repo/${index}`,
          files: ['SKILL.md'],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'abc',
        })),
      );
      fixture.componentRef.setInput('approvedIds', new Set());
      fixture.detectChanges();
      const root = overlay();
      const install = [...root.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('and continue'),
      );
      expect(install?.textContent?.trim()).toBe(
        `Install ${count} ${count === 1 ? 'skill' : 'skills'} and continue`,
      );
      expect(install?.disabled).toBe(false);
      fixture.componentRef.setInput('busy', true);
      fixture.detectChanges();
      expect(install?.textContent).toContain('Installing\u2026');
      expect(install?.disabled).toBe(true);
    },
  );
  it('renders per-skill content hash, script file list, hook notice, and all-files disclosure', () => {
    const fixture = TestBed.createComponent(StackSkillConsentComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('previews', [
      {
        skillName: 'owner/repo/with-scripts',
        files: ['SKILL.md', 'scripts/setup.sh', 'hooks/post-install.mjs'],
        scriptFiles: ['scripts/setup.sh', 'hooks/post-install.mjs'],
        hasScripts: true,
        contentHash: 'sha256-scripts-111',
      },
      {
        skillName: 'owner/repo/hooks-only',
        files: ['SKILL.md', 'hooks.json'],
        scriptFiles: [],
        hasScripts: true,
        contentHash: 'sha256-hooks-222',
      },
      {
        skillName: 'owner/repo/docs-only',
        files: ['SKILL.md', 'references/guide.md'],
        scriptFiles: [],
        hasScripts: false,
        contentHash: 'sha256-docs-333',
      },
    ]);
    fixture.componentRef.setInput('approvedIds', new Set());
    fixture.detectChanges();

    const root = overlay();
    const sectionFor = (skillName: string): HTMLElement => {
      const section = root.querySelector<HTMLElement>(
        `section[aria-label="${skillName}"]`,
      );
      if (!section) {
        throw new Error(`Expected consent section for ${skillName}`);
      }
      return section;
    };
    const detailsFor = (
      section: HTMLElement,
      summaryPrefix: string,
    ): HTMLDetailsElement | undefined =>
      [...section.querySelectorAll('details')].find((details) =>
        details
          .querySelector('summary')
          ?.textContent?.trim()
          .startsWith(summaryPrefix),
      );
    const listTexts = (details: HTMLDetailsElement | undefined): string[] =>
      [...(details?.querySelectorAll('li') ?? [])].map(
        (li) => li.textContent?.trim() ?? '',
      );

    const withScripts = sectionFor('owner/repo/with-scripts');
    expect(withScripts.textContent).toContain(
      'Content hash: sha256-scripts-111',
    );
    expect(withScripts.textContent).toContain('Contains scripts');
    expect(withScripts.textContent).not.toContain(
      'Also contains hooks or executable files. Review all files.',
    );
    const withScriptsList = detailsFor(withScripts, 'Scripts (');
    expect(withScriptsList?.querySelector('summary')?.textContent?.trim()).toBe(
      'Scripts (2)',
    );
    expect(listTexts(withScriptsList)).toEqual([
      'scripts/setup.sh',
      'hooks/post-install.mjs',
    ]);
    const withScriptsAllFiles = detailsFor(withScripts, 'All files (');
    expect(
      withScriptsAllFiles?.querySelector('summary')?.textContent?.trim(),
    ).toBe('All files (3)');
    expect(listTexts(withScriptsAllFiles)).toEqual([
      'SKILL.md',
      'scripts/setup.sh',
      'hooks/post-install.mjs',
    ]);

    const hooksOnly = sectionFor('owner/repo/hooks-only');
    expect(hooksOnly.textContent).toContain('Content hash: sha256-hooks-222');
    expect(hooksOnly.textContent).toContain('Contains scripts');
    expect(hooksOnly.textContent).toContain(
      'Also contains hooks or executable files. Review all files.',
    );
    expect(detailsFor(hooksOnly, 'Scripts (')).toBeUndefined();
    const hooksOnlyAllFiles = detailsFor(hooksOnly, 'All files (');
    expect(
      hooksOnlyAllFiles?.querySelector('summary')?.textContent?.trim(),
    ).toBe('All files (2)');
    expect(listTexts(hooksOnlyAllFiles)).toEqual(['SKILL.md', 'hooks.json']);

    const docsOnly = sectionFor('owner/repo/docs-only');
    expect(docsOnly.textContent).toContain('Content hash: sha256-docs-333');
    expect(docsOnly.textContent).toContain('No scripts detected');
    expect(docsOnly.textContent).not.toContain(
      'Also contains hooks or executable files. Review all files.',
    );
    expect(detailsFor(docsOnly, 'Scripts (')).toBeUndefined();
    const docsOnlyAllFiles = detailsFor(docsOnly, 'All files (');
    expect(
      docsOnlyAllFiles?.querySelector('summary')?.textContent?.trim(),
    ).toBe('All files (2)');
    expect(listTexts(docsOnlyAllFiles)).toEqual([
      'SKILL.md',
      'references/guide.md',
    ]);
  });
});
