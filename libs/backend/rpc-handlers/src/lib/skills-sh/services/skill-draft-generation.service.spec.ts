import 'reflect-metadata';

jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn(),
}));

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'os';
import * as path from 'node:path';
import { InternalQueryQueueTimeoutError } from '@ptah-extension/agent-sdk';
import type {
  IWorkspaceLlmResolver,
  ResolvedSetupSnapshot,
  SetupResolution,
  WorkspaceLlmResolveOptions,
  WorkspaceLlmSnapshot,
} from '@ptah-extension/agent-sdk';
import type { WizardGenerateSkillDraftParams } from '@ptah-extension/shared';

import type {
  HarnessLlmRunArgs,
  HarnessLlmRunResult,
  HarnessLlmRunner,
} from '../../harness/ai/harness-llm-runner.service';
import { HarnessFsService } from '../../harness/io/harness-fs.service';
import { SkillDraftGenerationService } from './skill-draft-generation.service';

type DraftRunResult = Omit<HarnessLlmRunResult, 'postProcessed'>;

const SNAPSHOT: ResolvedSetupSnapshot = {
  providerId: 'setup-provider',
  model: 'setup-model',
  auth: { env: { ANTHROPIC_AUTH_TOKEN: 'provider-secret' } },
};

const PARAMS: WizardGenerateSkillDraftParams = {
  runId: 'run-1',
  proposalId: 'build:proposal-1',
  proposalName: 'Project conventions',
  items: [
    {
      itemId: 'item-a',
      name: 'Alpha',
      kind: 'framework',
      evidence: 'Alpha is declared in the application package.',
      buildReasons: ['Capture the local Alpha test convention.'],
    },
    {
      itemId: 'item-b',
      name: 'Beta',
      kind: 'library',
      evidence: 'Beta is imported by the workspace adapter.',
      buildReasons: [
        'Document the adapter boundary.',
        'Keep the existing retry behavior.',
      ],
    },
  ],
};

function makeService() {
  const resolveSetup = jest.fn<
    Promise<SetupResolution>,
    [string | undefined]
  >();
  const resolveForPath = jest.fn<
    Promise<WorkspaceLlmSnapshot>,
    [string | undefined, WorkspaceLlmResolveOptions?]
  >();
  const run = jest.fn<Promise<DraftRunResult>, [HarnessLlmRunArgs]>();
  const workspaceLlm: IWorkspaceLlmResolver = {
    resolveSetup,
    resolveForPath,
  };
  const service = new SkillDraftGenerationService(
    workspaceLlm,
    { run } as unknown as HarnessLlmRunner,
  );

  resolveSetup.mockResolvedValue({ kind: 'set', snapshot: SNAPSHOT });
  run.mockImplementation(async (args) => {
    if (args.execute.stageTrace) {
      args.execute.stageTrace.pairUsed = {
        provider: 'setup-provider',
        model: 'setup-model',
      };
    }
    return {
      structuredOutput: {
        name: 'Project conventions',
        description: 'Project-specific implementation conventions.',
        body: '# Project conventions',
      },
      terminal: { kind: 'success' },
    };
  });

  return { service, resolveSetup, resolveForPath, run };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SkillDraftGenerationService', () => {
  it.each(['set', 'unset'] as const)('uses only the resolved Setup pair when %s and never calls the skill writer', async (kind) => {
    const { service, resolveSetup, resolveForPath, run } = makeService();
    resolveSetup.mockResolvedValue({ kind, snapshot: SNAPSHOT });
    const writer = jest.spyOn(HarnessFsService.prototype, 'createSkillPlugin');

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(resolveSetup).toHaveBeenCalledWith('/workspace/project');
    expect(resolveForPath).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
    const args = run.mock.calls[0][0];
    expect(args.timeoutMs).toBe(60_000);
    expect(args.execute.resolved).toBe(SNAPSHOT);
    expect(args.execute).not.toHaveProperty('model');
    expect(args.execute.toolAccess).toBe('none');
    expect(args.execute.mcpServerRunning).toBe(false);
    expect(args.execute.maxTurns).toBe(3);
    expect(JSON.parse(args.execute.prompt)).toEqual({
      proposalName: PARAMS.proposalName,
      items: PARAMS.items.map(({ name, kind, evidence, buildReasons }) => ({
        name,
        kind,
        evidence,
        buildReasons,
      })),
    });
    expect(result).toMatchObject({
      ok: true,
      name: 'project-conventions',
      destinationSlug: 'project-conventions',
      pairUsed: { provider: 'setup-provider', model: 'setup-model' },
    });
    expect(JSON.stringify(result)).not.toContain('provider-secret');
  });

  it('appends deterministic project evidence with each linked Build reason', async () => {
    const { service } = makeService();

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toContain(
      '- Alpha (framework)\n' +
        '  - Evidence: Alpha is declared in the application package.\n' +
        '  - Build reason: Capture the local Alpha test convention.\n' +
        '- Beta (library)\n' +
        '  - Evidence: Beta is imported by the workspace adapter.\n' +
        '  - Build reason: Document the adapter boundary.\n' +
        '  - Build reason: Keep the existing retry behavior.',
    );
    expect(result.body.match(/^## Project evidence$/gm)).toHaveLength(1);
  });

  it.each([null, { name: 'Incomplete draft' }])('extracts fenced JSON with structured output %j and preserves the evidence section', async (structuredOutput) => {
    const { service, run } = makeService();
    run.mockImplementation(async (args) => {
      if (args.execute.stageTrace) {
        args.execute.stageTrace.pairUsed = {
          provider: 'setup-provider',
          model: 'setup-model',
        };
      }
      return {
        structuredOutput,
        resultText: [
          '```json',
          JSON.stringify({
            name: ' My Skill ',
            description: '  A trimmed description.  ',
            body: '# Guide\n\n## Project evidence\n\n- Existing evidence',
          }),
          '```',
        ].join('\n'),
        terminal: { kind: 'success' },
      };
    });

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({
      ok: true,
      name: 'my-skill',
      description: 'A trimmed description.',
      body: '# Guide\n\n## Project evidence\n\n- Existing evidence',
    });
  });

  it('AI draft with two consecutive frontmatter blocks normalizes once and yields byte-equal Preview and disk file', async () => {
    const { service, run } = makeService();
    run.mockImplementation(async (args) => {
      if (args.execute.stageTrace) {
        args.execute.stageTrace.pairUsed = {
          provider: 'setup-provider',
          model: 'setup-model',
        };
      }
      return {
        structuredOutput: {
          name: 'Two Block',
          description: 'Checks single normalization.',
          body:
            '---\nname: outer\n---\n' +
            '---\nname: inner\n---\n' +
            '# Body',
        },
        terminal: { kind: 'success' },
      };
    });

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.startsWith('---\nname: inner\n---\n# Body')).toBe(true);
    expect(result.body).not.toContain('name: outer');
    const temporaryHome = await mkdtemp(
      path.join(os.tmpdir(), 'skill-draft-test-'),
    );
    jest.mocked(os.homedir).mockReturnValue(temporaryHome);
    try {
      const writer = new HarnessFsService(null as never, null as never);
      const saved = await writer.createSkillPlugin({
        name: result.name,
        description: result.description,
        content: result.body,
      });

      expect(saved.skillPath).toBe(
        path.join(
          temporaryHome,
          '.ptah',
          'plugins',
          'ptah-harness-two-block',
          'skills',
          'two-block',
          'SKILL.md',
        ),
      );
      expect(await readFile(saved.skillPath)).toEqual(
        Buffer.from(result.content, 'utf8'),
      );
    } finally {
      jest.mocked(os.homedir).mockReset();
      await rm(temporaryHome, { recursive: true, force: true });
    }
  });

  it('replaces control characters in AI description with spaces before serialization and stays byte-equal on disk', async () => {
    const { service, run } = makeService();
    run.mockImplementation(async (args) => {
      if (args.execute.stageTrace) {
        args.execute.stageTrace.pairUsed = {
          provider: 'setup-provider',
          model: 'setup-model',
        };
      }
      return {
        structuredOutput: {
          name: 'Control Clean',
          description: 'Alpha\r\nBeta\tGamma\u0000Delta\u001b[0m\u202eEnd',
          body: '# Body',
        },
        terminal: { kind: 'success' },
      };
    });

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.description).toBe('Alpha Beta Gamma Delta [0m End');
    expect(result.content).toContain(
      'description: "Alpha Beta Gamma Delta [0m End"',
    );
    expect(result.description).not.toMatch(/[\p{Cc}\p{Bidi_Control}]/u);

    const temporaryHome = await mkdtemp(
      path.join(os.tmpdir(), 'skill-draft-ctrl-test-'),
    );
    jest.mocked(os.homedir).mockReturnValue(temporaryHome);
    try {
      const writer = new HarnessFsService(null as never, null as never);
      const saved = await writer.createSkillPlugin({
        name: result.name,
        description: result.description,
        content: result.body,
      });
      expect(await readFile(saved.skillPath)).toEqual(
        Buffer.from(result.content, 'utf8'),
      );
    } finally {
      jest.mocked(os.homedir).mockReset();
      await rm(temporaryHome, { recursive: true, force: true });
    }
  });

  it('rejects an AI description made only of control characters as invalid-output', async () => {
    const { service, run } = makeService();
    run.mockImplementation(async (args) => {
      if (args.execute.stageTrace) {
        args.execute.stageTrace.pairUsed = {
          provider: 'setup-provider',
          model: 'setup-model',
        };
      }
      return {
        structuredOutput: {
          name: 'Only Controls',
          description: '\u0000\u0007\u001b',
          body: '# Body',
        },
        terminal: { kind: 'success' },
      };
    });

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({ ok: false, category: 'invalid-output' });
  });

  it.each([
    {
      resolution: {
        kind: 'invalid',
        source: 'workspace',
        provider: 'setup-provider',
        model: null,
        cause: 'model-missing',
      },
      category: 'no-model',
    },
    {
      resolution: {
        kind: 'invalid',
        source: 'setup',
        provider: 'setup-provider',
        model: 'setup-model',
        cause: 'not-signed-in',
      },
      category: 'invalid-pair',
    },
    {
      resolution: {
        kind: 'unavailable',
        source: 'setup',
        provider: 'setup-provider',
        model: 'setup-model',
        cause: 'provider-unavailable',
      },
      category: 'provider-error',
    },
  ] satisfies Array<{
    resolution: SetupResolution;
    category: string;
  }>)('maps Setup resolution to $category', async ({ resolution, category }) => {
    const { service, resolveSetup, run } = makeService();
    resolveSetup.mockResolvedValue(resolution);

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({ ok: false, category });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    {
      output: {
        structuredOutput: null,
        resultText: '  \n',
        terminal: { kind: 'success' },
      },
      category: 'empty-output',
    },
    {
      output: {
        structuredOutput: null,
        resultText: 'not JSON',
        terminal: { kind: 'success' },
      },
      category: 'invalid-output',
    },
    {
      output: {
        structuredOutput: {
          name: 'Valid name',
          description: 'Valid description',
          body: '  ',
        },
        terminal: { kind: 'success' },
      },
      category: 'empty-output',
    },
    {
      output: {
        structuredOutput: {
          name: '---',
          description: 'Valid description',
          body: '# Body',
        },
        terminal: { kind: 'success' },
      },
      category: 'invalid-output',
    },
    {
      output: {
        structuredOutput: {
          name: 'Valid name',
          description: 'Valid description',
          body: '---\nname: removed\n---\n',
        },
        terminal: { kind: 'success' },
      },
      category: 'empty-output',
    },
    {
      output: {
        structuredOutput: 'unexpected structured value',
        terminal: { kind: 'success' },
      },
      category: 'invalid-output',
    },
  ] satisfies Array<{
    output: DraftRunResult;
    category: string;
  }>)('returns $category for unusable model output', async ({ output, category }) => {
    const { service, run } = makeService();
    run.mockResolvedValue(output);

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({ ok: false, category });
  });

  it('returns provider-error for an SDK error terminal', async () => {
    const { service, run } = makeService();
    run.mockResolvedValue({
      structuredOutput: null,
      resultText: 'provider secret must not be returned',
      terminal: { kind: 'provider-error', subtype: 'error_during_execution' },
    });

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({ ok: false, category: 'provider-error' });
    expect(JSON.stringify(result)).not.toContain('provider secret');
  });

  it('rejects partial output before classifying it as an invalid draft', async () => {
    const { service, run } = makeService();
    run.mockResolvedValue({
      structuredOutput: { name: 'Partial draft' },
    });

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({ ok: false, category: 'provider-error' });
  });

  it.each([
    Object.assign(new Error('raw abort details'), { name: 'AbortError' }),
    new InternalQueryQueueTimeoutError(1),
  ])('returns timed-out for $name without raw provider details', async (error) => {
    const { service, run } = makeService();
    run.mockRejectedValue(error);

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({ ok: false, category: 'timed-out' });
    expect(JSON.stringify(result)).not.toContain('raw abort details');
  });

  it('sanitizes provider exceptions', async () => {
    const { service, run } = makeService();
    run.mockRejectedValue(new Error('failed with provider-secret'));

    const result = await service.generateDraft(PARAMS, '/workspace/project');

    expect(result).toMatchObject({ ok: false, category: 'provider-error' });
    expect(JSON.stringify(result)).not.toContain('provider-secret');
  });
});
