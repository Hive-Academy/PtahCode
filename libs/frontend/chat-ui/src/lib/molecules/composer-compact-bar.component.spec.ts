import { TestBed } from '@angular/core/testing';
import { ComposerCompactBarComponent } from './composer-compact-bar.component';

describe('ComposerCompactBarComponent', () => {
  function render(showStop = true) {
    TestBed.configureTestingModule({ imports: [ComposerCompactBarComponent] });
    const fixture = TestBed.createComponent(ComposerCompactBarComponent);
    fixture.componentRef.setInput('statusLabel', 'Claude is working…');
    fixture.componentRef.setInput('controlsId', 'composer-1');
    fixture.componentRef.setInput('showStop', showStop);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root };
  }

  it('keeps the expand chevron at the start of the row, away from Stop', () => {
    const { root } = render();
    const expand = root.querySelector<HTMLButtonElement>('[data-testid="composer-compact-expand"]');
    const stop = root.querySelector<HTMLButtonElement>('[data-testid="chat-stop-btn"]');
    expect(expand).not.toBeNull();
    expect(stop).not.toBeNull();
    // The chevron is the expand button's first glyph, before the status text.
    const glyphs = [...(expand?.children ?? [])].filter((child) => child.tagName.toLowerCase() === 'lucide-angular');
    expect(glyphs).toHaveLength(1);
    expect(expand?.querySelector('lucide-angular')?.nextElementSibling?.classList.contains('ptah-compact-pulse')).toBe(true);
    // A rule separates the two controls.
    const divider = root.querySelector('[data-testid="composer-compact-stop-divider"]');
    expect(divider?.previousElementSibling).toBe(expand);
    expect(divider?.nextElementSibling).toBe(stop);
  });

  it('labels Stop with visible text and a tooltip, and emits only stop on click', () => {
    const { fixture, root } = render();
    const stop = root.querySelector<HTMLButtonElement>('[data-testid="chat-stop-btn"]');
    expect(stop?.textContent?.trim()).toBe('Stop');
    expect(stop?.getAttribute('aria-label')).toBe('Stop generating');
    expect(stop?.getAttribute('title')).toContain('Stop generating');
    const stopped = jest.fn();
    const expanded = jest.fn();
    fixture.componentInstance.stopRequested.subscribe(stopped);
    fixture.componentInstance.expandRequested.subscribe(expanded);
    stop?.click();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(expanded).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-testid="composer-compact-expand"]')?.click();
    expect(expanded).toHaveBeenCalledTimes(1);
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('renders neither Stop nor its divider when Stop is hidden', () => {
    const { root } = render(false);
    expect(root.querySelector('[data-testid="chat-stop-btn"]')).toBeNull();
    expect(root.querySelector('[data-testid="composer-compact-stop-divider"]')).toBeNull();
  });
});
