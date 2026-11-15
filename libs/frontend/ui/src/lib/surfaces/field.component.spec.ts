import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahFieldComponent } from './field.component';
import { PtahFieldControlDirective } from './field-control.directive';
import { PtahFieldTriggerDirective } from './field.component';
import { NativePopoverComponent } from '../native/popover/native-popover.component';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahFieldControlDirective],
  template: `<ptah-field label="Name" [hint]="hint()" [error]="error()"
    ><input id="existing-control-id" ptahFieldControl aria-describedby="external"
  /></ptah-field>`,
})
class Host {
  hint = signal<string | null>('Helpful text');
  error = signal<string | null>(null);
}
describe('PtahFieldComponent', () => {
  it('connects its marked projected control to label and help text', async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const input = f.nativeElement.querySelector('input') as HTMLInputElement;
    const label = f.nativeElement.querySelector('label') as HTMLLabelElement;
    const help = f.nativeElement.querySelector('p') as HTMLParagraphElement;
    expect(label.htmlFor).toBe(input.id);
    expect(input.classList).toContain('input-sm');
    expect(input.getAttribute('aria-describedby')).toContain('external');
    expect(input.getAttribute('aria-describedby')).toContain(help.id);
    expect(help.textContent).toContain('Helpful text');
    f.componentInstance.error.set('Required');
    f.detectChanges();
    expect(help.textContent).toContain('Required');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('floats the label: an empty placeholder, aria-required and the required mark', () => {
    const f = TestBed.createComponent(ActionsHost);
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    const field = root.querySelector('[data-testid="secret"] .ptah-field') as HTMLElement;
    const input = field.querySelector('input') as HTMLInputElement;
    expect(field.getAttribute('data-appearance')).toBe('floating');
    expect(input.getAttribute('placeholder')).toBe(' ');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(field.querySelector('.ptah-field__required')?.getAttribute('aria-hidden')).toBe('true');
    expect(field.querySelector('.ptah-field__rail')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows and hides a secret with the reveal action', () => {
    const f = TestBed.createComponent(ActionsHost);
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    const input = root.querySelector('[data-testid="secret"] input') as HTMLInputElement;
    const reveal = root.querySelector('[data-testid="secret"] .ptah-field__action') as HTMLButtonElement;
    expect(reveal.getAttribute('aria-label')).toBe('Show Token');
    expect(reveal.getAttribute('aria-pressed')).toBe('false');
    reveal.click();
    f.detectChanges();
    expect(input.type).toBe('text');
    expect(reveal.getAttribute('aria-pressed')).toBe('true');
    reveal.click();
    f.detectChanges();
    expect(input.type).toBe('password');
  });

  it('clears the value with the clear action and moves focus to the control', () => {
    const f = TestBed.createComponent(ActionsHost);
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    const input = root.querySelector('[data-testid="search"] input') as HTMLInputElement;
    const clear = root.querySelector('[data-testid="search"] .ptah-field__clear') as HTMLButtonElement;
    expect(root.querySelectorAll('[data-testid="search"] .ptah-field__clear')).toHaveLength(1);
    expect(input.type).toBe('search');
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(input.value));
    expect(clear.getAttribute('aria-label')).toBe('Clear Search');
    clear.click();
    expect(input.value).toBe('');
    expect(seen).toEqual(['']);
    expect(document.activeElement).toBe(input);
  });

  it('counts the characters of a textarea against maxlength', () => {
    const f = TestBed.createComponent(ActionsHost);
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    const textarea = root.querySelector('[data-testid="notes"] textarea') as HTMLTextAreaElement;
    // The first count lands after the first render.
    f.detectChanges();
    expect(root.querySelector('[data-testid="notes"] .ptah-field__counter')?.textContent).toContain('3 / 40');
    textarea.value = 'hello';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    f.detectChanges();
    expect(root.querySelector('[data-testid="notes"] .ptah-field__counter')?.textContent).toContain('5 / 40');
  });

  it('marks busy on the field and on the control', () => {
    const f = TestBed.createComponent(ActionsHost);
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="notes"] .ptah-field')?.getAttribute('data-busy')).toBe('true');
    expect(root.querySelector('[data-testid="notes"] textarea')?.getAttribute('aria-busy')).toBe('true');
  });
});

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahFieldControlDirective],
  template: `
    <ptah-field data-testid="secret" label="Token" required revealable>
      <input ptahFieldControl type="password" value="abc" />
    </ptah-field>
    <ptah-field data-testid="search" label="Search" clearable>
      <input ptahFieldControl type="search" value="query" />
    </ptah-field>
    <ptah-field data-testid="notes" label="Notes" counter busy>
      <textarea ptahFieldControl maxlength="40">abc</textarea>
    </ptah-field>
  `,
})
class ActionsHost {}

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahFieldControlDirective, PtahFieldTriggerDirective, NativePopoverComponent],
  template: `
    <ptah-field label="Model" size="sm" required busy hint="Choose a model">
      <ptah-native-popover [isOpen]="false">
        <button trigger ptahFieldTrigger type="button" [id]="triggerId()">Sonnet</button>
        <div content>Options</div>
      </ptah-native-popover>
    </ptah-field>
    <ptah-field label="Effort" size="sm"><button ptahFieldTrigger type="button" disabled>High</button></ptah-field>
    <ptah-field label="Provider" size="sm"><select ptahFieldControl><option>Local</option></select></ptah-field>
    <ptah-field label="Notes" size="sm"><textarea ptahFieldControl></textarea></ptah-field>
  `,
})
class CompactHost {
  triggerId = signal('model-trigger');
}

describe('compact field and trigger', () => {
  it('wires the nested popover button and direct disabled button', async () => {
    await TestBed.configureTestingModule({ imports: [CompactHost] }).compileComponents();
    const fixture = TestBed.createComponent(CompactHost);
    fixture.detectChanges();
    const fields = fixture.nativeElement.querySelectorAll('.ptah-field') as NodeListOf<HTMLElement>;
    expect([...fields].map((field) => field.getAttribute('data-size'))).toEqual(['sm', 'sm', 'sm', 'sm']);
    const button = fields[0].querySelector('button[ptahFieldTrigger]') as HTMLButtonElement;
    const label = fields[0].querySelector('label') as HTMLLabelElement;
    expect(label.htmlFor).toBe(button.id);
    expect(button.getAttribute('aria-labelledby')).toBe(`${label.id} ${button.id}`);
    expect(button.getAttribute('aria-required')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toContain('ptah-field-description-');
    button.focus();
    expect(fields[0].querySelector('.ptah-field__box:focus-within')).not.toBeNull();
    expect((fields[1].querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    expect(fields[2].querySelector('select')?.id).toBeTruthy();
    expect(fields[3].querySelector('textarea')?.id).toBeTruthy();
  });

  it('updates the trigger name and label target when its bound id changes', async () => {
    const fixture = TestBed.createComponent(CompactHost);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button[ptahFieldTrigger]') as HTMLButtonElement;
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;
    expect(button.getAttribute('aria-labelledby')).toBe(`${label.id} model-trigger`);

    fixture.componentInstance.triggerId.set('new-model-trigger');
    fixture.detectChanges();
    expect(button.id).toBe('new-model-trigger');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(button.getAttribute('aria-labelledby')).toBe(`${label.id} new-model-trigger`);
    expect(label.htmlFor).toBe('new-model-trigger');
  });

  it('defines a 40px compact height and trigger focus styling', () => {
    const css = readFileSync(join(__dirname, '../form-controls/ptah-field.css'), 'utf8');
    const tokens = readFileSync(join(__dirname, '../tokens/ptah-tokens.css'), 'utf8');
    expect(tokens).toContain('--ptah-field-h-sm: 2.5rem');
    expect(css).toMatch(/\.ptah-field\[data-size='sm'\]\s*\{[^}]*--ptah-field-textarea-min-h: var\(--ptah-field-h-sm\);[^}]*--ptah-field-textarea-pad-y: var\(--ptah-space-2\)/);
    expect(css).toMatch(/\[data-size='sm'\] \.ptah-field__box\s*\{\s*min-height: var\(--ptah-field-h-sm\)/);
    expect(css).toContain('.ptah-field .ptah-field__box:has(.ptah-field__body :focus)');
  });
});
