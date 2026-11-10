import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RailIconActionDirective } from './rail-icon-action.directive';
import { provideCanvasRailActionLook } from './rail-icon-action.look';

@Component({
  standalone: true,
  imports: [RailIconActionDirective],
  template: `
    <button ptahRailIconAction type="button" [label]="label()" [active]="active()" [disabled]="disabled()">
      <span data-testid="icon" aria-hidden="true">≡</span>
    </button>
  `,
})
class TestHostComponent {
  readonly label = signal('Dense cards');
  readonly active = signal(false);
  readonly disabled = signal(false);
}

describe('RailIconActionDirective', () => {
  it('renders the default look, active state, native disabled state, label, and icon content', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.classList.contains('btn')).toBe(true);
    expect(button.classList.contains('btn-ghost')).toBe(true);
    expect(button.classList.contains('btn-xs')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Dense cards');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('[data-testid="icon"]')?.textContent).toBe('≡');

    fixture.componentInstance.active.set(true);
    fixture.componentInstance.disabled.set(true);
    fixture.componentInstance.label.set('Compact cards');
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Compact cards');
  });

  it('uses a provided look', () => {
    TestBed.configureTestingModule({
      providers: [provideCanvasRailActionLook({ classes: 'custom-rail-look' })],
    });
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).classList.contains('custom-rail-look')).toBe(true);
  });
});
