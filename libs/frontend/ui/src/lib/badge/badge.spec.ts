import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahStatus } from '../foundation/status-badge.component';
import { PtahBadgeDirective } from './badge.directive';
import { PtahBadgeTone } from './badge.types';
import { PtahStatusComponent } from './status.component';

@Component({
  standalone: true,
  imports: [PtahBadgeDirective, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span ptahBadge [tone]="tone()" appearance="outline" size="xs">beta</span>
    <span ptahBadge count>12</span>
    <span ptahBadge>plain</span>
    <ptah-status [status]="status()" />
    <ptah-status status="failed" label="Build failed" appearance="inline" />`,
})
class HostComponent {
  readonly tone = signal<PtahBadgeTone>('neutral');
  readonly status = signal<PtahStatus>('running');
}

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root };
}

describe('PtahBadgeDirective', () => {
  it('reflects tone, appearance, size and count as data attributes', () => {
    const { fixture, root } = setup();
    const [first, count, plain] = Array.from(
      root.querySelectorAll<HTMLElement>('[data-ptah-badge]'),
    );
    expect(first.dataset).toMatchObject({ tone: 'neutral', appearance: 'outline', size: 'xs' });
    expect(first.hasAttribute('data-count')).toBe(false);
    expect(count.hasAttribute('data-count')).toBe(true);
    expect(plain.dataset).toMatchObject({ tone: 'neutral', appearance: 'soft', size: 'sm' });

    fixture.componentInstance.tone.set('err');
    fixture.detectChanges();
    expect(first.dataset['tone']).toBe('err');
  });

  it('adds no DaisyUI badge class', () => {
    const { root } = setup();
    expect(root.querySelector('.badge')).toBeNull();
  });
});

describe('PtahStatusComponent', () => {
  it.each<[PtahStatus, string]>([
    ['running', 'run'],
    ['queued', 'idle'],
    ['pending', 'idle'],
    ['needs-review', 'need'],
    ['warning', 'need'],
    ['failed', 'err'],
    ['offline', 'err'],
    ['completed', 'done'],
    ['online', 'done'],
  ])('maps %s to the %s ink', (status, ink) => {
    const { fixture, root } = setup();
    fixture.componentInstance.status.set(status);
    fixture.detectChanges();
    const el = root.querySelector<HTMLElement>('ptah-status');
    expect(el?.dataset['ink']).toBe(ink);
    expect(el?.textContent?.trim()).toBe(status.replace('-', ' '));
  });

  it('uses the label in place of the status name', () => {
    const { root } = setup();
    const el = root.querySelectorAll<HTMLElement>('ptah-status')[1];
    expect(el.dataset['appearance']).toBe('inline');
    expect(el.textContent?.trim()).toBe('Build failed');
  });
});
