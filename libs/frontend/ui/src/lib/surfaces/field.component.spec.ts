import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahFieldComponent } from './field.component';
import { PtahFieldControlDirective } from './field-control.directive';
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
