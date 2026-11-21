import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { isDisabledControl } from '../feedback/busy-disabled.testing';
import { ClaudeBuiltinsRowComponent, toIdPart, type BuiltinKind } from './claude-builtins-row.component';

@Component({
  standalone: true,
  imports: [ClaudeBuiltinsRowComponent],
  template: `
    <ptah-claude-builtins-row
      [kind]="kind()"
      [itemId]="itemId()"
      [name]="name()"
      [description]="description()"
      tokens="~460"
      [on]="on()"
      [disabled]="disabled()"
      [blockedReason]="blockedReason()"
      (toggled)="events.push($event)"
    />
  `,
})
class HostComponent {
  readonly kind = signal<BuiltinKind>('skill');
  readonly itemId = signal('code-review');
  readonly name = signal('code-review');
  readonly description = signal<string | null>('Reviews the current diff for bugs.');
  readonly on = signal(false);
  readonly disabled = signal(false);
  readonly blockedReason = signal<string | null>(null);
  readonly events: Event[] = [];
}

describe('ClaudeBuiltinsRowComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const toggle = (kind = 'skill', id = 'code-review') => {
    const input = element.querySelector<HTMLInputElement>(`[data-testid="settings-toggle-claude-${kind}-${id}"]`);
    if (!input) throw new Error('missing toggle');
    return input;
  };
  const byId = (id: string | null) => (id ? element.ownerDocument.getElementById(id) : null);

  it('renders a switch that is still a checkbox element, with the kept test id', () => {
    expect(toggle().type).toBe('checkbox');
    expect(toggle().getAttribute('role')).toBe('switch');
    expect(toggle().checked).toBe(false);

    host.on.set(true);
    fixture.detectChanges();
    expect(toggle().checked).toBe(true);
  });

  it('labels the switch with the name element (aria-labelledby resolves)', () => {
    const label = byId(toggle().getAttribute('aria-labelledby'));
    expect(label?.textContent?.trim()).toBe('code-review');
    expect(label?.className).toContain('truncate');
    expect(toggle().getAttribute('aria-label')).toBeNull();
  });

  it('derives the ids from kind and item id, so a tool and a skill of one name do not collide', () => {
    const skillLabelId = toggle().getAttribute('aria-labelledby');
    host.kind.set('tool');
    fixture.detectChanges();
    expect(toggle('tool').getAttribute('aria-labelledby')).not.toBe(skillLabelId);
  });

  it('resolves the label of an id that has a colon', () => {
    host.itemId.set('anthropic-skills:docx');
    host.name.set('docx');
    fixture.detectChanges();

    const input = toggle('skill', 'anthropic-skills:docx');
    const labelId = input.getAttribute('aria-labelledby');
    expect(labelId).toMatch(/^[A-Za-z][\w-]*$/);
    expect(byId(labelId)?.textContent?.trim()).toBe('docx');
  });

  it('shows the token chip and a one-line description with a title', () => {
    expect(element.querySelector('[data-testid="claude-builtins-row-tokens"]')?.textContent?.trim()).toBe('~460');
    const description = element.querySelector('[data-testid="claude-builtins-row-description"]');
    expect(description?.textContent?.trim()).toBe('Reviews the current diff for bugs.');
    expect(description?.getAttribute('title')).toBe('Reviews the current diff for bugs.');
    expect(description?.className).toContain('truncate');

    host.description.set(null);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="claude-builtins-row-description"]')).toBeNull();
  });

  it('shows no dependency chip and no aria-describedby by default', () => {
    expect(element.querySelector('[data-testid="claude-skill-dependency-code-review"]')).toBeNull();
    expect(toggle().getAttribute('aria-describedby')).toBeNull();
  });

  it('shows the dependency chip and refers to it with aria-describedby', () => {
    host.blockedReason.set('ReportFindings is off');
    fixture.detectChanges();

    const chip = element.querySelector('[data-testid="claude-skill-dependency-code-review"]');
    expect(chip?.textContent?.trim()).toBe('ReportFindings is off');
    expect(chip?.getAttribute('data-tone')).toBe('warn');
    expect(byId(toggle().getAttribute('aria-describedby'))).toBe(chip);
  });

  it('emits the change event of the checkbox', () => {
    toggle().click();
    expect(host.events).toHaveLength(1);
    expect(host.events[0].target).toBe(toggle());
    expect((host.events[0].target as HTMLInputElement).checked).toBe(true);
  });

  it('is busy, not natively disabled, and emits nothing while disabled', () => {
    host.disabled.set(true);
    fixture.detectChanges();

    expect(isDisabledControl(toggle())).toBe(true);
    expect(toggle().disabled).toBe(false);
    toggle().click();
    expect(host.events).toEqual([]);
    expect(toggle().checked).toBe(false);
  });
});

@Component({
  standalone: true,
  imports: [ClaudeBuiltinsRowComponent],
  template: `
    @for (id of ids; track id) {
      <ptah-claude-builtins-row kind="skill" [itemId]="id" [name]="id" tokens="~10" [on]="false" blockedReason="Workflow is off" />
    }
  `,
})
class TwoRowsHostComponent {
  readonly ids = ['anthropic-skills:release.notes', 'anthropic-skills:release_notes'];
}

describe('ClaudeBuiltinsRowComponent ids', () => {
  it('encodes an id without collisions', () => {
    expect(toIdPart('code-review')).toBe('code-review');
    expect(toIdPart('release.notes')).not.toBe(toIdPart('release_notes'));
    expect(toIdPart('a_2e_b')).not.toBe(toIdPart('a.b'));
    expect(toIdPart('anthropic-skills:docx')).toMatch(/^[\w-]+$/);
  });

  it('two rows whose names differ only by a dot and an underscore have different ids, each resolved to its own row', async () => {
    await TestBed.configureTestingModule({ imports: [TwoRowsHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TwoRowsHostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const document = element.ownerDocument;
    window.document.body.appendChild(element);

    const inputs = Array.from(element.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
    expect(inputs).toHaveLength(2);
    const labelIds = inputs.map((input) => input.getAttribute('aria-labelledby') ?? '');
    const chipIds = inputs.map((input) => input.getAttribute('aria-describedby') ?? '');
    expect(new Set([...labelIds, ...chipIds]).size).toBe(4);
    expect(labelIds.map((id) => document.getElementById(id)?.textContent?.trim())).toEqual(fixture.componentInstance.ids);
    for (const [index, id] of [...labelIds, ...chipIds].entries()) {
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      expect(inputs[index % 2].closest('ptah-claude-builtins-row')?.contains(document.getElementById(id))).toBe(true);
    }
    element.remove();
  });
});
