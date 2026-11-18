import type { IChildChatSessionHost } from './child-chat-session-host.port';
import type {
  ChildSettingRoute,
  IChildSettingRouter,
} from './child-setting-router.port';
import { resolveChildSettings } from './child-setting-resolution';
import {
  describeChildSetting,
  type SessionChildStartRequest,
} from './session-spawner.port';

const reason = { rule: 'code-work-kind', input: 'workKind: code' };
function harness() {
  const host = {
    listChildModels: jest.fn().mockResolvedValue(['sonnet-new', 'sonnet-old']),
    resolveChildModel: jest
      .fn()
      .mockImplementation(
        async ({
          model,
        }: {
          model: string;
        }): Promise<
          Awaited<ReturnType<IChildChatSessionHost['resolveChildModel']>>
        > => ({ accepted: true, resolvedModel: model }),
      ),
    startChildSession: jest.fn(),
    startHandoffSession: jest.fn(),
  } satisfies IChildChatSessionHost;
  const choice: ChildSettingRoute = {
    model: 'sonnet-new',
    effort: 'high',
    modelSource: 'ranking',
    effortSource: 'ranking',
    reason,
    candidates: ['sonnet-new', 'sonnet-old'],
  };
  const router = {
    route: jest.fn().mockResolvedValue(choice),
  } satisfies IChildSettingRouter;
  const request: SessionChildStartRequest = {
    callerSessionId: 'parent',
    branch: 'branch',
    task: 'Fix parser',
    workKind: 'code',
  };
  const resolve = (
    overrides: Partial<SessionChildStartRequest> = {},
    routing: IChildSettingRouter | null = router,
  ) =>
    resolveChildSettings(
      host,
      routing,
      { ...request, ...overrides },
      '/workspace',
      'parent',
      request.task,
      request.branch,
    );
  return { host, router, request, resolve };
}

describe('resolveChildSettings', () => {
  it('passes the explicit work kind and phase kind and retains the routing reason', async () => {
    const h = harness();
    // Only phase.kind is consulted here; the spawner validates the complete phase contract.
    const phase = { kind: 'implement' } as SessionChildStartRequest['phase'];
    await expect(h.resolve({ phase })).resolves.toMatchObject({
      ok: true,
      model: 'sonnet-new',
      effort: 'high',
      settingReason: reason,
    });
    expect(h.router.route).toHaveBeenCalledWith(
      expect.objectContaining({
        workKind: 'code',
        phaseKind: 'implement',
        brief: 'branch\nFix parser',
      }),
    );
  });

  it('admits the next ranked candidate when the first is refused', async () => {
    const h = harness();
    h.host.resolveChildModel.mockResolvedValueOnce({
      accepted: false,
      code: 'invalid-model',
      message: 'refused',
    });
    await expect(h.resolve()).resolves.toMatchObject({
      ok: true,
      model: 'sonnet-old',
      modelSource: 'ranking',
      effort: 'high',
      settingReason: reason,
    });
    expect(
      h.host.resolveChildModel.mock.calls.map(([input]) => input.model),
    ).toEqual(['sonnet-new', 'sonnet-old']);
  });

  it('keeps an explicit model pin while routing the missing effort', async () => {
    const h = harness();
    h.host.resolveChildModel.mockResolvedValueOnce({
      accepted: true,
      resolvedModel: 'haiku-resolved',
    });
    await expect(h.resolve({ model: 'haiku' })).resolves.toMatchObject({
      ok: true,
      model: 'haiku-resolved',
      modelSource: 'pin',
      effort: 'high',
      effortSource: 'ranking',
    });
    expect(h.router.route).toHaveBeenCalledWith(
      expect.objectContaining({ models: [], model: 'haiku-resolved' }),
    );
    expect(h.host.listChildModels).not.toHaveBeenCalled();
    expect(h.host.resolveChildModel).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit low effort while routing the model', async () => {
    const h = harness();
    await expect(h.resolve({ effort: 'low' })).resolves.toMatchObject({
      ok: true,
      model: 'sonnet-new',
      effort: 'low',
      effortSource: 'pin',
    });
  });

  it('does not route when both settings are pinned', async () => {
    const h = harness();
    await expect(
      h.resolve({ model: 'haiku', effort: 'low' }),
    ).resolves.toMatchObject({
      ok: true,
      model: 'haiku',
      effort: 'low',
      modelSource: 'pin',
      effortSource: 'pin',
      settingReason: { rule: 'pin' },
    });
    expect(h.router.route).not.toHaveBeenCalled();
  });

  it('refuses invalid explicit pins before consulting the router', async () => {
    const h = harness();
    h.host.resolveChildModel.mockResolvedValueOnce({
      accepted: false,
      code: 'invalid-model',
      message: 'refused',
      acceptedModels: ['sonnet'],
    });
    await expect(h.resolve({ model: 'unknown' })).resolves.toEqual({
      ok: false,
      code: 'invalid-model',
      detail: 'refused Accepted models: sonnet',
    });
    expect(h.router.route).not.toHaveBeenCalled();
  });

  it('returns a catalog refusal when explicit validation throws', async () => {
    const h = harness();
    h.host.resolveChildModel.mockRejectedValueOnce(new Error('offline'));
    await expect(h.resolve({ model: 'sonnet' })).resolves.toEqual({
      ok: false,
      code: 'model-catalog-unavailable',
      detail: 'offline',
    });
  });

  it('keeps the host default model but applies the effort floor when routing is unavailable', async () => {
    const h = harness();
    const floor = {
      ok: true,
      effort: 'high',
      modelSource: 'default',
      effortSource: 'ranking',
      settingReason: { rule: 'router-unavailable', input: 'effort floor high' },
    };
    h.router.route.mockRejectedValueOnce(new Error('offline'));
    await expect(h.resolve()).resolves.toEqual({ ...floor, model: undefined });
    await expect(h.resolve({}, null)).resolves.toEqual({ ...floor, model: undefined });
  });

  it('keeps an explicit effort when routing is unavailable', async () => {
    const h = harness();
    await expect(h.resolve({ effort: 'low' }, null)).resolves.toMatchObject({
      ok: true,
      effort: 'low',
      effortSource: 'pin',
      settingReason: { rule: 'router-unavailable' },
    });
  });

  it('keeps the effort and records refused routing when no candidate is admitted', async () => {
    const h = harness();
    h.host.resolveChildModel.mockResolvedValue({
      accepted: false,
      code: 'invalid-model',
      message: 'refused',
    });
    await expect(h.resolve()).resolves.toMatchObject({
      ok: true,
      modelSource: 'default',
      effort: 'high',
      settingReason: { rule: 'routed-model-refused', input: reason.input },
    });
  });
});

describe('describeChildSetting', () => {
  it('renders model, effort, sources and the rule input', () => {
    expect(
      describeChildSetting({
        model: 'sonnet',
        effort: 'high',
        modelSource: 'ranking',
        effortSource: 'ranking',
        settingReason: reason,
      }),
    ).toBe(
      'model sonnet (ranking); effort high (ranking); code-work-kind: workKind: code',
    );
  });
  it('renders older records with an explicit unavailable reason', () => {
    expect(describeChildSetting({ model: 'opus' })).toBe(
      'model opus (pin); effort default (default); reason unavailable',
    );
  });
});
