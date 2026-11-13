import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahStatCardComponent } from './stat-card.component';
@Component({
  standalone: true,
  imports: [PtahStatCardComponent],
  template: `<ptah-stat-card label="Sessions" [value]="42" trend="Up 10%" size="dense"
    ><button actions>Open</button></ptah-stat-card
  >`,
})
class Host {}
@Component({
  standalone: true,
  imports: [PtahStatCardComponent],
  template: `<ptah-stat-card label="Runs" [value]="1" hint="From hint" trend="From alias" direction="up" />`,
})
class HintHost {}
describe('PtahStatCardComponent hint', () => {
  it('shows the hint over the deprecated trend alias and forwards the direction', async () => {
    await TestBed.configureTestingModule({ imports: [HintHost] }).compileComponents();
    const f = TestBed.createComponent(HintHost);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('From hint');
    expect(el.textContent).not.toContain('From alias');
    expect(el.textContent).toContain('up');
    expect(el.querySelector('[aria-hidden="true"]')?.textContent).toBe('▲');
  });
});
describe('PtahStatCardComponent', () => {
  it('renders required metrics and projected actions through the stat owner', async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const card = f.nativeElement.querySelector('ptah-stat') as HTMLElement;
    expect(card.getAttribute('data-appearance')).toBe('card');
    expect(card.textContent).toContain('Sessions');
    expect(card.textContent).toContain('42');
    expect(card.textContent).toContain('Up 10%');
    expect(card.querySelector('button')?.textContent).toContain('Open');
    expect(card.querySelector('.text-lg')?.textContent).toContain('42');
  });
});
