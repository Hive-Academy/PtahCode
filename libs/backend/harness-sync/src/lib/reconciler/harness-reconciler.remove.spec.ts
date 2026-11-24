/**
 * `HarnessReconcilerService.remove()` — the explicit uninstall path (E22).
 *
 * Bounded strictly by the manifest: a foreign skill directory the user made by
 * hand, the user's own `.mcp.json`, and the user-layer source directories all
 * survive. Only what Ptah's own manifests say it owns is deleted, across every
 * target. A pre-P2 `kind: 'mcp'` manifest row produces no removal: it is
 * dropped on load and the config entry it named stays (TASK_2026_979, parity
 * row 23, D-U5).
 *
 * Source-under-test: `HarnessReconcilerService.remove` + `ClaudeTarget` +
 * `createCodexTarget`.
 */

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
import type { Logger } from '@ptah-extension/vscode-core';
import { ClaudeTarget } from '../targets/claude-target';
import { createCodexTarget } from '../targets/rival-targets';
import { createStaticSourceResolver } from '../sources/plugin-config-source-resolver';
import type { HarnessSourceState } from '../sources/harness-source.port';
import { HarnessManifestBuilder } from '../manifest/harness-manifest.builder';
import { HarnessReconcilerService } from './harness-reconciler.service';
import {
  managedEntry,
  ManagedManifestStore,
} from '../manifest-store/managed-manifest';
import { HarnessStateStore } from '../gitignore/harness-state-store';

/**
 * Skills are gated per workspace since TASK_2026_316, and a fresh temp
 * workspace has no manifest evidence, so the migration correctly gates it. This
 * suite predates the gate and is about E22 uninstall, so the selection is
 * recorded up front rather than re-tested. The gate itself is owned by
 * `reconciler/harness-reconciler.skill-consent.spec.ts`.
 */
function grantSkillSync(workspaceRoot: string): void {
  const store = new HarnessStateStore();
  store.save(workspaceRoot, {
    ...store.load(workspaceRoot),
    skillSyncMode: 'all',
  });
}

interface FakeLogger {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
}

function makeFakeLogger(): FakeLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function writeSkill(skillsRoot: string, slug: string): void {
  const dir = join(skillsRoot, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${slug}\n---\nbody\n`,
    'utf-8',
  );
}

function writeCommand(commandsRoot: string, name: string): void {
  mkdirSync(commandsRoot, { recursive: true });
  writeFileSync(join(commandsRoot, `${name}.md`), `command ${name}`, 'utf-8');
}

describe('HarnessReconcilerService.remove (E22)', () => {
  let ws: string;
  let sourcesRoot: string;
  let tempHome: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'harness-sync-removeall-ws-'));
    grantSkillSync(ws);
    sourcesRoot = mkdtempSync(join(tmpdir(), 'harness-sync-removeall-src-'));
    tempHome = mkdtempSync(join(tmpdir(), 'harness-sync-removeall-home-'));
  });

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
    rmSync(sourcesRoot, { recursive: true, force: true });
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('[E22] removes every manifest-owned artifact across every target, leaving foreign artifacts and the user layer untouched', async () => {
    const skillsRoot = join(sourcesRoot, 'skills');
    const commandsRoot = join(sourcesRoot, 'commands');
    writeSkill(skillsRoot, 'foo');
    writeCommand(commandsRoot, 'baz');

    const sourceState: HarnessSourceState = {
      layout: {
        skillsRoot,
        commandsRoot,
        agentsRoot: join(sourcesRoot, 'agents'),
      },
      overlayPluginPaths: [],
      disabledSkillIds: [],
      disabledPluginIds: [],
    };

    const logger = makeFakeLogger();
    const store = new ManagedManifestStore((message, detail) =>
      logger.warn(message, detail),
    );
    const detector = { isInstalled: () => Promise.resolve(true) };
    const reconciler = new HarnessReconcilerService(
      logger as unknown as Logger,
      new HarnessManifestBuilder(),
      store,
      createStaticSourceResolver(sourceState),
      [
        new ClaudeTarget(store),
        createCodexTarget({
          manifestStore: store,
          detector,
          homeDir: tempHome,
        }),
      ],
    );

    await reconciler.reconcile(ws, { mode: 'full', reason: 'seed' });

    const claudeSkillDir = join(ws, '.claude', 'skills', 'foo');
    const claudeCommandFile = join(ws, '.claude', 'commands', 'baz.md');
    const codexSkillDir = join(ws, '.agents', 'skills', 'foo');
    const mcpConfigPath = join(ws, '.mcp.json');
    expect(existsSync(claudeSkillDir)).toBe(true);
    expect(existsSync(claudeCommandFile)).toBe(true);
    expect(existsSync(codexSkillDir)).toBe(true);
    // No target writes MCP config (TASK_2026_979, decision row 10).
    expect(existsSync(mcpConfigPath)).toBe(false);

    // Foreign skill the user made by hand, right next to Ptah's own.
    const foreignSkillDir = join(ws, '.claude', 'skills', 'mine');
    mkdirSync(foreignSkillDir, { recursive: true });
    const foreignSkillFile = join(foreignSkillDir, 'SKILL.md');
    const foreignSkillContent =
      "---\nname: mine\n---\nmy own skill, not Ptah's\n";
    writeFileSync(foreignSkillFile, foreignSkillContent, 'utf-8');

    // The user's `.mcp.json`: `github` was written by a pre-P2 pass, and a
    // pre-P2 manifest row still names it; `myown` the user added by hand.
    const mcpConfigContent = `${JSON.stringify(
      {
        mcpServers: {
          github: { command: 'npx', args: ['-y', 'gh-mcp'] },
          myown: { command: 'node', args: ['own-server.js'] },
        },
      },
      null,
      2,
    )}\n`;
    writeFileSync(mcpConfigPath, mcpConfigContent, 'utf-8');
    const claudeManifestPath = store.manifestPath(ws, 'claude');
    const seeded = JSON.parse(readFileSync(claudeManifestPath, 'utf-8')) as {
      entries: Record<string, unknown>;
    };
    seeded.entries['.mcp.json#github'] = managedEntry(
      'hash-github',
      'io.github.example/server',
      'mcp',
    );
    writeFileSync(claudeManifestPath, JSON.stringify(seeded), 'utf-8');

    await reconciler.remove(ws);

    expect(existsSync(claudeSkillDir)).toBe(false);
    expect(existsSync(claudeCommandFile)).toBe(false);
    expect(existsSync(codexSkillDir)).toBe(false);

    // Foreign skill survives, byte-identical.
    expect(existsSync(foreignSkillFile)).toBe(true);
    expect(readFileSync(foreignSkillFile, 'utf-8')).toBe(foreignSkillContent);

    // `.mcp.json` survives byte-identical: the old row removed nothing.
    expect(readFileSync(mcpConfigPath, 'utf-8')).toBe(mcpConfigContent);
    expect(readFileSync(claudeManifestPath, 'utf-8')).not.toContain(
      '.mcp.json#github',
    );

    // Every manifest this run touched is now empty.
    const claudeManifest = new ManagedManifestStore().load(ws, 'claude');
    const codexManifest = new ManagedManifestStore().load(ws, 'codex');
    expect(claudeManifest.entries).toEqual({});
    expect(codexManifest.entries).toEqual({});

    // The user-layer source is never touched by `remove()`.
    expect(existsSync(join(skillsRoot, 'foo', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(commandsRoot, 'baz.md'))).toBe(true);
  });
});
