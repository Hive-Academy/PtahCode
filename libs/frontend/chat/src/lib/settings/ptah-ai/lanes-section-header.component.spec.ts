import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PtahBadgeDirective } from '@ptah-extension/ui';
import { LanesSectionHeaderComponent } from './lanes-section-header.component';

@Component({
  standalone: true,
  imports: [LanesSectionHeaderComponent],
  template: `
    <ptah-lanes-section-header [total]="9" [enabled]="6">
      <span controls data-testid="projected-control">Max concurrent</span>
    </ptah-lanes-section-header>
  `,
})
class HostComponent {}

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

  it('shows the total as a shared count badge and "x of y enabled" with the same total', async () => {
    const fixture = await setup();
    const badge = fixture.debugElement.query(By.directive(PtahBadgeDirective));
    expect(badge.nativeElement.textContent.trim()).toBe('9');
    expect(badge.injector.get(PtahBadgeDirective).count()).toBe(true);
    const host: HTMLElement = fixture.nativeElement;
    expect(
      host
        .querySelector('[data-testid="lanes-enabled-count"]')
        ?.textContent?.trim(),
    ).toBe('6 of 9 enabled');
    expect(
      host.querySelector('#cli-matrix-heading lucide-angular'),
    ).not.toBeNull();
  });

  it('toggles Reorder: label, icon and aria-pressed follow the editing state', async () => {
    const fixture = await setup();
    const edit = jest.fn();
    fixture.componentInstance.editRequested.subscribe(edit);
    const host: HTMLElement = fixture.nativeElement;
    const button = host.querySelector<HTMLButtonElement>(
      '[data-testid="lanes-order-edit"]',
    );
    const icon = () =>
      fixture.debugElement.query(
        By.css('[data-testid="lanes-order-edit"] lucide-angular'),
      ).componentInstance.img;
    expect(button?.getAttribute('variant')).toBe('outline');
    expect(button?.textContent?.trim()).toBe('Reorder');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    const reorderIcon = icon();
    button?.click();
    expect(edit).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.textContent?.trim()).toBe('Done');
    expect(icon()).not.toBe(reorderIcon);
  });

  it('has no Add control; Reorder waits for write availability, Done never does', async () => {
    const fixture = await setup();
    const host: HTMLElement = fixture.nativeElement;
    expect(
      host.querySelector('[data-testid="lanes-header-add-instance"]'),
    ).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(1);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const button = host.querySelector<HTMLButtonElement>(
      '[data-testid="lanes-order-edit"]',
    );
    expect(button?.disabled).toBe(true);
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();
    expect(button?.disabled).toBe(false);
  });

  it('projects the [controls] slot before the Reorder toggle', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const control = host.querySelector('[data-testid="projected-control"]');
    const reorder = host.querySelector('[data-testid="lanes-order-edit"]');
    if (!control || !reorder) throw new Error('header controls missing');
    expect(control.closest('.lanes-actions')).not.toBeNull();
    expect(
      control.compareDocumentPosition(reorder) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
