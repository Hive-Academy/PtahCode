/**
 * The lane's ACP spawn policy: a Windows `.cmd` wrapper becomes
 * `node <script>` (`resolveDirectSpawn`), the resolved command line is checked
 * against the length limit, and the base environment is the host environment
 * plus `CLI_CLEAN_ENV`.
 */
const mockResolveDirectSpawn = jest.fn();
const mockAssertCommandLine = jest.fn();

jest.mock('../cli-adapter.utils', () => ({
  CLI_CLEAN_ENV: { NO_COLOR: '1' },
  resolveDirectSpawn: (...args: unknown[]) => mockResolveDirectSpawn(...args),
  assertCommandLineWithinLimit: (...args: unknown[]) => mockAssertCommandLine(...args),
}));

import { laneAcpBaseEnv, laneAcpCommandPreparer } from './lane-acp-spawn';

describe('lane ACP spawn policy', () => {
  beforeEach(() => {
    mockResolveDirectSpawn.mockReset();
    mockAssertCommandLine.mockReset();
  });

  it('resolves a Windows .cmd wrapper and checks the resolved command line', async () => {
    mockResolveDirectSpawn.mockResolvedValue({
      command: 'C:\\node\\node.exe',
      prefixArgs: ['C:\\npm\\node_modules\\grok\\cli.js'],
    });

    await expect(
      laneAcpCommandPreparer('C:\\npm\\grok.cmd', ['agent', '--no-leader', 'stdio']),
    ).resolves.toEqual({
      command: 'C:\\node\\node.exe',
      prefixArgs: ['C:\\npm\\node_modules\\grok\\cli.js'],
    });
    expect(mockResolveDirectSpawn).toHaveBeenCalledWith('C:\\npm\\grok.cmd');
    expect(mockAssertCommandLine).toHaveBeenCalledWith('C:\\node\\node.exe', [
      'C:\\npm\\node_modules\\grok\\cli.js',
      'agent',
      '--no-leader',
      'stdio',
    ]);
  });

  it('rejects a command line over the limit, so the transport settles as a failed spawn', async () => {
    mockResolveDirectSpawn.mockResolvedValue({ command: 'grok', prefixArgs: [] });
    mockAssertCommandLine.mockImplementation(() => {
      throw new Error('command line too long');
    });
    await expect(laneAcpCommandPreparer('grok', [])).rejects.toThrow('command line too long');
  });

  it('bases the environment on the host one plus the clean-output variables', () => {
    process.env['PTAH_LANE_ENV_SPEC'] = 'host';
    try {
      expect(laneAcpBaseEnv()).toMatchObject({ PTAH_LANE_ENV_SPEC: 'host', NO_COLOR: '1' });
    } finally {
      delete process.env['PTAH_LANE_ENV_SPEC'];
    }
  });
});
