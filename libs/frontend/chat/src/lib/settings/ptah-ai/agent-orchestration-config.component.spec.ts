import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ProvidersSettingsStateService,
  type ProvidersOrchestration,
  type ProvidersSettingsCommit,
  type ProvidersSettingsPatch,
  type ProvidersSettingsSection,
} from '@ptah-extension/core';
import type {
  CliDetectionResult,
  PtahCliSummary,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { AgentOrchestrationConfigComponent } from './agent-orchestration-config.component';

const ready = <T>(data: T): ProvidersSettingsSection<T> => ({
  status: 'ready',
  data,
  error: null,
});
const unloaded = <T>(): ProvidersSettingsSection<T> => ({
  status: 'unloaded',
  data: null,
  error: null,
});
const idle: ProvidersSettingsCommit = {
  status: 'idle',
  saved: [],
  unsaved: [],
  unconfirmed: [],
  refreshFailed: false,
  message: null,
};
const CONTEXT = { scopeKey: 'workspace', activePath: '/ws' };
const detected = (
  cli: CliDetectionResult['cli'],
  installed: boolean,
  extra: Partial<CliDetectionResult> = {},
): CliDetectionResult => ({ cli, installed, messagingMode: 'none', ...extra });

/** The prototype data set (BRIEF): 4 ranked agents, OpenCode unranked, Copilot off, Cursor and Pi not installed. */
const ORCHESTRATION = {
  detectedClis: [
    detected('codex', true, { version: '1.4.0' }),
    detected('copilot', true),
    detected('cursor', false),
    detected('antigravity', true),
    detected('opencode', true),
    detected('pi', false),
    detected('ptah-cli', true, { ptahCliId: 'glm-1', ptahCliName: 'Glm' }),
  ],
  disabledClis: ['copilot'],
  preferredAgentOrder: ['codex', 'antigravity', 'glm-1', 'copilot'],
  maxConcurrentAgents: 3,
  copilotAutoApprove: false,
  codexModel: '',
  copilotModel: '',
  cursorModel: '',
  antigravityModel: '',
  opencodeModel: '',
  piModel: '',
  codexReasoningEffort: '',
  copilotReasoningEffort: '',
  piReasoningEffort: '',
  cursorApiKeyConfigured: false,
  cursorApiKeyStored: false,
  cursorApiKeyEnvSet: false,
} as ProvidersOrchestration;
const GLM: PtahCliSummary = {
  id: 'glm-1',
  name: 'Glm',
  providerName: 'Ollama Cloud',
  providerId: 'ollama-cloud',
  hasApiKey: true,
  hasStoredKey: true,
  status: 'available',
  enabled: true,
  modelCount: 12,
};

/** The shared state: `saveSettings` applies the patch and records a `saved` commit, like a confirmed read-back. */
class StateStub {
  readonly commit = signal<ProvidersSettingsCommit>(idle);
  readonly orchestration = signal<
    ProvidersSettingsSection<ProvidersOrchestration>
  >(ready(ORCHESTRATION));
  readonly cliAgents = signal<ProvidersSettingsSection<PtahCliSummary[]>>(
    ready([GLM]),
  );
  readonly cliDetection =
    signal<ProvidersSettingsSection<CliDetectionResult[]>>(unloaded());
  readonly scopes = signal<
    ProvidersSettingsSection<{ activePath: string; entries: unknown[] }>
  >(ready({ activePath: '/ws', entries: [] }));
  readonly reviewContext = jest.fn(() =>
    this.scopes().status === 'ready' ? CONTEXT : null,
  );
  /** `false` makes the next writes fail without changing the saved values. */
  persist = true;
  readonly saveSettings = jest.fn(
    async (patch: ProvidersSettingsPatch, _context: unknown) => {
      if (!this.persist) {
        this.commit.set({
          ...idle,
          status: 'failed',
          unsaved: ['Orchestration policy'],
          message: 'Nothing was saved.',
        });
        return true;
      }
      const data = this.orchestration().data;
      if (data)
        this.orchestration.set(
          ready({ ...data, ...patch.orchestration } as ProvidersOrchestration),
        );
      this.commit.set({
        ...idle,
        status: 'saved',
        saved: ['Orchestration policy'],
      });
      return true;
    },
  );
  readonly redetectClis = jest.fn(async (): Promise<boolean> => {
    this.cliDetection.set(ready([]));
    return true;
  });
}

describe('AgentOrchestrationConfigComponent (policy bar, Batch 33)', () => {
  let fixture: ComponentFixture<AgentOrchestrationConfigComponent>;
  let state: StateStub;
  let feedback: SettingsSaveFeedbackService;
  const element = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    element().querySelector(selector) as T | null;
  const chips = () =>
    Array.from(
      element().querySelectorAll('[data-testid^="policy-order-chip-"]'),
    ).map((chip) =>
      chip.getAttribute('data-testid')?.replace('policy-order-chip-', ''),
    );
  beforeEach(() => {
    state = new StateStub();
    // No ClaudeRpcService is provided: the bar has no private RPC path left.
    TestBed.configureTestingModule({
      imports: [AgentOrchestrationConfigComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: state },
        SettingsSaveFeedbackService,
      ],
    });
    feedback = TestBed.inject(SettingsSaveFeedbackService);
    fixture = TestBed.createComponent(AgentOrchestrationConfigComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    feedback.dismiss();
    TestBed.resetTestingModule();
  });

  describe('structure (design-spec §1.2 item 2, deviation 5, RUX-9)', () => {
    it('is one read-only order line: no Max concurrent, no Re-detect, no order editor (moved, R-3)', () => {
      const bar = q('[data-testid="settings-section-orchestration-policy"]');
      expect(bar).not.toBeNull();
      expect(q('[data-testid="orchestration-policy-bar"]')).not.toBeNull();
      expect(bar?.querySelector('[data-testid="policy-order"]')).not.toBeNull();
      expect(q('#agent-max-concurrent')).toBeNull();
      expect(q('[data-testid="policy-max-concurrent-input"]')).toBeNull();
      expect(q('[data-testid="policy-redetect"]')).toBeNull();
      expect(q('[data-testid="policy-order-edit"]')).toBeNull();
      expect(q('[data-testid="policy-order-popover"]')).toBeNull();
      expect(element().querySelectorAll('button, input')).toHaveLength(0);
    });

    it('owns no scroll area (decision 32, 44: one scroll owner)', () => {
      expect(
        element().querySelector(
          '.overflow-y-auto, .overflow-auto, .overflow-scroll',
        ),
      ).toBeNull();
    });

    it('keeps none of the old body: no Copilot toggle, no CLI cards, no "Manage … in Providers" repeats (RUX-9)', () => {
      const text = element().textContent ?? '';
      expect(q('[data-testid="copilot-auto-approve"]')).toBeNull();
      expect(text).not.toMatch(/Manage .* in Providers/);
      expect(text).not.toMatch(/codex automatic approval/i);
      expect(text).not.toContain('System CLIs');
      expect(text).not.toContain('Headless agents');
      expect(element().querySelectorAll('input[type="checkbox"]')).toHaveLength(
        0,
      );
    });

    it('shows the order as compact read-only chips with no move buttons (Reorder mode of the table moves lanes)', () => {
      const bar = q('[data-testid="settings-section-orchestration-policy"]');
      expect(
        bar?.querySelectorAll(
          '[data-testid^="policy-order-up-"], [data-testid^="policy-order-down-"]',
        ),
      ).toHaveLength(0);
      expect(
        Array.from(q('[data-testid="policy-order"]')?.children ?? []).map(
          (node) => node.textContent?.trim(),
        ),
      ).toEqual([
        '1. Codex',
        '→',
        '2. Antigravity',
        '→',
        '3. Glm',
        '→',
        '4. Copilot',
        '→',
        '5. OpenCode',
      ]);
      expect(element().innerHTML).not.toMatch(/grip/i);
      expect(element().querySelector('[draggable="true"]')).toBeNull();
      expect(element().querySelector('.cursor-grab')).toBeNull();
    });

    it('names the whole order for screen readers (the chips may clip in a narrow box)', () => {
      expect(
        q('[data-testid="policy-order-summary"]')?.textContent?.trim(),
      ).toBe(
        'Preferred order: 1. Codex, 2. Antigravity, 3. Glm, 4. Copilot (off), 5. OpenCode',
      );
      expect(q('[data-testid="policy-order-summary"]')?.className).toContain(
        'sr-only',
      );
    });
  });

  describe('empty and loading text', () => {
    it('says so when no agent is installed', () => {
      state.orchestration.set(
        ready({ ...ORCHESTRATION, detectedClis: [detected('pi', false)] }),
      );
      state.cliAgents.set(ready([]));
      fixture.detectChanges();
      expect(q('[data-testid="policy-order-empty"]')?.textContent?.trim()).toBe(
        'No CLI agent installed yet.',
      );
    });

    it('says Loading… before the policy is read', () => {
      state.orchestration.set({ status: 'loading', data: null, error: null });
      state.cliAgents.set({ status: 'loading', data: null, error: null });
      fixture.detectChanges();
      expect(q('[data-testid="policy-order-empty"]')?.textContent?.trim()).toBe(
        'Loading…',
      );
    });
  });

  describe('order strip: only whole chips, then "+N" (Batch 53.4, B38-4)', () => {
    let resize: (() => void) | null = null;
    /** Every observer the component made: the element it observes and whether it was disconnected. */
    const observers: { target: Element | null; disconnected: boolean }[] = [];
    const original = (globalThis as { ResizeObserver?: unknown })
      .ResizeObserver;
    beforeAll(() => {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        private readonly record = {
          target: null as Element | null,
          disconnected: false,
        };
        constructor(callback: () => void) {
          resize = callback;
          observers.push(this.record);
        }
        observe(target: Element): void {
          this.record.target = target; /* the test calls the callback */
        }
        disconnect(): void {
          this.record.disconnected = true;
        }
      };
    });
    afterAll(() => {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
    });

    /** Lays the strip out: its width, each chip 60 px, the arrow 10 px, "+N" 25 px (gap-1 = 4 px). */
    function layOut(stripWidth: number): void {
      const strip = q('[data-testid="policy-order"]');
      if (!strip) throw new Error('no strip');
      Object.defineProperty(strip, 'clientWidth', {
        configurable: true,
        value: stripWidth,
      });
      const measure = strip.nextElementSibling as HTMLElement;
      for (const node of Array.from(
        measure.querySelectorAll<HTMLElement>('[data-measure]'),
      )) {
        const kind = node.getAttribute('data-measure');
        Object.defineProperty(node, 'offsetWidth', {
          configurable: true,
          value: kind === 'chip' ? 60 : kind === 'arrow' ? 10 : 25,
        });
      }
      resize?.();
      fixture.detectChanges();
    }

    it('a narrow strip shows the whole chips that fit and "+N" for the rest; the summary names the whole order', () => {
      fixture.detectChanges();
      // 5 chips need 60·5 + 4·18 = 372 px. In 200 px: two chips (60 + 78) plus "→ +3" (43) = 181 px.
      layOut(200);
      expect(chips()).toEqual(['codex', 'antigravity']);
      expect(q('[data-testid="policy-order-more"]')?.textContent?.trim()).toBe(
        '+3',
      );
      expect(
        q('[data-testid="policy-order-more"]')?.getAttribute('title'),
      ).toContain('5. OpenCode');
      expect(q('[data-testid="policy-order-summary"]')?.textContent).toContain(
        '5. OpenCode',
      );
    });

    it('M-7 (Batch 55b): an order that empties and refills makes a new strip; the observer follows it and lets the old one go', () => {
      TestBed.tick();
      const first = q('[data-testid="policy-order"]');
      expect(
        observers.filter((o) => !o.disconnected).map((o) => o.target),
      ).toEqual([first]);
      state.orchestration.set(
        ready({ ...ORCHESTRATION, detectedClis: [detected('pi', false)] }),
      );
      state.cliAgents.set(ready([]));
      TestBed.tick();
      expect(q('[data-testid="policy-order"]')).toBeNull();
      expect(observers.every((o) => o.disconnected)).toBe(true);
      state.orchestration.set(ready(ORCHESTRATION));
      state.cliAgents.set(ready([GLM]));
      TestBed.tick();
      const second = q('[data-testid="policy-order"]');
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
      expect(
        observers.filter((o) => !o.disconnected).map((o) => o.target),
      ).toEqual([second]);
      layOut(200);
      expect(chips()).toEqual(['codex', 'antigravity']);
      fixture.destroy();
      expect(observers.every((o) => o.disconnected)).toBe(true);
    });

    it('a wide strip shows every chip and no "+N"', () => {
      fixture.detectChanges();
      layOut(400);
      expect(chips()).toEqual([
        'codex',
        'antigravity',
        'glm-1',
        'copilot',
        'opencode',
      ]);
      expect(q('[data-testid="policy-order-more"]')).toBeNull();
    });
  });
});
