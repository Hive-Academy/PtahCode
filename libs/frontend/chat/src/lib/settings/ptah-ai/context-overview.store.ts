import {
  computed,
  effect,
  inject,
  Injectable,
  PendingTasks,
  signal,
} from '@angular/core';
import {
  ClaudeRpcService,
  ProvidersSettingsStateService,
} from '@ptah-extension/core';
import {
  SESSION_BUDGET_SETTINGS,
  type SessionBudgetNumberSetting,
} from '@ptah-extension/shared';
import type { PtahInstrumentBandSegment } from '@ptah-extension/ui';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { laneGuardFromConfig } from './lane-guards-settings.logic';

type Segment = PtahInstrumentBandSegment;
const TIMEOUT_MS = 10_000;
const BUDGET_KEYS = [
  'enabled',
  'unit',
  'tokens',
  'usd',
  'tightenPercent',
  'handoffPercent',
] as const;

function unavailable(id: string, label: string): Segment {
  return { id, label, value: 'Unavailable', tone: 'warn' };
}

function effectiveNumber(
  setting: SessionBudgetNumberSetting,
  value: unknown,
): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= setting.min &&
    value <= setting.max &&
    (!setting.integer || Number.isInteger(value))
    ? value
    : (setting.default ?? 0);
}

/** Page-scoped reads run even while the corresponding forms are deferred. */
@Injectable()
export class ContextOverviewStore {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly tasks = inject(PendingTasks);
  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService, {
    optional: true,
  });
  private readonly pending = signal(true);
  private readonly values = signal<readonly Segment[]>([
    {
      id: 'session-budget',
      label: 'Session budget',
      value: 'Not set',
      tone: 'idle',
    },
    { id: 'lane-guards', label: 'Lane guards', value: 'Not set', tone: 'idle' },
    { id: 'routing', label: 'Routing', value: 'Not set', tone: 'idle' },
    {
      id: 'close-rotation',
      label: 'Close rotation',
      value: 'Not set',
      tone: 'idle',
    },
    { id: 'limits', label: 'Limits', value: 'Not set', tone: 'idle' },
  ]);
  readonly loading = computed(
    () => this.pending() || this.state.orchestration().status === 'loading',
  );
  readonly segments = computed<readonly Segment[]>(() => {
    const cache = this.state.orchestration();
    let prompt: Segment = {
      id: 'prompt-cache',
      label: 'Prompt cache',
      value: 'Not set',
      tone: 'idle',
    };
    if (cache.status === 'error') prompt = unavailable(prompt.id, prompt.label);
    else if (cache.status === 'ready' && cache.data) {
      const override = cache.data.subagentPromptCacheTtlEnvOverride;
      const ttl =
        override === '5m' || override === '1h'
          ? override
          : cache.data.subagentPromptCacheTtl;
      prompt = {
        ...prompt,
        value:
          ttl === '1h'
            ? '1 hour'
            : ttl === '5m'
              ? '5 minutes'
              : ttl === 'auto'
                ? 'Auto'
                : 'Not set',
        meta:
          override === 'invalid'
            ? 'Invalid environment override'
            : override
              ? 'Set by environment'
              : undefined,
        tone: override === 'invalid' ? 'warn' : 'idle',
      };
    }
    return [prompt, ...this.values()];
  });

  constructor() {
    let wasSaving = false;
    effect(() => {
      const saving = this.feedback?.saving() ?? false;
      if (wasSaving && !saving) void this.reload();
      wasSaving = saving;
    });
  }

  async reload(): Promise<void> {
    const done = this.tasks.add();
    this.pending.set(true);
    try {
      const [budget, guards, routing, rotation] = await Promise.all([
        this.readBudget(),
        this.readGuards(),
        this.readToggle('routing', 'Routing', 'agentOrchestration.hostRouting'),
        this.readToggle(
          'close-rotation',
          'Close rotation',
          'agentOrchestration.laneRotation',
        ),
      ]);
      this.values.set([budget[0], guards, routing, rotation, budget[1]]);
      this.pending.set(false);
    } finally {
      done();
    }
  }

  private async setting(key: string): Promise<unknown> {
    const response = await this.rpc.call(
      'settings:get',
      { key },
      { timeout: TIMEOUT_MS },
    );
    if (!response.isSuccess() || response.data.success !== true)
      throw new Error('Unavailable');
    return response.data.value;
  }

  private async readToggle(
    id: string,
    label: string,
    key: string,
  ): Promise<Segment> {
    try {
      const value = await this.setting(key);
      if (value != null && typeof value !== 'boolean')
        return unavailable(id, label);
      const on = value ?? true;
      return { id, label, value: on ? 'On' : 'Off', tone: on ? 'ok' : 'idle' };
    } catch {
      // degradation-audit: reported - this segment displays Unavailable with a warning tone.
      return unavailable(id, label);
    }
  }

  private async readGuards(): Promise<Segment> {
    try {
      const response = await this.rpc.call('agent:getConfig', undefined, {
        timeout: TIMEOUT_MS,
      });
      if (!response.isSuccess())
        return unavailable('lane-guards', 'Lane guards');
      const stopAt = laneGuardFromConfig(
        'laneRepeatCallStopAt',
        response.data.laneRepeatCallStopAt,
      );
      return {
        id: 'lane-guards',
        label: 'Lane guards',
        value: `Stop at ${stopAt}`,
        meta: 'Repeated calls',
        tone: 'ok',
      };
    } catch {
      // degradation-audit: reported - this segment displays Unavailable with a warning tone.
      return unavailable('lane-guards', 'Lane guards');
    }
  }

  private async readBudget(): Promise<readonly [Segment, Segment]> {
    try {
      const replies = await Promise.all(
        BUDGET_KEYS.map((key) =>
          this.setting(SESSION_BUDGET_SETTINGS[key].key),
        ),
      );
      const saved = Object.fromEntries(
        BUDGET_KEYS.map((key, index) => [key, replies[index]]),
      );
      const enabled =
        typeof saved['enabled'] === 'boolean'
          ? saved['enabled']
          : SESSION_BUDGET_SETTINGS.enabled.default;
      const cost = saved['unit'] === 'cost';
      const limit = effectiveNumber(
        cost ? SESSION_BUDGET_SETTINGS.usd : SESSION_BUDGET_SETTINGS.tokens,
        saved[cost ? 'usd' : 'tokens'],
      );
      const tighten = effectiveNumber(
        SESSION_BUDGET_SETTINGS.tightenPercent,
        saved['tightenPercent'],
      );
      const handoff = effectiveNumber(
        SESSION_BUDGET_SETTINGS.handoffPercent,
        saved['handoffPercent'],
      );
      return [
        {
          id: 'session-budget',
          label: 'Session budget',
          value: enabled ? 'On' : 'Off',
          meta: `${limit.toLocaleString('en-US')} ${cost ? 'USD' : 'tokens'}`,
          tone: enabled ? 'ok' : 'idle',
        },
        {
          id: 'limits',
          label: 'Limits',
          value: `${tighten < handoff ? handoff : SESSION_BUDGET_SETTINGS.handoffPercent.default}%`,
          meta: 'Budget handoff',
          tone: 'idle',
        },
      ];
    } catch {
      // degradation-audit: reported - both budget summaries display Unavailable with a warning tone.
      return [
        unavailable('session-budget', 'Session budget'),
        unavailable('limits', 'Limits'),
      ];
    }
  }
}
