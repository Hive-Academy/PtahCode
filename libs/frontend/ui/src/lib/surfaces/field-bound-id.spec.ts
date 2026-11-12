import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahInputDirective } from '../form-controls/input.directive';
import { PtahFieldComponent } from './field.component';

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahInputDirective],
  template: `<ptah-field label="Name"
    ><input ptahInput [id]="boundId()"
  /></ptah-field>`,
})
class BoundIdHost {
  boundId = signal('consumer-id-a');
}

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahInputDirective],
  template: `<ptah-field label="Name"><input ptahInput /></ptah-field>`,
})
class NoIdHost {}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('PtahFieldComponent bound id', () => {
  it('keeps a bound id and follows a later change with the label', async () => {
    await TestBed.configureTestingModule({
      imports: [BoundIdHost],
    }).compileComponents();
    const f = TestBed.createComponent(BoundIdHost);
    f.detectChanges();
    await tick();
    const input = f.nativeElement.querySelector('input') as HTMLInputElement;
    const label = f.nativeElement.querySelector('label') as HTMLLabelElement;
    expect(input.id).toBe('consumer-id-a');
    expect(label.htmlFor).toBe('consumer-id-a');

    f.componentInstance.boundId.set('consumer-id-b');
    f.detectChanges();
    await tick();
    f.detectChanges();
    expect(input.id).toBe('consumer-id-b');
    expect(label.htmlFor).toBe('consumer-id-b');
  });

  it('applies the generated id only while the control has no id', async () => {
    await TestBed.configureTestingModule({
      imports: [NoIdHost],
    }).compileComponents();
    const f = TestBed.createComponent(NoIdHost);
    f.detectChanges();
    await tick();
    const input = f.nativeElement.querySelector('input') as HTMLInputElement;
    const label = f.nativeElement.querySelector('label') as HTMLLabelElement;
    expect(input.id).toMatch(/^ptah-field-control-/);
    expect(label.htmlFor).toBe(input.id);
  });
});
