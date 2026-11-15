/**
 * Retiring a manifest-owned rival-CLI copy never loses a hand edit
 * (TASK_2026_609).
 *
 * Routine reconciliation keeps managed agent copies when their source leaves
 * the desired state. Explicit uninstall and skill retirement still use the
 * snapshot policy before removing a hand-edited copy.
 *
 * Source-under-test: `WorkspaceHarnessTarget.apply` via the real
 * `HarnessReconcilerService`, with the real Codex and Copilot targets. The
 * retirement rule itself (detach, then decide) is `targets/artifact-retirement`.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import type {
  HarnessHealth,
  HarnessTargetHealth,
  HarnessTargetId,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { HarnessStateStore } from '../gitignore/harness-state-store';
import { HarnessManifestBuilder } from '../manifest/harness-manifest.builder';
import { ManagedManifestStore } from '../manifest-store/managed-manifest';
import { createStaticSourceResolver } from '../sources/plugin-config-source-resolver';
import type {
  HarnessSourceState,
  IHarnessCliDetector,
} from '../sources/harness-source.port';
import {
  createCodexTarget,
  createCopilotTarget,
} from '../targets/rival-targets';
import { HarnessReconcilerService } from './harness-reconciler.service';

// Every home lookup lands in the per-test temp home, never the real one.
jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn(),
}));

function fakeLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

function detectorFor(installed: HarnessTargetId[]): IHarnessCliDetector {
  const set = new Set(installed);
  return { isInstalled: (target) => Promise.resolve(set.has(target)) };
}

describe('HarnessReconcilerService — retiring a hand-edited copy (TASK_2026_609)', () => {
  let ws: string;
  let sourcesRoot: string;
  let home: string;

  const CODEX_ONE = '.codex/agents/agent-one.toml';
  const CODEX_TWO = '.codex/agents/agent-two.toml';
  const COPILOT_ONE = '.github/agents/agent-one.agent.md';
  const COPILOT_TWO = '.github/agents/agent-two.agent.md';
  const HISTORY = '.ptah/harness/.history';
  let savedCodexHome: string | undefined;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'harness-retire-ws-'));
    sourcesRoot = mkdtempSync(join(tmpdir(), 'harness-retire-src-'));
    home = mkdtempSync(join(tmpdir(), 'harness-retire-home-'));
    jest.mocked(homedir).mockReturnValue(tmpdir());
    savedCodexHome = process.env['CODEX_HOME'];
    delete process.env['CODEX_HOME'];
    mkdirSync(join(sourcesRoot, 'skills'), { recursive: true });
    writeAgentSources('agent-one', 'agent-two');
    new HarnessStateStore().save(ws, {
      version: 1,
      agentSyncEnabled: true,
      skillSyncMode: 'all',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedCodexHome === undefined) delete process.env['CODEX_HOME'];
    else process.env['CODEX_HOME'] = savedCodexHome;
    for (const dir of [ws, sourcesRoot, home]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------- fixtures

  function writeAgentSources(...slugs: string[]): void {
    const agentsRoot = join(ws, '.claude', 'agents');
    mkdirSync(agentsRoot, { recursive: true });
    for (const slug of slugs) {
      writeFileSync(
        join(agentsRoot, `${slug}.md`),
        `---\nname: ${slug}\ndescription: the ${slug} agent\n---\n${slug} instructions\n`,
        'utf-8',
      );
    }
  }

  function deleteAgentSource(slug: string): void {
    rmSync(join(ws, '.claude', 'agents', `${slug}.md`), { force: true });
  }

  function writeSkillSource(slug: string): void {
    const dir = join(sourcesRoot, 'skills', slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      `---\nname: ${slug}\ndescription: the ${slug} skill\n---\n${slug} body\n`,
      'utf-8',
    );
  }

  function newReconciler(
    disabledAgentIds: string[] = [],
  ): HarnessReconcilerService {
    const store = new ManagedManifestStore();
    const deps = {
      manifestStore: store,
      detector: detectorFor(['codex', 'copilot']),
      homeDir: home,
    };
    const state: HarnessSourceState = {
      layout: {
        skillsRoot: join(sourcesRoot, 'skills'),
        commandsRoot: join(sourcesRoot, 'commands'),
        agentsRoot: join(sourcesRoot, 'agents'),
      },
      overlayPluginPaths: [],
      disabledSkillIds: [],
      disabledPluginIds: [],
      disabledAgentIds,
    };
    return new HarnessReconcilerService(
      fakeLogger(),
      new HarnessManifestBuilder(),
      store,
      createStaticSourceResolver(state),
      [createCodexTarget(deps), createCopilotTarget(deps)],
    );
  }

  function reconcile(
    disabledAgentIds: string[] = [],
    reason = 'test pass',
  ): Promise<HarnessHealth> {
    return newReconciler(disabledAgentIds).reconcile(ws, {
      mode: 'full',
      reason,
    });
  }

  // ----------------------------------------------------------------- probes

  function abs(relPath: string): string {
    return join(ws, ...relPath.split('/'));
  }

  function exists(relPath: string): boolean {
    return existsSync(abs(relPath));
  }

  function read(relPath: string): string {
    return readFileSync(abs(relPath), 'utf-8');
  }

  function row(
    health: HarnessHealth,
    id: HarnessTargetId,
  ): HarnessTargetHealth {
    const found = health.targets.find((target) => target.target === id);
    if (found === undefined) throw new Error(`no health row for ${id}`);
    return found;
  }

  function ownedPaths(id: HarnessTargetId): string[] {
    return Object.keys(new ManagedManifestStore().load(ws, id).entries);
  }

  /** `<ts>` directories under `.ptah/harness/.history/<slug>`, sorted. */
  function snapshotStamps(slug: string): string[] {
    const dir = abs(`${HISTORY}/${slug}`);
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  // ------------------------------------------------------------------ cases

  it('1. a managed copy remains after its workspace source is deleted', async () => {
    await reconcile();
    const original = read(CODEX_TWO);
    deleteAgentSource('agent-two');
    const health = await reconcile();
    expect(read(CODEX_TWO)).toBe(original);
    expect(row(health, 'codex').removed).not.toContain(CODEX_TWO);
    expect(ownedPaths('codex')).toContain(CODEX_TWO);
    expect(exists(HISTORY)).toBe(false);
  });

  it('clears a stale claim when an undesired agent copy is already missing', async () => {
    await reconcile();
    deleteAgentSource('agent-two');
    rmSync(abs(CODEX_TWO), { force: true });
    const health = await reconcile();
    expect(row(health, 'codex').keptLocalEdit).not.toContain(CODEX_TWO);
    expect(ownedPaths('codex')).not.toContain(CODEX_TWO);
    expect(exists(COPILOT_TWO)).toBe(true);
  });

  it('2. a hand-edited managed copy remains after source deletion', async () => {
    await reconcile();
    writeFileSync(abs(CODEX_TWO), 'HAND EDITED', 'utf-8');
    deleteAgentSource('agent-two');
    const health = await reconcile();
    expect(read(CODEX_TWO)).toBe('HAND EDITED');
    expect(row(health, 'codex').removedLocalEdit).toEqual([]);
    expect(ownedPaths('codex')).toContain(CODEX_TWO);
    expect(exists(COPILOT_TWO)).toBe(true);
    expect(snapshotStamps('agent-two')).toEqual([]);
  });

  it('3. disabling a user agent keeps its managed copy pending retirement consent', async () => {
    await reconcile();
    writeFileSync(abs(CODEX_TWO), 'HAND EDITED', 'utf-8');
    const health = await reconcile(['agent-two'], 'agent-two disabled');
    expect(read(CODEX_TWO)).toBe('HAND EDITED');
    expect(row(health, 'codex').removed).not.toContain(CODEX_TWO);
    expect(ownedPaths('codex')).toContain(CODEX_TWO);
    expect(exists(CODEX_ONE)).toBe(true);
    expect(exists(COPILOT_ONE)).toBe(true);
    expect(snapshotStamps('agent-two')).toEqual([]);
  });

  it('4. explicit uninstall keeps an unreadable agent copy owned', async () => {
    await reconcile();
    rmSync(abs(CODEX_TWO), { force: true });
    mkdirSync(abs(CODEX_TWO));
    writeFileSync(join(abs(CODEX_TWO), 'inner.txt'), 'something', 'utf-8');
    const health = await newReconciler().remove(ws);
    expect(read(`${CODEX_TWO}/inner.txt`)).toBe('something');
    expect(row(health, 'codex').writeFailed).toEqual(expect.arrayContaining([
      expect.objectContaining({ relPath: CODEX_TWO, reason: expect.stringContaining('cannot read to check for local edits') }),
    ]));
    expect(ownedPaths('codex')).toContain(CODEX_TWO);
    expect(snapshotStamps('agent-two')).toEqual([]);
  });

  it('5. explicit uninstall keeps a hand-edited agent owned when history is unavailable', async () => {
    await reconcile();
    writeFileSync(abs(CODEX_TWO), 'HAND EDITED', 'utf-8');
    writeFileSync(abs(HISTORY), 'not a directory', 'utf-8');
    const health = await newReconciler().remove(ws);
    expect(read(CODEX_TWO)).toBe('HAND EDITED');
    expect(row(health, 'codex').removed).not.toContain(CODEX_TWO);
    expect(ownedPaths('codex')).toContain(CODEX_TWO);
    expect(row(health, 'codex').writeFailed).toEqual(expect.arrayContaining([
      expect.objectContaining({ relPath: CODEX_TWO }),
    ]));
    expect(exists(COPILOT_TWO)).toBe(true);
    expect(read(HISTORY)).toBe('not a directory');
  });

  it('6. a rival skill directory: unchanged is removed plainly (A8), hand-edited is snapshotted whole, then removed', async () => {
    writeSkillSource('kept-as-is');
    writeSkillSource('tuned');
    await reconcile();
    const UNCHANGED = '.agents/skills/kept-as-is';
    const EDITED = '.agents/skills/tuned';
    expect(exists(`${UNCHANGED}/SKILL.md`)).toBe(true);
    expect(exists(`${EDITED}/SKILL.md`)).toBe(true);
    const writtenSkill = read(`${EDITED}/SKILL.md`);
    writeFileSync(abs(`${EDITED}/NOTES.md`), 'my notes', 'utf-8');

    rmSync(join(sourcesRoot, 'skills', 'kept-as-is'), { recursive: true });
    rmSync(join(sourcesRoot, 'skills', 'tuned'), { recursive: true });
    const health = await reconcile();

    const codex = row(health, 'codex');
    // A8: the hash the write branch recorded equals `hashDir` of the copy on
    // disk, so an untouched transformed skill is NOT mistaken for a local edit.
    expect(exists(UNCHANGED)).toBe(false);
    expect(codex.removed).toContain(UNCHANGED);
    expect(codex.removedLocalEdit).not.toContain(UNCHANGED);
    expect(snapshotStamps('kept-as-is')).toEqual([]);
    expect(row(health, 'copilot').removedLocalEdit).toEqual([]);

    expect(exists(EDITED)).toBe(false);
    expect(codex.removed).toContain(EDITED);
    expect(codex.removedLocalEdit).toEqual([EDITED]);
    const stamps = snapshotStamps('tuned');
    expect(stamps).toHaveLength(1);
    const saved = `${HISTORY}/tuned/${stamps[0]}/${EDITED}`;
    expect(read(`${saved}/NOTES.md`)).toBe('my notes');
    expect(read(`${saved}/SKILL.md`)).toBe(writtenSkill);
  });

  it('7. the explicit uninstall pass (E22) snapshots a hand-edited copy and reports it on that target row', async () => {
    await reconcile();
    writeFileSync(abs(CODEX_ONE), 'HAND EDITED ONE', 'utf-8');

    const health = await newReconciler().remove(ws);

    expect(exists(CODEX_ONE)).toBe(false);
    expect(exists(CODEX_TWO)).toBe(false);
    const codex = row(health, 'codex');
    expect(codex.removed).toEqual(
      expect.arrayContaining([CODEX_ONE, CODEX_TWO]),
    );
    expect(codex.removedLocalEdit).toEqual([CODEX_ONE]);
    expect(row(health, 'copilot').removedLocalEdit).toEqual([]);
    const stamps = snapshotStamps('agent-one');
    expect(stamps).toHaveLength(1);
    expect(read(`${HISTORY}/agent-one/${stamps[0]}/${CODEX_ONE}`)).toBe(
      'HAND EDITED ONE',
    );
    expect(ownedPaths('codex')).toEqual([]);
  });

  it('8. explicit uninstall snapshots edits to the same slug in two targets', async () => {
    await reconcile();
    writeFileSync(abs(CODEX_TWO), 'CODEX EDIT', 'utf-8');
    writeFileSync(abs(COPILOT_TWO), 'COPILOT EDIT', 'utf-8');
    const health = await newReconciler().remove(ws);
    expect(exists(CODEX_TWO)).toBe(false);
    expect(exists(COPILOT_TWO)).toBe(false);
    expect(row(health, 'codex').removedLocalEdit).toContain(CODEX_TWO);
    expect(row(health, 'copilot').removedLocalEdit).toContain(COPILOT_TWO);
    const stamps = snapshotStamps('agent-two');
    expect(stamps).toHaveLength(2);
    expect(stamps.map((stamp) => `${HISTORY}/agent-two/${stamp}/${CODEX_TWO}`).filter(exists).map(read)).toEqual(['CODEX EDIT']);
    expect(stamps.map((stamp) => `${HISTORY}/agent-two/${stamp}/${COPILOT_TWO}`).filter(exists).map(read)).toEqual(['COPILOT EDIT']);
  });

  it('9. repeated passes preserve managed copies without history snapshots', async () => {
    await reconcile();
    writeFileSync(abs(CODEX_TWO), 'HAND EDITED', 'utf-8');
    deleteAgentSource('agent-two');
    await reconcile();
    const next = await reconcile();
    expect(read(CODEX_TWO)).toBe('HAND EDITED');
    expect(ownedPaths('codex')).toContain(CODEX_TWO);
    expect(snapshotStamps('agent-two')).toEqual([]);
    for (const target of next.targets) {
      expect(target.removed).toEqual([]);
      expect(target.removedLocalEdit).toEqual([]);
    }
  });

  it('10. F1: a skill whose SKILL.md is untouched but which holds the only copy of .history/notes.md is kept, notes included', async () => {
    writeSkillSource('tuned');
    await reconcile();
    const SKILL = '.agents/skills/tuned';
    mkdirSync(abs(`${SKILL}/.history`), { recursive: true });
    writeFileSync(abs(`${SKILL}/.history/notes.md`), 'only copy', 'utf-8');

    rmSync(join(sourcesRoot, 'skills', 'tuned'), { recursive: true });
    const health = await reconcile();

    const codex = row(health, 'codex');
    expect(exists(SKILL)).toBe(false);
    expect(codex.removed).toContain(SKILL);
    expect(codex.removedLocalEdit).toEqual([SKILL]);
    expect(codex.writeFailed).toEqual([]);
    expect(ownedPaths('codex')).not.toContain(SKILL);
    const stamps = snapshotStamps('tuned');
    expect(stamps).toHaveLength(1);
    expect(
      read(`${HISTORY}/tuned/${stamps[0]}/${SKILL}/.history/notes.md`),
    ).toBe('only copy');
  });

  it('11. F1: a _candidates entry and a symlink inside an otherwise unchanged skill are kept; the link is not followed', async () => {
    writeSkillSource('tuned');
    await reconcile();
    const SKILL = '.agents/skills/tuned';
    mkdirSync(abs(`${SKILL}/_candidates`), { recursive: true });
    writeFileSync(abs(`${SKILL}/_candidates/draft.md`), 'a draft', 'utf-8');
    const outside = mkdtempSync(join(tmpdir(), 'harness-retire-outside-'));
    try {
      writeFileSync(join(outside, 'precious.md'), 'outside bytes', 'utf-8');
      symlinkSync(outside, abs(`${SKILL}/linked`), 'junction');

      rmSync(join(sourcesRoot, 'skills', 'tuned'), { recursive: true });
      const health = await reconcile();

      expect(exists(SKILL)).toBe(false);
      expect(row(health, 'codex').removedLocalEdit).toEqual([SKILL]);
      const stamps = snapshotStamps('tuned');
      expect(stamps).toHaveLength(1);
      const saved = `${HISTORY}/tuned/${stamps[0]}/${SKILL}`;
      expect(read(`${saved}/_candidates/draft.md`)).toBe('a draft');
      expect(lstatSync(abs(`${saved}/linked`)).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(outside, 'precious.md'), 'utf-8')).toBe(
        'outside bytes',
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('12. a missing source leaves a managed agent copy unchanged on routine passes', async () => {
    await reconcile();
    const original = read(CODEX_TWO);
    deleteAgentSource('agent-two');
    const health = await reconcile();
    expect(read(CODEX_TWO)).toBe(original);
    expect(row(health, 'codex').removed).not.toContain(CODEX_TWO);
    expect(ownedPaths('codex')).toContain(CODEX_TWO);
    expect(snapshotStamps('agent-two')).toEqual([]);
  });
});
