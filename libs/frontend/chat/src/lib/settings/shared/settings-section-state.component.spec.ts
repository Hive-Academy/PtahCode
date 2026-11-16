import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SettingsSectionStateComponent, type SettingsSectionState } from './settings-section-state.component';

@Component({
  standalone: true,
  imports: [SettingsSectionStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-settings-section-state
      [state]="state()"
      errorText="Could not load providers."
      retryLabel="Try again"
      [skeletonLines]="4"
      emptyTitle="No providers"
      emptyBody="Add a provider to continue."
      emptyActionLabel="Add provider"
      errorTestId="providers-error"
      (retry)="retry()"
      (emptyAction)="emptyAction()"
    >
      <p data-testid="ready-content">Loaded providers</p>
    </ptah-settings-section-state>
  `,
})
class HostComponent {
  readonly state = signal<SettingsSectionState>('loading');
  readonly retry = jest.fn();
  readonly emptyAction = jest.fn();
}

describe('SettingsSectionStateComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  function render(state: SettingsSectionState) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.state.set(state);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, element };
  }

  it('shows four skeleton lines during loading and hides ready content', () => {
    const { element } = render('loading');
    expect(element.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(element.querySelectorAll('ptah-skeleton .skeleton')).toHaveLength(4);
    expect(element.querySelector('[data-testid="ready-content"]')).toBeNull();
  });

  it('shows a compact alert with the error test id and emits retry', () => {
    const { element, host } = render('error');
    const alert = element.querySelector('ptah-alert[data-testid="providers-error"]');
    expect(alert?.querySelector('[role="alert"]')?.textContent).toContain('Could not load providers.');
    expect(alert?.querySelector('[role="alert"]')?.classList.contains('p-2')).toBe(true);
    (alert?.querySelector('button') as HTMLButtonElement).click();
    expect(host.retry).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="ready-content"]')).toBeNull();
  });

  it('shows the empty panel and emits its action', () => {
    const { element, host } = render('empty');
    const panel = element.querySelector('ptah-state-panel');
    expect(panel?.textContent).toContain('No providers');
    expect(panel?.textContent).toContain('Add a provider to continue.');
    (panel?.querySelector('button') as HTMLButtonElement).click();
    expect(host.emptyAction).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="ready-content"]')).toBeNull();
  });

  it('projects content only in the ready state', () => {
    const { fixture, host, element } = render('ready');
    expect(element.querySelector('[data-testid="ready-content"]')?.textContent).toContain('Loaded providers');
    host.state.set('loading');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="ready-content"]')).toBeNull();
    host.state.set('ready');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="ready-content"]')).not.toBeNull();
  });
});
