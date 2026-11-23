import { TestBed } from '@angular/core/testing';
import { ComposerAttachMenuComponent } from './composer-attach-menu.component';

function setup() {
  const fixture = TestBed.createComponent(ComposerAttachMenuComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance;
  const events: string[] = [];
  component.pickFiles.subscribe(() => events.push('files'));
  component.pickImages.subscribe(() => events.push('images'));
  const trigger = fixture.nativeElement.querySelector(
    '[data-testid="chat-attach-btn"]',
  ) as HTMLButtonElement;
  return { fixture, component, events, trigger };
}

/** The popover may move its panel out of the host, so look in the document. */
function item(testId: string): HTMLButtonElement | null {
  return document.querySelector(`[data-testid="${testId}"]`);
}

describe('ComposerAttachMenuComponent', () => {
  it('renders the 28 px attach button, keyboard reachable, with a menu popup', () => {
    const { trigger } = setup();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-label')).toBe(
      'Attach files or add context',
    );
    expect(trigger.getAttribute('title')).toBe('Attach');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.classList.contains('h-7')).toBe(true);
    expect(trigger.classList.contains('w-7')).toBe(true);
  });

  it('toggles open on click', () => {
    const { fixture, component, trigger } = setup();
    trigger.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.classList.contains('bg-surface-2')).toBe(true);
    trigger.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
  });

  it('closes and emits pickFiles / pickImages for the chosen item', () => {
    const { fixture, component, events, trigger } = setup();
    trigger.click();
    fixture.detectChanges();
    const files = item('composer-attach-files');
    expect(files).not.toBeNull();
    files?.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);

    trigger.click();
    fixture.detectChanges();
    const images = item('composer-attach-images');
    expect(images).not.toBeNull();
    images?.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
    expect(events).toEqual(['files', 'images']);
  });

  it('labels both menu items as menuitems', () => {
    const { fixture, trigger } = setup();
    trigger.click();
    fixture.detectChanges();
    expect(item('composer-attach-files')?.getAttribute('role')).toBe(
      'menuitem',
    );
    expect(item('composer-attach-files')?.textContent).toContain(
      'Attach files',
    );
    expect(item('composer-attach-images')?.textContent).toContain(
      'Attach images',
    );
  });
});
