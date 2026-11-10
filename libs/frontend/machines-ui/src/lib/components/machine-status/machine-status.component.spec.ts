import { TestBed } from '@angular/core/testing';
import type { MachineConnectionState } from '@ptah-extension/shared';
import { MachineStatusComponent } from './machine-status.component';

describe('MachineStatusComponent', () => {
  function render(state: MachineConnectionState, label?: string): HTMLElement {
    TestBed.configureTestingModule({ imports: [MachineStatusComponent] });
    const fixture = TestBed.createComponent(MachineStatusComponent);
    fixture.componentRef.setInput('state', state);
    if (label !== undefined) fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it.each<[MachineConnectionState, string, string, string]>([
    ['connected', 'Connected', 'text-state-done', 'circle'],
    ['offline', 'Offline', 'text-state-idle', 'circle'],
    ['reconnecting', 'Reconnecting', 'text-state-run', 'path'],
    ['version-mismatch', 'Version mismatch', 'text-state-need', 'path'],
    ['unpaired', 'Not paired', 'text-state-err', 'circle'],
  ])(
    '%s shows a shape, the label "%s" and its ink',
    (state, label, ink, shape) => {
      const host = render(state);
      const status = host.querySelector('[data-testid="machine-status"]');
      expect(status?.textContent?.trim()).toBe(label);
      expect(status?.classList).toContain(ink);
      const marker = host.querySelector('svg');
      expect(marker?.getAttribute('aria-hidden')).toBe('true');
      expect(marker?.querySelector(shape)).not.toBeNull();
    },
  );

  it('distinguishes offline (solid ring) from not paired (dashed ring)', () => {
    expect(
      render('offline')
        .querySelector('circle')
        ?.getAttribute('stroke-dasharray'),
    ).toBeNull();
    TestBed.resetTestingModule();
    expect(
      render('unpaired')
        .querySelector('circle')
        ?.getAttribute('stroke-dasharray'),
    ).not.toBeNull();
  });

  it('spins only while reconnecting, and not under reduced motion', () => {
    const marker = render('reconnecting').querySelector('svg');
    expect(marker?.classList).toContain('animate-spin');
    expect(marker?.classList).toContain('motion-reduce:animate-none');
    TestBed.resetTestingModule();
    expect(render('connected').querySelector('svg')?.classList).not.toContain(
      'animate-spin',
    );
  });

  it('takes a label override', () => {
    const host = render('reconnecting', 'Running (last known)');
    expect(host.textContent).toContain('Running (last known)');
  });

  it('is not interactive', () => {
    expect(render('connected').querySelector('button')).toBeNull();
  });
});
