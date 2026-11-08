import { TestBed } from '@angular/core/testing';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import { CliSharedDefaultsComponent } from './cli-shared-defaults.component';

const supported = { state: 'supported' as const };
const manifest: CliAdapterManifest = {
  messaging: { steer: supported, interrupt: supported, continuation: supported, resume: supported },
  roleChannel: 'task-prompt',
  permissionModes: { plan: { ...supported, networkModes: ['deny'] }, yolo: { ...supported, networkModes: ['allow'] } },
  networkModes: { deny: supported, allow: supported },
  mcp: supported,
  limitReader: { state: 'no-reliable-source' },
};

describe('CliSharedDefaultsComponent', () => {
  it('shows inherited scope and wide controls and forwards a safe selection', () => {
    const fixture = TestBed.createComponent(CliSharedDefaultsComponent);
    fixture.componentRef.setInput('manifest', manifest);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Inherited by all Ptah CLI providers');
    expect(host.querySelector('ptah-cli-lane-default-cell .wide')).toBeTruthy();
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = host.querySelector('select') as HTMLSelectElement;
    select.value = 'plan';
    select.dispatchEvent(new Event('change'));
    expect(selected).toHaveBeenCalledWith({ permission: 'plan', network: 'deny' });
  });
});
