/**
 * No rival target writes MCP config (TASK_2026_979, Batch 16, decision row 10).
 *
 * Each target used to carry an MCP facet that wrote the user's installed
 * servers into the CLI's native config file. Ptah now serves those servers
 * through its gateway, so a full plan + apply pass must leave every one of
 * those files absent, and a file the user already has must stay
 * byte-identical, even when a pre-P2 manifest still names a server in it
 * (Batch 17, decision D1: the row is dropped on load). Skills still land.
 *
 * Every case runs in its own `mkdtemp` workspace and home directory, so the
 * "file system" the targets see is a disposable sandbox.
 *
 * Source-under-test: `createRivalTargets` and each `WorkspaceHarnessTarget`.
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
import { hashDir } from '../hash/content-hash';
import type { HarnessDesiredState } from '../manifest/desired-state.types';
import {
  emptyManifest,
  managedEntry,
  ManagedManifestStore,
} from '../manifest-store/managed-manifest';
import { createRivalTargets } from './rival-targets';

/** Every MCP config file a rival target's facet used to write. */
function mcpConfigFiles(ws: string, home: string): string[] {
  return [
    join(home, '.codex', 'config.toml'),
    join(home, '.copilot', 'mcp-config.json'),
    join(ws, '.cursor', 'mcp.json'),
    join(home, '.gemini', 'config', 'mcp_config.json'),
    join(ws, 'opencode.json'),
    join(ws, '.vscode', 'mcp.json'),
  ];
}

describe('createRivalTargets — no MCP config writes', () => {
  let tempRoot: string;
  let ws: string;
  let home: string;
  let desired: HarnessDesiredState;

  beforeEach(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ptah-b16-rival-'));
    ws = join(tempRoot, 'ws');
    home = join(tempRoot, 'home');
    mkdirSync(ws, { recursive: true });
    mkdirSync(home, { recursive: true });
    const skillSource = join(tempRoot, 'user', 'skills', 'orchestration');
    mkdirSync(skillSource, { recursive: true });
    writeFileSync(
      join(skillSource, 'SKILL.md'),
      '---\nname: orchestration\ndescription: test skill\n---\n# skill\n',
    );
    const skillHash = await hashDir(skillSource);
    if (skillHash === null) throw new Error('fixture skill did not hash');
    desired = {
      skills: [
        {
          slug: 'orchestration',
          sourceDir: skillSource,
          contentHash: skillHash,
        },
      ],
      commands: [],
      agents: [],
      collisions: [],
      sources: 'ok',
      sourceRoots: [join(tempRoot, 'user')],
    };
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const store = new ManagedManifestStore();

  function targets() {
    return createRivalTargets({
      manifestStore: store,
      detector: { isInstalled: () => Promise.resolve(true) },
      homeDir: home,
    });
  }

  it('registers no VS Code target and reports the mcp facet unsupported on every target', () => {
    const list = targets();
    expect(list.map((target) => target.id)).toEqual([
      'codex',
      'copilot',
      'cursor',
      'antigravity',
      'opencode',
    ]);
    for (const target of list) {
      expect(target.facets.mcp).toBe('unsupported');
    }
  });

  it('plans no MCP row and counts no MCP key in preflight', async () => {
    for (const target of targets()) {
      const plan = await target.plan(
        desired,
        ws,
        emptyManifest(target.id),
        undefined,
        { skillSourceRoots: [] },
      );
      expect(plan.writes.filter((write) => write.kind === 'mcp')).toEqual([]);
      expect(plan.removals.filter((row) => row.kind === 'mcp')).toEqual([]);
      expect([...target.preflightKeys(desired).keys()]).not.toContainEqual(
        expect.stringContaining('#'),
      );
    }
  });

  it('a full pass writes no MCP config file and still copies skills', async () => {
    for (const target of targets()) {
      const plan = await target.plan(desired, ws, emptyManifest(target.id));
      const result = await target.apply(plan, ws);
      expect(result.writeFailed).toEqual([]);
    }

    for (const file of mcpConfigFiles(ws, home)) {
      expect(existsSync(file)).toBe(false);
    }
    expect(
      existsSync(join(ws, '.cursor', 'skills', 'orchestration', 'SKILL.md')),
    ).toBe(true);
    expect(
      existsSync(join(ws, '.agents', 'skills', 'orchestration', 'SKILL.md')),
    ).toBe(true);
  });

  it('leaves an existing MCP config byte-identical, even when the manifest holds an old mcp row for it', async () => {
    const existing = mcpConfigFiles(ws, home);
    const bytes = new Map<string, string>();
    for (const file of existing) {
      mkdirSync(join(file, '..'), { recursive: true });
      const content = file.endsWith('.toml')
        ? '[mcp_servers.github]\ncommand = "npx"\n'
        : '{"mcpServers":{"github":{"command":"npx"}}}\n';
      writeFileSync(file, content);
      bytes.set(file, content);
    }

    for (const target of targets()) {
      // A pre-P2 manifest row for a server the user later uninstalled. The old
      // facet planner turned it into a removal from the config file. It is
      // written to disk and read back, as a real pass reads it.
      const manifestPath = store.manifestPath(ws, target.id);
      mkdirSync(join(manifestPath, '..'), { recursive: true });
      writeFileSync(
        manifestPath,
        JSON.stringify({
          ...emptyManifest(target.id),
          entries: {
            '.cursor/mcp.json#github': managedEntry(
              'hash-github',
              'io.github.example/github',
              'mcp',
            ),
          },
        }),
      );
      const manifest = store.load(ws, target.id);
      expect(manifest.entries).toEqual({});
      const plan = await target.plan(desired, ws, manifest, undefined, {
        skillSourceRoots: [],
      });
      expect(plan.removals).toEqual([]);
      await target.apply(plan, ws);
    }

    for (const file of existing) {
      expect(readFileSync(file, 'utf-8')).toBe(bytes.get(file));
    }
  });
});
