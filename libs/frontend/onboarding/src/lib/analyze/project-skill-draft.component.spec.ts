import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { ProjectSkillDraftComponent } from './project-skill-draft.component';

describe('ProjectSkillDraftComponent', () => {
  const call = jest.fn();
  beforeEach(() => {
    call.mockReset();
    TestBed.configureTestingModule({ providers: [
      { provide: ClaudeRpcService, useValue: { call } },
    ] });
  });
  it('prepares a draft but writes only after Create', async () => {
    call.mockResolvedValue({ isSuccess: () => true, data: { skillPath: '/ws/.ptah/skills/angular/SKILL.md' } });
    const fixture = TestBed.createComponent(ProjectSkillDraftComponent);
    fixture.componentRef.setInput('item', {
      kind: 'framework', name: 'Angular', evidence: 'package.json dependency', sourcePhase: 'project-profile',
    });
    fixture.detectChanges();
    expect(call).not.toHaveBeenCalled();
    expect(fixture.componentInstance.content()).toContain('package.json dependency');
    await fixture.componentInstance.create();
    expect(call).toHaveBeenCalledWith('harness:create-skill', expect.objectContaining({
      name: 'angular', content: expect.stringContaining('package.json dependency'),
    }));
  });

  it('keeps edits when the same kind and name are reloaded', () => {
    const fixture = TestBed.createComponent(ProjectSkillDraftComponent);
    fixture.componentRef.setInput('item', {
      kind: 'framework', name: 'Angular', evidence: 'first evidence', sourcePhase: 'project-profile',
    });
    fixture.detectChanges();
    fixture.componentInstance.content.set('My edited draft');
    fixture.componentInstance.description.set('My description');
    fixture.componentRef.setInput('item', {
      kind: 'framework', name: 'Angular', evidence: 'new evidence', sourcePhase: 'project-profile',
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.content()).toBe('My edited draft');
    expect(fixture.componentInstance.description()).toBe('My description');
  });
});
