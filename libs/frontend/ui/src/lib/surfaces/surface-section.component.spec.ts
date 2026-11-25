import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SurfaceSectionComponent } from './surface-section.component';
@Component({
  standalone: true,
  imports: [SurfaceSectionComponent],
  template: `<ptah-surface-section tone="subtle" padding="md"
    ><div section-header>Heading</div>
    <p>Body</p></ptah-surface-section
  >`,
})
class Host {}
@Component({
  standalone: true,
  imports: [SurfaceSectionComponent],
  template: `<ptah-surface-section glassSurface="chrome"><p>Body</p></ptah-surface-section>`,
})
class ChromeHost {}
@Component({
  standalone: true,
  imports: [SurfaceSectionComponent],
  template: `<ptah-surface-section tone="flush" padding="md"><p>Body</p></ptah-surface-section>`,
})
class FlushHost {}
describe('SurfaceSectionComponent', () => {
  it('projects its header/body and applies the compact section contract', async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const section = f.nativeElement.querySelector('section') as HTMLElement;
    expect(section.textContent).toContain('Heading');
    expect(section.className).toContain('surface-1');
    expect(section.className).toContain('p-4');
    expect(section.className).toContain('rounded-xl');
    expect(section.getAttribute('data-glass-surface')).toBe('content');
  });
  it('takes the blurred chrome glass role on request and lifts section and host while a dialog is open', async () => {
    await TestBed.configureTestingModule({
      imports: [ChromeHost],
    }).compileComponents();
    const f = TestBed.createComponent(ChromeHost);
    f.detectChanges();
    const host = f.nativeElement.querySelector('ptah-surface-section') as HTMLElement;
    const section = host.querySelector('section') as HTMLElement;
    expect(section.getAttribute('data-glass-surface')).toBe('chrome');
    expect(section.className).toContain('surface-2');
    expect(section.classList.contains('has-[[role=dialog]]:z-30')).toBe(true);
    expect(host.classList.contains('has-[[role=dialog]]:z-30')).toBe(true);
    expect(host.classList.contains('has-[[role=dialog]]:relative')).toBe(true);
  });
  it('renders a flush section with no plane, radius or glass role', async () => {
    await TestBed.configureTestingModule({ imports: [FlushHost] }).compileComponents();
    const f = TestBed.createComponent(FlushHost);
    f.detectChanges();
    const section = f.nativeElement.querySelector('section') as HTMLElement;
    expect(section.className).not.toMatch(/surface-\d/);
    expect(section.className).not.toContain('rounded-xl');
    expect(section.className).toContain('p-4');
    expect(section.hasAttribute('data-glass-surface')).toBe(false);
  });
});
