import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Settings } from 'lucide-angular';
import {
  PtahSettingsLayoutComponent,
  PtahSettingsTab,
  PtahSettingsTitleLevel,
} from './settings-layout.component';

type TabId = 'general' | 'accounts' | 'billing' | 'labs';

@Component({
  standalone: true,
  imports: [PtahSettingsLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-settings-layout
      [tabs]="tabs()"
      [selected]="selected()"
      [title]="title()"
      [description]="description()"
      [titleLevel]="titleLevel()"
      [navMode]="navMode()"
      [navTestId]="navTestId()"
      (selectedChange)="onSelected($event)"
    >
      <span nav-header data-testid="nav-header">Ptah</span>
      <span nav-footer data-testid="nav-footer">v1.0</span>
      <button actions type="button" data-testid="header-action">Reset</button>
      <div header-band data-testid="instrument-band">Status</div>
      <p data-testid="panel-content">Panel</p>
    </ptah-settings-layout>
  `,
})
class HostComponent {
  readonly tabs = signal<readonly PtahSettingsTab<TabId>[]>([
    { id: 'general', label: 'General', icon: Settings },
    { id: 'accounts', label: 'Accounts', badge: 2 },
    { id: 'billing', label: 'Billing', disabled: true, disabledReason: 'Only an admin can open billing.' },
    { id: 'labs', label: 'Labs', badge: 'New' },
  ]);
  readonly selected = signal<TabId>('general');
  readonly title = signal('Settings');
  readonly description = signal<string | null>('Manage the app.');
  readonly titleLevel = signal<PtahSettingsTitleLevel>(2);
  readonly navMode = signal<'tabs' | 'navigation'>('tabs');
  readonly navTestId = signal('settings-layout-nav');
  readonly emitted: TabId[] = [];
  onSelected(id: TabId): void {
    this.emitted.push(id);
  }
}

const RAW_SPACING = /\b(gap|p|px|py|m|mx|my|space-[xy])-\d/;

/** Replaces ResizeObserver, so a test can set the container width. */
function installResizeObserverMock(): {
  setWidth: (width: number) => void;
  restore: () => void;
} {
  const original = globalThis.ResizeObserver;
  const callbacks: ResizeObserverCallback[] = [];
  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(callback);
    }
    observe(): void {
      /* The test drives the width. */
    }
    unobserve(): void {
      /* Not used. */
    }
    disconnect(): void {
      /* Not used. */
    }
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  return {
    setWidth: (width) =>
      callbacks.forEach((cb) =>
        cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver),
      ),
    restore: () => {
      globalThis.ResizeObserver = original;
    },
  };
}

describe('PtahSettingsLayoutComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;
  let resize: ReturnType<typeof installResizeObserverMock>;

  const q = <T extends Element = HTMLElement>(sel: string): T | null => el.querySelector<T>(sel);
  const tablist = (): HTMLElement => q('[role="tablist"]') as HTMLElement;
  const tabs = (): HTMLButtonElement[] =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panel = (): HTMLElement => q('[data-testid="settings-layout-panel"]') as HTMLElement;
  const key = (target: HTMLElement, k: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  beforeEach(() => {
    resize = installResizeObserverMock();
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    resize.restore();
  });

  it('marks the host with data-ptah-pattern and a size container', () => {
    const patternHost = q('ptah-settings-layout') as HTMLElement;
    expect(patternHost.getAttribute('data-ptah-pattern')).toBe('settings-layout');
    expect(patternHost.classList.contains('[container-type:inline-size]')).toBe(true);
  });

  it.each([
    [2, 'H2'],
    [1, 'H1'],
  ] as const)('renders titleLevel %p as %s', (level, tag) => {
    host.titleLevel.set(level);
    fixture.detectChanges();
    const heading = q('[data-testid="settings-layout-header"] h1, [data-testid="settings-layout-header"] h2');
    expect(heading?.tagName).toBe(tag);
    expect(heading?.textContent?.trim()).toBe('Settings');
  });

  it('wires the tabs to the panel', () => {
    const list = tablist();
    expect(list.getAttribute('aria-label')).toBeNull();
    expect(
      list.closest('nav')?.getAttribute('aria-label'),
    ).toBe('Settings sections');
    expect(tabs()).toHaveLength(4);
    for (const tab of tabs()) {
      expect(tab.tagName).toBe('BUTTON');
      expect(tab.getAttribute('aria-controls')).toBe(panel().id);
    }
    const [general] = tabs();
    expect(general.getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('false');
    expect(panel().getAttribute('role')).toBe('tabpanel');
    expect(panel().getAttribute('tabindex')).toBe('0');
    expect(panel().getAttribute('aria-labelledby')).toBe(general.id);
    expect(general.id).toMatch(/^ptah-settings-layout-\d+-tab-general$/);
  });

  it('keeps the visible label as the tab name and shows badges', () => {
    expect(tabs().map((tab) => tab.querySelector('span')?.textContent?.trim())).toEqual([
      'General',
      'Accounts',
      'Billing',
      'Labs',
    ]);
    expect(tabs()[1].textContent?.trim().startsWith('Accounts')).toBe(true);
    expect(el.querySelectorAll('[data-testid="settings-layout-badge"]')).toHaveLength(2);
    expect(tabs()[0].querySelector('lucide-angular')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses a roving tabindex on the selected tab', () => {
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    host.selected.set('accounts');
    fixture.detectChanges();
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1]);
    expect(panel().getAttribute('aria-labelledby')).toBe(tabs()[1].id);
  });

  it('moves focus with the vertical arrow keys, Home and End, and does not select', () => {
    tabs()[0].focus();
    key(tabs()[0], 'ArrowDown');
    expect(document.activeElement).toBe(tabs()[1]);
    key(tabs()[1], 'ArrowDown');
    expect(document.activeElement).toBe(tabs()[2]);
    key(tabs()[2], 'ArrowUp');
    expect(document.activeElement).toBe(tabs()[1]);
    key(tabs()[1], 'End');
    expect(document.activeElement).toBe(tabs()[3]);
    key(tabs()[3], 'ArrowDown');
    expect(document.activeElement).toBe(tabs()[0]);
    key(tabs()[0], 'ArrowUp');
    expect(document.activeElement).toBe(tabs()[3]);
    key(tabs()[3], 'Home');
    expect(document.activeElement).toBe(tabs()[0]);
    // Left and Right do nothing in the vertical orientation.
    key(tabs()[0], 'ArrowRight');
    expect(document.activeElement).toBe(tabs()[0]);
    expect(host.emitted).toEqual([]);
  });

  it('emits selectedChange on Enter, Space and click, and keeps focus on the tab', () => {
    tabs()[0].focus();
    key(tabs()[0], 'ArrowDown');
    const enter = key(tabs()[1], 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(host.emitted).toEqual(['accounts']);
    expect(document.activeElement).toBe(tabs()[1]);

    key(tabs()[1], 'End');
    key(tabs()[3], ' ');
    expect(host.emitted).toEqual(['accounts', 'labs']);

    tabs()[1].click();
    expect(host.emitted).toEqual(['accounts', 'labs', 'accounts']);
  });

  it('does not emit for the already selected tab', () => {
    tabs()[0].focus();
    key(tabs()[0], 'Enter');
    tabs()[0].click();
    expect(host.emitted).toEqual([]);
  });

  it('marks a disabled tab and emits nothing for it', () => {
    const billing = tabs()[2];
    expect(billing.getAttribute('aria-disabled')).toBe('true');
    expect(billing.getAttribute('title')).toBe('Only an admin can open billing.');
    const reason = q(`#${billing.getAttribute('aria-describedby')}`);
    expect(reason?.classList.contains('sr-only')).toBe(true);
    expect(reason?.textContent?.trim()).toBe('Only an admin can open billing.');

    billing.focus();
    key(billing, 'Enter');
    key(billing, ' ');
    billing.click();
    expect(host.emitted).toEqual([]);
    expect(tabs()[1].hasAttribute('aria-disabled')).toBe(false);
  });

  it('sets aria-orientation from the container width and swaps the arrow keys', () => {
    expect(tablist().getAttribute('aria-orientation')).toBe('vertical');

    resize.setWidth(600);
    fixture.detectChanges();
    expect(tablist().getAttribute('aria-orientation')).toBe('horizontal');
    tabs()[0].focus();
    key(tabs()[0], 'ArrowDown');
    expect(document.activeElement).toBe(tabs()[0]);
    key(tabs()[0], 'ArrowRight');
    expect(document.activeElement).toBe(tabs()[1]);
    key(tabs()[1], 'ArrowLeft');
    expect(document.activeElement).toBe(tabs()[0]);

    resize.setWidth(768);
    fixture.detectChanges();
    expect(tablist().getAttribute('aria-orientation')).toBe('vertical');
  });

  it('scrolls the selected tab into view in the narrow strip', () => {
    const scroll = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    try {
      resize.setWidth(500);
      host.selected.set('labs');
      fixture.detectChanges();
      expect(scroll).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' });
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('renders no nav and a plain content column when there are no tabs', () => {
    host.tabs.set([]);
    fixture.detectChanges();
    expect(q('nav')).toBeNull();
    expect(q('[role="tablist"]')).toBeNull();
    expect(panel().hasAttribute('role')).toBe(false);
    expect(panel().hasAttribute('tabindex')).toBe(false);
    const frame = q('[data-testid="settings-layout"]') as HTMLElement;
    expect(frame.className).not.toContain('grid-cols-[var(--ptah-settings-nav-w)');
    expect(q('[data-testid="panel-content"]')).not.toBeNull();
  });

  it('centers one fluid main column with the content cap; the panel has no own cap', () => {
    const main = q('[data-testid="settings-layout-main"]') as HTMLElement;
    expect(main.classList.contains('mx-auto')).toBe(true);
    expect(main.classList.contains('w-full')).toBe(true);
    expect(main.classList.contains('max-w-[var(--ptah-settings-content-max-w)]')).toBe(true);
    expect(panel().classList.contains('w-full')).toBe(true);
    expect(panel().className).not.toMatch(/\bmax-w-/);
  });

  it('projects the slots and shows the description', () => {
    expect(q('nav [data-testid="nav-header"]')).not.toBeNull();
    expect(q('nav [data-testid="nav-footer"]')).not.toBeNull();
    expect(q('header [data-testid="header-action"]')).not.toBeNull();
    expect(q('[data-testid="settings-layout-panel"] [data-testid="panel-content"]')).not.toBeNull();
    expect(q('[data-testid="settings-layout-description"]')?.textContent?.trim()).toBe('Manage the app.');
    host.description.set(null);
    fixture.detectChanges();
    expect(q('[data-testid="settings-layout-description"]')).toBeNull();
  });

  it('gives each instance unique ids', () => {
    const other = TestBed.createComponent(HostComponent);
    other.detectChanges();
    const otherTab = (other.nativeElement as HTMLElement).querySelector('[role="tab"]');
    expect(otherTab?.id).toBeTruthy();
    expect(otherTab?.id).not.toBe(tabs()[0].id);
  });

  it('uses only token values for spacing', () => {
    const classes = Array.from(el.querySelectorAll('ptah-settings-layout, ptah-settings-layout *')).flatMap(
      (node) => Array.from(node.classList),
    );
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((cls) => RAW_SPACING.test(cls))).toEqual([]);
  });

  it('keeps tabs as the default mode', () => {
    expect(tabs()).toHaveLength(4);
    expect(tablist()).not.toBeNull();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs()[0].hasAttribute('aria-current')).toBe(false);
    // Each tab wrapper is presentational and uses display: contents, so each tab
    // stays a direct flex item of the tablist.
    for (const tab of tabs()) {
      const wrapper = tab.parentElement as HTMLElement;
      expect(wrapper.parentElement).toBe(tablist());
      expect(wrapper.getAttribute('role')).toBe('presentation');
      expect(wrapper.className).toBe('contents');
    }
  });

  it('renders navigation buttons with active hooks and a projected band', () => {
    host.navMode.set('navigation');
    host.navTestId.set('settings-tabs');
    fixture.detectChanges();
    const nav = q('[data-testid="settings-tabs"]') as HTMLElement;
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(nav.getAttribute('aria-label')).toBe('Settings sections');
    expect(tablist()).toBeNull();
    const list = q('[data-testid="settings-layout-tablist"]') as HTMLElement;
    expect(list.getAttribute('role')).toBe('list');
    const items = Array.from(list.children);
    expect(items).toHaveLength(buttons.length);
    expect(items.every((item) => item.getAttribute('role') === 'listitem')).toBe(true);
    expect(buttons[0].hasAttribute('role')).toBe(false);
    expect(buttons[0].getAttribute('aria-current')).toBe('page');
    expect(buttons[0].getAttribute('data-active')).toBe('true');
    expect(buttons[0].classList.contains('tab-active')).toBe(true);
    expect(buttons[1].hasAttribute('aria-current')).toBe(false);
    expect(q('[data-testid="settings-layout-header-band"] [data-testid="instrument-band"]')).not.toBeNull();
    expect(panel().hasAttribute('role')).toBe(false);
    buttons[1].click();
    expect(host.emitted).toEqual(['accounts']);
  });

  it('does not cancel Tab, Enter, Space or arrow keys on navigation buttons', () => {
    host.navMode.set('navigation');
    fixture.detectChanges();
    const buttons = Array.from(
      (q('[data-testid="settings-layout-tablist"]') as HTMLElement).querySelectorAll('button'),
    );
    for (const k of ['Tab', 'Enter', ' ', 'ArrowDown', 'Home']) {
      expect(key(buttons[1], k).defaultPrevented).toBe(false);
    }
    expect(host.emitted).toEqual([]);
  });

  it('indents a child and marks its parent as in section', () => {
    host.navMode.set('navigation');
    host.tabs.set([
      { id: 'general', label: 'General' },
      { id: 'accounts', label: 'Accounts', parent: 'general' },
    ]);
    host.selected.set('accounts');
    fixture.detectChanges();
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('nav button'));
    expect(buttons[0].getAttribute('data-in-section')).toBe('true');
    expect(buttons[0].getAttribute('aria-current')).toBeNull();
    expect(buttons[1].getAttribute('aria-current')).toBe('page');
    expect(buttons[1].parentElement?.className).toContain('ml-[var(--ptah-gap-section)]');
  });

  it('shows a state dot and count with an accessible label', () => {
    host.navMode.set('navigation');
    host.tabs.set([{ id: 'general', label: 'General', stateMark: { tone: 'warn', count: 2, label: '2 need attention' } }]);
    fixture.detectChanges();
    const mark = q('[data-testid="settings-layout-state-mark"]') as HTMLElement;
    expect(mark.getAttribute('aria-label')).toBe('2 need attention');
    expect(mark.textContent?.trim()).toBe('2');
    expect(mark.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
