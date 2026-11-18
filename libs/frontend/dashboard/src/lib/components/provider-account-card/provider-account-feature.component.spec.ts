import { TestBed } from '@angular/core/testing';
import { ProviderAccountFeatureComponent } from './provider-account-feature.component';
import { buildPlanTile } from './plan-tile-view.model';
import {
  ownerFixture,
  windowFixture,
  NOW,
  TIME,
} from './provider-account-test.fixtures';
describe('ProviderAccountFeatureComponent', () => {
  it('shows labelled readings with reset and unknown provenance', () => {
    const fixture = TestBed.createComponent(ProviderAccountFeatureComponent);
    fixture.componentRef.setInput(
      'view',
      buildPlanTile(ownerFixture(), NOW, TIME),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Weekly');
    expect(el.textContent).toContain('94%');
    expect(el.querySelector('[role="meter"]')).not.toBeNull();
  });
  it('emits disclosure intent and renders parent expansion across new view records', () => {
    const fixture = TestBed.createComponent(ProviderAccountFeatureComponent);
    const owner = ownerFixture({
      windows: [
        windowFixture(),
        ...['a', 'b', 'c'].map((key) =>
          windowFixture({
            key: `other:${key}`,
            label: key,
            used: { kind: 'percent', percent: 30 },
          }),
        ),
      ],
    });
    fixture.componentRef.setInput('view', buildPlanTile(owner, NOW, TIME));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector<HTMLButtonElement>('[aria-controls]');
    const toggled = jest.fn();
    fixture.componentInstance.toggleExpanded.subscribe(toggled);
    toggle?.click();
    expect(toggled).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('expanded', true);
    fixture.detectChanges();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const controlled = el.querySelector<HTMLElement>(
      '[id="' + toggle?.getAttribute('aria-controls') + '"]',
    );
    expect(controlled?.hidden).toBe(false);
    fixture.componentRef.setInput(
      'view',
      buildPlanTile(owner, NOW + 1000, TIME),
    );
    fixture.detectChanges();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  });
});
