import { SkillRankingCallerService } from './skill-ranking-caller.service';
import type { DecisionCaller } from './decision-caller';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import type { SkillRankingCallerItem } from './skill-ranking-caller.types';

const configured = {
  provider: 'configured-provider',
  model: 'configured-model',
};
const attempted = { provider: 'effective-provider', model: 'effective-model' };
const item: SkillRankingCallerItem = {
  key: 'angular',
  kind: 'framework',
  name: 'Angular',
  evidence: 'Angular components use standalone imports',
  registry: 'matched',
  candidates: [
    { label: 'a', name: 'Angular basics', description: 'x'.repeat(250) },
    {
      label: 'b',
      name: 'Angular advanced',
      description: 'Standalone patterns',
    },
    {
      label: 'old',
      name: 'Angular legacy',
      description: 'Deprecated: use Angular advanced instead',
    },
  ],
};
const install = {
  itemId: 'i1',
  verdict: 'install',
  candidateId: ' B ',
  reason: ' The advanced skill covers standalone imports. ',
};
const failed = { status: 'failed', items: {}, itemRejections: {} };

function setup(configuredTimeoutMs: number | null = null) {
  const complete = jest.fn().mockResolvedValue({ items: [install] });
  const openCaller = jest.fn().mockResolvedValue({
    kind: 'structured',
    providerId: configured.provider,
    model: configured.model,
  });
  const dispatchFor = jest.fn().mockImplementation((_opened, budget) => ({
    kind: 'structured',
    completer: { complete },
    providerId: attempted.provider,
    model: attempted.model,
    signal: budget.signal,
    timeoutMs: budget.maxTimeoutMs,
  }));
  const noteLive = jest.fn().mockResolvedValue(undefined);
  const getConfiguredTimeoutMs = jest.fn().mockReturnValue(configuredTimeoutMs);
  const service = new SkillRankingCallerService(
    {
      openCaller,
      dispatchFor,
      noteLive,
      getConfiguredTimeoutMs,
    } as unknown as DecisionCaller,
    { debug: jest.fn(), warn: jest.fn() } as unknown as LaneRoutingLogger,
  );
  return {
    service,
    openCaller,
    dispatchFor,
    complete,
    noteLive,
    getConfiguredTimeoutMs,
  };
}

describe('SkillRankingCallerService.rankSkillCandidates', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('skips empty input and items without eligible candidates', async () => {
    const { service, openCaller } = setup();
    const expected = {
      status: 'skipped',
      category: 'no-work',
      items: {},
      itemRejections: {},
    };
    expect(await service.rankSkillCandidates([])).toEqual(expected);
    expect(
      await service.rankSkillCandidates([
        { ...item, registry: 'search-failed' },
      ]),
    ).toEqual(expected);
    expect(openCaller).not.toHaveBeenCalled();
  });

  it('skips an unset model without pair attribution', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({ kind: 'unset' });
    expect(await service.rankSkillCandidates([item])).toEqual({
      status: 'skipped',
      category: 'not-configured',
      items: {},
      itemRejections: {},
    });
    expect(dispatchFor).not.toHaveBeenCalled();
  });

  it.each(['unreachable', 'auth', 'provider-error'])(
    'retains only the configured pair for a blocked model (%s)',
    async (cause) => {
      const { service, openCaller, dispatchFor } = setup();
      openCaller.mockResolvedValue({
        kind: 'blocked',
        cause,
        configuredPair: configured,
      });
      expect(await service.rankSkillCandidates([item])).toEqual({
        ...failed,
        category: cause,
        pairConfigured: configured,
      });
      expect(dispatchFor).not.toHaveBeenCalled();
    },
  );

  it('attributes success to the submitted pair and keeps valid per-candidate rejections', async () => {
    const { service, complete, noteLive } = setup();
    complete.mockResolvedValue({
      items: [
        {
          ...install,
          rejections: [
            { candidateId: 'A', reason: 'Only covers modules.' },
            { candidateId: 'b', reason: 'Already selected' },
            { candidateId: 'old', reason: 'Deprecated' },
            { candidateId: 'unknown', reason: 'Unknown ID' },
            { candidateId: 'a', reason: '  ' },
            42,
          ],
        },
      ],
    });
    expect(await service.rankSkillCandidates([item])).toEqual({
      status: 'used',
      pairConfigured: configured,
      pairAttempted: attempted,
      pairUsed: attempted,
      items: {
        angular: {
          verdict: 'install',
          stage: 'decision',
          candidateId: 'b',
          reason: 'The advanced skill covers standalone imports.',
          order: ['b', 'a'],
          rejections: { a: 'Only covers modules.' },
        },
      },
      itemRejections: {},
    });
    expect(noteLive).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].jsonSchema.properties.items).toEqual({
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'verdict'],
        properties: {
          itemId: { type: 'string' },
          verdict: { type: 'string', enum: ['install', 'none'] },
          candidateId: { type: 'string' },
          reason: { type: 'string' },
          confidence: { type: 'number' },
          rejections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['candidateId', 'reason'],
              properties: {
                candidateId: { type: 'string' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
    });
  });

  it('pre-dispatch fit/abort returns pre-dispatch-error with pairConfigured only; post-submit timeout retains pairAttempted without pairUsed', async () => {
    const fit = setup();
    const tooLarge = Array.from({ length: 10_000 }, (_, index) => ({
      ...item,
      key: `item-${index}`,
    }));
    const preDispatchError = {
      ...failed,
      category: 'pre-dispatch-error',
      pairConfigured: configured,
    };
    expect(await fit.service.rankSkillCandidates(tooLarge)).toEqual(
      preDispatchError,
    );
    expect(fit.complete).not.toHaveBeenCalled();

    const cancelled = setup();
    cancelled.dispatchFor.mockReturnValue({
      kind: 'structured',
      completer: { complete: cancelled.complete },
      providerId: attempted.provider,
      model: attempted.model,
      signal: AbortSignal.abort(),
    });
    expect(await cancelled.service.rankSkillCandidates([item])).toEqual(
      preDispatchError,
    );
    expect(cancelled.complete).not.toHaveBeenCalled();

    const submitted = setup();
    let finish!: (value: unknown) => void;
    submitted.complete.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = submitted.service.rankSkillCandidates(
      [item],
      Date.now() - 41_000,
    );
    await jest.advanceTimersByTimeAsync(999);
    expect(submitted.complete.mock.calls[0][0].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toEqual({
      ...failed,
      category: 'timed-out',
      pairConfigured: configured,
      pairAttempted: attempted,
    });
    expect(submitted.complete.mock.calls[0][0].signal.aborted).toBe(true);
    finish({ items: [install] });
    await jest.advanceTimersByTimeAsync(0);
    expect(submitted.noteLive).not.toHaveBeenCalled();
  });

  it('does not dispatch and reports timed-out when the RPC budget has already elapsed', async () => {
    const { service, dispatchFor } = setup();
    expect(
      await service.rankSkillCandidates([item], Date.now() - 42_000),
    ).toEqual({
      ...failed,
      category: 'timed-out',
      pairConfigured: configured,
    });
    expect(dispatchFor).not.toHaveBeenCalled();
  });

  it('uses 20s default budget for structured Decision and honors configured decisionModelTimeoutMs', async () => {
    const { service, complete, dispatchFor } = setup();
    complete.mockImplementation(() => new Promise(() => undefined));
    const settled = jest.fn();
    const pending = service.rankSkillCandidates([item]).then(settled);
    await jest.advanceTimersByTimeAsync(19_999);
    expect(settled).not.toHaveBeenCalled();
    expect(dispatchFor).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'structured' }),
      expect.objectContaining({ maxTimeoutMs: 20_000 }),
    );
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toHaveBeenCalledWith({
      ...failed,
      category: 'timed-out',
      pairConfigured: configured,
      pairAttempted: attempted,
    });

    const configuredRun = setup(12_000);
    configuredRun.complete.mockImplementation(
      () => new Promise(() => undefined),
    );
    const configuredSettled = jest.fn();
    const configuredPending = configuredRun.service
      .rankSkillCandidates([item])
      .then(configuredSettled);
    await jest.advanceTimersByTimeAsync(11_999);
    expect(configuredSettled).not.toHaveBeenCalled();
    expect(configuredRun.dispatchFor).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'structured' }),
      expect.objectContaining({ maxTimeoutMs: 12_000 }),
    );
    await jest.advanceTimersByTimeAsync(1);
    await configuredPending;
    expect(configuredSettled).toHaveBeenCalledWith({
      ...failed,
      category: 'timed-out',
      pairConfigured: configured,
      pairAttempted: attempted,
    });
  });

  it('keeps generic failures before and after submission free of provider text', async () => {
    const { service, dispatchFor, complete } = setup();
    dispatchFor.mockImplementationOnce(() => {
      throw new Error('provider secret');
    });
    expect(await service.rankSkillCandidates([item])).toEqual({
      ...failed,
      category: 'pre-dispatch-error',
      pairConfigured: configured,
    });
    complete.mockRejectedValueOnce(new Error('provider secret'));
    expect(await service.rankSkillCandidates([item])).toEqual({
      ...failed,
      category: 'provider-error',
      pairConfigured: configured,
      pairAttempted: attempted,
    });
  });

  it.each([
    {
      field: 'unknown ID',
      answers: [{ ...install, candidateId: 'missing' }],
      reason: /unknown/i,
    },
    {
      field: 'deprecated candidate',
      answers: [{ ...install, candidateId: 'old' }],
      reason: /deprecated/i,
    },
    {
      field: 'duplicate answers',
      answers: [install, { ...install, verdict: 'none' }],
      reason: /conflicting/i,
    },
    {
      field: 'absent reason',
      answers: [{ ...install, reason: undefined }],
      reason: /reason/i,
    },
    {
      field: 'blank reason',
      answers: [{ ...install, reason: ' <b> </b> ' }],
      reason: /reason/i,
    },
    {
      field: 'Build',
      answers: [{ ...install, verdict: 'build' }],
      reason: /unsupported/i,
    },
    {
      field: 'proposalRef',
      answers: [{ ...install, proposalRef: 'ref' }],
      reason: /unsupported/i,
    },
  ])(
    'rejects $field and preserves valid siblings',
    async ({ answers, reason }) => {
      const { service, complete } = setup();
      complete.mockResolvedValue({
        items: [...answers, 42, { ...install, itemId: 'i2' }],
      });
      const result = await service.rankSkillCandidates([
        item,
        { ...item, key: 'next' },
      ]);
      expect(result.status).toBe('used');
      expect(Object.keys(result.items)).toEqual(['next']);
      expect(result.itemRejections['angular']).toMatch(reason);
    },
  );

  it('rejects a case-insensitive ID collision', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({
      items: [{ ...install, candidateId: 'a' }],
    });
    const result = await service.rankSkillCandidates([
      {
        ...item,
        candidates: [
          ...item.candidates,
          { label: ' A ', name: 'Other package' },
        ],
      },
    ]);
    expect(result).toMatchObject({
      ...failed,
      category: 'invalid-output',
      pairAttempted: attempted,
      itemRejections: {
        angular: expect.stringMatching(/ambiguous/i),
      },
    });
    expect(result).not.toHaveProperty('pairUsed');
  });

  it('omits items with no usable project evidence from a mixed request', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({
      items: [
        { ...install, itemId: 'i1' },
        { ...install, itemId: 'i2' },
        { ...install, itemId: 'i3' },
      ],
    });
    const result = await service.rankSkillCandidates([
      { ...item, key: 'blank', evidence: 'https://private.invalid' },
      item,
      { ...item, key: 'missing', evidence: undefined },
    ]);
    const { prompt } = complete.mock.calls[0][0];
    expect(prompt).toContain('"itemId":"i2"');
    expect(prompt).not.toMatch(/"itemId":"i[13]"/);
    expect(result).toMatchObject({
      status: 'used',
      itemRejections: {},
    });
    expect(Object.keys(result.items)).toEqual(['angular']);
  });

  it('skips dispatch when every item lacks project evidence', async () => {
    const { service, openCaller, dispatchFor, complete } = setup();
    expect(
      await service.rankSkillCandidates([
        { ...item, evidence: '' },
        { ...item, key: 'missing', evidence: undefined },
      ]),
    ).toEqual({
      status: 'skipped',
      category: 'no-work',
      items: {},
      itemRejections: {},
    });
    expect(openCaller).not.toHaveBeenCalled();
    expect(dispatchFor).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('leaves none, low-confidence, and omitted items unresolved', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({
      items: [
        { itemId: 'i1', verdict: 'none' },
        { ...install, itemId: 'i2', confidence: 0.49 },
      ],
    });
    expect(
      await service.rankSkillCandidates([
        item,
        { ...item, key: 'low' },
        { ...item, key: 'omitted' },
      ]),
    ).toMatchObject({ status: 'used', items: {}, itemRejections: {} });
  });

  it('fails an invalid response envelope with no used pair', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({ items: { i1: install } });
    expect(await service.rankSkillCandidates([item])).toEqual({
      ...failed,
      category: 'invalid-output',
      pairConfigured: configured,
      pairAttempted: attempted,
    });
  });

  it('sends bounded evidence and metadata without mentioning ineligible candidates', async () => {
    const { service, complete } = setup();
    await service.rankSkillCandidates([
      {
        ...item,
        evidence:
          'standalone imports <script>bad-script</script> https://private.invalid /private/file',
        candidates: item.candidates.map((candidate) =>
          candidate.label === 'a'
            ? {
                ...candidate,
                description: 'D:\\private\\file ' + 'x'.repeat(250),
              }
            : candidate,
        ),
      },
    ]);
    const { prompt } = complete.mock.calls[0][0];
    expect(prompt).toContain('standalone imports');
    expect(prompt).toContain('"registry":"matched"');
    expect(prompt).toContain('"candidateId":"b"');
    expect(prompt).not.toMatch(/bad-script|private|Angular legacy|x{201}/);
  });

  it('resolves c1..cN prompt aliases in structured output and rejections', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({
      items: [
        {
          itemId: 'i1',
          verdict: 'install',
          candidateId: 'c2',
          reason: 'Matches standalone imports.',
          rejections: [{ candidateId: 'c1', reason: 'Too basic.' }],
        },
      ],
    });
    const result = await service.rankSkillCandidates([item]);
    expect(result).toEqual({
      status: 'used',
      pairConfigured: configured,
      pairAttempted: attempted,
      pairUsed: attempted,
      items: {
        angular: {
          verdict: 'install',
          stage: 'decision',
          candidateId: 'b',
          reason: 'Matches standalone imports.',
          order: ['b', 'a'],
          rejections: { a: 'Too basic.' },
        },
      },
      itemRejections: {},
    });
  });

  it('keeps skills that mention deprecated APIs eligible while filtering deprecated skills', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({
      items: [
        {
          itemId: 'i1',
          verdict: 'install',
          candidateId: 'migrate',
          reason: 'Helps replace deprecated APIs.',
        },
      ],
    });
    const result = await service.rankSkillCandidates([
      {
        ...item,
        candidates: [
          {
            label: 'migrate',
            name: 'Migration helper',
            description: 'Helps migrate away from deprecated APIs cleanly.',
          },
          {
            label: 'retired',
            name: 'Retired skill',
            description: '[Deprecated] Do not use this skill.',
          },
        ],
      },
    ]);
    const { prompt } = complete.mock.calls[0][0];
    expect(prompt).toContain('"candidateId":"migrate"');
    expect(prompt).not.toContain('Retired skill');
    expect(result).toMatchObject({
      status: 'used',
      items: {
        angular: {
          verdict: 'install',
          candidateId: 'migrate',
        },
      },
    });
  });

  it('runs System One inference and maps valid choices to install verdicts with evidence-grounded reasons', async () => {
    const { service, openCaller, dispatchFor, noteLive } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      provider: 'ollama',
      selection: { kind: 'ollama', model: configured.model },
      target: {
        baseUrl: 'http://127.0.0.1:11434',
        model: attempted.model,
        probe: 'daemon',
        locality: 'local',
        timeoutMs: 8_000,
        timeoutExplicit: true,
      },
    });
    const decide = jest.fn().mockResolvedValue({
      ok: true,
      result: {
        model: attempted.model,
        answers: {
          i1: { type: 'choice', choice: 'c2', confidence: 0.84 },
        },
      },
    });
    dispatchFor.mockReturnValue({
      kind: 'system-one',
      provider: 'ollama',
      model: attempted.model,
      caller: { decide },
    });

    const result = await service.rankSkillCandidates([item]);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(noteLive).toHaveBeenCalledTimes(1);
    expect(dispatchFor).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'system-one' }),
      expect.objectContaining({ maxTimeoutMs: 8_000 }),
    );
    expect(result).toEqual({
      status: 'used',
      pairConfigured: { provider: 'ollama', model: configured.model },
      pairAttempted: { provider: 'ollama', model: attempted.model },
      pairUsed: { provider: 'ollama', model: attempted.model },
      items: {
        angular: {
          verdict: 'install',
          stage: 'decision',
          candidateId: 'b',
          reason:
            'Selected for Angular based on Angular components use standalone imports (84% confidence)',
          order: ['b', 'a'],
          rejections: {},
        },
      },
      itemRejections: {},
    });
  });

  it('leaves System One none and low-confidence choices unresolved and rejects invalid choices', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      provider: 'ollama',
      selection: { kind: 'ollama', model: configured.model },
      target: {
        baseUrl: 'http://127.0.0.1:11434',
        model: attempted.model,
        probe: 'daemon',
        locality: 'local',
        timeoutMs: 5_000,
        timeoutExplicit: true,
      },
    });
    const decide = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        result: {
          model: attempted.model,
          answers: {
            i1: { type: 'choice', choice: 'none', confidence: 0.9 },
            i2: { type: 'choice', choice: 'c1', confidence: 0.3 },
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          model: attempted.model,
          answers: {
            i1: { type: 'choice', choice: 'c99', confidence: 0.9 },
          },
        },
      });
    dispatchFor.mockReturnValue({
      kind: 'system-one',
      provider: 'ollama',
      model: attempted.model,
      caller: { decide },
    });

    const unresolved = await service.rankSkillCandidates([
      item,
      { ...item, key: 'second' },
    ]);
    expect(unresolved).toEqual({
      status: 'used',
      pairConfigured: { provider: 'ollama', model: configured.model },
      pairAttempted: { provider: 'ollama', model: attempted.model },
      pairUsed: { provider: 'ollama', model: attempted.model },
      items: {},
      itemRejections: {},
    });

    const invalid = await service.rankSkillCandidates([item]);
    expect(invalid).toEqual({
      status: 'failed',
      category: 'invalid-output',
      pairConfigured: { provider: 'ollama', model: configured.model },
      pairAttempted: { provider: 'ollama', model: attempted.model },
      items: {},
      itemRejections: {
        angular: 'Invalid or missing Decision choice or confidence',
      },
    });
  });

  it('caps System One deadline using opened.target.timeoutMs when timeoutExplicit is true', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      provider: 'ollama',
      selection: { kind: 'ollama', model: configured.model },
      target: {
        baseUrl: 'http://127.0.0.1:11434',
        model: attempted.model,
        probe: 'daemon',
        locality: 'local',
        timeoutMs: 5_000,
        timeoutExplicit: true,
      },
    });
    dispatchFor.mockReturnValue({
      kind: 'system-one',
      provider: 'ollama',
      model: attempted.model,
      caller: { decide: () => new Promise(() => undefined) },
    });
    const settled = jest.fn();
    const pending = service.rankSkillCandidates([item]).then(settled);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(settled).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toHaveBeenCalledWith({
      status: 'failed',
      category: 'timed-out',
      pairConfigured: { provider: 'ollama', model: configured.model },
      pairAttempted: { provider: 'ollama', model: attempted.model },
      items: {},
      itemRejections: {},
    });
  });

  it('uses 20s default budget for System One when timeoutExplicit is false', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      provider: 'ollama',
      selection: { kind: 'ollama', model: configured.model },
      target: {
        baseUrl: 'http://127.0.0.1:11434',
        model: attempted.model,
        probe: 'daemon',
        locality: 'local',
        timeoutMs: 3_000,
        timeoutExplicit: false,
      },
    });
    dispatchFor.mockReturnValue({
      kind: 'system-one',
      provider: 'ollama',
      model: attempted.model,
      caller: { decide: () => new Promise(() => undefined) },
    });
    const settled = jest.fn();
    const pending = service.rankSkillCandidates([item]).then(settled);
    await jest.advanceTimersByTimeAsync(19_999);
    expect(settled).not.toHaveBeenCalled();
    expect(dispatchFor).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'system-one' }),
      expect.objectContaining({ maxTimeoutMs: 20_000 }),
    );
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toHaveBeenCalledWith({
      status: 'failed',
      category: 'timed-out',
      pairConfigured: { provider: 'ollama', model: configured.model },
      pairAttempted: { provider: 'ollama', model: attempted.model },
      items: {},
      itemRejections: {},
    });
  });

  it('caps per-item candidates to Ollama System One 26-option limit while keeping top-install skills', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      provider: 'ollama',
      selection: { kind: 'ollama', model: configured.model },
      target: {
        baseUrl: 'http://127.0.0.1:11434',
        model: attempted.model,
        probe: 'daemon',
        locality: 'local',
        timeoutMs: 3_000,
        timeoutExplicit: false,
      },
    });
    const decide = jest.fn().mockResolvedValue({
      ok: true,
      result: {
        model: attempted.model,
        answers: {
          i1: { type: 'choice', choice: 'c25', confidence: 0.9 },
        },
      },
    });
    dispatchFor.mockReturnValue({
      kind: 'system-one',
      provider: 'ollama',
      model: attempted.model,
      caller: { decide },
    });

    const thirtyCandidates: SkillRankingCallerItem = {
      ...item,
      candidates: Array.from({ length: 30 }, (_, index) => ({
        label: `skill-${index + 1}`,
        name: `Skill ${index + 1}`,
        description: `Description for skill ${index + 1}`,
        installs: 10_000 - index * 100,
      })),
    };

    const result = await service.rankSkillCandidates([thirtyCandidates]);
    expect(decide).toHaveBeenCalledTimes(1);
    const sentCriteria = decide.mock.calls[0][0].questions.i1.criteria;
    const keys = Object.keys(sentCriteria);
    expect(keys.length).toBeLessThanOrEqual(26);
    expect(keys[0]).toBe('none');
    expect(keys[keys.length - 1]).toBe('c25');
    expect(sentCriteria.c1).toContain('"candidateId":"skill-1"');
    expect(sentCriteria.c25).toContain('"candidateId":"skill-25"');
    expect(sentCriteria.c26).toBeUndefined();
    expect(result).toMatchObject({
      status: 'used',
      items: {
        angular: {
          verdict: 'install',
          candidateId: 'skill-25',
        },
      },
    });
  });

  it('shrinks per-item candidate width on large multi-item requests to fit under 64 KiB instead of pre-dispatch-error', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      provider: 'ollama',
      selection: { kind: 'ollama', model: configured.model },
      target: {
        baseUrl: 'http://127.0.0.1:11434',
        model: attempted.model,
        probe: 'daemon',
        locality: 'local',
        timeoutMs: 3_000,
        timeoutExplicit: false,
      },
    });
    const decide = jest.fn().mockImplementation(async () => ({
      ok: true,
      result: {
        model: attempted.model,
        answers: Object.fromEntries(
          Array.from({ length: 25 }, (_, i) => [
            `i${i + 1}`,
            { type: 'choice', choice: 'c1', confidence: 0.92 },
          ]),
        ),
      },
    }));
    dispatchFor.mockReturnValue({
      kind: 'system-one',
      provider: 'ollama',
      model: attempted.model,
      caller: { decide },
    });

    const largeItems: SkillRankingCallerItem[] = Array.from(
      { length: 25 },
      (_, itemIndex) => ({
        key: `stack-${itemIndex + 1}`,
        kind: 'library',
        name: `Stack Item ${itemIndex + 1}`,
        evidence: `Observed in package.json and src/module-${itemIndex + 1}.ts`,
        registry: 'matched' as const,
        candidates: Array.from({ length: 20 }, (_, candIndex) => ({
          label: `org/repo/item-${itemIndex + 1}-cand-${candIndex + 1}`,
          name: `Candidate ${candIndex + 1} for Stack ${itemIndex + 1}`,
          source: `org/repo-${itemIndex + 1}`,
          description:
            `Best practices guide for stack ${itemIndex + 1} candidate ${candIndex + 1} ` +
            'd'.repeat(120),
          installs: 50_000 - candIndex * 1_000,
        })),
      }),
    );

    const result = await service.rankSkillCandidates(largeItems);
    expect(result.status).toBe('used');
    expect(decide).toHaveBeenCalledTimes(1);
    const payload = decide.mock.calls[0][0];
    expect(Object.keys(payload.questions)).toHaveLength(25);
    const firstCriteria = payload.questions.i1.criteria;
    expect(Object.keys(firstCriteria).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(firstCriteria).length).toBeLessThan(21);
    // Highest-install candidate is preserved at c1.
    expect(firstCriteria.c1).toContain(
      '"candidateId":"org/repo/item-1-cand-1"',
    );
    expect(result.items['stack-1']?.candidateId).toBe('org/repo/item-1-cand-1');
    expect(result.items['stack-25']?.candidateId).toBe(
      'org/repo/item-25-cand-1',
    );
  });

  it('contains late rejections after timeout without emitting unhandled rejections', async () => {
    const { service, complete } = setup();
    let rejectLate!: (error: Error) => void;
    complete.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectLate = reject;
        }),
    );

    const pending = service.rankSkillCandidates([item], Date.now() - 41_500);
    await jest.advanceTimersByTimeAsync(500);
    const result = await pending;
    expect(result).toEqual({
      ...failed,
      category: 'timed-out',
      pairConfigured: configured,
      pairAttempted: attempted,
    });

    // Rejecting the losing race branch after timeout must not surface an unhandled rejection.
    rejectLate(new Error('late transport error'));
    await jest.advanceTimersByTimeAsync(0);
  });
});
