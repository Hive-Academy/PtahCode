import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn();
const mockExecFile = jest.fn((...args: unknown[]) =>
  (args.at(-1) as (error: null, stdout: string, stderr: string) => void)(
    null,
    '',
    '',
  ),
);

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: (...args: unknown[]) => mockExecFile(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  platform: jest.fn(() => 'win32'),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => false),
}));

import { ClaudeCliPathResolver } from './claude-cli-path-resolver';

class HangingChild extends EventEmitter {
  readonly pid = 6161;
  readonly killed = false;
  readonly stdout = new EventEmitter();
  readonly kill = jest.fn();
}

describe('ClaudeCliPathResolver process cleanup', () => {
  const realPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: realPlatform,
      configurable: true,
    });
  });

  it('bounds a wedged where.exe lookup and reaps its process tree', async () => {
    jest.useFakeTimers();
    try {
      const child = new HangingChild();
      mockSpawn.mockReturnValue(child);

      const result = new ClaudeCliPathResolver().resolve('claude');
      jest.advanceTimersByTime(30_000);

      await expect(result).resolves.toBeNull();
      await Promise.resolve();
      expect(mockSpawn).toHaveBeenCalledWith(
        'where',
        ['claude'],
        expect.objectContaining({ shell: false }),
      );
      expect(child.kill).not.toHaveBeenCalled();
      expect(mockExecFile).toHaveBeenCalledWith(
        expect.stringContaining('taskkill'),
        ['/pid', '6161', '/T', '/F'],
        { windowsHide: true, timeout: 3_000 },
        expect.any(Function),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ClaudeCliPathResolver with a process spawner', () => {
  beforeEach(() => mockSpawn.mockClear());

  it('runs where.exe through the spawner instead of spawning inline', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      pid: 7,
      killed: false,
      kill: jest.fn(),
    });
    const spawner = { spawnProcess: jest.fn(() => child) };

    const result = new ClaudeCliPathResolver(
      spawner as never,
    ).resolve('claude');
    await Promise.resolve();
    child.stdout.emit('data', Buffer.from('C:\\bin\\claude.exe\r\nC:\\other\r\n'));
    child.emit('close', 0, null);

    await expect(result).resolves.toBeNull();
    expect(spawner.spawnProcess).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'where', args: ['claude'] }),
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('logs a lookup that cannot start and treats it as not found', async () => {
    const spawner = {
      spawnProcess: jest.fn(() => {
        throw new Error('worker refused');
      }),
    };
    const logger = { warn: jest.fn() };

    const result = await new ClaudeCliPathResolver(
      spawner as never,
      logger as never,
    ).resolve('claude');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      '[ClaudeCliPathResolver] Path lookup could not start',
      expect.objectContaining({
        command: 'where',
        commandName: 'claude',
        error: 'worker refused',
      }),
    );
  });
});
