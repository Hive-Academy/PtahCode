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
    { label: 'old', name: 'Angular legacy', description: 'Deprecated package' },
  ],
};
const install = {
  itemId: 'i1',
  verdict: 'install',
  candidateId: ' B ',
  reason: ' The advanced skill covers standalone imports. ',
};
const failed = { status: 'failed', items: {}, itemRejections: {} };

function setup() {
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
  }));
  const noteLive = jest.fn().mockResolvedValue(undefined);
  const service = new SkillRankingCallerService(
    { openCaller, dispatchFor, noteLive } as unknown as DecisionCaller,
    { debug: jest.fn(), warn: jest.fn() } as unknown as LaneRoutingLogger,
  );
  return { service, openCaller, dispatchFor, complete, noteLive };
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
      items: {},
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
      Date.now() - 30_000,
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

  it('does not dispatch when the RPC budget has already elapsed', async () => {
    const { service, dispatchFor } = setup();
    expect(
      await service.rankSkillCandidates([item], Date.now() - 31_000),
    ).toEqual({
      ...failed,
      category: 'pre-dispatch-error',
      pairConfigured: configured,
    });
    expect(dispatchFor).not.toHaveBeenCalled();
  });

  it('caps an early RPC entry at three seconds from Decision start', async () => {
    const { service, complete } = setup();
    complete.mockImplementation(() => new Promise(() => undefined));
    const settled = jest.fn();
    const pending = service.rankSkillCandidates([item]).then(settled);
    await jest.advanceTimersByTimeAsync(2_999);
    expect(settled).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toHaveBeenCalledWith({
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

  it('skips System One before inference and leaves items for Normal', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      provider: 'ollama',
      selection: { kind: 'ollama', model: configured.model },
    });
    const decide = jest.fn().mockResolvedValue({
      ok: true,
      result: {
        model: attempted.model,
        answers: { i1: { type: 'choice', choice: 'c2' } },
      },
    });
    dispatchFor.mockReturnValue({
      kind: 'system-one',
      provider: 'ollama',
      model: attempted.model,
      caller: { decide },
    });
    expect(await service.rankSkillCandidates([item])).toEqual({
      status: 'skipped',
      category: 'no-work',
      pairConfigured: { provider: 'ollama', model: configured.model },
      items: {},
      itemRejections: {},
    });
    expect(decide).not.toHaveBeenCalled();
  });
});
