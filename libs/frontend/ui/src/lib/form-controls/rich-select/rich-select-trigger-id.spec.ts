import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahFieldComponent } from '../../surfaces/field.component';
import { PtahRichSelectComponent } from './rich-select.component';

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahRichSelectComponent],
  template: `
    <ptah-field label="Provider">
      <ptah-select triggerId="consumer-trigger" [options]="options" />
    </ptah-field>
    <ptah-select label="Plain" [options]="options" />
  `,
})
class TriggerIdHost {
  readonly options = [{ value: 'a', label: 'A' }];
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('PtahRichSelectComponent triggerId', () => {
  it('sets the trigger id and the field label reaches it', async () => {
    await TestBed.configureTestingModule({
      imports: [TriggerIdHost],
    }).compileComponents();
    const f = TestBed.createComponent(TriggerIdHost);
    f.detectChanges();
    await tick();
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    const triggers = root.querySelectorAll<HTMLElement>('[role="combobox"]');
    expect(triggers[0].id).toBe('consumer-trigger');
    expect(root.querySelector('ptah-field label')?.getAttribute('for')).toBe(
      'consumer-trigger',
    );
    expect(triggers[1].id).toMatch(/^ptah-select-\d+$/);
  });
});
