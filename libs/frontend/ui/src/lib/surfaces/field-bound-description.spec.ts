import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahInputDirective } from '../form-controls/input.directive';
import { PtahFieldComponent } from './field.component';

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahInputDirective],
  template: `<ptah-field label="Name" [hint]="hint()" [error]="error()"
    ><input ptahInput [attr.aria-describedby]="bound()"
  /></ptah-field>`,
})
class BoundHost {
  bound = signal<string | null>('consumer-a');
  hint = signal<string | null>('Helpful text');
  error = signal<string | null>(null);
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('PtahFieldComponent bound aria-describedby', () => {
  it('keeps a bound id on first render and after the binding changes', async () => {
    await TestBed.configureTestingModule({
      imports: [BoundHost],
    }).compileComponents();
    const f = TestBed.createComponent(BoundHost);
    f.detectChanges();
    await tick();
    const input = f.nativeElement.querySelector('input') as HTMLInputElement;
    const help = f.nativeElement.querySelector('p') as HTMLParagraphElement;
    const ids = () => (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids()).toEqual(['consumer-a', help.id]);

    f.componentInstance.bound.set('consumer-b');
    f.detectChanges();
    await tick();
    expect(ids()).toEqual(['consumer-b', help.id]);

    f.componentInstance.error.set('Required');
    f.detectChanges();
    await tick();
    expect(ids()).toEqual(['consumer-b', help.id]);
    expect(help.textContent).toContain('Required');

    f.componentInstance.hint.set(null);
    f.componentInstance.error.set(null);
    f.detectChanges();
    await tick();
    expect(ids()).toEqual(['consumer-b']);
  });
});
