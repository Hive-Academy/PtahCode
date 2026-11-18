import 'reflect-metadata';
import { rm } from 'node:fs/promises';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SkillRankingCallerService } from '@ptah-extension/lane-routing';
import type { HarnessLlmRunner } from '../../harness/ai/harness-llm-runner.service';
import { SkillRankingService } from './skill-ranking.service';
import {
  skillRankingItemSchema,
  skillRankingJsonSchema,
} from './skill-ranking.schema';
import type { SkillRankingRequest } from './skill-ranking.types';

jest.mock('node:fs/promises', () => ({
  mkdtemp: jest.fn().mockResolvedValue('D:\\fake-scratch'),
  rm: jest.fn().mockResolvedValue(undefined),
}));
const request: SkillRankingRequest = {
  workspaceRoot: 'D:\\private-workspace',
  items: {
    angular: {
      kind: 'framework',
      name: 'Angular',
      candidates: ['a', 'b'].map((label) => ({
        label,
        name: label,
        source: 'owner/repo',
        skillId: label,
        installs: 10,
        description: 'x'.repeat(250),
      })),
    },
  },
};
function setup(decision = false, session = true) {
  const rankSkillCandidates = jest.fn().mockResolvedValue(null);
  const run = jest.fn().mockResolvedValue({
    structuredOutput: {
      items: { angular: { order: ['b', 'a'], reason: 'Better relevance' } },
    },
  });
  const service = new SkillRankingService(
    { debug: jest.fn() } as unknown as Logger,
    decision
      ? ({ rankSkillCandidates } as unknown as SkillRankingCallerService)
      : undefined,
    session ? ({ run } as unknown as HarnessLlmRunner) : undefined,
  );
  return { service, rankSkillCandidates, run };
}
describe('SkillRankingService.rank', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  it('uses decision model order and does not invoke the session model', async () => {
    const { service, rankSkillCandidates, run } = setup(true);
    rankSkillCandidates.mockResolvedValue({
      items: { angular: { order: ['b', 'a'] } },
    });
    const result = await service.rank(request);
    expect(result.items['angular'].order).toEqual(['b', 'a']);
    expect(result.items['angular'].rankedBy).toBe('decision-model');
    expect(result.items['angular'].reason).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'falls through absent/null decision model (registered=%s)',
    async (registered) => {
      const { service, run } = setup(registered);
      const result = await service.rank(request);
      expect(run).toHaveBeenCalledTimes(1);
      expect(result.items['angular'].order).toEqual(['b', 'a']);
      expect(result.items['angular'].rankedBy).toBe('session-model');
      expect(rm).toHaveBeenCalledTimes(1);
      expect(rm).toHaveBeenCalledWith('D:\\fake-scratch', {
        recursive: true,
        force: true,
      });
    },
  );
  it('continues to the session model after a decision error', async () => {
    const { service, rankSkillCandidates } = setup(true);
    rankSkillCandidates.mockRejectedValue(new Error('fake unavailable'));
    expect((await service.rank(request)).items['angular'].rankedBy).toBe(
      'session-model',
    );
  });
  it.each([
    ['invalid JSON', '{broken'],
    ['unknown label', { items: { angular: { order: ['unknown'] } } }],
    ['duplicate label', { items: { angular: { order: ['a', 'a', 'b'] } } }],
    ['missing item', { items: {} }],
  ])('keeps the item heuristic on %s', async (_name, output) => {
    const { service, run } = setup();
    run.mockResolvedValue({ structuredOutput: output });
    const result = await service.rank(request);
    expect(result.items['angular'].order).toEqual(['a', 'b']);
    expect(result.items['angular'].rankedBy).toBe('heuristic');
    expect(result.rankedBy).toBe('heuristic');
  });
  it('isolates invalid items while accepting the next valid item', async () => {
    const { service, run } = setup();
    run.mockResolvedValue({
      structuredOutput: {
        items: { angular: { order: ['unknown'] }, next: { order: ['b', 'a'] } },
      },
    });
    const result = await service.rank({
      ...request,
      items: { ...request.items, next: request.items['angular'] },
    });
    expect(result.items['angular']).toEqual({
      order: ['a', 'b'],
      rankedBy: 'heuristic',
    });
    expect(result.items['next'].order).toEqual(['b', 'a']);
    expect(result.items['next'].rankedBy).toBe('session-model');
  });
  it('passes only unresolved items to the session model', async () => {
    const { service, run, rankSkillCandidates } = setup(true);
    rankSkillCandidates.mockResolvedValue({
      items: { angular: { order: ['b', 'a'] } },
    });
    run.mockResolvedValue({
      structuredOutput: { items: { next: { order: ['b', 'a'] } } },
    });
    const result = await service.rank({
      ...request,
      items: { ...request.items, next: request.items['angular'] },
    });
    expect(
      JSON.parse(run.mock.calls[0][0].execute.prompt).items,
    ).not.toHaveProperty('angular');
    expect(result.items['angular'].rankedBy).toBe('decision-model');
    expect(result.items['next'].rankedBy).toBe('session-model');
  });
  it.each([
    '<img onerror>',
    '<script>alert(1)</script>',
    'javascript:alert(1)',
  ])(
    'removes description injection %s without altering order',
    async (injection) => {
      const { service, run } = setup();
      const baseline = await service.rank(request);
      const modified = structuredClone(request);
      modified.items['angular'].candidates[0].description = injection;
      const result = await service.rank(modified);
      expect(run.mock.calls[1][0].execute.prompt).not.toMatch(
        /<img|onerror|<script|javascript:/i,
      );
      expect(result.items['angular'].order).toEqual(
        baseline.items['angular'].order,
      );
    },
  );
  it('constrains prompt metadata and requests a tool-free item-scoped JSON schema', async () => {
    const { service, run } = setup();
    const modified = structuredClone(request);
    modified.items['angular'].candidates[0].description =
      'https://private.invalid D:\\secret\\file /private/file ' +
      'x'.repeat(250);
    await service.rank({
      ...modified,
      evidence: 'secret-evidence',
    } as SkillRankingRequest);
    const execute = run.mock.calls[0][0].execute;
    expect(execute.toolAccess).toBe('none');
    expect(execute.outputFormat.type).toBe('json_schema');
    expect(execute.outputFormat.schema).toEqual(
      skillRankingJsonSchema(request.items),
    );
    expect(
      execute.outputFormat.schema.properties.items.properties.angular.properties
        .order.items.enum,
    ).toEqual(['a', 'b']);
    expect(execute.prompt).not.toMatch(
      /secret-evidence|private|https?:|D:|\\secret/,
    );
    const prompt = JSON.parse(execute.prompt);
    expect(prompt.items['angular'].candidates[0].description).toHaveLength(200);
    expect(
      skillRankingItemSchema(['a', 'b']).safeParse({ order: ['unknown'] })
        .success,
    ).toBe(false);
    expect(
      skillRankingItemSchema(['a', 'b']).safeParse({ order: ['a', 'a', 'b'] })
        .success,
    ).toBe(false);
  });
  it('fires the decision deadline at exactly 3 seconds', async () => {
    const { service, rankSkillCandidates, run } = setup(true);
    rankSkillCandidates.mockImplementation(() => new Promise(() => undefined));
    const pending = service.rank(request);
    await jest.advanceTimersByTimeAsync(2999);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect((await pending).items['angular'].rankedBy).toBe('session-model');
  });
  it('fires the session deadline at exactly 15 seconds and preserves heuristic order', async () => {
    const { service, run } = setup();
    run.mockImplementation(() => new Promise(() => undefined));
    let settled = false;
    const pending = service.rank(request).then((result) => {
      settled = true;
      return result;
    });
    await jest.advanceTimersByTimeAsync(14999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect((await pending).items['angular']).toEqual({
      order: ['a', 'b'],
      rankedBy: 'heuristic',
    });
  });
  it('retains heuristic order without either model', async () => {
    expect(
      (await setup(false, false).service.rank(request)).items['angular']
        .rankedBy,
    ).toBe('heuristic');
  });
  it.each(['resolve', 'reject'])(
    'defers scratch removal after the deadline until the runner settles (%s)',
    async (outcome) => {
      const { service, run } = setup();
      let settle: () => void = () => {
        throw new Error('Runner has not started');
      };
      run.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            settle = () => {
              if (outcome === 'reject')
                reject(new Error('Late runner failure'));
              else resolve({ structuredOutput: { items: {} } });
            };
          }),
      );
      const pending = service.rank(request);
      await jest.advanceTimersByTimeAsync(15_000);
      const result = await pending;
      expect(result.items['angular'].rankedBy).toBe('heuristic');
      expect(rm).not.toHaveBeenCalled();

      settle();
      await jest.advanceTimersByTimeAsync(0);
      expect(rm).toHaveBeenCalledTimes(1);
      expect(rm).toHaveBeenCalledWith('D:\\fake-scratch', {
        recursive: true,
        force: true,
      });
      expect(result.items['angular'].rankedBy).toBe('heuristic');
    },
  );
  it('caps nonheuristic reasons below 140 characters', async () => {
    const { service, run } = setup();
    run.mockResolvedValue({
      structuredOutput: {
        items: { angular: { order: ['b'], reason: 'r'.repeat(300) } },
      },
    });
    const result = await service.rank(request);
    expect(result.items['angular'].order).toEqual(['b', 'a']);
    expect(result.items['angular'].reason).toHaveLength(139);
  });
});
