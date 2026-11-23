/**
 * #1469 — harness sync in a linked git worktree, and the removal proof for
 * owned, non-retired MCP keys everywhere else.
 *
 * A linked worktree shares its repository with the main checkout, so the MCP
 * config files there are tracked files of that repository. A sync run from the
 * worktree must write, update and delete no MCP config file, workspace or home,
 * and write no `.bak`. In the main checkout an owned key that is no longer
 * desired is deleted only on proof (unchanged AND not git-tracked); an unproven
 * key stays on disk and is released from the manifest (`releasedTracked`).
 *
 * Fixtures are real: a `git init` repository with a commit, a real
 * `git worktree add`, real facets and a fake home under the same temp root.
 */

import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type {
  HarnessFacetMatrix,
  HarnessTargetId,
  McpServerConfig,
} from '@ptah-extension/shared';
import type {
  HarnessDesiredMcpServer,
  HarnessDesiredState,
} from '../../manifest/desired-state.types';
import {
  emptyManifest,
  managedEntry,
  ManagedManifestStore,
  type ManagedEntries,
} from '../../manifest-store/managed-manifest';
import type { HarnessApplyResult } from '../harness-target.port';
import { WorkspaceHarnessTarget } from '../workspace-target';
import { applyMcpFacet, planMcpFacet } from './mcp-facet-planner';
import type { IHarnessMcpFacet } from './mcp-facet.port';
import { createMcpFacet } from './mcp-facet.registry';
import { hashMcpConfig } from './mcp-json-format';

const ZERNIO = 'zernio';
const NEW_SERVER = 'new-srv';

const VSCODE_MCP = '.vscode/mcp.json';
const AGENTS_MCP = '.agents/mcp_config.json';

const VSCODE_CONTENT = `${JSON.stringify(
  { servers: { [ZERNIO]: { type: 'http', url: 'https://zernio.test/mcp' } } },
  null,
  2,
)}\n`;
const AGENTS_CONTENT = `${JSON.stringify(
  {
    mcpServers: {
      ptah: { serverUrl: 'http://127.0.0.1:51234/workspace/abc/mcp' },
    },
  },
  null,
  2,
)}\n`;

const MCP_ONLY: HarnessFacetMatrix = {
  skills: 'unsupported',
  commands: 'unsupported',
  agents: 'unsupported',
  mcp: 'supported',
};

/** git with no inherited repository location, so `cwd` alone decides. */
function git(cwd: string, args: string[]): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['GIT_DIR'];
  delete env['GIT_WORK_TREE'];
  delete env['GIT_INDEX_FILE'];
  return execFileSync(
    'git',
    [
      '-c',
      'user.email=spec@example.test',
      '-c',
      'user.name=spec',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.autocrlf=false',
      ...args,
    ],
    { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function emptyResult(): HarnessApplyResult {
  return { written: {}, removed: [], writeFailed: [], keptLocalEdit: [] };
}

function target(
  id: HarnessTargetId,
  facet: IHarnessMcpFacet,
): WorkspaceHarnessTarget {
  return new WorkspaceHarnessTarget({
    id,
    facets: MCP_ONLY,
    manifestStore: new ManagedManifestStore(),
    detector: { isInstalled: () => Promise.resolve(true) },
    mcpFacet: facet,
  });
}

function desiredState(mcp: HarnessDesiredMcpServer[]): HarnessDesiredState {
  return {
    skills: [],
    commands: [],
    agents: [],
    mcp,
    collisions: [],
    sources: 'ok',
    sourceRoots: [],
  };
}

/** The one new intent: a server for the workspace AND the home target. */
function newIntent(): HarnessDesiredMcpServer {
  const config: McpServerConfig = { type: 'stdio', command: 'new-server' };
  return {
    serverKey: NEW_SERVER,
    registryName: `registry/${NEW_SERVER}`,
    config,
    targets: ['vscode', 'antigravity'],
    contentHash: hashMcpConfig(config),
  };
}

/** A manifest entry owning `zernio` at the hash it has in `root` now. */
function ownsZernio(facet: IHarnessMcpFacet, root: string): ManagedEntries {
  const config = facet.readAll(root).get(ZERNIO) as McpServerConfig;
  return {
    [`${facet.configRelPath()}#${ZERNIO}`]: managedEntry(
      hashMcpConfig(config),
      `registry/${ZERNIO}`,
      'mcp',
    ),
  };
}

describe('MCP facet planner — linked git worktree (#1469)', () => {
  let tempRoot: string;
  let repo: string;
  let worktree: string;
  let home: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ptah-1469-'));
    repo = join(tempRoot, 'repo');
    worktree = join(tempRoot, 'wt');
    home = join(tempRoot, 'home');
    mkdirSync(join(repo, '.vscode'), { recursive: true });
    mkdirSync(join(repo, '.agents'), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(repo, VSCODE_MCP), VSCODE_CONTENT);
    writeFileSync(join(repo, AGENTS_MCP), AGENTS_CONTENT);
    git(repo, ['init', '-q']);
    git(repo, ['add', '--', VSCODE_MCP, AGENTS_MCP]);
    git(repo, ['commit', '-q', '-m', 'seed']);
    git(repo, ['worktree', 'add', '-q', '-b', 'task', worktree]);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('a worktree sync changes no MCP file, writes no .bak, leaves git status clean', async () => {
    const vscodeFacet = createMcpFacet('vscode');
    const homeFacet = createMcpFacet('antigravity', { homeDir: home });
    const homeConfig = homeFacet.configPath(worktree) as string;
    // The manifest owns `zernio`; the intents no longer want it, and one new
    // intent would add a server to both the workspace and the home config.
    const manifestEntries = ownsZernio(vscodeFacet, worktree);
    const desired = desiredState([newIntent()]);

    for (const [id, facet] of [
      ['vscode', vscodeFacet],
      ['antigravity', homeFacet],
    ] as const) {
      const harnessTarget = target(id, facet);
      const plan = await harnessTarget.plan(desired, worktree, {
        ...emptyManifest(id),
        entries: id === 'vscode' ? manifestEntries : {},
      });
      // Nothing to write and nothing to remove: the manifest's MCP rows pass
      // through unchanged.
      expect(plan.writes).toEqual([]);
      expect(plan.removals).toEqual([]);
      expect(plan.baseEntries).toEqual(id === 'vscode' ? manifestEntries : {});

      const result = await harnessTarget.apply(plan, worktree);
      expect(result.written).toEqual({});
      expect(result.removed).toEqual([]);
      expect(result.writeFailed).toEqual([]);
      expect(result.releasedTracked).toBeUndefined();
    }

    expect(readFileSync(join(worktree, VSCODE_MCP), 'utf-8')).toBe(
      VSCODE_CONTENT,
    );
    expect(readFileSync(join(worktree, AGENTS_MCP), 'utf-8')).toBe(
      AGENTS_CONTENT,
    );
    expect(existsSync(`${join(worktree, VSCODE_MCP)}.bak`)).toBe(false);
    expect(existsSync(`${join(worktree, AGENTS_MCP)}.bak`)).toBe(false);
    expect(existsSync(homeConfig)).toBe(false);
    expect(existsSync(`${homeConfig}.bak`)).toBe(false);
    expect(git(worktree, ['status', '--porcelain'])).toBe('');
  });

  it('planMcpFacet returns the empty plan for a worktree root, before reading the config', () => {
    const facet = createMcpFacet('vscode');
    const baseEntries = ownsZernio(facet, worktree);
    const readAll = jest.spyOn(facet, 'readAll');

    const plan = planMcpFacet(facet, [newIntent()], worktree, baseEntries, [
      ZERNIO,
    ]);

    expect(plan.writes).toEqual([]);
    expect(plan.removals).toEqual([]);
    expect(plan.ownedKeys.size).toBe(0);
    expect(plan.expected).toBe(0);
    expect(readAll).not.toHaveBeenCalled();
  });

  it('applyMcpFacet touches no facet in a worktree, for a plan built elsewhere (the uninstall sweep)', async () => {
    const facet = createMcpFacet('vscode');
    const write = jest.spyOn(facet, 'write');
    const remove = jest.spyOn(facet, 'remove');
    const relPath = `${VSCODE_MCP}#${ZERNIO}`;
    const retiredRel = `${VSCODE_MCP}#retired`;
    const result = emptyResult();

    await applyMcpFacet(
      facet,
      [
        {
          relPath: `${VSCODE_MCP}#${NEW_SERVER}`,
          kind: 'mcp',
          source: `registry/${NEW_SERVER}`,
          hash: 'h',
          sourceHash: 'h',
          isDirectory: false,
          reason: 'create',
          mcp: { serverKey: NEW_SERVER, config: newIntent().config },
        },
      ],
      [
        { relPath, kind: 'mcp', isDirectory: false, mcpServerKey: ZERNIO },
        {
          relPath: retiredRel,
          kind: 'mcp',
          isDirectory: false,
          mcpServerKey: 'retired',
          retiredItemId: 'mcp:retired',
        },
      ],
      worktree,
      result,
      {
        baseEntries: ownsZernio(facet, worktree),
        probeGitTracking: () => Promise.resolve('untracked'),
      },
    );

    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    // Nothing recorded: every manifest row stays owned as it was.
    expect(result).toEqual(emptyResult());
    expect(readFileSync(join(worktree, VSCODE_MCP), 'utf-8')).toBe(
      VSCODE_CONTENT,
    );
    expect(git(worktree, ['status', '--porcelain'])).toBe('');
  });

  describe('main checkout: owned, non-retired removals go through the proof', () => {
    it('keeps a git-tracked key and releases it from the manifest', async () => {
      const facet = createMcpFacet('vscode');
      const harnessTarget = target('vscode', facet);
      const plan = await harnessTarget.plan(desiredState([]), repo, {
        ...emptyManifest('vscode'),
        entries: ownsZernio(facet, repo),
      });
      expect(plan.removals.map((r) => r.mcpServerKey)).toEqual([ZERNIO]);

      const result = await harnessTarget.apply(plan, repo);

      expect(result.removed).toEqual([]);
      expect(result.releasedTracked).toEqual([`${VSCODE_MCP}#${ZERNIO}`]);
      expect(result.writeFailed).toEqual([]);
      expect(readFileSync(join(repo, VSCODE_MCP), 'utf-8')).toBe(
        VSCODE_CONTENT,
      );
      expect(existsSync(`${join(repo, VSCODE_MCP)}.bak`)).toBe(false);
      expect(git(repo, ['status', '--porcelain'])).toBe('');
    });

    it('keeps a hand-edited key and releases it, without asking git', async () => {
      const facet = createMcpFacet('vscode');
      const baseEntries = ownsZernio(facet, repo);
      const edited = VSCODE_CONTENT.replace('zernio.test', 'zernio.example');
      writeFileSync(join(repo, VSCODE_MCP), edited);
      const probe = jest.fn(() => Promise.resolve('untracked' as const));
      const result = emptyResult();

      await applyMcpFacet(
        facet,
        [],
        [
          {
            relPath: `${VSCODE_MCP}#${ZERNIO}`,
            kind: 'mcp',
            isDirectory: false,
            mcpServerKey: ZERNIO,
          },
        ],
        repo,
        result,
        { baseEntries, probeGitTracking: probe },
      );

      expect(result.removed).toEqual([]);
      expect(result.releasedTracked).toEqual([`${VSCODE_MCP}#${ZERNIO}`]);
      expect(probe).not.toHaveBeenCalled();
      expect(readFileSync(join(repo, VSCODE_MCP), 'utf-8')).toBe(edited);
    });

    it('removes an unchanged key from an untracked config, siblings untouched', async () => {
      git(repo, ['rm', '-q', '--cached', '--', VSCODE_MCP]);
      git(repo, ['commit', '-q', '-m', 'untrack']);
      const facet = createMcpFacet('vscode');
      await facet.write(repo, 'hand-added', { type: 'stdio', command: 'mine' });
      const harnessTarget = target('vscode', facet);
      const plan = await harnessTarget.plan(desiredState([]), repo, {
        ...emptyManifest('vscode'),
        entries: ownsZernio(facet, repo),
      });

      const result = await harnessTarget.apply(plan, repo);

      expect(result.removed).toEqual([`${VSCODE_MCP}#${ZERNIO}`]);
      expect(result.releasedTracked ?? []).toEqual([]);
      expect([...facet.readAll(repo).keys()]).toEqual(['hand-added']);
    });

    it('fails owned without a proof context, deleting nothing', async () => {
      const facet = createMcpFacet('vscode');
      const result = emptyResult();

      await applyMcpFacet(
        facet,
        [],
        [
          {
            relPath: `${VSCODE_MCP}#${ZERNIO}`,
            kind: 'mcp',
            isDirectory: false,
            mcpServerKey: ZERNIO,
          },
        ],
        repo,
        result,
      );

      expect(result.removed).toEqual([]);
      expect(result.writeFailed).toEqual([
        expect.objectContaining({ relPath: `${VSCODE_MCP}#${ZERNIO}` }),
      ]);
      expect(readFileSync(join(repo, VSCODE_MCP), 'utf-8')).toBe(
        VSCODE_CONTENT,
      );
    });
  });
});
