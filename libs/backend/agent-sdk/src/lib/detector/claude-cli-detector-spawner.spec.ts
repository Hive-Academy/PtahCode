import 'reflect-metadata';
import { EventEmitter } from 'node:events';

jest.mock('cross-spawn', () => ({ __esModule: true, default: jest.fn() }));

import crossSpawn from 'cross-spawn';
import { ClaudeCliDetector } from './claude-cli-detector';

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
};

/** Reaches the private command runner; every detection strategy goes through it. */
function run(
  detector: ClaudeCliDetector,
  command: string,
  args: string[],
): Promise<CommandResult> {
  return (
    detector as unknown as {
      executeCommand(c: string, a: string[], o: object): Promise<CommandResult>;
    }
  ).executeCommand(command, args, { timeout: 5000 });
}

describe('ClaudeCliDetector with a process spawner', () => {
  beforeEach(() => jest.mocked(crossSpawn).mockClear());

  it('runs probe commands through the spawner instead of cross-spawn', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      pid: 3,
      killed: false,
      kill: jest.fn(),
    });
    const spawner = { spawnProcess: jest.fn(() => child) };
    const detector = new ClaudeCliDetector(undefined, spawner as never);

    const result = run(detector, 'claude', ['--version']);
    child.stdout.emit('data', Buffer.from('2.1.0 (Claude Code)'));
    child.emit('close', 0, null);

    await expect(result).resolves.toEqual({
      success: true,
      stdout: '2.1.0 (Claude Code)',
      stderr: '',
      exitCode: 0,
    });
    expect(spawner.spawnProcess).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'claude', args: ['--version'] }),
    );
    expect(crossSpawn).not.toHaveBeenCalled();
  });

  it('kills a probe that times out before its pid is known', async () => {
    jest.useFakeTimers();
    try {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        pid: undefined,
        killed: false,
        exitCode: null,
        whenSpawned: new Promise<number | null>(() => undefined),
        kill: jest.fn(),
      });
      const detector = new ClaudeCliDetector(undefined, {
        spawnProcess: jest.fn(() => child),
      } as never);

      const result = run(detector, 'claude', ['--version']);
      jest.advanceTimersByTime(5000);

      await expect(result).resolves.toEqual({
        success: false,
        stdout: '',
        stderr: 'Command timeout',
        exitCode: -1,
      });
      expect(child.kill).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('logs a command that cannot start and reports it as a failed probe', async () => {
    const spawner = {
      spawnProcess: jest.fn(() => {
        throw new Error('worker refused');
      }),
    };
    const logger = { warn: jest.fn() };
    const detector = new ClaudeCliDetector(
      undefined,
      spawner as never,
      logger as never,
    );

    await expect(run(detector, 'npm', ['config', 'get', 'prefix'])).resolves
      .toEqual({
        success: false,
        stdout: '',
        stderr: 'worker refused',
        exitCode: -1,
      });
    expect(logger.warn).toHaveBeenCalledWith(
      '[ClaudeCliDetector] Probe command could not start',
      { command: 'npm', error: 'worker refused' },
    );
  });
});
