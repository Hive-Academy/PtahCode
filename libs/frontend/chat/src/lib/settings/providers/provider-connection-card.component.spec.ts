import { OverlayContainer } from '@angular/cdk/overlay';
/**
 * ProviderConnectionCardComponent specs — TASK_2026_555 Batch 24 (compact card, plan :627-636).
 *
 * The state table itself (label, copy, tone, dot, primary action) is pinned in
 * `provider-connection-card.state.spec.ts`. These specs pin what the component renders from it:
 * - the whole card has one native details trigger: click, Enter and Space emit `detailsRequested`, a click
 *   on the inline action never does (RUX-4: every card opens its drawer);
 * - one list row: initials avatar, name over provenance, "Used by N" and the consumer names; status
 *   dot + label, at most one inline action (`btn-sm`, 32 px target), auth-modality badge;
 * - each state's single inline action emits its own output, with an accessible name naming the
 *   provider; Active and Checking carry none;
 * - the state-table copy is the card's accessible name and tooltip;
 * - never Connected without confirmed evidence; a blocked main route says it needs attention;
 * - colour on the dot, avatar and badges only; the kept testids (provider-connection-card,
 *   provider-name, status-copy, auth-modality) are present;
 * - a D16 scope badge forwards its intents; "Used by" is hidden while unknown.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ProviderConnectionCardComponent } from './provider-connection-card.component';
import type { SettingScopeDisplay } from './setting-scope-row.component';

function overlay(): HTMLElement {
  return TestBed.inject(OverlayContainer).getContainerElement();
}

type CardInputs = {
  [K in keyof ProviderConnectionCardComponent]: unknown;
};

function createComponent(
  inputs: Partial<CardInputs> = {},
): ComponentFixture<ProviderConnectionCardComponent> {
  const fixture = TestBed.createComponent(ProviderConnectionCardComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture;
}

function query(
  fixture: ComponentFixture<ProviderConnectionCardComponent>,
  testId: string,
): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`) ?? overlay().querySelector(`[data-testid="${testId}"]`);
}

/** The card's full-surface native details trigger. */
function surface(
  fixture: ComponentFixture<ProviderConnectionCardComponent>,
): HTMLButtonElement {
  const trigger = query(
    fixture,
    'provider-card-details-trigger',
  ) as HTMLButtonElement | null;
  if (!trigger) throw new Error('No card details trigger');
  return trigger;
}

/** All buttons in the noninteractive card frame. */
function buttons(
  fixture: ComponentFixture<ProviderConnectionCardComponent>,
): HTMLButtonElement[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('button'),
  ) as HTMLButtonElement[];
}

const KIMI_CODE = {
  providerId: 'kimi-code',
  providerName: 'Kimi Code',
  authModality: 'apiKey',
};

describe('ProviderConnectionCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProviderConnectionCardComponent],
    }).compileComponents();
  });

  describe('whole-card trigger (RUX-4)', () => {
    it('the card-area trigger is a focusable native button for click, Enter and Space', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'connected',
        positiveProbeEvidence: true,
      });
      const emitted = jest.fn();
      fixture.componentInstance.detailsRequested.subscribe(emitted);
      const frame = fixture.nativeElement.querySelector(
        'ptah-surface-card > div',
      ) as HTMLElement;
      expect(frame.getAttribute('role')).toBeNull();
      expect(frame.getAttribute('tabindex')).toBeNull();
      expect(frame.contains(surface(fixture))).toBe(true);
      expect(surface(fixture).tagName).toBe('BUTTON');
      expect(surface(fixture).getAttribute('type')).toBe('button');
      surface(fixture).focus();
      expect(document.activeElement).toBe(surface(fixture));
      surface(fixture).click();
      // jsdom does not synthesize a click from keyboard default actions; the click after each
      // keydown models the browser's native button activation without adding a custom handler.
      surface(fixture).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      surface(fixture).click();
      surface(fixture).dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );
      surface(fixture).click();
      expect(emitted).toHaveBeenCalledTimes(3);
      expect(surface(fixture).className).toContain(
        'focus-visible:outline-base-content',
      );
    });

    it('the inline action emits its own output, never detailsRequested', () => {
      const fixture = createComponent({ ...KIMI_CODE, status: 'unreachable' });
      const details = jest.fn();
      const retry = jest.fn();
      fixture.componentInstance.detailsRequested.subscribe(details);
      fixture.componentInstance.retryRequested.subscribe(retry);
      const action = query(fixture, 'btn-retry') as HTMLButtonElement;
      expect(action.parentElement).not.toBe(surface(fixture));
      expect(surface(fixture).contains(action)).toBe(false);
      expect(action.className).toContain('pointer-events-auto');
      action.click();
      expect(retry).toHaveBeenCalledTimes(1);
      expect(details).not.toHaveBeenCalled();
    });

    it('its accessible name and tooltip carry the status and the state-table copy', () => {
      const fixture = createComponent({ ...KIMI_CODE, status: 'unreachable' });
      expect(surface(fixture).getAttribute('aria-label')).toBe(
        'Kimi Code: Unreachable. Could not reach Kimi Code; check the connection and retry. Open connection details.',
      );
      expect(
        query(fixture, 'provider-connection-card')?.getAttribute('title'),
      ).toBe('Could not reach Kimi Code; check the connection and retry.');
    });

    it('exposes status and subtitle without duplicating usage that fits', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'unreachable',
        sourceLabel: 'Key stored on this machine',
        usedByCount: 2,
        usedByLabels: ['Main agent', 'Memory curator'],
      });
      expect(surface(fixture).getAttribute('title')).toBe(
        'Could not reach Kimi Code; check the connection and retry.\nKey stored on this machine',
      );

      const withoutSegments = createComponent({
        providerId: 'x',
        providerName: 'X',
        status: 'unreachable',
      });
      expect(query(withoutSegments, 'card-subtitle')).toBeNull();
      expect(query(withoutSegments, 'used-for')).toBeNull();
      expect(surface(withoutSegments).getAttribute('title')).toBe(
        'Could not reach X; check the connection and retry.',
      );
    });
  });

  it('keeps the provenance separator with a nonempty usage segment', () => {
    const fixture = createComponent({
      ...KIMI_CODE,
      authModality: 'cli',
      sourceLabel: 'CLI subscription',
    });
    const subtitle = query(fixture, 'card-subtitle');
    expect(subtitle).not.toBeNull();
    expect(subtitle?.parentElement?.textContent?.trim()).toBe(
      'CLI subscription',
    );
    expect(query(fixture, 'used-by-segment')).toBeNull();
    fixture.componentRef.setInput('usedByCount', 0);
    fixture.detectChanges();
    expect(query(fixture, 'card-subtitle')?.textContent?.trim()).toBe(
      'CLI subscription',
    );
    expect(
      query(fixture, 'used-by-segment')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('CLI subscription \u00b7 Used by 0');
  });

  describe('compact layout (≤ 80 px, prototype .conn-card)', () => {
    it('renders the avatar, name, provenance and auth-modality badge on row 1', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'connected',
        positiveProbeEvidence: true,
        sourceLabel: 'Key stored on this machine',
      });
      expect(query(fixture, 'card-avatar')?.textContent?.trim()).toBe('KC');
      expect(query(fixture, 'card-avatar')?.className).toContain(
        'text-base-content',
      );
      expect(query(fixture, 'provider-name')?.textContent?.trim()).toBe(
        'Kimi Code',
      );
      expect(query(fixture, 'card-subtitle')?.textContent?.trim()).toBe(
        'Key stored on this machine',
      );
      expect(query(fixture, 'auth-modality')?.textContent?.trim()).toBe(
        'API key',
      );
    });

    it('falls back to the last connected / failed time, then the full modality, for the provenance line', () => {
      expect(
        query(
          createComponent({ ...KIMI_CODE, lastConnectedText: '2 hours ago' }),
          'card-subtitle',
        )?.textContent?.trim(),
      ).toBe('Last connected 2 hours ago');
      expect(
        query(
          createComponent({ ...KIMI_CODE, lastFailedText: '5 minutes ago' }),
          'card-subtitle',
        )?.textContent?.trim(),
      ).toBe('Last check failed 5 minutes ago');
      const cli = createComponent({
        providerId: 'claude-cli',
        providerName: 'Claude (Subscription)',
        authModality: 'cli',
      });
      expect(query(cli, 'card-subtitle')?.textContent?.trim()).toBe(
        'CLI subscription',
      );
      expect(query(cli, 'auth-modality')?.textContent?.trim()).toBe('CLI');
      expect(
        query(
          createComponent({ providerId: 'x', providerName: 'X' }),
          'card-subtitle',
        ),
      ).toBeNull();
    });

    it('a preformatted modality (the page passes "Custom" for a custom gateway) replaces the badge text', () => {
      expect(
        query(
          createComponent({ ...KIMI_CODE, authModalityText: 'Custom' }),
          'auth-modality',
        )?.textContent?.trim(),
      ).toBe('Custom');
    });

    it('never truncates the name or the modality', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        providerName: 'A very long provider name that wraps',
        status: 'connected',
      });
      for (const id of ['provider-name', 'auth-modality']) {
        expect(query(fixture, id)?.className).not.toMatch(
          /truncate|line-clamp|text-ellipsis/,
        );
      }
    });

    it('row 2 holds the status dot and label, the inline action and "Used by N"', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'connected',
        positiveProbeEvidence: true,
        usedByCount: 2,
      });
      expect(query(fixture, 'status-copy')?.textContent?.trim()).toBe(
        'Connected',
      );
      expect(
        query(fixture, 'status-badge')?.querySelector('.bg-success'),
      ).not.toBeNull();
      expect(query(fixture, 'status-badge')?.className).toContain(
        'text-base-content',
      );
      expect(query(fixture, 'used-by-count')?.textContent?.trim()).toBe(
        'Used by 2',
      );
    });

    it('keeps many consumers in a two-line clamp without style overrides', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        usedByCount: 40,
        usedByLabels: Array.from({ length: 40 }, (_, i) => `Consumer ${i}`),
      });
      const segment = query(fixture, 'used-by-segment') as HTMLElement;
      expect(segment.classList.contains('line-clamp-2')).toBe(true);
      expect(
        segment.querySelector('[data-testid="card-subtitle"]'),
      ).not.toBeNull();
      const source = readFileSync(
        join(__dirname, 'provider-connection-card.component.ts'),
        'utf8',
      );
      const styles = source.split('styles: `')[1].split('`,')[0];
      for (const rule of styles.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
        if (
          /display:\s*inline|overflow:\s*visible|-webkit-line-clamp:\s*unset/.test(
            rule[2],
          )
        ) {
          expect(segment.matches(rule[1].trim())).toBe(false);
        }
      }
    });

    it('names the consumers next to "Used by N" when labels are given, and omits them when empty', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        usedByCount: 2,
        usedByLabels: ['Main agent', 'Memory curator'],
      });
      const usedFor = query(fixture, 'used-for');
      expect(usedFor?.textContent?.trim()).toBe(
        'Used for: Main agent, Memory curator',
      );
      expect(usedFor?.getAttribute('title')).toBeNull();
      // "Used by N · Used for: …" is one truncating segment, so the sub-line wraps to at most two lines (80 px card gate).
      expect(query(fixture, 'used-by-segment')?.className).toContain(
        'line-clamp-2',
      );
      expect(query(fixture, 'used-by-segment')?.className).not.toContain(
        'truncate',
      );
      expect(query(fixture, 'used-by-segment')?.contains(usedFor ?? null)).toBe(
        true,
      );
      expect(query(fixture, 'used-by-count')?.textContent?.trim()).toBe(
        'Used by 2',
      );
      expect(
        query(createComponent({ ...KIMI_CODE, usedByCount: 0 }), 'used-for'),
      ).toBeNull();
      expect(
        query(
          createComponent({
            ...KIMI_CODE,
            usedByCount: null,
            usedByLabels: ['Main agent'],
          }),
          'used-for',
        ),
      ).toBeNull();
    });

    it('adds the full usage title only while the measured content overflows', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        usedByCount: 2,
        usedByLabels: ['Main agent', 'Memory curator'],
      });
      const segment = query(fixture, 'used-by-segment') as HTMLElement;
      let height = 60;
      Object.defineProperties(segment, {
        scrollHeight: { get: () => height },
        clientHeight: { get: () => 32 },
      });
      // Input changes also remeasure usage when labels are reassigned.
      fixture.componentRef.setInput('usedByLabels', [
        'Main agent',
        'Memory curator',
        'Enhancement',
      ]);
      fixture.detectChanges();
      fixture.detectChanges();
      expect(query(fixture, 'used-for')?.getAttribute('title')).toBe(
        'Main agent, Memory curator, Enhancement',
      );
      expect(surface(fixture).getAttribute('title')).toContain(
        'Used for: Main agent, Memory curator, Enhancement',
      );
      height = 32;
      fixture.componentRef.setInput('usedByLabels', ['Main agent']);
      fixture.detectChanges();
      fixture.detectChanges();
      expect(query(fixture, 'used-for')?.getAttribute('title')).toBeNull();
      expect(surface(fixture).getAttribute('title')).not.toContain('Used for:');
    });

    it('exposes full usage when the shared provenance clamp overflows', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        usedByCount: 2,
        usedByLabels: ['Main agent'],
      });
      const provenance = query(fixture, 'used-by-segment')?.parentElement;
      Object.defineProperties(provenance, {
        scrollHeight: { get: () => 60 },
        clientHeight: { get: () => 32 },
      });
      fixture.componentRef.setInput('usedByLabels', [
        'Main agent',
        'Memory curator',
      ]);
      fixture.detectChanges();
      fixture.detectChanges();
      expect(query(fixture, 'used-for')?.getAttribute('title')).toBe(
        'Main agent, Memory curator',
      );
    });

    it('keeps text at the 12 px floor; the card frame is the surface card own frame (no second glass frame on the host)', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'needs-key',
        sourceLabel: 'Key stored on this machine',
        usedByCount: 1,
      });
      expect(fixture.nativeElement.innerHTML).not.toMatch(
        /text-\[(9|10|11)px\]/,
      );
      expect(
        fixture.nativeElement
          .querySelector('ptah-surface-card')
          ?.hasAttribute('data-glass-surface'),
      ).toBe(false);
    });

    it('gives a long provider name room without wrapping the status controls', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        providerName: 'Claude (Subscription)',
      });
      const name = query(fixture, 'provider-name');
      const status = query(fixture, 'status-badge');
      expect(name?.textContent?.trim()).toBe('Claude (Subscription)');
      expect(name?.parentElement?.className).toContain('min-w-[7rem]');
      expect(name?.parentElement?.className).toContain('flex-1');
      expect(name?.parentElement?.className).toContain('basis-0');
      expect(status?.parentElement?.className).toContain('flex-nowrap');
      expect(fixture.nativeElement.className).toContain('self-start');
    });

    it('keeps a configured local provider status, action and modality on one line', () => {
      const fixture = createComponent({
        providerId: 'ollama',
        providerName: 'Ollama',
        authModality: 'local-native',
        status: 'not-checked',
        usedByCount: 0,
      });
      const name = query(fixture, 'provider-name');
      const status = query(fixture, 'status-badge');
      expect(name?.textContent?.trim()).toBe('Ollama');
      expect(name?.parentElement?.className).toContain('min-w-[7rem]');
      expect(name?.parentElement?.className).toContain('flex-1');
      expect(name?.parentElement?.className).toContain('basis-0');
      expect(status?.parentElement?.className).toContain('flex-nowrap');
      expect(status?.className).toContain('min-w-0');
      expect(query(fixture, 'status-copy')?.className).toContain('truncate');
      expect(query(fixture, 'btn-check-connection')?.className).toContain('shrink-0');
      expect(query(fixture, 'auth-modality')?.textContent?.trim()).toBe('Local');
      expect(fixture.nativeElement.className).toContain('self-start');
    });

    it('"Used by" is hidden while the count is unknown, and shows 0 when known and unused', () => {
      expect(
        query(
          createComponent({ ...KIMI_CODE, usedByCount: null }),
          'used-by-count',
        ),
      ).toBeNull();
      expect(
        query(
          createComponent({ ...KIMI_CODE, usedByCount: 0 }),
          'used-by-count',
        )?.textContent?.trim(),
      ).toBe('Used by 0');
    });
  });

  describe('one inline action per state (every other action lives in the drawer)', () => {
    it.each([
      [
        'needs-key',
        {},
        'btn-add-key',
        'addKeyRequested',
        'Add API key for Kimi Code',
      ],
      [
        'unauthenticated',
        {},
        'btn-replace-key',
        'replaceKeyRequested',
        'Replace key for Kimi Code',
      ],
      [
        'unauthenticated',
        { authModality: 'oauth' },
        'btn-sign-in',
        'signInRequested',
        'Sign in to Kimi Code',
      ],
      [
        'unreachable',
        {},
        'btn-retry',
        'retryRequested',
        'Retry connection to Kimi Code',
      ],
      [
        'not-installed',
        { cliName: 'Claude CLI' },
        'btn-check-again',
        'checkAgainRequested',
        'Check again for Claude CLI',
      ],
      ['not-configured', {}, 'btn-setup', 'setupRequested', 'Set up Kimi Code'],
      [
        'connected',
        { positiveProbeEvidence: false },
        'btn-check-connection',
        'checkConnectionRequested',
        'Check connection for Kimi Code',
      ],
      [
        'skipped',
        {},
        'btn-retry',
        'retryRequested',
        'Retry connection to Kimi Code',
      ],
    ] as const)(
      '%s %j → %s',
      (status, extra, testId, outputName, ariaLabel) => {
        const fixture = createComponent({ ...KIMI_CODE, status, ...extra });
        const card = fixture.componentInstance as unknown as Record<
          string,
          { subscribe(fn: () => void): unknown }
        >;
        const emitted = jest.fn();
        card[outputName].subscribe(emitted);
        expect(buttons(fixture)).toHaveLength(2);
        const action = query(fixture, testId) as HTMLButtonElement;
        expect(action.getAttribute('aria-label')).toBe(ariaLabel);
        expect(action.className).toContain('btn-sm');
        expect(action.className).not.toContain('btn-xs');
        expect(action.className).toContain('btn-ghost');
        expect(action.hasAttribute('data-ptah-button')).toBe(true);
        action.click();
        expect(emitted).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['active', 'checking'] as const)(
      '%s carries no inline action',
      (status) => {
        expect(buttons(createComponent({ ...KIMI_CODE, status }))).toHaveLength(
          1,
        );
      },
    );

    // Gate V 28 (prototype cards): no "Use for main agent" on the face; the Main Agent popover changes the main
    // agent, and its provider select offers the same usable connections (parity #3).
    it('a connected card, or a not-checkable one, carries no inline action and no "Use for main agent"', () => {
      for (const extra of [
        { status: 'connected', positiveProbeEvidence: true },
        { status: 'unknown' },
      ] as const) {
        const fixture = createComponent({ ...KIMI_CODE, ...extra });
        expect(buttons(fixture)).toHaveLength(1);
        expect(fixture.nativeElement.textContent).not.toContain(
          'Use for main agent',
        );
      }
    });

    it('no longer renders Manage, Change main provider, Edit connection or Installation instructions', () => {
      for (const status of [
        'active',
        'connected',
        'unreachable',
        'not-installed',
        'not-checked',
      ] as const) {
        const fixture = createComponent({
          ...KIMI_CODE,
          status,
          positiveProbeEvidence: true,
        });
        for (const id of [
          'btn-manage',
          'btn-change-main',
          'btn-edit-connection',
          'btn-install-instructions',
        ]) {
          expect(query(fixture, id)).toBeNull();
        }
      }
    });
  });

  describe('never Connected without confirmed evidence', () => {
    it.each([
      ['unknown', null, 'Not checked'],
      ['skipped', null, 'Check unavailable'],
      ['missing', null, 'Not configured'],
      ['connected', false, 'Not checked'],
      ['active', false, 'Not checked'],
      ['reachable', null, 'Not checked'],
      ['reachable', true, 'Connected'],
    ] as const)(
      '%s (evidence %s) reads %s',
      (status, positiveProbeEvidence, label) => {
        const fixture = createComponent({
          ...KIMI_CODE,
          status,
          positiveProbeEvidence,
        });
        expect(query(fixture, 'status-copy')?.textContent?.trim()).toBe(label);
      },
    );
  });

  describe('main agent', () => {
    it('the active card has the primary spine (prototype; Gate V 28) and "Active for main agent"', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'connected',
        positiveProbeEvidence: true,
        isActive: true,
      });
      expect(query(fixture, 'status-copy')?.textContent?.trim()).toBe(
        'Active for main agent',
      );
      expect(query(fixture, 'surface-card-spine')).not.toBeNull();
      expect(
        fixture.nativeElement
          .querySelector('[data-tone]')
          ?.getAttribute('data-tone'),
      ).toBe('primary');
    });

    it('a blocked main route says it needs attention, with a warning tone, never the healthy label', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'unreachable',
        isActive: true,
      });
      expect(query(fixture, 'blocked-main-badge')?.textContent).toContain(
        'Main agent · Needs attention',
      );
      expect(query(fixture, 'status-copy')?.textContent?.trim()).toBe(
        'Unreachable',
      );
      expect(
        fixture.nativeElement
          .querySelector('[data-tone]')
          ?.getAttribute('data-tone'),
      ).toBe('warning');
      expect(surface(fixture).getAttribute('aria-label')).toContain(
        'main agent needs attention',
      );
    });

    it('isBlocked alone marks the card', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'connected',
        positiveProbeEvidence: true,
        isBlocked: true,
      });
      expect(query(fixture, 'blocked-main-badge')).not.toBeNull();
    });
  });

  describe('scope badge (D16)', () => {
    it('shows an overridden scope as a badge and forwards its popover actions', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        scope: 'workspace' as SettingScopeDisplay,
        hasOverride: true,
        supportedTargets: ['global', 'workspace'],
      });
      const clear = jest.fn();
      fixture.componentInstance.scopeClearRequested.subscribe(clear);
      const badge = query(fixture, 'scope-badge') as HTMLButtonElement;
      expect(badge.getAttribute('data-field')).toBe('Kimi Code');
      expect(surface(fixture).contains(badge)).toBe(false);
      const details = jest.fn();
      fixture.componentInstance.detailsRequested.subscribe(details);
      badge.click();
      expect(details).not.toHaveBeenCalled();
      fixture.detectChanges();
      (query(fixture, 'scope-clear-override') as HTMLButtonElement).click();
      expect(clear).toHaveBeenCalledTimes(1);
      expect(details).not.toHaveBeenCalled();
    });

    it('an inherited scope renders nothing', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        scope: 'global' as SettingScopeDisplay,
        supportedTargets: ['global', 'workspace'],
      });
      expect(query(fixture, 'scope-badge')).toBeNull();
    });
  });

  describe('unreadable stored key (final review M-6)', () => {
    it('shows "Could not read the stored key." with Retry, never "Not set" or "Add API key", even when the route says needs-key', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'needs-key',
        keyUnreadable: true,
      });
      const text = query(fixture, 'card-key-unreadable');
      expect(text?.textContent?.trim()).toBe('Could not read the stored key.');
      expect(text?.className ?? '').not.toMatch(
        /text-(warning|error|success|info)/,
      );
      const retry = query(
        fixture,
        'card-key-unreadable-retry',
      ) as HTMLButtonElement;
      expect(retry.textContent?.trim()).toBe('Retry');
      expect(retry.className).toContain('btn-ghost');
      expect(retry.hasAttribute('data-ptah-button')).toBe(true);
      expect(retry.getAttribute('aria-label')).toBe(
        'Retry reading the stored key for Kimi Code',
      );
      expect(query(fixture, 'btn-add-key')).toBeNull();
      expect(query(fixture, 'status-copy')).toBeNull();
      const all = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(all).not.toContain('Not set');
      expect(all).not.toContain('Add API key');
      expect(all).not.toContain('Needs API key');
      expect(surface(fixture).getAttribute('aria-label')).toContain(
        'Could not read the stored key.',
      );
      expect(surface(fixture).getAttribute('aria-label')).not.toContain(
        'Add an API key',
      );
      // Colour sits on the icon only.
      expect(
        fixture.nativeElement.querySelector('lucide-angular.text-warning'),
      ).not.toBeNull();
    });

    it('Retry emits keyRetryRequested only, never detailsRequested or addKeyRequested', () => {
      const fixture = createComponent({
        ...KIMI_CODE,
        status: 'needs-key',
        keyUnreadable: true,
      });
      const retry = jest.fn(),
        details = jest.fn(),
        addKey = jest.fn();
      fixture.componentInstance.keyRetryRequested.subscribe(retry);
      fixture.componentInstance.detailsRequested.subscribe(details);
      fixture.componentInstance.addKeyRequested.subscribe(addKey);
      (
        query(fixture, 'card-key-unreadable-retry') as HTMLButtonElement
      ).click();
      expect(retry).toHaveBeenCalledTimes(1);
      expect(details).not.toHaveBeenCalled();
      expect(addKey).not.toHaveBeenCalled();
    });

    it('a readable connection renders no unreadable state', () => {
      const fixture = createComponent({ ...KIMI_CODE, status: 'needs-key' });
      expect(query(fixture, 'card-key-unreadable')).toBeNull();
      expect(query(fixture, 'btn-add-key')).not.toBeNull();
    });
  });

  describe('connected-accounts badge (D41)', () => {
    const CLAUDE = {
      providerId: 'claude-cli',
      providerName: 'Claude (Subscription)',
      authModality: 'cli',
    };

    it.each([null, 0])('is hidden for %p', (connectedAccounts) => {
      const fixture = createComponent({
        ...CLAUDE,
        status: 'connected',
        positiveProbeEvidence: true,
        connectedAccounts,
      });
      expect(query(fixture, 'connected-accounts-badge')).toBeNull();
    });

    it('shows "N connected" only, as display text (no control, no account detail)', () => {
      const fixture = createComponent({
        ...CLAUDE,
        status: 'connected',
        positiveProbeEvidence: true,
        connectedAccounts: 2,
      });
      const badge = query(fixture, 'connected-accounts-badge');
      expect(badge?.textContent?.trim()).toBe('2 connected');
      expect(badge?.tagName).toBe('SPAN');
      expect(badge?.querySelector('a, button')).toBeNull();
      expect(badge?.hasAttribute('data-ptah-badge')).toBe(true);
      expect(badge?.getAttribute('data-tone')).toBe('neutral');
    });

    it('follows the input and hides again when it returns to null', () => {
      const fixture = createComponent({ ...CLAUDE, connectedAccounts: 3 });
      expect(
        query(fixture, 'connected-accounts-badge')?.textContent?.trim(),
      ).toBe('3 connected');
      fixture.componentRef.setInput('connectedAccounts', null);
      fixture.detectChanges();
      expect(query(fixture, 'connected-accounts-badge')).toBeNull();
    });

    it('with a badge shown, activating the card still opens the drawer once', () => {
      const fixture = createComponent({ ...CLAUDE, connectedAccounts: 1 });
      const details = jest.fn();
      fixture.componentInstance.detailsRequested.subscribe(details);
      surface(fixture).click();
      expect(details).toHaveBeenCalledTimes(1);
    });
  });
});
