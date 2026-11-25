import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { serializeSkillDocument } from '@ptah-extension/shared';
import { ProjectSkillDraftComponent } from './project-skill-draft.component';

const angular = {
  kind: 'framework',
  name: 'Angular',
  evidence: 'package.json dependency',
  sourcePhase: 'project-profile',
};

function render() {
  const fixture = TestBed.createComponent(ProjectSkillDraftComponent);
  fixture.componentRef.setInput('item', angular);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  return {
    fixture,
    root,
    button: (label: string) =>
      Array.from(root.querySelectorAll('button')).find(
        (element) => element.textContent?.trim() === label,
      ),
  };
}

function edit(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  if (!element) throw new Error('Missing draft field');
  element.value = value;
  element.dispatchEvent(new Event('input'));
}

describe('ProjectSkillDraftComponent', () => {
  const call = jest.fn();

  beforeEach(() => {
    call.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: ClaudeRpcService, useValue: { call } }],
    });
  });

  it('prepares project evidence and submits the same document shown in Preview only on Create', async () => {
    const skillPath = '/ws/.ptah/skills/angular/SKILL.md';
    call.mockResolvedValue({ isSuccess: () => true, data: { skillPath } });
    const { fixture, root, button } = render();
    await fixture.whenStable();
    const body = root.querySelector('textarea')?.value;

    expect(call).not.toHaveBeenCalled();
    expect(body).toBe('## Project evidence\n\n- Angular: package.json dependency\n\n');

    button('Preview')?.click();
    fixture.detectChanges();
    expect(root.querySelector('pre')?.textContent).toBe(
      serializeSkillDocument({ name: 'angular', description: 'Project guidance for Angular', body: body ?? '' }).content,
    );
    expect(call).not.toHaveBeenCalled();

    button('Create skill')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(call).toHaveBeenCalledWith('harness:create-skill', {
      name: 'angular', description: 'Project guidance for Angular', content: body,
    });
    expect(root.textContent).toContain(`Created: ${skillPath}`);
    expect(button('Create skill')).toBeUndefined();
  });

  it('keeps edits when the same kind and name are reloaded', async () => {
    const { fixture, root } = render();
    await fixture.whenStable();
    edit(root.querySelector('textarea'), 'My edited draft');
    edit(root.querySelectorAll('input')[1], 'My description');

    fixture.componentRef.setInput('item', { ...angular, evidence: 'new evidence' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(root.querySelector('textarea')?.value).toBe('My edited draft');
    expect(root.querySelectorAll('input')[1]?.value).toBe('My description');
  });

  it.each([
    ['RPC failure response', () => ({ isSuccess: () => false })],
    ['RPC rejection', () => { throw new Error('Private provider detail'); }],
  ])('clears busy and retains edits after a %s', async (_, fail) => {
    call.mockImplementation(async () => fail());
    const { fixture, root, button } = render();
    await fixture.whenStable();
    edit(root.querySelector('input'), 'local-angular');
    edit(root.querySelector('textarea'), '---\nname: keep-user-text\n---\nEdited draft');
    fixture.detectChanges();

    const create = button('Create skill');
    create?.click();
    create?.click();
    fixture.detectChanges();
    expect(button('Creating…')?.disabled).toBe(true);
    expect(root.querySelector('textarea')?.readOnly).toBe(true);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('harness:create-skill', {
      name: 'local-angular',
      description: 'Project guidance for Angular',
      content: '---\nname: keep-user-text\n---\nEdited draft',
    });
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not create this skill. Your draft is still here.');
    expect(root.textContent).not.toContain('Private provider detail');
    expect(root.querySelector('input')?.value).toBe('local-angular');
    expect(root.querySelector('textarea')?.value).toBe('---\nname: keep-user-text\n---\nEdited draft');
    expect(root.querySelector('textarea')?.readOnly).toBe(false);
    expect(button('Create skill')?.disabled).toBe(false);
  });
});
