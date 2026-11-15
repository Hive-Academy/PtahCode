import { signal, ViewEncapsulation, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ProvidersSettingsStateService,
  type ProvidersSettingsCommit,
} from '@ptah-extension/core';
import { SettingsSaveFeedbackService } from './settings-save-feedback.service';
import { SettingsToastComponent, TOAST_PLACEMENT_STYLES } from './settings-toast.component';
import { isDisabledControl } from './busy-disabled.testing';

const EMPTY: ProvidersSettingsCommit = {
  status: 'idle',
  saved: [],
  unsaved: [],
  unconfirmed: [],
  refreshFailed: false,
  message: null,
};

describe('SettingsToastComponent', () => {
  let commit: WritableSignal<ProvidersSettingsCommit>;
  let feedback: SettingsSaveFeedbackService;
  let fixture: ComponentFixture<SettingsToastComponent>;

  const query = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  function settlesTo(outcome: Partial<ProvidersSettingsCommit>): jest.Mock<Promise<boolean>> {
    return jest.fn(async () => {
      commit.set({ ...EMPTY, ...outcome });
      return true;
    });
  }

  beforeEach(() => {
    commit = signal<ProvidersSettingsCommit>(EMPTY);
    TestBed.configureTestingModule({
      imports: [SettingsToastComponent],
      providers: [
        SettingsSaveFeedbackService,
        { provide: ProvidersSettingsStateService, useValue: { commit } },
      ],
    });
    feedback = TestBed.inject(SettingsSaveFeedbackService);
    fixture = TestBed.createComponent(SettingsToastComponent);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  /** Real-timer wait past the 50 ms announce tick (the 8 s auto-dismiss stays far away). */
  async function afterAnnounceTick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 60));
    fixture.detectChanges();
  }

  it('renders no card without a toast, but both live regions exist and are empty', () => {
    expect(query('settings-toast')).toBeNull();
    const status = query('settings-toast-live-status');
    const alert = query('settings-toast-live-alert');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.getAttribute('aria-atomic')).toBe('true');
    expect(status?.classList.contains('sr-only')).toBe(true);
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.getAttribute('aria-atomic')).toBe('true');
    expect(alert?.classList.contains('sr-only')).toBe(true);
    expect(status?.textContent?.trim()).toBe('');
    expect(alert?.textContent?.trim()).toBe('');
  });

  describe('persistent live regions (P6-A1)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const text = (testId: string) => query(testId)?.textContent?.trim();

    it('fills only the toned region, and only after the tick', () => {
      feedback.announce('Account added', 'status');
      fixture.detectChanges();
      expect(query('settings-toast-message')?.textContent).toBe('Account added');
      expect(text('settings-toast-live-status')).toBe('');
      expect(text('settings-toast-live-alert')).toBe('');

      jest.advanceTimersByTime(49);
      fixture.detectChanges();
      expect(text('settings-toast-live-status')).toBe('');

      jest.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(text('settings-toast-live-status')).toBe('Account added');
      expect(text('settings-toast-live-alert')).toBe('');
    });

    it('an alert goes to the alert region and clears the status region', () => {
      feedback.announce('Saved', 'status');
      fixture.detectChanges();
      jest.advanceTimersByTime(50);
      fixture.detectChanges();
      feedback.announce('Account not saved.', 'alert');
      fixture.detectChanges();
      expect(text('settings-toast-live-status')).toBe('');
      expect(text('settings-toast-live-alert')).toBe('');
      jest.advanceTimersByTime(50);
      fixture.detectChanges();
      expect(text('settings-toast-live-status')).toBe('');
      expect(text('settings-toast-live-alert')).toBe('Account not saved.');
    });

    it('an identical consecutive message is cleared, then set again', () => {
      feedback.announce('Lanes use Work', 'status');
      fixture.detectChanges();
      jest.advanceTimersByTime(50);
      fixture.detectChanges();
      const region = query('settings-toast-live-status');
      expect(region?.textContent?.trim()).toBe('Lanes use Work');

      feedback.announce('Lanes use Work', 'status');
      fixture.detectChanges();
      expect(query('settings-toast-live-status')).toBe(region);
      expect(text('settings-toast-live-status')).toBe('');
      jest.advanceTimersByTime(50);
      fixture.detectChanges();
      expect(text('settings-toast-live-status')).toBe('Lanes use Work');
    });

    it('dismiss clears the regions and cancels a pending announcement', () => {
      feedback.announce('First', 'status');
      fixture.detectChanges();
      jest.advanceTimersByTime(50);
      fixture.detectChanges();
      feedback.announce('Second', 'alert');
      fixture.detectChanges();
      feedback.dismiss();
      fixture.detectChanges();
      jest.advanceTimersByTime(50);
      fixture.detectChanges();
      expect(query('settings-toast')).toBeNull();
      expect(text('settings-toast-live-status')).toBe('');
      expect(text('settings-toast-live-alert')).toBe('');
      expect(query('settings-toast-live-status')).not.toBeNull();
    });

    it('a destroyed component leaves no pending announce timer', () => {
      const component = fixture.componentInstance as unknown as { liveStatus: () => string };
      feedback.announce('Gone', 'status');
      fixture.detectChanges();
      fixture.destroy();
      jest.advanceTimersByTime(50);
      expect(component.liveStatus()).toBe('');
    });

    it('the visual card carries no role or aria-live of its own', () => {
      feedback.announce('Saved', 'status');
      fixture.detectChanges();
      expect(query('settings-toast')?.hasAttribute('role')).toBe(false);
      expect(query('settings-toast')?.hasAttribute('aria-live')).toBe(false);
    });

    it('the floating card takes the glass overlay role, so glass themes give it a near-opaque fill', () => {
      feedback.announce('Saved', 'status');
      fixture.detectChanges();
      expect(query('settings-toast')?.getAttribute('data-glass-surface')).toBe('overlay');
    });
  });

  it('announces a success in the polite region, with an Undo that performs the undo write', async () => {
    const undo = settlesTo({ status: 'saved', saved: ['model'] });
    await feedback.save({
      label: 'main agent model',
      scope: 'workspace',
      write: settlesTo({ status: 'saved', saved: ['model'] }),
      undo,
    });
    fixture.detectChanges();

    const toast = query('settings-toast');
    expect(toast?.textContent).toContain('Saved main agent model to This workspace.');
    await afterAnnounceTick();
    expect(query('settings-toast-live-status')?.textContent?.trim()).toBe('Saved main agent model to This workspace.');
    expect(query('settings-toast-live-alert')?.textContent?.trim()).toBe('');

    const undoClick = jest.spyOn(feedback, 'undo');
    query('settings-toast-undo')?.click();
    // whenStable() would wait out the 8 s auto-dismiss timer; await the Undo itself.
    await undoClick.mock.results[0]?.value;
    fixture.detectChanges();

    expect(undo).toHaveBeenCalledTimes(1);
    expect(query('settings-toast-undo')).toBeNull();
  });

  it('announces a failure in the alert region, with no Undo', async () => {
    await feedback.save({
      label: 'effort',
      scope: 'global',
      write: settlesTo({ status: 'failed', unsaved: ['effort'] }),
      undo: jest.fn().mockResolvedValue(true),
    });
    fixture.detectChanges();

    const toast = query('settings-toast');
    expect(toast?.textContent).toContain('Could not save effort. Not saved: effort.');
    await afterAnnounceTick();
    expect(query('settings-toast-live-alert')?.textContent).toContain('Could not save effort. Not saved: effort.');
    expect(query('settings-toast-live-status')?.textContent?.trim()).toBe('');
    expect(query('settings-toast-undo')).toBeNull();
  });

  it('disables Undo while a save is in flight, keeping it focusable (aria-disabled)', async () => {
    await feedback.save({
      label: 'effort',
      scope: 'global',
      write: settlesTo({ status: 'saved' }),
      undo: jest.fn().mockResolvedValue(true),
    });
    commit.set({ ...EMPTY, status: 'saving' });
    fixture.detectChanges();

    expect(isDisabledControl(query('settings-toast-undo'))).toBe(true);
    expect((query('settings-toast-undo') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('inline (Batch 55b CS-1, the drawer Models & Tiers tab)', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('inline', true);
      fixture.detectChanges();
    });

    it('renders the same toast in the flow of the panel, with -inline test ids and no page region', async () => {
      const undo = jest.fn().mockResolvedValue(true);
      await feedback.save({ label: 'opus tier model', scope: 'global', write: settlesTo({ status: 'saved' }), undo });
      fixture.detectChanges();
      expect(query('settings-toast-region')).toBeNull();
      expect(query('settings-toast')).toBeNull();
      expect(query('settings-toast-live-status')).toBeNull();
      const toast = query('settings-toast-inline');
      expect(toast?.hasAttribute('role')).toBe(false);
      expect(toast?.className).not.toContain('shadow-lg');
      expect(toast?.hasAttribute('data-glass-surface')).toBe(false);
      expect(toast?.closest('.fixed')).toBeNull();
      expect(query('settings-toast-inline-message')?.textContent).toBe('Saved opus tier model to All Ptah apps.');
      await afterAnnounceTick();
      expect(query('settings-toast-inline-live-status')?.textContent?.trim()).toBe('Saved opus tier model to All Ptah apps.');
      query('settings-toast-inline-undo')?.click();
      await Promise.resolve();
      expect(undo).toHaveBeenCalledTimes(1);
    });

    it('a failure is announced in the inline alert region with no Undo, and Dismiss removes and clears it', async () => {
      await feedback.save({ label: 'opus tier model', scope: 'global', write: settlesTo({ status: 'failed' }), undo: null });
      fixture.detectChanges();
      expect(query('settings-toast-inline-live-alert')?.textContent?.trim()).toBe('');
      await afterAnnounceTick();
      expect(query('settings-toast-inline-live-alert')?.textContent).toContain('Could not save');
      expect(query('settings-toast-inline-undo')).toBeNull();
      query('settings-toast-inline-dismiss')?.click();
      fixture.detectChanges();
      expect(query('settings-toast-inline')).toBeNull();
      expect(query('settings-toast-inline-live-alert')?.textContent?.trim()).toBe('');
    });
  });

  it('the dismiss button removes the toast', async () => {
    await feedback.save({
      label: 'effort',
      scope: 'app',
      write: settlesTo({ status: 'saved' }),
      undo: null,
    });
    fixture.detectChanges();

    const dismiss = query('settings-toast-dismiss');
    expect(dismiss?.getAttribute('aria-label')).toBe('Dismiss notification');
    dismiss?.click();
    fixture.detectChanges();

    expect(query('settings-toast')).toBeNull();
  });

  describe('top-layer promotion', () => {
    const proto = HTMLElement.prototype;
    let previousShow: PropertyDescriptor | undefined;

    async function showToast(): Promise<HTMLElement> {
      await feedback.save({ label: 'voice', scope: 'app', write: settlesTo({ status: 'saved' }), undo: null });
      fixture.detectChanges();
      // A second pass runs the effect once the view query sees the new region.
      fixture.detectChanges();
      return query('settings-toast-region') as HTMLElement;
    }

    beforeEach(() => {
      previousShow = Object.getOwnPropertyDescriptor(proto, 'showPopover');
      // jsdom may not know :popover-open; report a closed popover.
      const realMatches = Element.prototype.matches;
      jest
        .spyOn(Element.prototype, 'matches')
        .mockImplementation(function (this: Element, selector: string) {
          return selector === ':popover-open' ? false : realMatches.call(this, selector);
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      if (previousShow) Object.defineProperty(proto, 'showPopover', previousShow);
      else Reflect.deleteProperty(proto, 'showPopover');
    });

    it('promotes the region with showPopover and keeps no in-page display override', async () => {
      const shown: HTMLElement[] = [];
      Object.defineProperty(proto, 'showPopover', {
        configurable: true,
        value(this: HTMLElement) {
          shown.push(this);
        },
      });
      const region = await showToast();
      expect(shown).toContain(region);
      expect(shown.every((el) => el === region)).toBe(true);
      expect(region.style.display).toBe('');
    });

    it('stays visible in the page layer when the Popover API is missing', async () => {
      Reflect.deleteProperty(proto, 'showPopover');
      const region = await showToast();
      expect(region.style.display).toBe('block');
    });

    it('stays visible in the page layer when showPopover throws', async () => {
      Object.defineProperty(proto, 'showPopover', {
        configurable: true,
        value() {
          throw new DOMException('not connected', 'InvalidStateError');
        },
      });
      const region = await showToast();
      expect(region.style.display).toBe('block');
    });
  });

  describe('restacking after another overlay opens', () => {
    let previousShow: PropertyDescriptor | undefined;
    let previousHide: PropertyDescriptor | undefined;
    let show: jest.Mock;
    let hide: jest.Mock;
    let overlay: HTMLElement;

    function toggle(target: HTMLElement, newState = 'open'): void {
      const event = new Event('toggle'); // Non-bubbling, as in Chromium.
      Object.defineProperty(event, 'newState', { value: newState });
      target.dispatchEvent(event);
    }

    async function showToast(): Promise<HTMLElement> {
      await feedback.save({ label: 'voice', scope: 'app', write: settlesTo({ status: 'saved' }), undo: null });
      fixture.detectChanges();
      fixture.detectChanges();
      show.mockClear();
      hide.mockClear();
      return query('settings-toast-region') as HTMLElement;
    }

    beforeEach(() => {
      previousShow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
      previousHide = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');
      const opened = new WeakSet<HTMLElement>();
      show = jest.fn(function (this: HTMLElement) { opened.add(this); });
      hide = jest.fn(function (this: HTMLElement) { opened.delete(this); });
      Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show });
      Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: hide });
      const realMatches = Element.prototype.matches;
      jest.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
        return selector === ':popover-open'
          ? this instanceof HTMLElement && opened.has(this)
          : realMatches.call(this, selector);
      });
      overlay = document.createElement('div');
      overlay.setAttribute('popover', 'manual');
      document.body.appendChild(overlay);
    });

    afterEach(() => {
      overlay.remove();
      jest.restoreAllMocks();
      if (previousShow) Object.defineProperty(HTMLElement.prototype, 'showPopover', previousShow);
      else Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
      if (previousHide) Object.defineProperty(HTMLElement.prototype, 'hidePopover', previousHide);
      else Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
    });

    it('captures open toggles and coalesces them into a microtask restack', async () => {
      await showToast();
      toggle(overlay);
      toggle(overlay);
      expect(show).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(hide).toHaveBeenCalledTimes(1);
      expect(show).toHaveBeenCalledTimes(1);
      expect(hide.mock.invocationCallOrder[0]).toBeLessThan(show.mock.invocationCallOrder[0]);
    });

    it('ignores its own toggle, closed toggles, and ordinary details toggles', async () => {
      const region = await showToast();
      toggle(region);
      toggle(overlay, 'closed');
      overlay.removeAttribute('popover');
      toggle(overlay);
      await Promise.resolve();
      expect(show).not.toHaveBeenCalled();
    });

    it('does nothing without a visible page toast, including inline mode', async () => {
      toggle(overlay);
      await Promise.resolve();
      expect(show).not.toHaveBeenCalled();
      fixture.componentRef.setInput('inline', true);
      await showToast();
      toggle(overlay);
      await Promise.resolve();
      expect(show).not.toHaveBeenCalled();
    });

    it('does not resurrect a toast dismissed before the microtask', async () => {
      await showToast();
      toggle(overlay);
      feedback.dismiss();
      await Promise.resolve();
      expect(show).not.toHaveBeenCalled();
    });

    it('raises above dialog openings without adding autofocus or moving focus', async () => {
      const region = await showToast();
      const dialog = document.createElement('dialog');
      const input = document.createElement('input');
      dialog.appendChild(input);
      document.body.appendChild(dialog);
      try {
        input.focus();
        toggle(dialog);
        await Promise.resolve();
        expect(show).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(input);
        expect(region.querySelector('[autofocus]')).toBeNull();
      } finally {
        dialog.remove();
      }
    });

    it('removes its capture listener and cancels a queued raise on destroy', async () => {
      await showToast();
      const remove = jest.spyOn(document, 'removeEventListener');
      toggle(overlay);
      fixture.destroy();
      await Promise.resolve();
      expect(remove).toHaveBeenCalledWith('toggle', expect.any(Function), true);
      toggle(overlay);
      await Promise.resolve();
      expect(show).not.toHaveBeenCalled();
    });
  });

  describe('placement over an open drawer (Batch 49b, polish B)', () => {
    async function showToast(): Promise<HTMLElement | null> {
      await feedback.save({
        label: 'voice',
        scope: 'app',
        write: settlesTo({ status: 'saved' }),
        undo: null,
      });
      fixture.detectChanges();
      return query('settings-toast-region');
    }

    /** Builds `<ptah-native-drawer><div role=dialog class=...><div data-testid=native-drawer-body>`. */
    function mountDrawer(panelClass: string): { drawer: HTMLElement; body: HTMLElement } {
      const drawer = document.createElement('ptah-native-drawer');
      const panel = document.createElement('div');
      panel.setAttribute('role', 'dialog');
      panel.className = panelClass;
      const body = document.createElement('div');
      body.setAttribute('data-testid', 'native-drawer-body');
      panel.appendChild(body);
      drawer.appendChild(panel);
      document.body.appendChild(drawer);
      return { drawer, body };
    }

    /** Rules of {@link TOAST_PLACEMENT_STYLES}: selector -> declarations, keyed with the media condition. */
    function rules(): Array<{ media: string | null; selector: string; body: string }> {
      const out: Array<{ media: string | null; selector: string; body: string }> = [];
      const re = /@media\s*\(([^)]*)\)\s*\{\s*([^{}]+)\{([^{}]*)\}\s*\}|([^{}@]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(TOAST_PLACEMENT_STYLES)) !== null) {
        if (m[1] !== undefined) out.push({ media: m[1].trim(), selector: m[2].trim(), body: m[3] });
        else out.push({ media: null, selector: m[4].trim(), body: m[5] });
      }
      return out;
    }

    it('marks the region and its message for the placement rules, and keeps the live regions outside', async () => {
      const region = await showToast();

      expect(region?.classList.contains('bottom-6')).toBe(true);
      expect(region?.classList.contains('right-6')).toBe(true);
      expect(region?.classList.contains('ptah-settings-toast-region')).toBe(true);
      // The old arbitrary lift moved into the stylesheet.
      expect([...(region?.classList ?? [])].some((c) => c.includes('bottom-28'))).toBe(false);
      expect(query('settings-toast-message')?.classList.contains('ptah-settings-toast-message')).toBe(true);
      expect(region?.querySelector('[data-testid="settings-toast"]')).not.toBeNull();
      expect(region?.querySelector('[data-testid="settings-toast-live-status"]')).toBeNull();
      expect(region?.querySelector('[data-testid="settings-toast-live-alert"]')).toBeNull();
    });

    it('ships the placement stylesheet unscoped, so its body:has() rules can reach the page', () => {
      const def = (SettingsToastComponent as unknown as {
        ɵcmp: { encapsulation: ViewEncapsulation };
      }).ɵcmp;
      expect(def.encapsulation).toBe(ViewEncapsulation.None);
      // jest-preset-angular strips component styles, so the rules are checked through TOAST_PLACEMENT_STYLES.
    });

    it('narrow window: lifts above the footer, caps the message and reserves drawer scroll space', () => {
      const all = rules();
      const lift = all.find((r) => r.media === null && r.selector.endsWith('.ptah-settings-toast-region'));
      expect(lift?.body).toContain('bottom: calc(var(--ptah-space-12) * 2 + var(--ptah-space-4))');
      const cap = all.find((r) => r.media === null && r.selector.endsWith('.ptah-settings-toast-message'));
      expect(cap?.body).toContain('max-height: 3lh');
      expect(cap?.body).toContain('overflow-y: auto');
      const reserves = all.filter((r) => r.selector.includes("[data-testid='native-drawer-body']"));
      expect(reserves.map((r) => r.media)).toEqual(['width < 51rem', 'width < 61rem']);
      for (const r of reserves) expect(r.body).toContain('padding-bottom: calc(var(--ptah-space-12) * 3)');
    });

    it('wide window: moves beside the drawer, a max-w-lg panel from 51rem and any other panel from 61rem', () => {
      const beside = rules().filter((r) => r.body.includes('left: var(--ptah-space-6)'));
      expect(beside.map((r) => r.media)).toEqual(['width >= 51rem', 'width >= 61rem']);
      for (const r of beside) {
        expect(r.body).toContain('right: auto');
        expect(r.body).toContain('bottom: var(--ptah-space-6)');
      }
      expect(beside[0].body).toContain('calc(100vw - 32rem - var(--ptah-space-12))');
      expect(beside[1].body).toContain('calc(100vw - 42rem - var(--ptah-space-12))');
    });

    it('selectors match only while a drawer panel is rendered, and the reserve only while a page toast shows', async () => {
      const all = rules();
      const pick = (match: (r: (typeof all)[number]) => boolean): (typeof all)[number] => {
        const found = all.find(match);
        if (!found) throw new Error('placement rule missing');
        return found;
      };
      const lift = pick((r) => r.media === null && r.selector.endsWith('.ptah-settings-toast-region'));
      const lgBeside = pick((r) => r.media === 'width >= 51rem');
      const reserveLg = pick((r) => r.media === 'width < 51rem');
      const reserveOther = pick((r) => r.media === 'width < 61rem');
      const condition = (selector: string): string => selector.replace(/\s+\.ptah-settings-toast-region$/, '');

      const host = document.createElement('ptah-native-drawer');
      document.body.appendChild(host);
      expect(document.querySelector(condition(lift.selector))).toBeNull();
      host.remove();

      const lg = mountDrawer('w-full max-w-lg');
      try {
        expect(document.querySelector(condition(lift.selector))).toBe(document.body);
        expect(document.querySelector(condition(lgBeside.selector))).toBe(document.body);
        // No page toast yet: no space is reserved.
        expect(lg.body.matches(reserveLg.selector)).toBe(false);
        const region = await showToast();
        expect(region).not.toBeNull();
        expect(lg.body.matches(reserveLg.selector)).toBe(true);
        expect(lg.body.matches(reserveOther.selector)).toBe(false);
        expect(region?.matches(lift.selector)).toBe(true);
      } finally {
        lg.drawer.remove();
      }

      const wide = mountDrawer('w-full max-w-2xl');
      try {
        expect(document.querySelector(condition(lgBeside.selector))).toBeNull();
        expect(wide.body.matches(reserveOther.selector)).toBe(true);
        feedback.dismiss();
        fixture.detectChanges();
        expect(wide.body.matches(reserveOther.selector)).toBe(false);
      } finally {
        wide.drawer.remove();
      }
    });
  });
});
