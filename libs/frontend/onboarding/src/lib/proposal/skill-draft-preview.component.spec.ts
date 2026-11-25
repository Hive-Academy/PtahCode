import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { serializeSkillDocument } from '@ptah-extension/shared';
import {
  SkillDraftPreviewComponent,
  type SkillDraftMode,
  type SkillDraftSubmission,
  type SkillDraftValue,
} from './skill-draft-preview.component';

const draft: SkillDraftValue = {
  name: 'project-conventions',
  description: 'Project "conventions"',
  body: '---\nname: second-block\n---\n\n## Project evidence\n\n- Keep both lines.\n',
};

@Component({
  standalone: true,
  imports: [SkillDraftPreviewComponent],
  template: `
    <button #opener type="button" (click)="open.set(true)">Preview draft</button>
    @if (open()) {
      <ptah-skill-draft-preview
        [draft]="value()"
        [mode]="mode()"
        [busy]="busy()"
        [usedSlugs]="usedSlugs()"
        (draftChange)="updateDraft($event)"
        (modeChange)="mode.set($event)"
        (createRequested)="create($event, opener)"
      />
    }
  `,
})
class PreviewHostComponent {
  public readonly open = signal(false);
  public readonly value = signal(draft);
  public readonly mode = signal<SkillDraftMode>('preview');
  public readonly busy = signal(false);
  public readonly usedSlugs = signal<readonly string[]>([]);
  public readonly submit = jest.fn<Promise<void>, [SkillDraftSubmission]>().mockResolvedValue(undefined);

  public updateDraft(patch: Partial<SkillDraftValue>): void {
    if (this.busy()) return;
    this.value.update((draft) => ({ ...draft, ...patch }));
  }

  public async create(submission: SkillDraftSubmission, opener: HTMLButtonElement): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    await this.submit(submission);
    this.open.set(false);
    this.busy.set(false);
    opener.focus();
  }
}

function render() {
  const fixture = TestBed.createComponent(PreviewHostComponent);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const button = (label: string) =>
    Array.from(root.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === label,
    );
  return { fixture, root, host: fixture.componentInstance, button };
}

function editField(field: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  if (!field) throw new Error('Missing editable field');
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

describe('SkillDraftPreviewComponent', () => {
  it('shows the destination and exact SKILL.md, toggles Edit, and writes only on Create', async () => {
    const { fixture, root, host, button } = render();

    expect(button('Create skill')).toBeUndefined();
    button('Preview draft')?.click();
    fixture.detectChanges();
    expect(host.submit).not.toHaveBeenCalled();
    expect(root.textContent).toContain('~/.ptah/plugins/ptah-harness-project-conventions/skills/project-conventions/SKILL.md');
    const pre = root.querySelector('pre');
    expect(pre?.textContent).toBe(serializeSkillDocument(draft).content);
    expect(pre?.tabIndex).toBe(0);

    button('Edit')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelectorAll('input')).toHaveLength(2);
    editField(root.querySelector('input'), 'local-guidance');
    editField(root.querySelector('textarea'), '---\n\nEdited guidance\n');
    fixture.detectChanges();
    button('Preview')?.click();
    fixture.detectChanges();

    const edited = { ...draft, name: 'local-guidance', body: '---\n\nEdited guidance\n' };
    expect(root.querySelector('pre')?.textContent).toBe(serializeSkillDocument(edited).content);
    expect(host.submit).not.toHaveBeenCalled();

    button('Create skill')?.click();
    await fixture.whenStable();
    expect(host.submit).toHaveBeenCalledWith({ ...edited, slug: 'local-guidance' });
  });

  it('keeps the flow locked during Create and returns focus to the opener after success', async () => {
    const { fixture, root, host, button } = render();
    let finish!: () => void;
    host.submit.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));

    const opener = button('Preview draft');
    opener?.click();
    fixture.detectChanges();
    button('Edit')?.click();
    fixture.detectChanges();
    const create = button('Create skill');
    create?.click();
    create?.click();
    fixture.detectChanges();

    expect(host.submit).toHaveBeenCalledTimes(1);
    expect(root.querySelector('input')?.readOnly).toBe(true);
    expect(root.querySelector('textarea')?.readOnly).toBe(true);
    expect(button('Preview')?.disabled).toBe(true);
    expect(button('Cancel')?.disabled).toBe(true);
    expect(button('Creating…')?.disabled).toBe(true);

    finish();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('ptah-skill-draft-preview')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('warns on a previously created slug and requires confirmation', async () => {
    const { fixture, root, host, button } = render();
    host.usedSlugs.set(['project-conventions']);
    button('Preview draft')?.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('A skill with this name was created in this run.');
    expect(button('Create skill')?.disabled).toBe(true);
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    fixture.detectChanges();
    expect(button('Create skill')?.disabled).toBe(false);
    button('Create skill')?.click();
    await fixture.whenStable();

    expect(host.submit).toHaveBeenCalledWith({ ...draft, slug: 'project-conventions' });
  });

  it('clears the duplicate warning when renamed, and requires confirmation again if changed back', async () => {
    const { fixture, root, host, button } = render();
    host.mode.set('edit');
    host.usedSlugs.set(['project-conventions']);
    button('Preview draft')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    fixture.detectChanges();
    expect(button('Create skill')?.disabled).toBe(false);

    const name = root.querySelector<HTMLInputElement>('input:not([type="checkbox"])');
    editField(name, 'new-name');
    fixture.detectChanges();
    expect(root.textContent).not.toContain('A skill with this name was created in this run.');
    expect(button('Create skill')?.disabled).toBe(false);

    editField(name, 'Project Conventions');
    fixture.detectChanges();
    expect(root.textContent).toContain('A skill with this name was created in this run.');
    expect(button('Create skill')?.disabled).toBe(true);
  });
});
