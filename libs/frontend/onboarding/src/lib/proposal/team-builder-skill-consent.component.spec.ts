import { TestBed } from '@angular/core/testing';
import { StackSkillConsentComponent } from './stack-skill-consent.component';

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
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Also contains hooks or executable files. Review all files.',
    );
  });
  it('reopens a native dialog closed during installation', async () => {
    const fixture = TestBed.createComponent(StackSkillConsentComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('previews', []);
    fixture.componentRef.setInput('approvedIds', new Set());
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const cancelled = jest.fn();
    fixture.componentInstance.cancelRequested.subscribe(cancelled);
    const dialog = (fixture.nativeElement as HTMLElement).querySelector(
      'dialog',
    ) as HTMLDialogElement;
    dialog.close();
    fixture.componentInstance.onClosed();
    await Promise.resolve();
    expect(dialog.open).toBe(true);
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
    const root = fixture.nativeElement as HTMLElement;
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
      const root = fixture.nativeElement as HTMLElement;
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
});
