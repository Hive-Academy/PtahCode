import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Brain } from 'lucide-angular';
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

@Component({
  standalone: true,
  imports: [PtahStatCardComponent],
  template: `<ptah-stat-card label="Jobs" [value]="2" [icon]="icon" tone="success" [loading]="loading" [error]="error"
    (retry)="retries = retries + 1" />`,
})
class StateHost {
  icon = Brain;
  loading = false;
  error: string | undefined = undefined;
  retries = 0;
}

describe('PtahStatCardComponent states and icon', () => {
  const setup = async (init: Partial<StateHost> = {}) => {
    await TestBed.configureTestingModule({ imports: [StateHost] }).compileComponents();
    const f = TestBed.createComponent(StateHost);
    Object.assign(f.componentInstance, init);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  };

  it('shows the value and a tone icon by default, with no skeleton or alert', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('2');
    expect(el.querySelector('[data-testid="stat-card-icon"]')?.classList.contains('text-success')).toBe(true);
    expect(el.querySelector('[data-testid="stat-skeleton"]')).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows no icon wrapper when no icon is set', async () => {
    await TestBed.configureTestingModule({ imports: [HintHost] }).compileComponents();
    const f = TestBed.createComponent(HintHost);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="stat-card-icon"]')).toBeNull();
  });

  it('forwards loading to the inner stat', async () => {
    const { el } = await setup({ loading: true });
    expect(el.querySelector('[data-testid="stat-skeleton"]')).not.toBeNull();
  });

  it('forwards the error copy and emits retry', async () => {
    const { f, el } = await setup({ error: 'Could not load.' });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load.');
    (el.querySelector('[data-testid="stat-retry"]') as HTMLButtonElement).click();
    expect(f.componentInstance.retries).toBe(1);
  });
});
