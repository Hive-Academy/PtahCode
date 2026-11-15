import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  classifyAgentModelValue,
  isAgentModelEmittable,
  matchesAgentModelSyntax,
  type AgentModelLayers,
} from '@ptah-extension/shared';
import { HarnessManifestBuilder } from '../manifest/harness-manifest.builder';
import { HarnessReconcilerService } from '../reconciler/harness-reconciler.service';
import { ManagedManifestStore } from '../manifest-store/managed-manifest';
import {
  createPluginConfigSourceResolver,
  defaultHarnessSourceLayout,
  scopeAgentsRoot,
} from '../sources/plugin-config-source-resolver';
import { HarnessStateStore } from '../gitignore/harness-state-store';
import { createCodexTarget, createOpencodeTarget } from './rival-targets';

jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn(),
}));

describe('rival targets — agent model reconciliation', () => {
  let tempRoot: string;
  let tempHome: string;
  let ws: string;
  let oldCodexHome: string | undefined;
  let layers: AgentModelLayers;
  const slug = 'backend-developer';
  const copyRel = `.codex/agents/${slug}.toml`;
  const legacyCopy =
    '# source: ptah\nname = "backend-developer"\ndescription = "an agent"\ndeveloper_instructions = """\ninstructions\n"""\n';

  function recordOrigins(roles: readonly string[]): void {
    const { agentsRoot } = scopeAgentsRoot(defaultHarnessSourceLayout(), ws);
    const dir = join(ws, '.ptah', 'setup-wizard');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'agent-origins.json'),
      JSON.stringify({
        version: 1,
        agents: Object.fromEntries(
          roles.map((role) => {
            const content = readFileSync(
              join(agentsRoot, `${role}.md`),
              'utf8',
            ).replace(/\r\n/g, '\n');
            return [
              role,
              {
                hash: `sha256:${createHash('sha256').update(content).digest('hex')}`,
                writtenAt: 1,
              },
            ];
          }),
        ),
      }),
    );
  }

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'harness-agent-model-'));
    tempHome = join(tempRoot, 'home');
    ws = join(tempRoot, 'workspace');
    mkdirSync(tempHome, { recursive: true });
    mkdirSync(ws, { recursive: true });
    jest.mocked(homedir).mockReturnValue(tempHome);
    oldCodexHome = process.env['CODEX_HOME'];
    delete process.env['CODEX_HOME'];
    new HarnessStateStore().save(ws, { version: 1, agentSyncEnabled: true });
    const { agentsRoot } = scopeAgentsRoot(defaultHarnessSourceLayout(), ws);
    mkdirSync(agentsRoot, { recursive: true });
    writeFileSync(
      join(agentsRoot, `${slug}.md`),
      `---\nname: ${slug}\ndescription: "an agent"\nmodel: opus\n---\ninstructions\n`,
      'utf-8',
    );
    layers = {};
  });

  afterEach(() => {
    if (oldCodexHome === undefined) delete process.env['CODEX_HOME'];
    else process.env['CODEX_HOME'] = oldCodexHome;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function reconciler(
    withModels = true,
    includeOpencode = false,
  ): HarnessReconcilerService {
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const store = new ManagedManifestStore((message, detail) =>
      logger.warn(message, detail),
    );
    const sourceResolver = createPluginConfigSourceResolver(
      () => ({
        resolveCurrentPluginPaths: () => [],
        getDisabledSkillIds: () => [],
        getWorkspacePluginConfig: () => ({}),
      }),
      undefined,
      undefined,
      withModels
        ? () => ({
            layersForPath: (root: string) => {
              expect(root).toBe(ws);
              return layers;
            },
          })
        : undefined,
    );
    return new HarnessReconcilerService(
      logger as unknown as Logger,
      new HarnessManifestBuilder((message, detail) =>
        logger.warn(message, detail),
      ),
      store,
      sourceResolver,
      [
        createCodexTarget({
          manifestStore: store,
          detector: { isInstalled: async (target) => target === 'codex' },
          homeDir: tempHome,
        }),
        ...(includeOpencode
          ? [
              createOpencodeTarget({
                manifestStore: store,
                detector: {
                  isInstalled: async (target) => target === 'opencode',
                },
                homeDir: tempHome,
              }),
            ]
          : []),
      ],
    );
  }

  it('does not copy retired Ptah clones and leaves tracked agent files in place', async () => {
    const { agentsRoot } = scopeAgentsRoot(defaultHarnessSourceLayout(), ws);
    for (const role of [
      'backend-developer',
      'frontend-developer',
      'devops-engineer',
    ]) {
      writeFileSync(
        join(agentsRoot, `${role}.md`),
        `---\nname: ${role}\n---\nold`,
      );
      for (const relative of [
        `.codex/agents/${role}.toml`,
        `.opencode/agent/${role}.md`,
      ]) {
        const copy = join(ws, relative);
        mkdirSync(join(copy, '..'), { recursive: true });
        writeFileSync(copy, `tracked ${role}`);
      }
    }
    recordOrigins([
      'backend-developer',
      'frontend-developer',
      'devops-engineer',
    ]);
    const workspaceAgents = join(ws, '.claude', 'agents');
    mkdirSync(workspaceAgents, { recursive: true });
    for (const role of [
      'backend-developer',
      'frontend-developer',
      'devops-engineer',
    ]) {
      writeFileSync(
        join(workspaceAgents, `${role}.md`),
        readFileSync(join(agentsRoot, `${role}.md`)),
      );
    }
    const result = await reconciler(true, true).reconcile(ws, {
      mode: 'full',
      reason: 'retired roles',
    });
    expect(
      result.targets.find((target) => target.target === 'codex')?.expected,
    ).toBe(0);
    expect(
      result.targets.find((target) => target.target === 'opencode')?.expected,
    ).toBe(0);
    for (const role of [
      'backend-developer',
      'frontend-developer',
      'devops-engineer',
    ]) {
      for (const relative of [
        `.codex/agents/${role}.toml`,
        `.opencode/agent/${role}.md`,
      ]) {
        const copy = join(ws, relative);
        expect(existsSync(copy)).toBe(true);
        expect(readFileSync(copy, 'utf-8')).toBe(`tracked ${role}`);
      }
    }
  });

  it('keeps a formerly managed retired copy after its source gains Ptah provenance', async () => {
    const service = reconciler();
    await service.reconcile(ws, {
      mode: 'full',
      reason: 'user-authored agent',
    });
    const copy = join(ws, copyRel);
    const original = readFileSync(copy, 'utf-8');
    const { agentsRoot } = scopeAgentsRoot(defaultHarnessSourceLayout(), ws);
    const workspaceAgents = join(ws, '.claude', 'agents');
    mkdirSync(workspaceAgents, { recursive: true });
    writeFileSync(
      join(workspaceAgents, `${slug}.md`),
      readFileSync(join(agentsRoot, `${slug}.md`)),
    );
    recordOrigins([slug]);
    await service.reconcile(ws, { mode: 'full', reason: 'retired built-in' });
    expect(readFileSync(copy, 'utf-8')).toBe(original);
  });

  it('keeps a retired base entry after its clone disappears', async () => {
    const service = reconciler();
    await service.reconcile(ws, { mode: 'full', reason: 'initial agent' });
    const copy = join(ws, copyRel);
    const { agentsRoot } = scopeAgentsRoot(defaultHarnessSourceLayout(), ws);
    const workspaceAgents = join(ws, '.claude', 'agents');
    mkdirSync(workspaceAgents, { recursive: true });
    writeFileSync(
      join(workspaceAgents, `${slug}.md`),
      readFileSync(join(agentsRoot, `${slug}.md`)),
    );
    recordOrigins([slug]);
    rmSync(join(agentsRoot, `${slug}.md`));
    await service.reconcile(ws, { mode: 'full', reason: 'clone removed' });
    expect(existsSync(copy)).toBe(true);
  });

  it.each(['no origin entry', 'hash mismatch'])(
    'removes a retired provider copy after its source disappears with %s',
    async (origin) => {
      const service = reconciler();
      const { agentsRoot } = scopeAgentsRoot(defaultHarnessSourceLayout(), ws);
      const workspaceAgents = join(ws, '.claude', 'agents');
      mkdirSync(workspaceAgents, { recursive: true });
      writeFileSync(
        join(workspaceAgents, `${slug}.md`),
        readFileSync(join(agentsRoot, `${slug}.md`)),
      );
      if (origin === 'hash mismatch') {
        recordOrigins([slug]);
        writeFileSync(join(workspaceAgents, `${slug}.md`), '# changed');
      }
      await service.reconcile(ws, { mode: 'full', reason: 'initial agent' });
      expect(existsSync(join(ws, copyRel))).toBe(true);
      rmSync(join(agentsRoot, `${slug}.md`));
      await service.reconcile(ws, { mode: 'full', reason: 'source removed' });
      expect(existsSync(join(ws, copyRel))).toBe(false);
    },
  );

  it('syncs a retired slug when its origin hash no longer matches', async () => {
    recordOrigins([slug]);
    const { agentsRoot } = scopeAgentsRoot(defaultHarnessSourceLayout(), ws);
    writeFileSync(join(agentsRoot, `${slug}.md`), '# edited');
    await reconciler().reconcile(ws, { mode: 'full', reason: 'edited agent' });
    expect(existsSync(join(ws, copyRel))).toBe(true);
  });

  it('syncs a retired slug when its origin store is unreadable', async () => {
    const dir = join(ws, '.ptah', 'setup-wizard', 'agent-origins.json');
    mkdirSync(dir, { recursive: true });
    await reconciler().reconcile(ws, {
      mode: 'full',
      reason: 'unreadable origins',
    });
    expect(existsSync(join(ws, copyRel))).toBe(true);
  });

  it('rewrites a changed Codex model without reporting a local edit, using the normalized root', async () => {
    layers = { workspace: { [slug]: { codex: 'model-one' } } };
    const service = reconciler();
    const nested = join(ws, 'src', 'nested');
    mkdirSync(nested, { recursive: true });
    await service.reconcile(nested, { mode: 'full', reason: 'initial model' });
    expect(readFileSync(join(ws, copyRel), 'utf-8')).toContain(
      'model = "model-one"',
    );

    layers = { workspace: { [slug]: { codex: 'model-two' } } };
    const result = await service.reconcile(nested, {
      mode: 'full',
      reason: 'changed model',
    });
    const copy = readFileSync(join(ws, copyRel), 'utf-8');
    expect(copy).toContain('model = "model-two"');
    expect(copy).not.toContain('model-one');
    expect(
      result.targets.find((target) => target.target === 'codex')?.keptLocalEdit,
    ).toEqual([]);
  });

  it('emits a provider-listed Codex value even when it fails the syntax heuristic', async () => {
    const model = 'provider model preview';
    expect(matchesAgentModelSyntax('codex', model)).toBe(false);
    expect(classifyAgentModelValue('codex', model, [{ id: model }])).toBe(
      'listed',
    );
    expect(isAgentModelEmittable('codex', model)).toBe(true);
    layers = { workspace: { [slug]: { codex: model } } };
    await reconciler().reconcile(ws, { mode: 'full', reason: 'listed model' });
    expect(readFileSync(join(ws, copyRel), 'utf-8')).toContain(
      `model = "${model}"`,
    );
  });

  it('preserves the exact pre-model Codex bytes without a getter or with empty layers', async () => {
    await reconciler(false).reconcile(ws, {
      mode: 'full',
      reason: 'no getter',
    });
    expect(readFileSync(join(ws, copyRel), 'utf-8')).toBe(legacyCopy);
    const result = await reconciler().reconcile(ws, {
      mode: 'full',
      reason: 'empty layers',
    });
    expect(readFileSync(join(ws, copyRel), 'utf-8')).toBe(legacyCopy);
    expect(
      result.targets.find((target) => target.target === 'codex')?.keptLocalEdit,
    ).toEqual([]);
  });
});
