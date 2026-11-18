import { TestBed } from '@angular/core/testing';
import { ProviderQuotaWindowComponent } from './provider-quota-window.component';
import { buildPlanTile } from './plan-tile-view.model';
import {
  ownerFixture,
  windowFixture,
  NOW,
  TIME,
} from './provider-account-test.fixtures';
it('retains over-limit text and the raw accessible value while meter clamps fill', () => {
  const fixture = TestBed.createComponent(ProviderQuotaWindowComponent);
  const view = buildPlanTile(
    ownerFixture({
      windows: [windowFixture({ used: { kind: 'percent', percent: 120 } })],
    }),
    NOW,
    TIME,
  );
  fixture.componentRef.setInput('window', view.primaryWindow);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  expect(el.textContent).toContain('120%');
  expect(
    el.querySelector('[role="meter"]')?.getAttribute('aria-valuetext'),
  ).toContain('120%');
});

it.each([0, -1, Number.NaN])('shows finite amount without a meter for denominator %s', (limit) => {
  const fixture = TestBed.createComponent(ProviderQuotaWindowComponent);
  const view = buildPlanTile(ownerFixture({ windows: [windowFixture({ used: { kind: 'amount', amount: 120, limit, unit: 'requests' } })] }), NOW, TIME);
  fixture.componentRef.setInput('window', view.secondaryWindows[0]);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  expect(el.textContent).toContain('120 requests used');
  expect(el.textContent).toContain('Allowance unknown');
  expect(el.textContent).not.toContain('Usage unknown');
  expect(el.querySelector('ptah-meter')).toBeNull();
});
it('invalidates a finite amount after reset passage', () => {
  const fixture = TestBed.createComponent(ProviderQuotaWindowComponent);
  const view = buildPlanTile(ownerFixture({ windows: [windowFixture({ used: { kind: 'amount', amount: 120, limit: 0, unit: 'requests' }, resetsAt: NOW - 1000, observedAt: NOW - 60000 })] }), NOW, TIME);
  fixture.componentRef.setInput('window', view.secondaryWindows[0]);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  expect(el.textContent).toContain('Usage unknown');
  expect(el.textContent).not.toContain('120 requests');
  expect(el.querySelector('ptah-meter')).toBeNull();
});
