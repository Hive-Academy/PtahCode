import { TestBed } from '@angular/core/testing';
import { ContextRingComponent } from './context-ring.component';

describe('ContextRingComponent', () => {
  function setup(percent: number, tone?: 'normal' | 'warning') {
    TestBed.configureTestingModule({ imports: [ContextRingComponent] });
    const fixture = TestBed.createComponent(ContextRingComponent);
    fixture.componentRef.setInput('percent', percent);
    if (tone) fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
    const arcOf = (): SVGCircleElement | null =>
      fixture.nativeElement.querySelector('circle[pathLength]');
    return { fixture, arcOf };
  }

  it('keeps the existing thresholds unless a tone is supplied', () => {
    const { fixture, arcOf } = setup(79);
    expect(arcOf()?.classList.contains('text-[var(--ptah-gold)]')).toBe(true);
    fixture.componentRef.setInput('percent', 80);
    fixture.detectChanges();
    expect(arcOf()?.classList.contains('text-state-need')).toBe(true);
    fixture.componentRef.setInput('percent', 95);
    fixture.detectChanges();
    expect(arcOf()?.classList.contains('text-state-err')).toBe(true);
  });

  it('uses the semantic tone regardless of percent', () => {
    const { fixture, arcOf } = setup(95, 'normal');
    expect(arcOf()?.classList.contains('text-state-done')).toBe(true);
    fixture.componentRef.setInput('tone', 'warning');
    fixture.detectChanges();
    expect(arcOf()?.classList.contains('text-state-need')).toBe(true);
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the clamped percent as a bare, hidden ring', () => {
    const { fixture, arcOf } = setup(150);
    expect(arcOf()?.getAttribute('stroke-dasharray')).toBe('100 100');
    expect(fixture.nativeElement.querySelector('[role]')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
