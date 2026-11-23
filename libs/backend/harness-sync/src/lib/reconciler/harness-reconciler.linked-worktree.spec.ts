/**
 * #1469, live-review LR1 — a full reconcile in a linked git worktree rewrites
 * no git-tracked file.
 *
 * The live finding: opening Ptah on a worktree rebuilt the tracked
 * `.gitignore` managed block from the CLIs detected in THAT pass, and one
 * target read as undetected, so its line dropped out and the task branch
 * carried an uncommitted `.gitignore` diff. The same rebuild in the main
 * checkout is intended and stays (the control case below).
 *
 * The second case covers the same rule for a tracked skill copy: a source
 * change updates the copy in the main checkout, but never in a worktree.
 *
 * Fixtures are real: a `git init` repository with a commit, a real
 * `git worktree add`, real targets and the real `.gitignore` writer.
 */

import { execFileSync } from 'child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Logger } from '@ptah-extension/vscode-core';
import { ClaudeTarget } from '../targets/claude-target';
import { createCodexTarget } from '../targets/rival-targets';
import { createStaticSourceResolver } from '../sources/plugin-config-source-resolver';
import type { HarnessSourceState } from '../sources/harness-source.port';
import { HarnessManifestBuilder } from '../manifest/harness-manifest.builder';
import { ManagedManifestStore } from '../manifest-store/managed-manifest';
import { HarnessGitignoreWriter } from '../gitignore/gitignore-writer';
import { HarnessStateStore } from '../gitignore/harness-state-store';
import { HarnessReconcilerService } from './harness-reconciler.service';

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

function fakeLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

/** Skills are gated per workspace; these fixtures opt in up front. */
function grantSkillSync(workspaceRoot: string): void {
  const store = new HarnessStateStore();
  store.save(workspaceRoot, {
    ...store.load(workspaceRoot),
    skillSyncMode: 'all',
  });
}

const SKILL_REL = join('.claude', 'skills', 'foo', 'SKILL.md');

describe('HarnessReconcilerService — linked git worktree (#1469, LR1)', () => {
  let tempRoot: string;
  let repo: string;
  let worktree: string;
  let sourcesRoot: string;
  let home: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ptah-lr1-'));
    repo = join(tempRoot, 'repo');
    worktree = join(tempRoot, 'wt');
    sourcesRoot = join(tempRoot, 'sources');
    home = join(tempRoot, 'home');
    mkdirSync(repo);
    mkdirSync(home);
    writeSource('v1');
    git(repo, ['init', '-q']);
    // `.ptah/` holds Ptah's own manifests and state; the real repository
    // ignores it the same way.
    writeFileSync(join(repo, '.gitignore'), '.ptah/\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function writeSource(body: string): void {
    const dir = join(sourcesRoot, 'skills', 'foo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      `---\nname: foo\n---\n${body}\n`,
      'utf-8',
    );
  }

  function sourceState(): HarnessSourceState {
    return {
      layout: {
        skillsRoot: join(sourcesRoot, 'skills'),
        commandsRoot: join(sourcesRoot, 'commands'),
        agentsRoot: join(sourcesRoot, 'agents'),
      },
      overlayPluginPaths: [],
      disabledSkillIds: [],
      disabledPluginIds: [],
      mcpIntents: [],
    };
  }

  function reconciler(codexInstalled: boolean): HarnessReconcilerService {
    const logger = fakeLogger();
    const store = new ManagedManifestStore(() => undefined);
    const detector = {
      isInstalled: (id: string) =>
        Promise.resolve(id === 'codex' ? codexInstalled : false),
    };
    return new HarnessReconcilerService(
      logger,
      new HarnessManifestBuilder(),
      store,
      createStaticSourceResolver(sourceState()),
      [
        new ClaudeTarget(store),
        createCodexTarget({ manifestStore: store, detector, homeDir: home }),
      ],
      new HarnessGitignoreWriter(logger),
    );
  }

  async function fullPass(root: string, codexInstalled: boolean) {
    await reconciler(codexInstalled).reconcile(root, {
      mode: 'full',
      reason: 'spec',
    });
  }

  /** Main checkout: a pass with Codex detected writes the managed block. */
  async function commitManagedBlock(): Promise<string> {
    await fullPass(repo, true);
    const text = readFileSync(join(repo, '.gitignore'), 'utf-8');
    expect(text).toContain('# ptah:harness:begin');
    expect(text).toContain('.agents/skills/');
    git(repo, ['add', '.gitignore']);
    git(repo, ['commit', '-q', '-m', 'init']);
    return text;
  }

  it('leaves the tracked .gitignore byte-identical when a target reads undetected', async () => {
    await commitManagedBlock();
    git(repo, ['worktree', 'add', '-q', '-b', 'task', worktree]);
    const before = readFileSync(join(worktree, '.gitignore'));

    // Codex undetected: the main checkout would drop `.agents/skills/`.
    await fullPass(worktree, false);

    expect(readFileSync(join(worktree, '.gitignore')).equals(before)).toBe(
      true,
    );
    expect(git(worktree, ['status', '--porcelain', '--', '.gitignore'])).toBe(
      '',
    );
  });

  it('still rebuilds the block in the main checkout (control)', async () => {
    const committed = await commitManagedBlock();

    await fullPass(repo, false);

    const after = readFileSync(join(repo, '.gitignore'), 'utf-8');
    expect(after).not.toBe(committed);
    expect(after).not.toContain('.agents/skills/');
  });

  it('does not update a tracked skill copy in a worktree, but does in the main checkout', async () => {
    grantSkillSync(repo);
    await fullPass(repo, false);
    const v1 = readFileSync(join(repo, SKILL_REL), 'utf-8');
    expect(v1).toContain('v1');
    git(repo, ['add', '-f', '--', '.gitignore', '.claude/skills/foo']);
    git(repo, ['commit', '-q', '-m', 'init']);
    git(repo, ['worktree', 'add', '-q', '-b', 'task', worktree]);

    // First worktree pass adopts the byte-identical tracked copy.
    grantSkillSync(worktree);
    await fullPass(worktree, false);
    expect(readFileSync(join(worktree, SKILL_REL), 'utf-8')).toBe(v1);

    // The source changes: the worktree's tracked copy must not follow.
    writeSource('v2');
    await fullPass(worktree, false);
    expect(readFileSync(join(worktree, SKILL_REL), 'utf-8')).toBe(v1);
    expect(git(worktree, ['status', '--porcelain', '--', '.claude'])).toBe('');

    // A later pass finds the path unowned and different: still untouched.
    await fullPass(worktree, false);
    expect(readFileSync(join(worktree, SKILL_REL), 'utf-8')).toBe(v1);

    // The main checkout is where the copy changes.
    await fullPass(repo, false);
    expect(readFileSync(join(repo, SKILL_REL), 'utf-8')).toContain('v2');
  });
});
