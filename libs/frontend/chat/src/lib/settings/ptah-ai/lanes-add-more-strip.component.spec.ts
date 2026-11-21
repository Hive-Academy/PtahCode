import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ProvidersSettingsStateService,
  type ProvidersSettingsCommit,
} from '@ptah-extension/core';
import { NativePopoverComponent } from '@ptah-extension/ui';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import { LanesAddMoreStripComponent } from './lanes-add-more-strip.component';

const notInstalled = (
  cli: 'pi' | 'opencode',
  name = cli === 'pi' ? 'Pi' : 'OpenCode',
): SystemCliMatrixRow => ({
  id: cli,
  cli,
  kind: 'system',
  name,
  status: { kind: 'not-installed', label: 'Not installed', tone: 'neutral' },
  enabled: false,
  interactive: false,
  installed: false,
  manifest: undefined,
  permission: { badge: 'Ask', detail: 'Asks before each edit', tone: 'info' },
  version: null,
  versionLabel: null,
  codexStatusLine: null,
  provider: null,
  model: { key: 'piModel', value: '' },
  effort: null,
  credentialAction: false,
} as SystemCliMatrixRow);

const GUIDES = {
  pi: { command: 'npm install -g pi', note: 'Install Pi, then Re-detect.' },
  opencode: { command: null, note: 'Put opencode on your PATH, then Re-detect.' },
};

class StateStub {
  readonly commit = signal<ProvidersSettingsCommit>({
    status: 'idle', saved: [], unsaved: [], unconfirmed: [], refreshFailed: false, message: null,
  });
  readonly cliDetection = signal({ status: 'ready', data: [], error: null });
  readonly redetectClis = jest.fn(async () => true);
}

describe('LanesAddMoreStripComponent', () => {
  let fixture: ComponentFixture<LanesAddMoreStripComponent>;
  const element = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    element().querySelector<T>(selector);

  function mount(rows: readonly SystemCliMatrixRow[] = [notInstalled('opencode'), notInstalled('pi')]) {
    TestBed.configureTestingModule({
      imports: [LanesAddMoreStripComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: new StateStub() },
        SettingsSaveFeedbackService,
      ],
    });
    fixture = TestBed.createComponent(LanesAddMoreStripComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('guides', GUIDES);
    fixture.detectChanges();
  }
  afterEach(() => TestBed.resetTestingModule());

  it('lists one card per not-installed CLI, in the given order, with the header count and Re-detect', () => {
    mount();
    expect(q('[data-testid="lanes-strip"]')).not.toBeNull();
    expect(q('[data-testid="lanes-strip"] h3')?.textContent).toContain('Add more CLI agents');
    expect(q('[data-testid="lanes-strip-count"]')?.textContent).toBe('2');
    expect(q('[data-testid="lanes-strip-redetect"]')?.getAttribute('aria-label')).toBe('Re-detect CLIs');
    const cards = Array.from(element().querySelectorAll('[data-testid^="cli-provider-card-"]'));
    expect(cards.map((card) => card.getAttribute('data-testid'))).toEqual([
      'cli-provider-card-opencode',
      'cli-provider-card-pi',
    ]);
    const pi = q('[data-testid="cli-provider-card-pi"]');
    expect(pi?.textContent).toContain('Pi');
    expect(pi?.textContent).toContain('Not installed');
    expect(pi?.querySelector('.lanes-strip-monogram')?.textContent).toBe('P');
    expect(q('[data-testid="lanes-strip-install-pi"]')?.textContent?.trim()).toBe('Install');
  });

  it('does not render when no CLI is missing', () => {
    mount([]);
    expect(q('[data-testid="lanes-strip"]')).toBeNull();
    expect(element().textContent?.trim()).toBe('');
  });

  it('opens the capped install popover with the command, the note and Re-detect (U-2..U-6)', () => {
    mount();
    const redetect = jest.fn();
    fixture.componentInstance.redetect.subscribe(redetect);
    const install = q<HTMLButtonElement>('[data-testid="lanes-strip-install-pi"]')!;
    expect(install.getAttribute('aria-expanded')).toBe('false');
    install.click();
    fixture.detectChanges();
    expect(install.getAttribute('aria-expanded')).toBe('true');
    const content = q('[data-testid="cli-provider-card-pi"] [data-testid="cli-provider-popover-content"]');
    expect(content?.querySelector('code')?.textContent).toBe('npm install -g pi');
    expect(content?.textContent).toContain('Install Pi, then Re-detect.');
    const popover = fixture.debugElement
      .queryAll(By.directive(NativePopoverComponent))
      .map((item) => item.componentInstance as NativePopoverComponent)
      .find((item) => item.isOpen());
    expect(popover?.capToViewport()).toBe(true);
    // One open popover at a time.
    q<HTMLButtonElement>('[data-testid="lanes-strip-install-opencode"]')!.click();
    fixture.detectChanges();
    expect(element().querySelectorAll('[data-testid="cli-provider-popover-content"]')).toHaveLength(1);
    expect(q('[data-testid="cli-provider-card-opencode"] code')).toBeNull();
    Array.from(
      q('[data-testid="cli-provider-card-opencode"]')!.querySelectorAll('button'),
    )
      .find((button) => button.textContent?.trim() === 'Re-detect')
      ?.click();
    expect(redetect).toHaveBeenCalledWith('opencode');
  });

  it('disables Re-detect while busy', () => {
    mount();
    fixture.componentRef.setInput('busy', true);
    q<HTMLButtonElement>('[data-testid="lanes-strip-install-pi"]')!.click();
    fixture.detectChanges();
    const redetect = Array.from(
      q('[data-testid="cli-provider-card-pi"]')!.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.trim() === 'Re-detect');
    expect(redetect?.disabled).toBe(true);
  });

  it('returns focus to the Install button when the popover closes without a re-detect', async () => {
    mount();
    const install = q<HTMLButtonElement>('[data-testid="lanes-strip-install-pi"]')!;
    install.click();
    fixture.detectChanges();
    Array.from(q('[data-testid="cli-provider-card-pi"]')!.querySelectorAll('button'))
      .find((button) => button.getAttribute('aria-label') === 'Close')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(q('[data-testid="cli-provider-popover-content"]')).toBeNull();
    expect(document.activeElement).toBe(install);
  });

  it('closeGuide closes only the open card and moves no focus (U-7)', async () => {
    mount();
    const install = q<HTMLButtonElement>('[data-testid="lanes-strip-install-pi"]')!;
    install.click();
    fixture.detectChanges();
    fixture.componentInstance.closeGuide('opencode');
    fixture.detectChanges();
    expect(q('[data-testid="cli-provider-popover-content"]')).not.toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    fixture.componentInstance.closeGuide('pi');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(q('[data-testid="cli-provider-popover-content"]')).toBeNull();
    expect(document.activeElement).not.toBe(install);
  });

  it('shows read-only Details: provider, native behavior and capabilities (U-8, U-10, U-14)', () => {
    mount();
    const details = q('[data-testid="cli-provider-card-pi"] ptah-disclosure')!;
    const toggle = details.querySelector<HTMLButtonElement>('button')!;
    expect(toggle.textContent).toContain('Details');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(details.textContent).toContain('CLI default');
    expect(details.textContent).toContain('Asks before each edit');
    expect(details.querySelector('[data-testid="cli-capability-detail"]')?.textContent).toContain('Messaging');
    expect(details.querySelector('input, select')).toBeNull();
  });
});
