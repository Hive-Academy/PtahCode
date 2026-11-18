import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PtahBadgeDirective, PtahRingComponent } from '@ptah-extension/ui';
import { LanesSectionHeaderComponent } from './lanes-section-header.component';

describe('LanesSectionHeaderComponent', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [LanesSectionHeaderComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(LanesSectionHeaderComponent);
    fixture.componentRef.setInput('total', 9);
    fixture.componentRef.setInput('enabled', 6);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the total as a shared count badge and enabled/total in the shared ring', async () => {
    const fixture = await setup();
    const badge = fixture.debugElement.query(By.directive(PtahBadgeDirective));
    const ring = fixture.debugElement.query(By.directive(PtahRingComponent))
      .componentInstance as PtahRingComponent;
    expect(badge.nativeElement.textContent.trim()).toBe('9');
    expect(badge.injector.get(PtahBadgeDirective).count()).toBe(true);
    expect(ring.value()).toBe(6);
    expect(ring.max()).toBe(9);
    expect(ring.centerText()).toBe('6/9');
  });

  it('emits edit/add actions and reflects editing and write availability', async () => {
    const fixture = await setup();
    const edit = jest.fn();
    const add = jest.fn();
    fixture.componentInstance.editRequested.subscribe(edit);
    fixture.componentInstance.addRequested.subscribe(add);
    const host: HTMLElement = fixture.nativeElement;
    const editButton = host.querySelector<HTMLButtonElement>(
      '[data-testid="lanes-order-edit"]',
    );
    const addButton = host.querySelector<HTMLButtonElement>(
      '[data-testid="lanes-header-add-instance"]',
    );
    expect(editButton?.getAttribute('variant')).toBe('outline');
    expect(addButton?.getAttribute('variant')).toBe('outline');
    editButton?.click();
    addButton?.click();
    expect(edit).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('editing', true);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(editButton?.getAttribute('aria-pressed')).toBe('true');
    expect(editButton?.textContent).toContain('Done editing order');
    expect(addButton?.disabled).toBe(true);
  });
});
