import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahTableRowActionsComponent } from './table-row-actions.component';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahTableRowActionsComponent],
  template: `<ptah-table-row-actions rowLabel="Quill" [menuLabel]="menuLabel()">
    <button ptahInlineAction>Sign in</button>
    <button role="menuitem">Edit</button><button role="menuitem">Delete</button>
  </ptah-table-row-actions>`,
})
class HostComponent {
  readonly menuLabel = signal<string | undefined>(undefined);
}

describe('PtahTableRowActionsComponent', () => {
  it('names the kebab, projects inline action and supports menu keyboard navigation', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('button[trigger]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toBe('More actions for Quill');
    expect(root.querySelector('[ptahInlineAction]')?.textContent).toBe(
      'Sign in',
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = root.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).toBeTruthy();
    const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[0].focus();
    items[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(items[1]);
    items[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
    );
    expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    fixture.componentInstance.menuLabel.set('Options for Quill');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-label')).toBe('Options for Quill');
  });

  it('links the trigger to the menu and handles Home, End and Tab', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('button[trigger]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    trigger.click();
    fixture.detectChanges();
    const menu = root.querySelector('[role="menu"]') as HTMLElement;
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[0].focus();
    items[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    expect(document.activeElement).toBe(items[items.length - 1]);
    items[items.length - 1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).not.toBe(trigger);
  });
});
