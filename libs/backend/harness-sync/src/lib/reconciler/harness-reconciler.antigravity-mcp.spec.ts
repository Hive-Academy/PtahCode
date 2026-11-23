/**
 * Antigravity gets no MCP config from the reconciler (TASK_2026_979, Batch 17,
 * parity row 10).
 *
 * Until P2 the antigravity target installed every MCP intent recorded for it
 * into `~/.gemini/config/mcp_config.json` and removed the entry again on
 * uninstall (TASK_2026_285). Ptah now serves those servers to `agy` through the
 * ACP `session/new.mcpServers` list instead, so a full reconcile must write,
 * rewrite and remove nothing in that file: not with an intent recorded, not
 * when the intent is dropped, not for a pre-P2 manifest row that still names
 * a key in it, and never the adapter's `ptah` key or a hand-written server.
 *
 * `homeDir` is a temp directory throughout. A spec that wrote to the real
 * `~/.gemini` would edit the developer's own `agy` config.
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
import type { HarnessTargetId } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { HarnessStateStore } from '../gitignore/harness-state-store';
import { HarnessManifestBuilder } from '../manifest/harness-manifest.builder';
import {
  emptyManifest,
  managedEntry,
  ManagedManifestStore,
} from '../manifest-store/managed-manifest';
import type {
  HarnessSourceState,
  IHarnessCliDetector,
} from '../sources/harness-source.port';
import { createStaticSourceResolver } from '../sources/plugin-config-source-resolver';
import { PTAH_SPAWN_MCP_KEY } from '../targets/mcp/mcp-facet.port';
import { createAntigravityTarget } from '../targets/rival-targets';
import { HarnessReconcilerService } from './harness-reconciler.service';

const CONFIG_REL = '~/.gemini/config/mcp_config.json';

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

/** A config file as `agy` and its user leave it: the adapter key and a hand server. */
const USER_CONFIG = `${JSON.stringify(
  {
    mcpServers: {
      [PTAH_SPAWN_MCP_KEY]: { serverUrl: 'http://localhost:51234' },
      github: { command: 'github-mcp', args: ['--stdio'] },
      'their-own': { command: 'theirs' },
    },
  },
  null,
  2,
)}\n`;

describe('HarnessReconcilerService — antigravity writes no MCP config (TASK_2026_979)', () => {
  let ws: string;
  let sourcesRoot: string;
  let home: string;
  let configPath: string;
  let store: ManagedManifestStore;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'harness-agy-mcp-ws-'));
    sourcesRoot = mkdtempSync(join(tmpdir(), 'harness-agy-mcp-src-'));
    home = mkdtempSync(join(tmpdir(), 'harness-agy-mcp-home-'));
    configPath = join(home, '.gemini', 'config', 'mcp_config.json');
    store = new ManagedManifestStore();
    new HarnessStateStore().save(ws, {
      ...new HarnessStateStore().load(ws),
      skillSyncMode: 'all',
    });

    // One skill, so the user layer is non-empty and the pass has real work.
    mkdirSync(join(sourcesRoot, 'skills', 'alpha'), { recursive: true });
    writeFileSync(
      join(sourcesRoot, 'skills', 'alpha', 'SKILL.md'),
      '---\nname: alpha\ndescription: the alpha skill\n---\nalpha body\n',
      'utf-8',
    );
  });

  afterEach(() => {
    for (const dir of [ws, sourcesRoot, home]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** A reconciler wired with the antigravity target alone, pointed at `home`. */
  function makeReconciler(
    intents: HarnessSourceState['mcpIntents'],
  ): HarnessReconcilerService {
    return new HarnessReconcilerService(
      fakeLogger(),
      new HarnessManifestBuilder(),
      store,
      createStaticSourceResolver({
        layout: {
          skillsRoot: join(sourcesRoot, 'skills'),
          commandsRoot: join(sourcesRoot, 'commands'),
          agentsRoot: join(sourcesRoot, 'agents'),
        },
        overlayPluginPaths: [],
        disabledSkillIds: [],
        disabledPluginIds: [],
        mcpIntents: intents,
      }),
      [
        createAntigravityTarget({
          manifestStore: store,
          detector: detectorFor(['antigravity']),
          homeDir: home,
        }),
      ],
    );
  }

  const githubIntent = {
    serverKey: 'github',
    registryName: 'io.github.example/github',
    config: {
      type: 'stdio' as const,
      command: 'github-mcp',
      args: ['--stdio'],
    },
    targets: ['antigravity' as const],
  };

  function writeUserConfig(): void {
    mkdirSync(join(configPath, '..'), { recursive: true });
    writeFileSync(configPath, USER_CONFIG, 'utf-8');
  }

  it('an intent recorded for antigravity creates no config file, and skills still land', async () => {
    const health = await makeReconciler([githubIntent]).reconcile(ws, {
      mode: 'full',
      reason: 'spec',
    });
    const target = health.targets.find((t) => t.target === 'antigravity');

    expect(target?.facets.mcp).toBe('unsupported');
    expect(target?.writeFailed).toEqual([]);
    expect(existsSync(configPath)).toBe(false);
    expect(target?.found).toBeGreaterThan(0);
    expect(
      Object.keys(store.load(ws, 'antigravity').entries).filter((relPath) =>
        relPath.includes('#'),
      ),
    ).toEqual([]);
  });

  it('an existing config stays byte-identical across an install pass and an uninstall pass', async () => {
    writeUserConfig();

    await makeReconciler([githubIntent]).reconcile(ws, {
      mode: 'full',
      reason: 'install',
    });
    expect(readFileSync(configPath, 'utf-8')).toBe(USER_CONFIG);

    // The intent is gone: what `McpInstallService.uninstall` used to reconcile.
    const health = await makeReconciler([]).reconcile(ws, {
      mode: 'full',
      reason: 'uninstall',
    });
    expect(readFileSync(configPath, 'utf-8')).toBe(USER_CONFIG);
    const target = health.targets.find((t) => t.target === 'antigravity');
    for (const relPath of [
      ...(target?.foreign ?? []),
      ...(target?.missing ?? []),
      ...(target?.removed ?? []),
    ]) {
      expect(relPath).not.toContain(CONFIG_REL);
    }
  });

  it('a pre-P2 manifest row for the config is dropped, not turned into a removal (D1)', async () => {
    writeUserConfig();
    const manifestPath = store.manifestPath(ws, 'antigravity');
    mkdirSync(join(manifestPath, '..'), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify({
        ...emptyManifest('antigravity'),
        entries: {
          [`${CONFIG_REL}#github`]: managedEntry(
            'hash-github',
            'io.github.example/github',
            'mcp',
          ),
        },
      }),
      'utf-8',
    );

    const health = await makeReconciler([]).reconcile(ws, {
      mode: 'full',
      reason: 'spec',
    });

    expect(readFileSync(configPath, 'utf-8')).toBe(USER_CONFIG);
    const target = health.targets.find((t) => t.target === 'antigravity');
    expect(target?.removed).toEqual([]);
    expect(target?.writeFailed).toEqual([]);
    // The pass wrote the skill and saved its manifest without the old row.
    expect(readFileSync(manifestPath, 'utf-8')).not.toContain(CONFIG_REL);
  });
});
