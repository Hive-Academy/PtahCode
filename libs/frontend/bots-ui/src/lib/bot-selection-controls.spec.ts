import { TestBed } from '@angular/core/testing';
import type { InstalledSkill } from '@ptah-extension/shared';
import { BotSkillsPickerComponent } from './bot-skills-picker.component';
import { ToolIdChipInputComponent } from './tool-id-chip-input.component';

describe('Bot selection controls', () => {
  it('keeps focus on the popover checkbox when unchecking a selected skill', () => {
    const fixture = TestBed.createComponent(BotSkillsPickerComponent);
    fixture.componentRef.setInput('skills', [{ id: 'angular' }]);
    fixture.componentRef.setInput('installedSkills', [
      {
        name: 'angular',
        description: 'Angular patterns',
        source: 'local',
        path: '/skills/angular',
        scope: 'workspace',
        agents: [],
      },
    ]);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[trigger]').click();
    fixture.detectChanges();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    );
    const change = jest.fn();
    fixture.componentInstance.skillsChange.subscribe(change);
    checkbox.focus();
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.componentRef.setInput('skills', []);
    fixture.detectChanges();
    expect(change).toHaveBeenCalledWith([]);
    expect(document.activeElement).toBe(checkbox);
    expect(
      fixture.nativeElement
        .querySelector('[trigger]')
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('marks unknown tools only after the catalog is loaded', () => {
    const fixture = TestBed.createComponent(ToolIdChipInputComponent);
    fixture.componentRef.setInput('ids', ['missing']);
    fixture.componentRef.setInput('catalogLoaded', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('(unresolved)');
    fixture.componentRef.setInput('catalogLoaded', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('(unresolved)');
    fixture.componentRef.setInput('knownIds', ['missing']);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('(unresolved)');
  });

  it('displays duplicate ids once in first-occurrence order without changing inputs', () => {
    const tools = TestBed.createComponent(ToolIdChipInputComponent);
    const toolIds = ['two', 'two', 'one', 'two'];
    tools.componentRef.setInput('ids', toolIds);
    tools.detectChanges();
    const toolButtons: NodeListOf<HTMLButtonElement> =
      tools.nativeElement.querySelectorAll('[aria-label^="Remove tool "]');
    expect(
      Array.from(toolButtons, (button) => button.getAttribute('aria-label')),
    ).toEqual(['Remove tool two', 'Remove tool one']);
    toolButtons
      .item(0)
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      );
    expect(document.activeElement).toBe(toolButtons.item(1));
    expect(toolIds).toEqual(['two', 'two', 'one', 'two']);
    const skills = TestBed.createComponent(BotSkillsPickerComponent);
    const first = { id: 'two' };
    const skillRefs = [first, { id: 'two' }, { id: 'one' }, { id: 'two' }];
    skills.componentRef.setInput('skills', skillRefs);
    skills.detectChanges();
    const skillButtons: NodeListOf<HTMLButtonElement> =
      skills.nativeElement.querySelectorAll('[aria-label^="Remove skill "]');
    expect(
      Array.from(skillButtons, (button) => button.getAttribute('aria-label')),
    ).toEqual(['Remove skill two', 'Remove skill one']);
    skillButtons
      .item(0)
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      );
    expect(document.activeElement).toBe(skillButtons.item(1));
    expect(skillRefs).toHaveLength(4);
    expect(skillRefs[0]).toBe(first);
    const change = jest.fn();
    skills.componentInstance.skillsChange.subscribe(change);
    skills.componentInstance.toggle('three');
    expect(change.mock.calls[0][0][0]).toBe(first);
  });

  it('exposes labelled chip containers as groups', () => {
    const tools = TestBed.createComponent(ToolIdChipInputComponent);
    const skills = TestBed.createComponent(BotSkillsPickerComponent);
    tools.detectChanges();
    skills.detectChanges();
    expect(
      tools.nativeElement
        .querySelector('[role="group"]')
        .getAttribute('aria-label'),
    ).toBe('Tool id selections');
    expect(
      skills.nativeElement
        .querySelector('[role="group"]')
        .getAttribute('aria-label'),
    ).toBe('Selected skills');
  });

  it('opens the searchable installed-skill checkbox picker from its native button', () => {
    const fixture = TestBed.createComponent(BotSkillsPickerComponent);
    fixture.componentRef.setInput('installedSkills', [
      {
        name: 'angular',
        description: 'Angular patterns',
        source: 'local',
        path: '/skills/angular',
        scope: 'workspace',
        agents: [],
      },
      {
        name: 'review',
        description: 'Review changes',
        source: 'local',
        path: '/skills/review',
        scope: 'workspace',
        agents: [],
      },
    ]);
    fixture.detectChanges();
    const add: HTMLButtonElement =
      fixture.nativeElement.querySelector('[trigger]');
    add.click();
    fixture.detectChanges();
    expect(add.getAttribute('aria-expanded')).toBe('true');
    const search: HTMLInputElement =
      fixture.nativeElement.querySelector('input[ptahInput]');
    search.value = 'Angular';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const choices: NodeListOf<HTMLInputElement> =
      fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
    expect(choices).toHaveLength(1);
    const change = jest.fn();
    fixture.componentInstance.skillsChange.subscribe(change);
    choices.item(0).dispatchEvent(new Event('change', { bubbles: true }));
    expect(change).toHaveBeenCalledWith([{ id: 'angular' }]);
    add.click();
    fixture.detectChanges();
    expect(add.getAttribute('aria-expanded')).toBe('false');
  });

  it('returns focus to an entry control when the last chip is removed', () => {
    const tools = TestBed.createComponent(ToolIdChipInputComponent);
    tools.componentRef.setInput('ids', ['only']);
    tools.detectChanges();
    tools.nativeElement
      .querySelector('[aria-label="Remove tool only"]')
      .click();
    expect(document.activeElement).toBe(
      tools.nativeElement.querySelector('input'),
    );
    const skills = TestBed.createComponent(BotSkillsPickerComponent);
    skills.componentRef.setInput('skills', [{ id: 'only' }]);
    skills.detectChanges();
    skills.nativeElement
      .querySelector('[aria-label="Remove skill only"]')
      .click();
    expect(document.activeElement).toBe(
      skills.nativeElement.querySelector('[trigger]'),
    );
  });

  it('adds trimmed tool ids, preserves unresolved ids and avoids duplicates', () => {
    const fixture = TestBed.createComponent(ToolIdChipInputComponent);
    fixture.componentRef.setInput('ids', ['missing']);
    fixture.detectChanges();
    const change = jest.fn();
    fixture.componentInstance.idsChange.subscribe(change);
    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('input');
    input.value = ' new-tool ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(change).toHaveBeenCalledWith(['missing', 'new-tool']);
    expect(fixture.nativeElement.textContent).toContain('(unresolved)');
    input.value = 'missing';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('keeps chip DOM identity on reorder and links the overlap warning', () => {
    const fixture = TestBed.createComponent(ToolIdChipInputComponent);
    fixture.componentRef.setInput('ids', ['one', 'two']);
    fixture.componentRef.setInput('overlapIds', ['one']);
    fixture.detectChanges();
    const first: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[aria-label="Remove tool one"]',
    );
    expect(fixture.nativeElement.querySelector('p[role="status"]').id).toBe(
      first.getAttribute('aria-describedby'),
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Deny takes precedence',
    );
    fixture.componentRef.setInput('ids', ['two', 'one']);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Remove tool one"]'),
    ).toBe(first);
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Remove tool two',
    );
    const change = jest.fn();
    fixture.componentInstance.idsChange.subscribe(change);
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
    );
    expect(change).toHaveBeenCalledWith(['two']);
  });

  it('uses installed skill slugs and retains unavailable skills', () => {
    const fixture = TestBed.createComponent(BotSkillsPickerComponent);
    const installed: InstalledSkill = {
      name: 'angular',
      description: 'Angular patterns',
      source: 'local',
      path: '/skills/angular',
      scope: 'workspace',
      agents: [],
    };
    fixture.componentRef.setInput('skills', [{ id: 'missing' }]);
    fixture.componentRef.setInput('installedSkills', [
      installed,
      { ...installed, path: '/other' },
    ]);
    fixture.detectChanges();
    const change = jest.fn();
    fixture.componentInstance.skillsChange.subscribe(change);
    fixture.componentInstance.toggle('angular');
    expect(change).toHaveBeenCalledWith([{ id: 'missing' }, { id: 'angular' }]);
    expect(fixture.nativeElement.textContent).toContain(
      'missing (unavailable)',
    );
    fixture.componentInstance.remove('missing');
    expect(change).toHaveBeenLastCalledWith([]);
  });

  it('navigates and removes skill chips with the keyboard, tracking by id', () => {
    const fixture = TestBed.createComponent(BotSkillsPickerComponent);
    fixture.componentRef.setInput('skills', [{ id: 'one' }, { id: 'two' }]);
    fixture.detectChanges();
    const first: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[aria-label="Remove skill one"]',
    );
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Remove skill two',
    );
    const change = jest.fn();
    fixture.componentInstance.skillsChange.subscribe(change);
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
    );
    expect(change).toHaveBeenCalledWith([{ id: 'two' }]);
    fixture.componentRef.setInput('skills', [{ id: 'two' }, { id: 'one' }]);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Remove skill one"]'),
    ).toBe(first);
  });

  it('emits no changes when read only', () => {
    const skills = TestBed.createComponent(BotSkillsPickerComponent);
    const tools = TestBed.createComponent(ToolIdChipInputComponent);
    skills.componentRef.setInput('readonly', true);
    tools.componentRef.setInput('readonly', true);
    const skillChange = jest.fn();
    const toolChange = jest.fn();
    skills.componentInstance.skillsChange.subscribe(skillChange);
    tools.componentInstance.idsChange.subscribe(toolChange);
    skills.componentInstance.toggle('one');
    skills.componentInstance.remove('one');
    tools.componentInstance.remove('one');
    tools.componentInstance.add();
    expect(skillChange).not.toHaveBeenCalled();
    expect(toolChange).not.toHaveBeenCalled();
  });
});
