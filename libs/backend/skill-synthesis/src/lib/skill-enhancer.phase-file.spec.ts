import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import {
  PhaseDefinitionError,
  resolvePhaseDefinition,
} from '@ptah-extension/lane-routing';
import { ENHANCE_TIMEOUT_DEFAULT_MS } from '@ptah-extension/platform-core';
import type { AgentScorecard } from '@ptah-extension/shared';
import { SkillEnhancerService, MIN_INVOCATIONS_TO_ENHANCE } from './skill-enhancer.service';
import type { JudgeDecision } from './skill-judge.service';
import type { SkillFileWriterPort } from './skill-file-writer.port';
import type { SkillSynthesisSettings } from './types';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('---\nkind: plan\n---\nOld phase body'),
}));

jest.mock('@ptah-extension/lane-routing', () => {
  const actual = jest.requireActual<typeof import('@ptah-extension/lane-routing')>(
    '@ptah-extension/lane-routing',
  );
  return { ...actual, resolvePhaseDefinition: jest.fn() };
});

const resolveMock = jest.mocked(resolvePhaseDefinition);
const readFileMock = jest.mocked(readFile);

const PHASE_FILE = 'phases/plan.md' as const;
const NEW_PHASE_TEXT = '---\nkind: plan\n---\nNew phase body';

const PASS: JudgeDecision = {
  status: 'scored',
  score: 8,
  criteria: null,
  reason: 'judge-verdict',
};

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function settings(): SkillSynthesisSettings {
  return {
    enabled: true,
    successesToPromote: 3,
    dedupCosineThreshold: 0.85,
    maxActiveSkills: 50,
    candidatesDir: '',
    evictionDecayRate: 0.95,
    generalizationContextThreshold: 3,
    dedupClusterThreshold: 0.78,
    prefilterMinEdits: 1,
    prefilterMinToolUses: 2,
    judgeEnabled: true,
    minJudgeScore: 6.0,
    judgeModel: 'claude-haiku-4-5-20251001',
    judgeProvider: '',
    enhanceTimeoutMs: ENHANCE_TIMEOUT_DEFAULT_MS,
    maxPinnedSkills: 10,
    curatorEnabled: false,
    curatorIntervalHours: 24,
    suggestionMinClusterSize: 2,
    suggestionMaxCandidates: 200,
  };
}

function scorecard(slug: string): AgentScorecard {
  return {
    slug,
    totalInvocations: 0,
    gradedCount: 0,
    gradedSuccessRate: null,
    avgInputTokens: null,
    avgOutputTokens: null,
    avgCacheReadTokens: null,
    totalInputTokens: null,
    totalOutputTokens: null,
    avgCostUsd: null,
    avgDurationMs: null,
    avgToolCount: null,
    recentVerdicts: [],
  };
}

interface Harness {
  svc: SkillEnhancerService;
  mirror: { writeEnhancedSkill: jest.Mock; revert: jest.Mock };
  writer: { writeEnhancedSkillFile: jest.Mock; revertSkillFile: jest.Mock } | null;
}

function makeHarness(withWriter: boolean): Harness {
  const mirror = {
    getUserLayerRoots: jest.fn(() => ({
      skills: '/user/skills',
      agents: '/user/agents',
      commands: '/user/commands',
    })),
    writeEnhancedSkill: jest.fn(),
    writeEnhancedFileClone: jest.fn(),
    revert: jest.fn(),
  };
  const internalQuery = {
    execute: jest.fn(async () => ({
      stream: (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: NEW_PHASE_TEXT }] } };
        yield { type: 'result' };
      })(),
      abort: jest.fn(),
      close: jest.fn(),
    })),
  };
  const stats = {
    getScorecards: jest.fn((slugs: readonly string[]) =>
      Object.fromEntries(slugs.map((s) => [s, scorecard(s)])),
    ),
    getInvocationStats: jest.fn(() => ({
      total: MIN_INVOCATIONS_TO_ENHANCE,
      succeeded: MIN_INVOCATIONS_TO_ENHANCE,
      failed: 0,
      distinctContexts: 1,
      invocationCount: MIN_INVOCATIONS_TO_ENHANCE,
      successRate: 1,
    })),
  };
  const writer = withWriter
    ? {
        writeEnhancedSkillFile: jest.fn().mockResolvedValue({
          slug: 'deep-research',
          historyTs: '1700000000000',
          currentContentHash: 'sha256:new',
        }),
        revertSkillFile: jest.fn().mockResolvedValue({
          restored: true,
          revertedFrom: '1700000000000',
          newHistoryTs: '1800000000000',
        }),
      }
    : null;
  const writerPort: SkillFileWriterPort | null = writer;
  const svc = new SkillEnhancerService(
    logger as never,
    {
      getConfiguration: jest.fn(() => ''),
      getWorkspaceRoot: jest.fn(() => '/workspace'),
    } as never,
    mirror as never,
    {
      getBySlug: jest.fn(() => ({ slug: 'deep-research', kind: 'skill', lastEnhancedAt: null })),
      markEnhanced: jest.fn(),
    } as never,
    { judge: jest.fn().mockResolvedValue(PASS) } as never,
    internalQuery as never,
    { repropagate: jest.fn().mockResolvedValue(undefined) } as never,
    { getRecentFindings: jest.fn().mockResolvedValue(null) } as never,
    stats as never,
    null,
    null,
    null,
    writerPort,
  );
  return { svc, mirror, writer };
}

function contractError(): PhaseDefinitionError {
  return new PhaseDefinitionError('INVALID_SCHEMA', 'plan');
}

describe('SkillEnhancerService — phase files (U-D13 (1))', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveMock.mockImplementation(() => {
      throw contractError();
    });
  });

  function acceptContract(): void {
    // The spec checks only that no error is thrown; the value is not read.
    resolveMock.mockReturnValue({} as never);
  }

  it('reads the body of the phase file, not SKILL.md', async () => {
    const h = makeHarness(true);
    acceptContract();
    await h.svc.generateProposal('deep-research', settings(), {
      manual: true,
      file: PHASE_FILE,
    });
    const path = String(readFileMock.mock.calls[0]?.[0]).replace(/\\/g, '/');
    expect(path.endsWith('/deep-research/phases/plan.md')).toBe(true);
  });

  it('refuses a phase candidate that the phase contract refuses', async () => {
    const h = makeHarness(true);
    const result = await h.svc.generateProposal('deep-research', settings(), {
      manual: true,
      file: PHASE_FILE,
    });
    expect(result.proposed).toBe(false);
    expect(result.skipReason).toBe('invalid-candidate');
    expect(resolveMock).toHaveBeenCalledWith('plan', expect.any(Function));
  });

  it('refuses a file argument on kind agent', async () => {
    const h = makeHarness(true);
    const result = await h.svc.generateProposal('deep-research', settings(), {
      manual: true,
      kind: 'agent',
      file: PHASE_FILE,
    });
    expect(result.skipReason).toBe('invalid-file');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('refuses the apply and keeps the old file when the contract check fails at apply', async () => {
    const h = makeHarness(true);
    acceptContract();
    const preview = await h.svc.generateProposal('deep-research', settings(), {
      manual: true,
      file: PHASE_FILE,
    });
    expect(preview.proposalId).toEqual(expect.any(String));
    resolveMock.mockImplementation(() => {
      throw contractError();
    });
    const applied = await h.svc.applyProposal('skill', 'deep-research', preview.proposalId ?? '');
    expect(applied.applied).toBe(false);
    expect(applied.skipReason).toBe('invalid-candidate');
    expect(h.writer?.writeEnhancedSkillFile).not.toHaveBeenCalled();
    expect(h.mirror.writeEnhancedSkill).not.toHaveBeenCalled();
  });

  it('refuses the apply when the host has no phase-file writer', async () => {
    const h = makeHarness(false);
    acceptContract();
    const preview = await h.svc.generateProposal('deep-research', settings(), {
      manual: true,
      file: PHASE_FILE,
    });
    const applied = await h.svc.applyProposal('skill', 'deep-research', preview.proposalId ?? '');
    expect(applied.applied).toBe(false);
    expect(applied.skipReason).toBe('phase-write-unavailable');
    expect(h.mirror.writeEnhancedSkill).not.toHaveBeenCalled();
  });

  it('writes a valid phase text through the writer port only', async () => {
    const h = makeHarness(true);
    acceptContract();
    const preview = await h.svc.generateProposal('deep-research', settings(), {
      manual: true,
      file: PHASE_FILE,
    });
    const applied = await h.svc.applyProposal('skill', 'deep-research', preview.proposalId ?? '');
    expect(applied.applied).toBe(true);
    expect(h.writer?.writeEnhancedSkillFile).toHaveBeenCalledWith({
      slug: 'deep-research',
      file: PHASE_FILE,
      newBody: NEW_PHASE_TEXT,
    });
    expect(h.mirror.writeEnhancedSkill).not.toHaveBeenCalled();
  });

  it('reverts one phase file through the writer port, not the whole folder', async () => {
    const h = makeHarness(true);
    const result = await h.svc.revert('deep-research', '1700000000000', 'skill', {}, PHASE_FILE);
    expect(result.reverted).toBe(true);
    expect(h.writer?.revertSkillFile).toHaveBeenCalledWith({
      slug: 'deep-research',
      file: PHASE_FILE,
      historyTs: '1700000000000',
    });
    expect(h.mirror.revert).not.toHaveBeenCalled();
  });

  it('refuses a one-file revert without a writer', async () => {
    const h = makeHarness(false);
    const result = await h.svc.revert('deep-research', '1700000000000', 'skill', {}, PHASE_FILE);
    expect(result.reverted).toBe(false);
    expect(h.mirror.revert).not.toHaveBeenCalled();
  });
});
