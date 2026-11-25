/**
 * End to end from a workspace-scoped install to the first `tools/list`: the
 * real `McpInstallService.install` (what `ptah_harness_install_mcp_server` and
 * the `mcp:install` RPC both call) over a temp `mcp-installed.json`, the real
 * capability policy model (`listDeclarations` -> `mcpRows` ->
 * `toEffectiveSet`), a real `GatewayServerSources` and a real `McpGateway`.
 * Only the stdio process is faked.
 *
 * Regression: a workspace-scoped intent row carries scope `workspace`, so
 * `defaultEnabled` gave it the repository-only default (OFF). The policy
 * denied the server and the gateway dropped it silently, so it was never
 * listed or spawned.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { McpGatewayScope } from '@ptah-extension/platform-core';
import type {
  EffectiveCapabilitySet,
  McpServerConfig,
} from '@ptah-extension/shared';
import { McpIntentStore } from '@ptah-extension/harness-sync';
import {
  EMPTY_CATALOG,
  mcpRows,
  toEffectiveSet,
} from '../../capabilities/capability-policy-model';
import { McpInstallService } from '../mcp-install.service';
import { McpGateway } from './mcp-gateway.service';
import { GatewayServerSources } from './server-sources';
import type {
  StdioClientOptions,
  StdioUpstreamClient,
} from './stdio-server-host';

describe('workspace-scoped stdio install through the gateway', () => {
  let home: string;
  let root: string;
  let intentPath: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'gw-stdio-home-'));
    root = mkdtempSync(join(tmpdir(), 'gw-stdio-ws-'));
    mkdirSync(join(root, '.ptah'));
    mkdirSync(join(home, '.ptah'));
    intentPath = join(home, '.ptah', 'mcp-installed.json');
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  const config: McpServerConfig = {
    type: 'stdio',
    command: 'node',
    args: ['server.js', 'D:/projects/PtahCode', 'log.txt'],
  };

  function fakeHost(): {
    createClient: jest.Mock<StdioUpstreamClient, [StdioClientOptions]>;
    dispose: jest.Mock<Promise<void>, []>;
    listTools: jest.Mock;
  } {
    const listTools = jest.fn(async () => [
      { name: 'echo', description: 'echo', inputSchema: { type: 'object' } },
    ]);
    const createClient = jest.fn(
      (_options: StdioClientOptions) =>
        ({
          connect: jest.fn(async () => undefined),
          listTools,
          callTool: jest.fn(async () => ({ content: [] })),
          close: jest.fn(async () => undefined),
          stderrTail: () => [],
          running: true,
        }) as unknown as StdioUpstreamClient,
    );
    return {
      createClient,
      dispose: jest.fn(async () => undefined),
      listTools,
    };
  }

  /** The resolver's policy path without its I/O: declarations -> rows -> set. */
  function policyFrom(installer: McpInstallService) {
    return {
      resolve: async (cwd: string): Promise<EffectiveCapabilitySet> => {
        const inventory = await installer.listDeclarations(cwd);
        const mcp = mcpRows(inventory, [], [], {}, new Set());
        return toEffectiveSet({
          ctx: {
            physicalRoot: cwd,
            policyKey: cwd,
            wsKey: cwd,
            stateRoot: cwd,
          },
          reasons: [],
          mcp,
          plugins: [],
          skills: [],
          catalog: EMPTY_CATALOG,
          pluginPolicy: null,
        });
      },
    };
  }

  it('records the workspace bucket, keeps the server enabled, and spawns it on the first tools/list', async () => {
    const store = new McpIntentStore(intentPath);
    const installer = new McpInstallService(null, store, {
      homeDir: home,
      mainCheckoutRoot: () => null,
    });
    const results = await installer.install(
      'stdiocheck',
      'stdiocheck',
      config,
      ['claude'],
      root,
      'workspace',
    );
    expect(results.every((result) => result.success)).toBe(true);

    // The live file shape: a v2 workspace bucket and no global record.
    const file = JSON.parse(readFileSync(intentPath, 'utf-8'));
    expect(file.version).toBe(2);
    expect(file.servers.stdiocheck.global).toBeUndefined();
    const buckets = Object.values(file.servers.stdiocheck.workspaces);
    expect(buckets).toEqual([{ root, targets: ['claude'], config }]);

    const capabilities = policyFrom(installer);
    const policy = await capabilities.resolve(root);
    expect(policy.status).toBe('verified');
    expect(policy.deniedMcpServers).not.toContain('stdiocheck');

    const sources = new GatewayServerSources({
      intents: store,
      capabilities,
      homeDir: home,
      claudeConfigDir: join(home, '.claude'),
      mainCheckoutRoot: () => null,
      env: {},
    });
    const host = fakeHost();
    const gateway = new McpGateway({ sources, capabilities, stdioHost: host });
    const scope: McpGatewayScope = {
      kind: 'session',
      capability: 'privileged',
      workspaceRoot: root,
      gatewayApproval: true,
    };

    const tools = await gateway.listTools(scope);

    expect(host.createClient).toHaveBeenCalledTimes(1);
    expect(host.createClient.mock.calls[0][0].spec.cwd).toBe(root);
    expect(host.listTools).toHaveBeenCalledTimes(1);
    expect(tools.map((tool) => tool.name)).toEqual(['stdiocheck__echo']);
    await gateway.dispose();
  });
});
