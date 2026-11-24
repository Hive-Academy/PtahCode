/**
 * D-2 retirement outcomes across a whole reconcile pass (TASK_2026_853,
 * Batch 24).
 *
 * The target-level proofs live in `workspace-target.retirement.spec.ts`. This
 * suite owns what the RECONCILER does with them:
 *
 * - it hands `source.retired` to every target's plan, so a removal of a retired
 *   copy runs the proof policy instead of a plain delete;
 * - it prunes the manifest only from what the apply REPORTED: `removed` goes,
 *   `keptRetired` is disowned (entry dropped, file kept), a `writeFailed` row
 *   keeps its entry so the next pass retries it;
 * - it carries `removedRetired` / `keptRetired` into the target health, keyed
 *   for the ledger by `harnessPathIdentity(workspaceRoot, relPath)`;
 * - it passes the workspace root to the builder, which activates the workspace
 *   skills.sh exemption (D-D4) on both `reconcile` and `verify`.
 *
 * Retired MCP keys are gone with the MCP facets (TASK_2026_979, Batch 17): a
 * pre-P2 `kind: 'mcp'` manifest row is dropped on load (D1) and the config file
 * it named is never touched.
 *
 * Every case runs in its own `mkdtemp` root. Removals that must happen run in a
 * REAL `git init` repository with the real git probe.
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
import {
  harnessPathIdentity,
  type HarnessFacetMatrix,
  type HarnessHealth,
  type HarnessTargetHealth,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { HarnessStateStore } from '../gitignore/harness-state-store';
import { hashDir } from '../hash/content-hash';
import { HarnessManifestBuilder } from '../manifest/harness-manifest.builder';
import {
  managedEntry,
  ManagedManifestStore,
  type ManagedEntries,
} from '../manifest-store/managed-manifest';
import type { HarnessSourceState } from '../sources/harness-source.port';
import { createStaticSourceResolver } from '../sources/plugin-config-source-resolver';
import { WorkspaceHarnessTarget } from '../targets/workspace-target';
import { HarnessReconcilerService } from './harness-reconciler.service';

const ROOT_ID = 'ptah-skillssh-retired';
const SKILL_ITEM = `skills-sh:${ROOT_ID}` as const;
const RETIRED_SKILL = '.cursor/skills/retired-skill';
const TRACKED_SKILL = '.cursor/skills/tracked-skill';
const MCP_CONFIG = '.cursor/mcp.json';
const KEY_RETIRED = 'srv-retired';
const KEY_HAND = 'srv-hand';

const FACETS: HarnessFacetMatrix = {
  skills: 'supported',
  commands: 'supported',
  agents: 'unsupported',
  mcp: 'unsupported',
};

/** Raw config entries as a user's JSON file spells them. */
const RAW_SERVERS = {
  [KEY_RETIRED]: { command: 'npx', args: ['retired'] },
  [KEY_HAND]: { command: 'my-own', args: [] },
};

/** Git with no inherited repository location, as the production probe runs it. */
function git(cwd: string, ...args: string[]): void {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['GIT_DIR'];
  delete env['GIT_WORK_TREE'];
  delete env['GIT_INDEX_FILE'];
  execFileSync(
    'git',
    [
      '-c',
      'init.defaultBranch=main',
      '-c',
      'user.name=ptah-test',
      '-c',
      'user.email=ptah-test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, env, stdio: 'ignore' },
  );
}

function grantSkills(
  workspaceRoot: string,
  mode: 'all' | 'selected',
  slugs: string[] = [],
): void {
  const store = new HarnessStateStore();
  store.save(workspaceRoot, {
    ...store.load(workspaceRoot),
    skillSyncMode: mode,
    ...(mode === 'selected' ? { enabledSkillSlugs: slugs } : {}),
  });
}

function writeSkillDir(dir: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: x\n---\n${body}\n`);
}

function cursorHealth(health: HarnessHealth): HarnessTargetHealth {
  const target = health.targets.find((t) => t.target === 'cursor');
  if (target === undefined) throw new Error('cursor target missing');
  return target;
}

describe('HarnessReconcilerService — retirement outcomes (D-2)', () => {
  let tempRoot: string;
  let retiredRoot: string;
  let userLayer: string;
  let store: ManagedManifestStore;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ptah-b24-recon-'));
    retiredRoot = join(tempRoot, 'plugins', ROOT_ID);
    userLayer = join(tempRoot, 'user');
    store = new ManagedManifestStore();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function sourceState(
    overrides: Partial<HarnessSourceState> = {},
  ): HarnessSourceState {
    return {
      layout: {
        skillsRoot: join(userLayer, 'skills'),
        commandsRoot: join(userLayer, 'commands'),
        agentsRoot: join(userLayer, 'agents'),
      },
      overlayPluginPaths: [],
      disabledSkillIds: [],
      disabledPluginIds: [],
      retired: { skillSourceRoots: [retiredRoot] },
      ...overrides,
    };
  }

  function newReconciler(
    state: HarnessSourceState,
    builder = new HarnessManifestBuilder(),
  ): HarnessReconcilerService {
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    return new HarnessReconcilerService(
      logger as unknown as Logger,
      builder,
      store,
      createStaticSourceResolver(state),
      [
        new WorkspaceHarnessTarget({
          id: 'cursor',
          facets: FACETS,
          manifestStore: store,
          detector: { isInstalled: () => Promise.resolve(true) },
          skillsDirRel: '.cursor/skills',
          commandsDirRel: '.cursor/commands',
        }),
      ],
    );
  }

  /** A git workspace with one untracked retired skill copy owned by the manifest. */
  async function seedRetiredSkill(ws: string): Promise<ManagedEntries> {
    const dir = join(ws, ...RETIRED_SKILL.split('/'));
    writeSkillDir(dir, 'retired');
    const hash = await hashDir(dir);
    if (hash === null) throw new Error('fixture copy did not hash');
    return {
      [RETIRED_SKILL]: managedEntry(
        hash,
        join(retiredRoot, 'skills', 'retired-skill'),
        'skill',
      ),
    };
  }

  function newGitWorkspace(name: string): string {
    const ws = join(tempRoot, name);
    mkdirSync(ws, { recursive: true });
    git(ws, 'init', '-q');
    grantSkills(ws, 'all');
    return ws;
  }

  const manifestFile = (ws: string) =>
    join(ws, '.ptah', 'harness', 'cursor.manifest.json');
  const ownedKeys = (ws: string) =>
    Object.keys(store.load(ws, 'cursor').entries).sort();
  const frag = (key: string) => `${MCP_CONFIG}#${key}`;

  it('passes the workspace root to both builder.build calls (verify and reconcile)', async () => {
    const ws = newGitWorkspace('ws');
    const builder = new HarnessManifestBuilder();
    const build = jest.spyOn(builder, 'build');
    const reconciler = newReconciler(sourceState(), builder);

    await reconciler.verify(ws);
    await reconciler.reconcile(ws, { mode: 'full', reason: 'test' });

    expect(build).toHaveBeenCalledTimes(2);
    for (const call of build.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ workspaceRoot: ws }));
    }
  });

  it("activates the workspace skills.sh exemption: this workspace's own root bypasses an empty selection, another workspace's does not", async () => {
    const ws = newGitWorkspace('ws');
    grantSkills(ws, 'selected', []);
    const localRoot = join(ws, '.ptah', 'plugins', 'ptah-skillssh-local');
    const otherRoot = join(
      tempRoot,
      'other-ws',
      '.ptah',
      'plugins',
      'ptah-skillssh-other',
    );
    writeSkillDir(join(localRoot, 'skills', 'local-skill'), 'local');
    writeSkillDir(join(otherRoot, 'skills', 'other-skill'), 'other');
    const reconciler = newReconciler(
      sourceState({ overlayPluginPaths: [localRoot, otherRoot] }),
    );

    const verified = cursorHealth(await reconciler.verify(ws));
    expect(verified.missing).toEqual(['.cursor/skills/local-skill']);

    const health = cursorHealth(
      await reconciler.reconcile(ws, { mode: 'full', reason: 'test' }),
    );
    expect(health.missing).toEqual([]);
    expect(health.found).toBe(1);
    expect(existsSync(join(ws, '.cursor', 'skills', 'local-skill'))).toBe(true);
    expect(existsSync(join(ws, '.cursor', 'skills', 'other-skill'))).toBe(
      false,
    );
  });

  it('mixed pass: one retired skill removed, one kept and disowned, an old MCP row dropped with its config untouched; a second pass is a no-op', async () => {
    const ws = newGitWorkspace('ws');
    const skillEntries = await seedRetiredSkill(ws);

    // A retired copy the user committed: provably tracked, so it must stay.
    const trackedDir = join(ws, ...TRACKED_SKILL.split('/'));
    writeSkillDir(trackedDir, 'tracked');
    git(ws, 'add', '--', TRACKED_SKILL);
    git(ws, 'commit', '-q', '-m', 'track one skill copy');
    const trackedHash = await hashDir(trackedDir);
    if (trackedHash === null) throw new Error('fixture copy did not hash');

    // A shared config file holding a key a pre-P2 pass wrote, plus a hand key.
    mkdirSync(join(ws, '.cursor'), { recursive: true });
    const configBytes = JSON.stringify({ mcpServers: RAW_SERVERS }, null, 2);
    writeFileSync(join(ws, MCP_CONFIG), configBytes);
    store.save(ws, 'cursor', {
      ...skillEntries,
      [TRACKED_SKILL]: managedEntry(
        trackedHash,
        join(retiredRoot, 'skills', 'tracked-skill'),
        'skill',
      ),
      [frag(KEY_RETIRED)]: managedEntry(
        'hash-retired',
        `registry/${KEY_RETIRED}`,
        'mcp',
      ),
    });

    const reconciler = newReconciler(sourceState());

    // Pass 1 — the skill outcomes; the MCP row produces none.
    const first = await reconciler.reconcile(ws, {
      mode: 'full',
      reason: 'pass-1',
    });
    const t1 = cursorHealth(first);
    expect(t1.removedRetired).toEqual([
      { relPath: RETIRED_SKILL, itemId: SKILL_ITEM },
    ]);
    expect(t1.removed).toEqual([RETIRED_SKILL]);
    expect(t1.keptRetired).toEqual([
      { relPath: TRACKED_SKILL, itemId: SKILL_ITEM, reason: 'git-tracked' },
    ]);
    expect(t1.writeFailed).toEqual([]);
    // Ledger keys: one identity per path, under this workspace root.
    expect(
      (t1.removedRetired ?? []).map((row) =>
        harnessPathIdentity(first.workspaceRoot, row.relPath),
      ),
    ).toEqual([harnessPathIdentity(ws, RETIRED_SKILL)]);

    // Disk: deleted only what was proven; kept copies and the config untouched.
    expect(existsSync(join(ws, ...RETIRED_SKILL.split('/')))).toBe(false);
    expect(existsSync(join(trackedDir, 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(ws, MCP_CONFIG), 'utf-8')).toBe(configBytes);
    // Manifest: removed and disowned entries gone, the MCP row dropped (D1).
    expect(ownedKeys(ws)).toEqual([]);
    expect(readFileSync(manifestFile(ws), 'utf-8')).not.toContain(
      frag(KEY_RETIRED),
    );

    // Pass 2 — nothing owned is retired any more: no outcome, no manifest write.
    const manifestBefore = readFileSync(manifestFile(ws), 'utf-8');
    const t2 = cursorHealth(
      await reconciler.reconcile(ws, { mode: 'full', reason: 'pass-2' }),
    );
    expect(t2.removed).toEqual([]);
    expect(t2.removedRetired).toEqual([]);
    expect(t2.keptRetired).toEqual([]);
    expect(t2.writeFailed).toEqual([]);
    expect(readFileSync(manifestFile(ws), 'utf-8')).toBe(manifestBefore);
    expect(existsSync(join(trackedDir, 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(ws, MCP_CONFIG), 'utf-8')).toBe(configBytes);
  });

  it('late-discovered workspace: a workspace first reconciled after the retirement gets its own copies proven and removed, under its own identity', async () => {
    const wsA = newGitWorkspace('ws-a');
    const wsB = newGitWorkspace('ws-b');
    store.save(wsA, 'cursor', await seedRetiredSkill(wsA));
    store.save(wsB, 'cursor', await seedRetiredSkill(wsB));
    const reconciler = newReconciler(sourceState());

    const healthA = await reconciler.reconcile(wsA, {
      mode: 'full',
      reason: 'open-a',
    });
    expect(cursorHealth(healthA).removedRetired).toEqual([
      { relPath: RETIRED_SKILL, itemId: SKILL_ITEM },
    ]);
    // Workspace B has not been opened yet: nothing of it was touched.
    expect(existsSync(join(wsB, ...RETIRED_SKILL.split('/')))).toBe(true);
    expect(ownedKeys(wsB)).toEqual([RETIRED_SKILL]);

    const healthB = await reconciler.reconcile(wsB, {
      mode: 'full',
      reason: 'open-b-later',
    });
    const tB = cursorHealth(healthB);
    expect(tB.removedRetired).toEqual([
      { relPath: RETIRED_SKILL, itemId: SKILL_ITEM },
    ]);
    expect(existsSync(join(wsB, ...RETIRED_SKILL.split('/')))).toBe(false);
    expect(ownedKeys(wsB)).toEqual([]);

    // Same item, same relPath, two distinct ledger paths.
    const identities = [healthA, healthB].map((health) =>
      harnessPathIdentity(health.workspaceRoot, RETIRED_SKILL),
    );
    expect(identities).toEqual([
      harnessPathIdentity(wsA, RETIRED_SKILL),
      harnessPathIdentity(wsB, RETIRED_SKILL),
    ]);
  });

  it('without a retired registry an orphaned copy is an ordinary removal with no retirement outcome', async () => {
    const ws = newGitWorkspace('ws');
    store.save(ws, 'cursor', await seedRetiredSkill(ws));
    const reconciler = newReconciler(sourceState({ retired: undefined }));

    const t = cursorHealth(
      await reconciler.reconcile(ws, { mode: 'full', reason: 'test' }),
    );
    expect(t.removed).toEqual([RETIRED_SKILL]);
    expect(t.removedRetired).toEqual([]);
    expect(t.keptRetired).toEqual([]);
  });
});
