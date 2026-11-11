/**
 * Accessibility of the badge family (TASK_2026_957_fda3): accessible name,
 * role, and a state that is not conveyed by color alone. Badges are static
 * text, so they have no keyboard path and no focus ring of their own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahBadgeDirective } from './badge.directive';
import { PtahStatusComponent } from './status.component';

const CSS = readFileSync(join(__dirname, 'ptah-badge.css'), 'utf8');

@Component({
  standalone: true,
  imports: [PtahBadgeDirective, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span ptahBadge tone="warn">Needs review</span>
    <ptah-status status="running" />
    <ptah-status status="offline" appearance="dot" label="Gateway offline" />`,
})
class HostComponent {}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('badge family accessibility', () => {
  it('names a badge by its visible text and gives it no role or tab stop', () => {
    const badge = render().querySelector<HTMLElement>('[data-ptah-badge]');
    expect(badge?.textContent?.trim()).toBe('Needs review');
    expect(badge?.getAttribute('role')).toBeNull();
    expect(badge?.hasAttribute('tabindex')).toBe(false);
  });

  it('hides the glyph and shows the state as a word in pill and inline', () => {
    const status = render().querySelector<HTMLElement>('ptah-status');
    expect(status?.getAttribute('role')).toBeNull();
    expect(status?.querySelector('.ptah-status-glyph')?.getAttribute('aria-hidden')).toBe('true');
    expect(status?.querySelector('.ptah-status-text')?.textContent).toBe('running');
  });

  it('gives a dot role img with the label as name and title', () => {
    const dot = render().querySelectorAll<HTMLElement>('ptah-status')[1];
    expect(dot.getAttribute('role')).toBe('img');
    expect(dot.getAttribute('aria-label')).toBe('Gateway offline');
    expect(dot.getAttribute('title')).toBe('Gateway offline');
    expect(dot.querySelector('.ptah-status-text')).toBeNull();
  });

  it('draws a different glyph shape for each state, not only a different color', () => {
    const shape = (ink: string) =>
      new RegExp(`ptah-status\\[data-ink='${ink}'\\][^{]*\\.ptah-status-glyph[^{]*\\{[^}]*(border|transform|border-radius)`);
    for (const ink of ['run', 'need', 'err']) {
      expect(CSS).toMatch(shape(ink));
    }
    expect(CSS).toMatch(/\[data-ink='idle'\] \.ptah-status-glyph[^{]*\{[^}]*background-color: transparent/s);
  });

  it('keeps run and idle different without motion (center point on run only)', () => {
    const rules = (ink: string) =>
      Array.from(
        CSS.matchAll(/([^{}]+)\{([^}]*)\}/g),
        ([, sel, body]) => ({ sel, body }),
      )
        .filter(({ sel }) => sel.includes(`[data-ink='${ink}'] .ptah-status-glyph`))
        .map(({ body }) => body)
        .join('');
    expect(rules('run')).toMatch(/background-image: radial-gradient/);
    expect(rules('idle')).not.toMatch(/background-image/);
  });

  it('stops the pulse when the user asks for reduced motion', () => {
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  });
});
