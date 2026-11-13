import { TestBed } from '@angular/core/testing';
import { PtahStatePanelComponent, PtahPanelState } from './state-panel.component';
import { Component } from '@angular/core';

it.each<PtahPanelState>(['loading', 'empty', 'error', 'partial', 'no-permission'])('renders %s state', state => {
  const fixture = TestBed.createComponent(PtahStatePanelComponent);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('title', 'Status');
  fixture.detectChanges();
  const region = fixture.nativeElement.querySelector(state === 'partial' ? '[role="status"]' : 'section') as HTMLElement;
  expect(region.getAttribute('aria-busy')).toBe(state === 'loading' ? 'true' : null);
  expect(region.classList.contains('rounded-[var(--ptah-card-radius)]')).toBe(true);
  expect(region.textContent).toContain('Status');
  if (state !== 'partial') expect(region.classList.contains('min-h-32')).toBe(true);
  if (state === 'loading') {
    expect(region.querySelector('h2.sr-only')?.textContent).toBe('Status');
    expect(region.querySelector('[aria-hidden="true"]')).not.toBeNull();
  }
  if (state === 'error') expect(region.getAttribute('role')).toBe('alert');
  if (state === 'partial') expect(region.classList.contains('alert-warning')).toBe(true);
});

@Component({ standalone: true, imports: [PtahStatePanelComponent], template: `<ptah-state-panel state="partial" title="Partial" body="Some results" actionLabel="Retry" (action)="actions = actions + 1"><div id="retained">Retained content</div></ptah-state-panel>` })
class Host { actions = 0; }

it('puts the warning above full-width retained content and emits action', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
  const content = fixture.nativeElement.querySelector('#retained') as HTMLElement;
  expect(status.classList.contains('alert')).toBe(true);
  expect(status.contains(content)).toBe(false);
  expect(status.nextElementSibling).toBe(content);
  (status.querySelector('button') as HTMLButtonElement).click();
  expect(fixture.componentInstance.actions).toBe(1);
});
