/**
 * The lane's spawn policy for ACP agents: `resolveDirectSpawn` first (a
 * Windows `.cmd` wrapper becomes `node <script>`), then `spawnCli` with the
 * lane environment merge, a detached group and orphan-descendant cleanup.
 */
const mockSpawnCli = jest.fn();
const mockResolveDirectSpawn = jest.fn();

jest.mock('../cli-adapter.utils', () => ({
  spawnCli: (...args: unknown[]) => mockSpawnCli(...args),
  resolveDirectSpawn: (...args: unknown[]) => mockResolveDirectSpawn(...args),
}));

import type { IProcessSpawner } from '@ptah-extension/platform-core';
import { cliAcpSpawnTransport } from './cli-acp-spawn-transport';

describe('cliAcpSpawnTransport', () => {
  beforeEach(() => {
    mockSpawnCli.mockReset();
    mockResolveDirectSpawn.mockReset();
  });

  it('runs a resolved Windows .cmd wrapper through the spawner with the lane spawn options', async () => {
    const handle = { pid: 42 };
    const spawner = { spawnProcess: jest.fn() } as unknown as IProcessSpawner;
    mockResolveDirectSpawn.mockResolvedValue({
      command: 'C:\\node\\node.exe',
      prefixArgs: ['C:\\npm\\node_modules\\grok\\cli.js'],
    });
    mockSpawnCli.mockReturnValue(handle);

    await expect(
      cliAcpSpawnTransport({
        command: 'C:\\npm\\grok.cmd',
        args: ['agent', '--no-leader', 'stdio'],
        cwd: 'D:\\work\\repo',
        env: { LANE: '1' },
        spawner,
      }),
    ).resolves.toBe(handle);

    expect(mockResolveDirectSpawn).toHaveBeenCalledWith('C:\\npm\\grok.cmd');
    expect(mockSpawnCli).toHaveBeenCalledWith(
      'C:\\node\\node.exe',
      ['C:\\npm\\node_modules\\grok\\cli.js', 'agent', '--no-leader', 'stdio'],
      {
        cwd: 'D:\\work\\repo',
        env: { LANE: '1' },
        detached: true,
        cleanupOrphanDescendants: true,
        windowsJobPolicy: 'no-job',
        spawner,
      },
    );
  });

  it('rejects when the command line is refused, so the transport settles as a failed spawn', async () => {
    mockResolveDirectSpawn.mockResolvedValue({ command: 'grok', prefixArgs: [] });
    mockSpawnCli.mockImplementation(() => {
      throw new Error('command line too long');
    });

    await expect(
      cliAcpSpawnTransport({ command: 'grok', args: [], cwd: '.' }),
    ).rejects.toThrow('command line too long');
  });
});
