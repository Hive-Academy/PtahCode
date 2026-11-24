// `harness-sync`'s barrel reaches `vscode-core` and therefore tsyringe.
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  McpIntentStore,
  type HarnessReconcilerService,
} from '@ptah-extension/harness-sync';
import {
  MCP_INSTALL_RESULT_COPY,
  type McpOAuthConnectedRecord,
  type SmitheryInstalledRecord,
} from '@ptah-extension/shared';
import { McpInstallService } from './mcp-install.service';

/**
 * Every case runs against a temp directory used as BOTH the home dir and the
 * workspace root, so no facet, intent store or reader can reach the
 * developer's real `~/.mcp.json`, `~/.claude.json` or `~/.ptah`.
 */
describe('McpInstallService', () => {
  let tmp: string;
  let intents: McpIntentStore;
  let reconcileCalls: number;

  /**
   * A reconciler that counts calls. Install records intent only (TASK_2026_979
   * B18), so every case below expects this count to stay at zero.
   */
  const countingReconciler = (): HarnessReconcilerService =>
    ({
      reconcile: (_root: string, opts: { targets?: string[] }) => {
        reconcileCalls += 1;
        return Promise.resolve({
          targets: (opts.targets ?? []).map((target) => ({
            target,
            writeFailed: [],
          })),
        });
      },
    }) as unknown as HarnessReconcilerService;

  const service = (
    options: {
      smithery?: {
        filePath: string;
        list(): SmitheryInstalledRecord[];
      };
      oauth?: { filePath: string; list(): McpOAuthConnectedRecord[] };
    } = {},
  ): McpInstallService =>
    new McpInstallService(countingReconciler(), intents, {
      homeDir: tmp,
      ...options,
    });

  const writeMcpJson = (servers: Record<string, unknown>): void => {
    fs.writeFileSync(
      path.join(tmp, '.mcp.json'),
      JSON.stringify({ mcpServers: servers }),
      'utf-8',
    );
  };

  const readMcpJson = (): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(path.join(tmp, '.mcp.json'), 'utf-8'))
      .mcpServers;

  /**
   * Every file under the temp home/workspace except the intent store: the
   * proof that an install, uninstall or make-global wrote no config file.
   */
  const filesBesideIntentStore = (): string[] => {
    const intentFile = path.join(tmp, '.ptah', 'mcp-installed.json');
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full !== intentFile && !full.startsWith(`${intentFile}.`)) {
          found.push(path.relative(tmp, full));
        }
      }
    };
    walk(tmp);
    return found.sort();
  };

  /** `~/.claude.json` with a top-level (user) map and this workspace's map. */
  const writeClaudeJson = (maps: {
    user?: Record<string, unknown>;
    project?: Record<string, unknown>;
  }): void => {
    fs.writeFileSync(
      path.join(tmp, '.claude.json'),
      JSON.stringify({
        ...(maps.user === undefined ? {} : { mcpServers: maps.user }),
        projects: { [tmp]: { mcpServers: maps.project ?? {} } },
      }),
      'utf-8',
    );
  };

  const httpServer = { type: 'http', url: 'https://example.test/mcp' };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-install-service-'));
    // Establish this workspace's marker before the first intent is recorded.
    // A parent temp directory may also contain .ptah, which would otherwise
    // change the canonical root after the store creates tmp/.ptah on write.
    fs.mkdirSync(path.join(tmp, '.ptah'));
    intents = new McpIntentStore(path.join(tmp, '.ptah', 'mcp-installed.json'));
    reconcileCalls = 0;
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('listInstalled', () => {
    it('gives a harness-config key Ptah never recorded no removal path, with the hand-removal reason (D2)', () => {
      writeMcpJson({ handwritten: { command: 'node', args: ['s.js'] } });

      return service()
        .listInstalled(tmp)
        .then((rows) => {
          const row = rows.find((r) => r.serverKey === 'handwritten');
          expect(row).toBeDefined();
          expect(row?.origin).toBe('harness-config');
          expect(row?.target).toBe('claude');
          expect(row?.managedByPtah).toBe(false);
          expect(row?.removal).toBe('none');
          expect(row?.removalBlockedReason).toContain('handwritten');
          expect(row?.removalBlockedReason).toContain(
            path.join(tmp, '.mcp.json'),
          );
          expect(row?.removalFixCommand).toBeUndefined();
        });
    });

    it('marks a recorded key as ptah-managed', async () => {
      writeMcpJson({ owned: { command: 'node' } });
      intents.record({
        serverKey: 'owned',
        registryName: 'io.github.x/owned',
        targets: ['claude'],
        config: { type: 'stdio', command: 'node' },
        scope: 'workspace',
        workspaceRoot: tmp,
      });

      const rows = await service().listInstalled(tmp);
      const row = rows.find(
        (r) => r.serverKey === 'owned' && r.target === 'claude',
      );
      expect(row?.managedByPtah).toBe(true);
      expect(row?.removal).toBe('ptah-managed');
      expect(row?.removalBlockedReason).toBeUndefined();
    });

    it('includes read-only ~/.claude.json rows with a reason naming the CLI command', async () => {
      fs.writeFileSync(
        path.join(tmp, '.claude.json'),
        JSON.stringify({
          projects: {
            [tmp]: {
              mcpServers: {
                sentry: { type: 'http', url: 'https://mcp.sentry.dev/mcp' },
              },
            },
          },
        }),
        'utf-8',
      );

      const rows = await service().listInstalled(tmp);
      const row = rows.find((r) => r.origin === 'claude-user');
      expect(row?.serverKey).toBe('sentry');
      expect(row?.target).toBeUndefined();
      expect(row?.removal).toBe('none');
      expect(row?.removalBlockedReason).toContain('.claude.json');
      expect(row?.removalBlockedReason).toContain('claude mcp remove sentry');
      expect(row?.config).toEqual({
        type: 'http',
        url: 'https://mcp.sentry.dev/mcp',
      });
    });

    describe('removalFixCommand on ~/.claude.json rows', () => {
      const claudeRow = async (serverKey: string) =>
        (await service().listInstalled(tmp)).find(
          (r) => r.origin === 'claude-user' && r.serverKey === serverKey,
        );

      it('gives a project-scope row the bare command, and leaves the prose as it was', async () => {
        writeClaudeJson({ project: { sentry: httpServer } });

        const row = await claudeRow('sentry');
        expect(row?.removalFixCommand).toBe('claude mcp remove sentry');
        expect(row?.removalBlockedReason).toBe(
          `"sentry" is declared in ${path.join(tmp, '.claude.json')}, ` +
            'which belongs to the Claude CLI — Ptah reads it and never ' +
            'writes it. Remove it with `claude mcp remove sentry`.',
        );
      });

      it('adds --scope user for a user-scope row, exactly as the prose does', async () => {
        writeClaudeJson({ user: { github: httpServer } });

        const row = await claudeRow('github');
        expect(row?.removalFixCommand).toBe(
          'claude mcp remove github --scope user',
        );
        expect(row?.removalBlockedReason).toContain(
          '`claude mcp remove github --scope user`',
        );
      });

      it.each([
        'oauth-mcp.sentry',
        'smithery_owner_server',
        'node_repl',
        'io.github/user:server',
      ])('passes the plain key %j bare', async (serverKey) => {
        writeClaudeJson({ project: { [serverKey]: httpServer } });

        expect((await claudeRow(serverKey))?.removalFixCommand).toBe(
          `claude mcp remove ${serverKey}`,
        );
      });

      it.each([
        ['whitespace', 'my server'],
        ['a command separator', 'a;rm -rf ~'],
        ['a pipe and redirect', 'a|b>c'],
        ['an ampersand', 'a&b'],
        ['a glob', 'serv*'],
        ['a comment marker', 'a#b'],
        ['a leading tilde', '~home'],
        ['a PowerShell array comma', 'a,b'],
        ['a PowerShell splat', '@scope/server'],
        ['parentheses', 'fn(x)'],
        ['a single quote', "o'brien"],
        ['non-ASCII text', 'café'],
      ])('double-quotes a key with %s', async (_label, serverKey) => {
        writeClaudeJson({ user: { [serverKey]: httpServer } });

        expect((await claudeRow(serverKey))?.removalFixCommand).toBe(
          `claude mcp remove "${serverKey}" --scope user`,
        );
      });

      it.each([
        ['a double quote', 'say"hi"'],
        ['a newline', 'line\nbreak'],
        ['a carriage return', 'line\rbreak'],
        ['a tab', 'tab\there'],
        ['an escape character', 'esc\u001bseq'],
        ['a C1 control', 'c1\u0085next'],
        ['a Unicode line separator', 'ls next'],
        ['a dollar expansion', '$HOME'],
        ['a backtick', 'back`tick'],
        ['a backslash', 'a\\b'],
        ['a history bang', 'bang!'],
        ['a cmd percent', '%PATH%'],
        ['a leading dash, read as an option', '-rf'],
      ])('omits the command for a key with %s', async (_label, serverKey) => {
        writeClaudeJson({ project: { [serverKey]: httpServer } });

        const row = await claudeRow(serverKey);
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('removalFixCommand');
        // The reason still explains where the entry lives and what removes it.
        expect(row?.removal).toBe('none');
        expect(row?.removalBlockedReason).toContain('.claude.json');
      });

      it('gives no command to rows that have a local removal path', async () => {
        writeMcpJson({ handwritten: { command: 'node' } });
        const rows = await service({
          smithery: {
            filePath: path.join(tmp, '.ptah', 'smithery-installed.json'),
            list: () => [
              {
                source: 'smithery',
                qualifiedName: '@owner/server',
                serverKey: 'smithery_owner_server',
                namespace: 'ns',
                connectionId: 'owner-server',
                hasEncryptedConfig: true,
                installedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
          oauth: {
            filePath: path.join(tmp, '.ptah', 'mcp-oauth-installed.json'),
            list: () => [
              {
                serverKey: 'oauth-mcp.sentry',
                name: 'Sentry',
                serverUrl: 'https://mcp.sentry.dev/mcp',
                connectedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        }).listInstalled(tmp);

        const origins = new Set(rows.map((r) => r.origin));
        expect(origins).toEqual(
          new Set(['harness-config', 'smithery', 'oauth']),
        );
        for (const row of rows) {
          expect(row).not.toHaveProperty('removalFixCommand');
        }
      });
    });

    it('includes Smithery and OAuth records, with no harness target and no secrets', async () => {
      const smitheryPath = path.join(tmp, '.ptah', 'smithery-installed.json');
      const oauthPath = path.join(tmp, '.ptah', 'mcp-oauth-installed.json');

      const rows = await service({
        smithery: {
          filePath: smitheryPath,
          list: () => [
            {
              source: 'smithery',
              qualifiedName: '@owner/server',
              serverKey: 'smithery_owner_server',
              namespace: 'ns',
              connectionId: 'owner-server',
              hasEncryptedConfig: true,
              installedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
        oauth: {
          filePath: oauthPath,
          list: () => [
            {
              serverKey: 'oauth-mcp.sentry',
              name: 'Sentry',
              serverUrl: 'https://mcp.sentry.dev/mcp',
              connectedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      }).listInstalled(tmp);

      const smithery = rows.find((r) => r.origin === 'smithery');
      expect(smithery?.removal).toBe('smithery');
      expect(smithery?.target).toBeUndefined();
      expect(smithery?.configPath).toBe(smitheryPath);
      expect(JSON.stringify(smithery?.config)).not.toContain('api_key');

      const oauth = rows.find((r) => r.origin === 'oauth');
      expect(oauth?.removal).toBe('oauth');
      expect(oauth?.configPath).toBe(oauthPath);
      expect(oauth?.config).toEqual({
        type: 'http',
        url: 'https://mcp.sentry.dev/mcp',
      });
    });

    it('keeps one row per config file for a key that lives in several', async () => {
      writeMcpJson({ shared: { command: 'a' } });
      fs.mkdirSync(path.join(tmp, '.cursor'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { shared: { command: 'a' } } }),
        'utf-8',
      );

      const rows = (await service().listInstalled(tmp)).filter(
        (r) => r.serverKey === 'shared',
      );
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.target))).toEqual(
        new Set(['claude', 'cursor']),
      );
    });
  });

  describe('listDeclarations (the one inventory, TASK_2026_560 C4)', () => {
    it('classifies every row by scope: repository files are workspace, user files global', async () => {
      writeMcpJson({ repo: { command: 'node' } });
      writeClaudeJson({
        user: { mine: httpServer },
        project: { local: httpServer },
      });
      fs.mkdirSync(path.join(tmp, '.codex'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, '.codex', 'config.toml'),
        '[mcp_servers.cx]\ncommand = "node"\n',
        'utf-8',
      );

      const { declarations, sourceStatus } =
        await service().listDeclarations(tmp);

      const scopeOf = (key: string, origin: string) =>
        declarations.find((r) => r.serverKey === key && r.origin === origin)
          ?.scope;
      expect(scopeOf('repo', 'harness-config')).toBe('workspace');
      expect(scopeOf('cx', 'harness-config')).toBe('global');
      // Both `~/.claude.json` maps are per-user files (the existing
      // `entry.scope` still drives the removal command).
      expect(scopeOf('mine', 'claude-user')).toBe('global');
      expect(scopeOf('local', 'claude-user')).toBe('global');
      expect(sourceStatus.find((s) => s.target === 'claude')?.status).toBe(
        'ok',
      );
    });

    it('reports an unreadable config file as error instead of "declares nothing"', async () => {
      fs.writeFileSync(path.join(tmp, '.mcp.json'), '{ not json', 'utf-8');
      writeClaudeJson({ user: { mine: httpServer } });

      const { declarations, sourceStatus } =
        await service().listDeclarations(tmp);

      const claude = sourceStatus.find((s) => s.target === 'claude');
      expect(claude).toMatchObject({
        status: 'error',
        path: path.join(tmp, '.mcp.json'),
      });
      expect(claude?.error).toBeTruthy();
      // The other sources still answer.
      expect(declarations.map((r) => r.serverKey)).toContain('mine');
    });

    it('marks an absent file missing, and lists no file for an unresolvable scope', async () => {
      const withRoot = await service().listDeclarations(tmp);
      expect(
        withRoot.sourceStatus.find((s) => s.target === 'claude')?.status,
      ).toBe('missing');

      const noRoot = await service().listDeclarations();
      expect(noRoot.sourceStatus.some((s) => s.target === 'claude')).toBe(
        false,
      );
    });

    it('feeds listInstalled, which carries the scope on every row', async () => {
      writeMcpJson({ repo: { command: 'node' } });
      writeClaudeJson({ user: { mine: httpServer } });

      const rows = await service().listInstalled(tmp);
      expect(rows.find((r) => r.serverKey === 'repo')?.scope).toBe('workspace');
      expect(rows.find((r) => r.serverKey === 'mine')?.scope).toBe('global');
    });
  });

  describe('install records intent only (TASK_2026_979 B18)', () => {
    const stdio = { type: 'stdio' as const, command: 'node' };

    it('records the intent, writes no config file and never reconciles', async () => {
      const results = await service().install(
        'io.github.x/k',
        'k',
        stdio,
        ['claude', 'vscode', 'cursor'],
        tmp,
      );

      expect(results).toEqual(
        ['claude', 'vscode', 'cursor'].map((target) => ({
          target,
          configPath: '',
          success: true,
        })),
      );
      expect(intents.listFor(tmp)).toEqual([
        {
          serverKey: 'k',
          registryName: 'io.github.x/k',
          config: stdio,
          targets: ['claude', 'vscode', 'cursor'],
        },
      ]);
      expect(reconcileCalls).toBe(0);
      expect(filesBesideIntentStore()).toEqual([]);
    });

    it('a global install with no folder open succeeds: the gateway serves global intents everywhere', async () => {
      const results = await service().install(
        'r/k',
        'k',
        stdio,
        ['claude', 'codex'],
        undefined,
        'global',
      );

      expect(results).toEqual([
        { target: 'claude', configPath: '', success: true },
        { target: 'codex', configPath: '', success: true },
      ]);
      expect(JSON.stringify(results)).not.toContain('deferred');
      // An empty root yields the global entries: what the gateway reads.
      expect(intents.listFor('').map((i) => i.serverKey)).toEqual(['k']);
      expect(reconcileCalls).toBe(0);
      expect(filesBesideIntentStore()).toEqual([]);
    });

    it('a host with no reconciler records the same intent and reports the same success', async () => {
      const svc = new McpInstallService(null, intents, { homeDir: tmp });

      const results = await svc.install('r/k', 'k', stdio, ['claude'], tmp);

      expect(results).toEqual([
        { target: 'claude', configPath: '', success: true },
      ]);
      expect(JSON.stringify(results)).not.toContain('reconciler-unavailable');
      expect(intents.has('k')).toBe(true);
    });

    it('leaves an existing config file byte-for-byte alone', async () => {
      writeMcpJson({ k: { command: 'old' }, mine: { command: 'other' } });
      const before = fs.readFileSync(path.join(tmp, '.mcp.json'), 'utf-8');

      await service().install('r/k', 'k', stdio, ['claude'], tmp);
      await service().uninstall('k', ['claude'], tmp);

      expect(fs.readFileSync(path.join(tmp, '.mcp.json'), 'utf-8')).toBe(
        before,
      );
      expect(filesBesideIntentStore()).toEqual(['.mcp.json']);
    });
  });

  describe('Installed rows from the intent store (TASK_2026_979 B23)', () => {
    const stdio = { type: 'stdio' as const, command: 'node' };
    const intentFile = (): string =>
      path.join(tmp, '.ptah', 'mcp-installed.json');

    it('lists a workspace install, which no config file carries, as a removable Ptah row', async () => {
      await service().install('r/k', 'k', stdio, ['claude', 'cursor'], tmp);

      const rows = await service().listInstalled(tmp);

      expect(rows).toEqual(
        ['claude', 'cursor'].map((target) => ({
          serverKey: 'k',
          target,
          configPath: intentFile(),
          config: stdio,
          managedByPtah: true,
          origin: 'ptah-intent',
          originLabel: 'Ptah',
          removal: 'ptah-managed',
          scope: 'workspace',
        })),
      );
    });

    it('lists a global install in any workspace and with no folder open', async () => {
      await service().install(
        'r/g',
        'g',
        stdio,
        ['codex'],
        undefined,
        'global',
      );

      for (const root of [tmp, undefined]) {
        const rows = await service().listInstalled(root);
        expect(rows).toEqual([
          expect.objectContaining({
            serverKey: 'g',
            target: 'codex',
            origin: 'ptah-intent',
            scope: 'global',
          }),
        ]);
      }
    });

    it('gives a key recorded in both scopes one row per scope, each with its own config', async () => {
      const wsConfig = { type: 'stdio' as const, command: 'ws' };
      await service().install(
        'r/k',
        'k',
        stdio,
        ['codex'],
        undefined,
        'global',
      );
      await service().install('r/k', 'k', wsConfig, ['claude'], tmp);

      const rows = await service().listInstalled(tmp);

      expect(rows.map((row) => [row.target, row.scope, row.config])).toEqual([
        ['codex', 'global', stdio],
        ['claude', 'workspace', wsConfig],
      ]);
    });

    it('drops the row once the install is uninstalled', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);
      await service().uninstall('k', ['claude'], tmp);

      expect(await service().listInstalled(tmp)).toEqual([]);
    });

    it('feeds the same rows to the capability inventory', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);

      const { declarations } = await service().listDeclarations(tmp);

      expect(declarations).toEqual([
        expect.objectContaining({ serverKey: 'k', origin: 'ptah-intent' }),
      ]);
    });

    it('lists no Ptah rows, and logs why, when the intent file is unreadable', async () => {
      fs.writeFileSync(intentFile(), '{ not json', 'utf-8');
      const warn = jest.fn();
      const svc = new McpInstallService(null, intents, { homeDir: tmp, warn });

      const rows = await svc.listInstalled(tmp);

      expect(rows).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        '[mcp-install] The MCP intent store could not be read',
        expect.anything(),
      );
    });
  });

  describe('onIntentsChanged (TASK_2026_979 B23)', () => {
    const stdio = { type: 'stdio' as const, command: 'node' };

    it('fires after a saved install, make-global and uninstall', async () => {
      const onIntentsChanged = jest.fn();
      const svc = new McpInstallService(null, intents, {
        homeDir: tmp,
        onIntentsChanged,
      });

      await svc.install('r/k', 'k', stdio, ['claude'], tmp);
      expect(onIntentsChanged).toHaveBeenCalledTimes(1);
      await svc.makeGlobal('k', tmp, []);
      expect(onIntentsChanged).toHaveBeenCalledTimes(2);
      await svc.uninstall('k', undefined, tmp);
      expect(onIntentsChanged).toHaveBeenCalledTimes(3);
    });

    it('does not fire when the intent change was not saved', async () => {
      fs.writeFileSync(
        path.join(tmp, '.ptah', 'mcp-installed.json'),
        '{ not json',
        'utf-8',
      );
      const onIntentsChanged = jest.fn();
      const svc = new McpInstallService(null, intents, {
        homeDir: tmp,
        onIntentsChanged,
      });

      const results = await svc.install('r/k', 'k', stdio, ['claude'], tmp);

      expect(results[0]).toMatchObject({ success: false });
      expect(onIntentsChanged).not.toHaveBeenCalled();
    });
  });

  describe('uninstall', () => {
    const stdio = { type: 'stdio' as const, command: 'node' };

    it('forgets a recorded intent and writes no config file', async () => {
      await service().install('r/k', 'k', stdio, ['claude', 'cursor'], tmp);

      const results = await service().uninstall('k', ['claude'], tmp);

      expect(results).toEqual([
        { target: 'claude', configPath: '', success: true },
      ]);
      expect(intents.targetsIn('k', 'workspace', tmp)).toEqual(['cursor']);
      expect(reconcileCalls).toBe(0);
      expect(filesBesideIntentStore()).toEqual([]);
    });

    it('reports a key Ptah never recorded as not installed, and leaves the file alone', async () => {
      writeMcpJson({ handwritten: { command: 'node' } });

      const results = await service().uninstall('handwritten', ['claude'], tmp);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        target: 'claude',
        configPath: '',
        success: false,
      });
      expect(results[0].error).toContain('handwritten');
      expect(results[0].error).toContain('was not installed by Ptah');
      expect(readMcpJson()).toHaveProperty('handwritten');
    });

    it('fails only the requested targets the key was never recorded for', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);

      const results = await service().uninstall('k', ['claude', 'cursor'], tmp);

      expect(results[0]).toEqual({
        target: 'claude',
        configPath: '',
        success: true,
      });
      expect(results[1]).toMatchObject({ target: 'cursor', success: false });
      expect(intents.has('k')).toBe(false);
    });

    it('has no force path: an unrecorded key is never removed from a config file (D2)', async () => {
      writeMcpJson({
        handwritten: { command: 'node' },
        untouched: { command: 'other' },
      });
      const before = fs.readFileSync(path.join(tmp, '.mcp.json'), 'utf-8');

      const results = await service().uninstall('handwritten', undefined, tmp);

      expect(results.every((result) => !result.success)).toBe(true);
      expect(fs.readFileSync(path.join(tmp, '.mcp.json'), 'utf-8')).toBe(
        before,
      );
      expect(fs.existsSync(path.join(tmp, '.mcp.json.bak'))).toBe(false);
    });
  });

  describe('scoped intent (TASK_2026_853 D-1)', () => {
    let otherWs: string;
    const stdio = { type: 'stdio' as const, command: 'node' };

    // Outside `tmp`: the intent store's `tmp/.ptah` is a workspace-root
    // marker, so a directory under `tmp` would canonicalise to `tmp` itself.
    beforeEach(() => {
      otherWs = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-install-other-'));
      fs.mkdirSync(path.join(otherWs, '.git'));
    });

    afterEach(() => {
      fs.rmSync(otherWs, { recursive: true, force: true });
    });

    it('records a workspace install by default, invisible to another workspace', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);

      expect(intents.scopeOf('k', tmp)).toBe('workspace');
      expect(intents.listFor(tmp).map((i) => i.serverKey)).toEqual(['k']);
      expect(intents.listFor(otherWs)).toEqual([]);
      expect(service().intentScopeOf('k', otherWs)).toBeUndefined();
    });

    it('refuses a workspace install with no root before saving anything', async () => {
      await expect(
        service().install('r/k', 'k', stdio, ['claude'], undefined),
      ).rejects.toMatchObject({ code: 'workspace-root-required' });
      expect(intents.has('k')).toBe(false);
      expect(reconcileCalls).toBe(0);
    });

    it('records an explicit global install for every workspace', async () => {
      const results = await service().install(
        'r/k',
        'k',
        stdio,
        ['claude'],
        tmp,
        'global',
      );

      expect(results[0]).toMatchObject({ target: 'claude', success: true });
      expect(intents.scopeOf('k', otherWs)).toBe('global');
      expect(intents.targetsIn('k', 'workspace', tmp)).toEqual([]);
    });

    it('merges a second install into the same workspace record', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);
      await service().install('r/k', 'k', stdio, ['cursor'], tmp);
      expect(intents.listFor(tmp)[0].targets).toEqual(['claude', 'cursor']);
    });

    it('makeGlobal promotes the record and adds opt-in home targets, writing no config file', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);

      const results = await service().makeGlobal('k', tmp, ['codex']);

      expect(results).toEqual([
        { target: 'claude', configPath: '', success: true },
        { target: 'codex', configPath: '', success: true },
      ]);
      expect(reconcileCalls).toBe(0);
      expect(filesBesideIntentStore()).toEqual([]);
      expect(intents.scopeOf('k', otherWs)).toBe('global');
      expect(intents.listFor(otherWs)[0].targets).toEqual(['claude', 'codex']);
    });

    it('makeGlobal refuses a server this workspace never installed', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], otherWs);
      await expect(service().makeGlobal('k', tmp, [])).rejects.toMatchObject({
        code: 'not-recorded',
      });
      expect(intents.scopeOf('k', otherWs)).toBe('workspace');
    });

    it('a bare uninstall drops this workspace only, leaving another workspace installed', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);
      await service().install('r/k', 'k', stdio, ['claude'], otherWs);

      await service().uninstall('k', undefined, tmp);

      expect(intents.listFor(tmp)).toEqual([]);
      expect(intents.listFor(otherWs).map((i) => i.serverKey)).toEqual(['k']);
    });

    it('a bare uninstall drops both the global and this workspace record', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);
      await service().install('r/k', 'k', stdio, ['codex'], tmp, 'global');

      const results = await service().uninstall('k', undefined, tmp);

      expect(results.map((r) => r.target).sort()).toEqual(['claude', 'codex']);
      expect(intents.has('k')).toBe(false);
    });

    it('an explicit workspace uninstall with no root throws before writing', async () => {
      await service().install('r/k', 'k', stdio, ['claude'], tmp);
      await expect(
        service().uninstall('k', undefined, undefined, { scope: 'workspace' }),
      ).rejects.toMatchObject({ code: 'workspace-root-required' });
      expect(intents.scopeOf('k', tmp)).toBe('workspace');
    });
  });
  describe('failure results carry fixed copy (Phase D review L2, L5, L6)', () => {
    const stdio = { type: 'stdio' as const, command: 'node' };

    /** A store whose path is a directory: every read fails with EISDIR. */
    const brokenStore = (): McpIntentStore => {
      const dir = path.join(tmp, 'broken-store');
      fs.mkdirSync(dir, { recursive: true });
      return new McpIntentStore(dir);
    };

    it('fails every target when the intent cannot be saved, and logs the cause', async () => {
      const warnings: unknown[] = [];
      const svc = new McpInstallService(countingReconciler(), brokenStore(), {
        homeDir: tmp,
        warn: (_message, detail) => warnings.push(detail),
      });

      const results = await svc.install(
        'r/k',
        'k',
        stdio,
        ['claude', 'codex'],
        tmp,
        'global',
      );

      expect(reconcileCalls).toBe(0);
      expect(results).toEqual([
        {
          target: 'claude',
          configPath: '',
          success: false,
          code: 'intent-not-saved',
          error: MCP_INSTALL_RESULT_COPY['intent-not-saved'],
        },
        expect.objectContaining({ target: 'codex', code: 'intent-not-saved' }),
      ]);
      expect(warnings).toHaveLength(1);
    });

    it('makeGlobal rejects with the persistence error', async () => {
      const svc = new McpInstallService(countingReconciler(), brokenStore(), {
        homeDir: tmp,
      });
      await expect(svc.makeGlobal('k', tmp, ['codex'])).rejects.toMatchObject({
        name: 'McpIntentPersistError',
        code: 'read-failed',
      });
      expect(reconcileCalls).toBe(0);
    });
  });

  describe('linked git worktree (#1469)', () => {
    /** git's linked-worktree layout: `.git` is a FILE with a gitdir pointer. */
    const makeLinkedWorktree = (): void => {
      fs.writeFileSync(
        path.join(tmp, '.git'),
        'gitdir: /repo/.git/worktrees/wt\n',
        'utf-8',
      );
    };

    it('needs no special case: install and uninstall change the intent and write nothing', async () => {
      makeLinkedWorktree();
      const warnings: unknown[] = [];
      const svc = new McpInstallService(countingReconciler(), intents, {
        homeDir: tmp,
        warn: (message) => warnings.push(message),
      });

      const installed = await svc.install(
        'io.github.x/zernio',
        'zernio',
        { type: 'stdio', command: 'node' },
        ['claude'],
        tmp,
      );
      expect(installed).toEqual([
        { target: 'claude', configPath: '', success: true },
      ]);
      expect(intents.has('zernio')).toBe(true);

      const removed = await svc.uninstall('zernio', ['claude'], tmp);
      expect(removed).toEqual([
        { target: 'claude', configPath: '', success: true },
      ]);
      expect(intents.has('zernio')).toBe(false);

      expect(reconcileCalls).toBe(0);
      expect(warnings).toEqual([]);
      expect(filesBesideIntentStore()).toEqual(['.git']);
    });

    // B24 (decision row 39): the gateway serves a worktree's intents with its
    // main checkout's (`GatewayServerSources.resolve`), so the Installed tab
    // lists them too, resolved through the same `mainCheckoutRoot` seam.
    describe("lists the main checkout's workspace intents the gateway serves", () => {
      const stdio = { type: 'stdio' as const, command: 'node' };
      let worktree: string;
      let mainRoot: string;
      const linked = (): McpInstallService =>
        new McpInstallService(null, intents, {
          homeDir: tmp,
          mainCheckoutRoot: (root) => (root === worktree ? mainRoot : null),
        });

      /**
       * A root with its own workspace marker, so the intent store keys it as
       * its own workspace rather than walking up to `tmp` (which holds the
       * `.ptah` of the intent store).
       */
      const repoRoot = (name: string): string => {
        const root = path.join(tmp, name);
        fs.mkdirSync(path.join(root, '.ptah'), { recursive: true });
        return root;
      };

      beforeEach(() => {
        worktree = repoRoot('wt');
        mainRoot = repoRoot('main');
      });

      it('adds the main checkout rows after the worktree own rows, removable only there', async () => {
        await linked().install('r/m', 'from-main', stdio, ['claude'], mainRoot);
        await linked().install('r/w', 'own', stdio, ['cursor'], worktree);

        const rows = await linked().listInstalled(worktree);

        expect(
          rows.map((row) => [row.serverKey, row.target, row.scope, row.removal]),
        ).toEqual([
          ['own', 'cursor', 'workspace', 'ptah-managed'],
          ['from-main', 'claude', 'workspace', 'none'],
        ]);
        const fromMain = rows.find((row) => row.serverKey === 'from-main');
        expect(fromMain).toMatchObject({
          origin: 'ptah-intent',
          managedByPtah: true,
          configPath: path.join(tmp, '.ptah', 'mcp-installed.json'),
          config: stdio,
        });
        expect(fromMain?.removalBlockedReason).toContain(mainRoot);
        expect(fromMain?.removalBlockedReason).toContain('Open that folder');
      });

      it('feeds the main checkout rows to the capability inventory too', async () => {
        await linked().install('r/m', 'from-main', stdio, ['claude'], mainRoot);

        const { declarations } = await linked().listDeclarations(worktree);

        expect(declarations).toEqual([
          expect.objectContaining({
            serverKey: 'from-main',
            origin: 'ptah-intent',
            scope: 'workspace',
          }),
        ]);
      });

      it('lists nothing extra outside a linked worktree', async () => {
        await linked().install('r/m', 'from-main', stdio, ['claude'], mainRoot);
        const other = repoRoot('other');

        expect(await linked().listInstalled(other)).toEqual([]);
        // The main checkout itself lists its own record once, as removable.
        expect(
          (await linked().listInstalled(mainRoot)).map((row) => row.removal),
        ).toEqual(['ptah-managed']);
      });

      it('lists a global install once, not again through the main checkout', async () => {
        await linked().install(
          'r/g',
          'g',
          stdio,
          ['codex'],
          undefined,
          'global',
        );

        const rows = await linked().listInstalled(worktree);

        expect(rows.map((row) => [row.serverKey, row.scope])).toEqual([
          ['g', 'global'],
        ]);
      });
    });
  });
});
