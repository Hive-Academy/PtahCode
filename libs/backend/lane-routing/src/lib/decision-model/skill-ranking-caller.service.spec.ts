import { SkillRankingCallerService } from './skill-ranking-caller.service';
import type { DecisionCaller } from './decision-caller';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import {
  DECISION_REQUEST_TIMEOUT_MS,
  DECISION_RETURN_MARGIN_MS,
} from '../routing-constants';

const item = {
  key: 'angular',
  kind: 'framework',
  name: 'Angular',
  candidates: [
    { label: 'a', name: 'Angular basics', description: 'x'.repeat(250) },
    { label: 'b', name: 'Angular advanced', description: 'Patterns' },
  ],
};
function setup(kind = 'structured') {
  const complete = jest.fn().mockResolvedValue({ i1: 'c1' });
  const openCaller = jest
    .fn()
    .mockResolvedValue({ kind, providerId: 'fake', model: 'fake' });
  const dispatchFor = jest.fn().mockReturnValue({
    kind: 'structured',
    completer: { complete },
    model: 'fake',
    providerId: 'fake',
  });
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
    jest.restoreAllMocks();
  });

  it('returns null when no decision model is configured', async () => {
    const { service, dispatchFor } = setup('unset');
    expect(await service.rankSkillCandidates([item])).toBeNull();
    expect(dispatchFor).not.toHaveBeenCalled();
  });
  it('returns null when a configured model cannot open', async () => {
    const { service, dispatchFor } = setup('blocked');
    expect(await service.rankSkillCandidates([item])).toBeNull();
    expect(dispatchFor).not.toHaveBeenCalled();
  });
  it.each([
    ['c1', ['a', 'b']],
    ['c2', ['b', 'a']],
  ])(
    'accepts offered %s and preserves remaining order',
    async (choice, order) => {
      const { service, complete, noteLive } = setup();
      complete.mockResolvedValue({ i1: choice });
      const result = await service.rankSkillCandidates([item]);
      expect(result?.items['angular'].order).toEqual(order);
      expect(noteLive).toHaveBeenCalledTimes(1);
    },
  );
  it('omits an unknown answer while preserving the next valid item', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({ i1: 'unknown', i2: 'c2' });
    const result = await service.rankSkillCandidates([
      item,
      { ...item, key: 'next' },
    ]);
    expect(result?.items).not.toHaveProperty('angular');
    expect(result?.items['next'].order).toEqual(['b', 'a']);
  });
  it('returns null when every answer is unknown', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({ i1: 'unknown' });
    expect(await service.rankSkillCandidates([item])).toBeNull();
  });
  it('races a hung model against the 3s outer deadline', async () => {
    const { service, complete } = setup();
    complete.mockImplementation(() => new Promise(() => undefined));
    let settled = false;
    const pending = service.rankSkillCandidates([item]).then((value) => {
      settled = true;
      return value;
    });
    await jest.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
  });
  it('returns null when opening throws', async () => {
    const { service, openCaller } = setup();
    openCaller.mockRejectedValue(new Error('fake failure'));
    expect(await service.rankSkillCandidates([item])).toBeNull();
  });
  it('returns null when the model throws', async () => {
    const { service, complete } = setup();
    complete.mockRejectedValue(new Error('fake failure'));
    expect(await service.rankSkillCandidates([item])).toBeNull();
  });
  it('reserves a return margin over the system-one inner timeout', async () => {
    const { service, openCaller, dispatchFor } = setup();
    openCaller.mockResolvedValue({
      kind: 'system-one',
      target: { timeoutMs: 60000 },
    });
    await service.rankSkillCandidates([item]);
    const inner = dispatchFor.mock.calls[0][0].target;
    expect(inner.timeoutMs).toBe(
      DECISION_REQUEST_TIMEOUT_MS - DECISION_RETURN_MARGIN_MS,
    );
    expect(inner.timeoutMs).toBeLessThan(DECISION_REQUEST_TIMEOUT_MS);
    expect(inner.timeoutExplicit).toBe(true);
  });
  it('accepts an answer that arrives within the total budget (not the erroneous margin cap)', async () => {
    jest.useFakeTimers();
    try {
      const { service, openCaller, complete } = setup();
      openCaller.mockResolvedValue({
        kind: 'system-one',
        target: { timeoutMs: 60000 },
      });
      complete.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ i1: 'c2' }), 1000),
          ),
      );
      const pending = service.rankSkillCandidates([item]);
      await jest.advanceTimersByTimeAsync(1001);
      const result = await pending;
      expect(result).toEqual({ items: { angular: { order: ['b', 'a'] } } });
    } finally {
      jest.useRealTimers();
    }
  });
  it('does not transmit workspace, evidence, URLs, paths, or descriptions over 200 characters', async () => {
    const { service, complete } = setup();
    await service.rankSkillCandidates([
      {
        ...item,
        workspaceRoot: 'D:\\private',
        evidence: 'secret-evidence',
        candidates: item.candidates.map((candidate) => ({
          ...candidate,
          description:
            'https://private.invalid D:\\secret\\file /private/file ' +
            'x'.repeat(250),
        })),
      } as typeof item,
    ]);
    const prompt = complete.mock.calls[0][0].prompt;
    expect(prompt).not.toMatch(/secret-evidence|private|https?:|D:|\\secret/);
    expect(prompt).toContain('x'.repeat(200));
    expect(prompt).not.toContain('x'.repeat(201));
  });
  it('returns an empty result without opening a model for empty input', async () => {
    const { service, openCaller } = setup();
    expect(await service.rankSkillCandidates([])).toEqual({ items: {} });
    expect(openCaller).not.toHaveBeenCalled();
  });
});
