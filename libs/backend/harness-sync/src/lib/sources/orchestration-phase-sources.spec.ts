import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOrchestrationPhaseSources } from './orchestration-phase-sources';
import { hashDir } from '../hash/content-hash';
import { emptyManifest, managedEntry } from '../manifest-store/managed-manifest';
import type { HarnessSourceState } from './harness-source.port';
import type { SkillSyncDecision } from '../state/skill-sync-gate';

describe('createOrchestrationPhaseSources', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ptah-orchestration-sources-'));
  const workspaceRoot = join(tempRoot, 'workspace');
  const userSkillsRoot = join(tempRoot, 'user', 'skills');
  const pluginsRoot = join(tempRoot, 'plugins');
  const skillRoot = join(workspaceRoot, '.claude', 'skills', 'orchestration');
  const source: HarnessSourceState = {
    layout: { skillsRoot: userSkillsRoot, commandsRoot: join(tempRoot, 'commands'), agentsRoot: join(tempRoot, 'agents') },
    overlayPluginPaths: [],
    disabledSkillIds: [],
    disabledPluginIds: [],
  };
  let selection: SkillSyncDecision = { mode: 'all', slugs: [], derived: false };
  const manifest = emptyManifest('claude');
  const policy = createOrchestrationPhaseSources({
    resolveWorkspaceRoot: () => workspaceRoot,
    userSkillsRoot,
    pluginsRoot,
    sourceResolver: { resolve: () => source },
    skillSyncGate: { resolve: () => selection },
    manifestStore: { load: () => manifest },
  });

  beforeEach(() => {
    source.policyUnknown = false;
    source.disabledSkillIds = [];
    source.disabledPluginIds = [];
    selection = { mode: 'all', slugs: [], derived: false };
    manifest.entries = {};
    rmSync(skillRoot, { recursive: true, force: true });
  });
  afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

  it('throws when policy is unknown', async () => {
    source.policyUnknown = true;
    await expect(policy.isCloneActive()).rejects.toThrow('Skill policy unavailable');
  });

  it('rejects a disabled skill', async () => {
    source.disabledSkillIds = ['orchestration'];
    await expect(policy.isCloneActive()).resolves.toBe(false);
  });

  it('rejects an unselected skill', async () => {
    selection = { mode: 'selected', slugs: [], derived: false };
    await expect(policy.isCloneActive()).resolves.toBe(false);
  });

  it('does not own an unmodified manifest-managed workspace entry', async () => {
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(skillRoot, 'SKILL.md'), 'original');
    const hash = await hashDir(skillRoot);
    if (hash === null) throw new Error('Expected skill directory hash');
    manifest.entries['.claude/skills/orchestration'] = managedEntry(hash, userSkillsRoot, 'skill');
    await expect(policy.isWorkspaceOwned(skillRoot)).resolves.toBe(false);
  });

  it('owns an edited manifest-managed workspace entry', async () => {
    mkdirSync(skillRoot, { recursive: true });
    const skillFile = join(skillRoot, 'SKILL.md');
    writeFileSync(skillFile, 'original');
    const hash = await hashDir(skillRoot);
    if (hash === null) throw new Error('Expected skill directory hash');
    manifest.entries['.claude/skills/orchestration'] = managedEntry(hash, userSkillsRoot, 'skill');
    writeFileSync(skillFile, 'workspace edit');
    await expect(policy.isWorkspaceOwned(skillRoot)).resolves.toBe(true);
  });

  it('owns a plain workspace folder', async () => {
    mkdirSync(skillRoot, { recursive: true });
    expect(policy.workspaceSkillsRoot()).toBe(join(workspaceRoot, '.claude', 'skills'));
    await expect(policy.isWorkspaceOwned(skillRoot)).resolves.toBe(true);
  });

  it('does not own a symlink into the user skills root', async () => {
    const target = join(userSkillsRoot, 'orchestration');
    mkdirSync(target, { recursive: true });
    mkdirSync(join(workspaceRoot, '.claude', 'skills'), { recursive: true });
    symlinkSync(target, skillRoot, 'junction');
    await expect(policy.isWorkspaceOwned(skillRoot)).resolves.toBe(false);
  });

  it('does not own a symlink into the plugins root', async () => {
    const target = join(pluginsRoot, 'ptah-core', 'skills', 'orchestration');
    mkdirSync(target, { recursive: true });
    mkdirSync(join(workspaceRoot, '.claude', 'skills'), { recursive: true });
    try {
      symlinkSync(target, skillRoot, 'junction');
    } catch (error: unknown) {
      if (process.platform === 'win32' && error instanceof Error && 'code' in error && error.code === 'EPERM') return;
      throw error;
    }
    await expect(policy.isWorkspaceOwned(skillRoot)).resolves.toBe(false);
  });
});
