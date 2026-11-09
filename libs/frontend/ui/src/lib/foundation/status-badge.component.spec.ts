import { TestBed } from '@angular/core/testing';
import { PtahStatusBadgeComponent, PtahStatus } from './status-badge.component';

it.each<PtahStatus>(['running', 'queued', 'pending', 'needs-review', 'warning', 'failed', 'offline', 'completed', 'online'])('renders %s with visible text', status => {
  const fixture = TestBed.createComponent(PtahStatusBadgeComponent);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent.trim()).toBe(status.replace('-', ' '));
  const shape = fixture.nativeElement.querySelector('[aria-hidden="true"]') as HTMLElement;
  if (status === 'running') {
    expect(shape.classList.contains('rounded-full')).toBe(true);
    expect(shape.classList.contains('border-state-run')).toBe(true);
    expect(shape.classList.contains('bg-state-run')).toBe(false);
  }
  if (status === 'queued' || status === 'pending') {
    expect(shape.classList.contains('rounded-full')).toBe(true);
    expect(shape.classList.contains('border')).toBe(true);
  }
});
