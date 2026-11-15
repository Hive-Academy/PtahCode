import {
  ANTIGRAVITY_CLI_PARSE_BACKOFF_MS,
  ANTIGRAVITY_CLI_SHORT_BACKOFF_MS,
  ANTIGRAVITY_CLI_MAX_OUTPUT_BYTES,
  antigravityCliCandidates,
  parseAntigravityCliUsage,
  readAntigravityCliUsage,
  type AntigravityCliExec,
} from './antigravity-cli-usage.adapter';
import { ANTIGRAVITY_USAGE_FIXTURE } from './antigravity-usage.fixture';

const SAMPLE = [
  'Gemini Models\tWeekly Limit Remaining\t100%\t2030-10-27T00:08:58Z',
  'Gemini Models\tFive Hour Limit Remaining\t100%\t2030-10-20T05:08:58Z',
  'Claude and GPT models\tWeekly Limit Remaining\t60%\t2030-10-27T00:08:58Z',
  'Claude and GPT models\tFive Hour Limit Remaining\t25.5%\t2030-10-20T05:08:58Z',
  'Gemini 4 Argon\tGemini 4 Argon Weekly Limit\t100%\t2030-10-27T00:08:44Z',
].join('\n');

const errno = (code: string) =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;

describe('Antigravity CLI usage adapter', () => {
  describe('parseAntigravityCliUsage', () => {
    it('reads two JSON groups as four separate windows', () => {
      const output = JSON.stringify({ type: 'command', command: { name: 'usage', data: { groups: [
        { name: 'Gemini Models', windows: [
          { kind: 'weekly', remaining_fraction: 0.83, reset_time: '2030-01-08T00:00:00Z' },
          { kind: '5h', remaining_fraction: 1, reset_time: '2030-01-01T05:00:00Z' },
        ] },
        { name: 'Claude and GPT models', windows: [
          { kind: 'weekly', remaining_fraction: 0.25, reset_time: '2030-01-08T00:00:00Z' },
          { kind: '5h', remaining_fraction: 0, reset_time: '2030-01-01T05:00:00Z' },
        ] },
      ] } } });
      const windows = parseAntigravityCliUsage(output, 1);
      expect(windows).toHaveLength(4);
      expect(windows?.map((window) => window.used)).toEqual([17, 0, 75, 100].map((percent) => ({ kind: 'percent', percent })));
      expect(new Set(windows?.map((window) => window.key)).size).toBe(4);
      expect(windows?.[0]).toMatchObject({ label: 'Gemini Models · Weekly', resetsAt: Date.parse('2030-01-08T00:00:00Z') });
      expect(windows?.[3]).toMatchObject({ label: 'Claude and GPT models · 5 Hour', resetsAt: Date.parse('2030-01-01T05:00:00Z') });
      expect(windows?.every((window) => !('modelScope' in window) && !('exhaustion' in window))).toBe(true);
    });
    it('falls back from unusable JSON to TSV and accepts 5h', () => {
      expect(parseAntigravityCliUsage('{bad', 1)).toBeUndefined();
      expect(parseAntigravityCliUsage('G\t5h\t25%\t2030-01-01T05:00:00Z', 1)?.[0]).toMatchObject({ kind: 'five_hour', used: { percent: 75 } });
      expect(parseAntigravityCliUsage('{"type":"command"}', 1)).toBeUndefined();
    });
    it('caps TSV percent below 100 while quota remains', () => {
      const small = parseAntigravityCliUsage('Placeholder\tWeekly\t0.04%\t2030-01-01T00:00:00Z', 1);
      const empty = parseAntigravityCliUsage('Placeholder\tWeekly\t0%\t2030-01-01T00:00:00Z', 1);
      expect(small?.[0].used).toEqual({ kind: 'percent', percent: 99.9 });
      expect(empty?.[0].used).toEqual({ kind: 'percent', percent: 100 });
    });
    it('uses the same identity for JSON and TSV windows', () => {
      const json = JSON.stringify({ type: 'command', command: { name: 'usage', data: { groups: [
        { name: 'Placeholder Group', windows: [{ kind: 'weekly', remaining_fraction: 0.5 }] },
      ] } } });
      const tsv = 'Placeholder Group\tWeekly Limit Remaining\t50%\t2030-01-01T00:00:00Z';
      const jsonWindow = parseAntigravityCliUsage(json, 1)?.[0];
      const tsvWindow = parseAntigravityCliUsage(tsv, 1)?.[0];
      expect(jsonWindow?.key).toBe(tsvWindow?.key);
      expect(jsonWindow?.label).toBe(tsvWindow?.label);
    });
    it('maps remaining percent to used percent with resets', () => {
      const windows = parseAntigravityCliUsage(SAMPLE, 5);
      expect(windows).toHaveLength(5);
      expect(windows?.[0]).toMatchObject({
        key: 'other:cli-gemini-models-weekly',
        kind: 'weekly',
        used: { kind: 'percent', percent: 0 },
        resetsAt: Date.parse('2030-10-27T00:08:58Z'),
        usedSource: 'provider-unofficial',
      });
      expect(windows?.[1]).toMatchObject({ kind: 'five_hour' });
      expect(windows?.[2]?.used).toEqual({ kind: 'percent', percent: 40 });
      expect(windows?.[3]?.used).toEqual({ kind: 'percent', percent: 74.5 });
      expect(windows?.[4]).toMatchObject({
        kind: 'weekly',
      });
    });

    it('tolerates CRLF and blank lines', () => {
      expect(
        parseAntigravityCliUsage(SAMPLE.replace(/\n/g, '\r\n') + '\r\n\r\n', 1),
      ).toHaveLength(5);
    });

    it.each([
      ['empty output', ''],
      ['free text', 'Please sign in first'],
      ['three fields', 'G\tWeekly\t10%'],
      ['five fields', 'G\tWeekly\t10%\t2030-10-27T00:08:58Z\textra'],
      ['percent above 100', 'G\tWeekly\t101%\t2030-10-27T00:08:58Z'],
      ['no percent sign', 'G\tWeekly\t10\t2030-10-27T00:08:58Z'],
      ['negative percent', 'G\tWeekly\t-5%\t2030-10-27T00:08:58Z'],
      ['reset too far in the past', 'G\tWeekly\t10%\t2030-10-27T00:08:58Z'],
      ['non-ISO date', 'G\tWeekly\t10%\ttomorrow'],
      ['impossible date', 'G\tWeekly\t10%\t2026-13-45T99:99:99Z'],
      ['empty group', '\tWeekly\t10%\t2030-10-27T00:08:58Z'],
      ['one bad line among good ones', SAMPLE + '\nGarbage line without tabs'],
      [
        'duplicate windows',
        'G\tWeekly Limit\t10%\t2030-10-27T00:08:58Z\nG\tWeekly Limit\t20%\t2030-10-27T00:08:58Z',
      ],
    ])('rejects %s (fail closed)', (name, output) => {
      expect(
        parseAntigravityCliUsage(
          output,
          name === 'reset too far in the past'
            ? Date.parse('2030-10-29T00:08:58Z')
            : 1,
        ),
      ).toBeUndefined();
    });

    it('rejects oversized output', () => {
      expect(
        parseAntigravityCliUsage(
          'x'.repeat(ANTIGRAVITY_CLI_MAX_OUTPUT_BYTES + 1),
          1,
        ),
      ).toBeUndefined();
    });
  });

  describe('readAntigravityCliUsage', () => {
    it('creates and removes cwd around a successful run, then skips creation on cache hit', async () => {
      const order: string[] = [];
      const temporaryCwd = {
        create: jest.fn(async () => { order.push('create'); return 'temporary'; }),
        remove: jest.fn(async () => { order.push('remove'); }),
      };
      const exec: AntigravityCliExec = async () => { order.push('run'); return SAMPLE; };
      const options = { exec, temporaryCwd, executables: ['agy'], ownerKey: 'cwd-success' };
      expect((await readAntigravityCliUsage(undefined, options)).ok).toBe(true);
      expect(order).toEqual(['create', 'run', 'remove']);
      expect((await readAntigravityCliUsage(undefined, options)).ok).toBe(true);
      expect(temporaryCwd.create).toHaveBeenCalledTimes(1);
    });

    it('returns cli-unavailable when cwd creation fails', async () => {
      const exec = jest.fn(async () => SAMPLE);
      const create = jest.fn(async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
      const result = await readAntigravityCliUsage(undefined, { exec, executables: ['agy', 'agy-alt'],
        ownerKey: 'cwd-failure', temporaryCwd: {
          create, remove: jest.fn(),
        } });
      expect(result).toEqual({ ok: false, reason: 'cli-unavailable' });
      expect(exec).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('removes cwd after the run closes on abort', async () => {
      const order: string[] = [];
      const controller = new AbortController();
      let started!: () => void;
      let finish!: () => void;
      const start = new Promise<void>((resolve) => { started = resolve; });
      const exec: AntigravityCliExec = async () => {
        started();
        return new Promise<string>((resolve) => { finish = () => { order.push('closed'); resolve(SAMPLE); }; });
      };
      const pending = readAntigravityCliUsage(controller.signal, { exec, executables: ['agy'],
        ownerKey: 'cwd-abort', temporaryCwd: {
          create: async () => 'temporary', remove: async () => { order.push('remove'); },
        } });
      await start;
      controller.abort();
      await expect(pending).resolves.toMatchObject({ ok: false });
      expect(order).toEqual([]);
      finish();
      await new Promise((resolve) => setImmediate(resolve));
      expect(order).toEqual(['closed', 'remove']);
    });

    it('removes cwd after timeout closes the run', async () => {
      jest.useFakeTimers();
      try {
        const order: string[] = [];
        const exec: AntigravityCliExec = async (_command, _args, signal) =>
          new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => {
            order.push('closed'); reject(Object.assign(new Error('timeout'), { code: 'ABORT_ERR' }));
          }, { once: true }));
        const pending = readAntigravityCliUsage(undefined, { exec, executables: ['agy'],
          ownerKey: 'cwd-timeout', timeoutMs: 10, temporaryCwd: {
            create: async () => 'temporary', remove: async () => { order.push('remove'); },
          } });
        await jest.advanceTimersByTimeAsync(20);
        await expect(pending).resolves.toMatchObject({ reason: 'cli-timeout' });
        expect(order).toEqual(['closed', 'remove']);
      } finally { jest.useRealTimers(); }
    });

    it('starts a short back-off after timeout', async () => {
      jest.useFakeTimers();
      try {
        const exec = jest.fn<
          ReturnType<AntigravityCliExec>,
          Parameters<AntigravityCliExec>
        >(
          async (_executable, _args, signal) =>
            new Promise<string>((_, reject) =>
              signal.addEventListener(
                'abort',
                () =>
                  reject(
                    Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }),
                  ),
                { once: true },
              ),
            ),
        );
        const options = { exec, executables: ['agy'], now: Date.now };
        const pending = readAntigravityCliUsage(undefined, options);
        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(15_000);
        await expect(pending).resolves.toEqual({
          ok: false,
          reason: 'cli-timeout',
        });
        await expect(
          readAntigravityCliUsage(undefined, options),
        ).resolves.toMatchObject({ ok: false, reason: 'cli-backoff' });
        expect(exec).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_SHORT_BACKOFF_MS);
        const next = readAntigravityCliUsage(undefined, options);
        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(15_000);
        await expect(next).resolves.toEqual({
          ok: false,
          reason: 'cli-timeout',
        });
        expect(exec).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not back off when the caller aborts during CLI execution', async () => {
      const controller = new AbortController();
      let finish!: (value: string) => void;
      const exec = jest
        .fn<ReturnType<AntigravityCliExec>, Parameters<AntigravityCliExec>>()
        .mockImplementationOnce(
          async () => new Promise<string>((resolve) => { finish = resolve; }),
        )
        .mockResolvedValueOnce(SAMPLE);
      const options = { exec, executables: ['agy'] };
      const pending = readAntigravityCliUsage(controller.signal, options);
      await new Promise<void>((resolve) => setImmediate(resolve));
      controller.abort();
      await expect(pending).resolves.toEqual({
        ok: false,
        reason: 'cli-unavailable',
      });
      finish(SAMPLE);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect((await readAntigravityCliUsage(undefined, options)).ok).toBe(true);
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('shares one timer across two failing candidates', async () => {
      jest.useFakeTimers();
      try {
        const exec: AntigravityCliExec = async (_executable, _args, signal) =>
          new Promise<string>((_, reject) => {
            const timer = setTimeout(
              () => reject(Object.assign(new Error('exit'), { code: 1 })),
              10_000,
            );
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(
                  Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }),
                );
              },
              { once: true },
            );
          });
        const started = Date.now();
        const pending = readAntigravityCliUsage(undefined, {
          exec,
          executables: ['first', 'second'],
          now: Date.now,
        });
        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(15_000);
        await expect(pending).resolves.toEqual({
          ok: false,
          reason: 'cli-timeout',
        });
        expect(Date.now() - started).toBe(15_000);
      } finally {
        jest.useRealTimers();
      }
    });
    it('backs off after unrecognized output and clears it after a later success', async () => {
      let clock = 1;
      const exec = jest.fn(async () => ANTIGRAVITY_USAGE_FIXTURE);
      exec.mockResolvedValueOnce('unrecognized command');
      const options = { exec, executables: ['agy'], now: () => clock };
      await expect(
        readAntigravityCliUsage(undefined, options),
      ).resolves.toEqual({ ok: false, reason: 'cli-parse-failed' });
      await expect(
        readAntigravityCliUsage(undefined, options),
      ).resolves.toMatchObject({ ok: false, reason: 'cli-backoff' });
      expect(exec).toHaveBeenCalledTimes(1);
      clock += ANTIGRAVITY_CLI_PARSE_BACKOFF_MS;
      const success = await readAntigravityCliUsage(undefined, options);
      expect(success.ok).toBe(true);
      if (success.ok)
        expect(
          success.windows.map(({ kind }) => kind),
        ).toEqual([
          'weekly', 'five_hour', 'weekly', 'five_hour',
        ]);
      await readAntigravityCliUsage(undefined, options);
      expect(exec).toHaveBeenCalledTimes(2);
    });
    it('runs agy with an argument array and parses the result', async () => {
      const exec = jest.fn<
        ReturnType<AntigravityCliExec>,
        Parameters<AntigravityCliExec>
      >(async () => SAMPLE);
      const result = await readAntigravityCliUsage(undefined, {
        exec,
        executables: ['agy'],
      });
      expect(result.ok).toBe(true);
      expect(exec).toHaveBeenCalledWith(
        'agy',
        ['-p', '/usage', '--output-format', 'json'],
        expect.any(AbortSignal),
      );
    });

    it('falls through to the next candidate when the first is missing', async () => {
      const exec: AntigravityCliExec = jest.fn(async (executable: string) => {
        if (executable === 'agy') throw errno('ENOENT');
        return SAMPLE;
      });
      const result = await readAntigravityCliUsage(undefined, {
        exec,
        executables: ['agy', 'C:/agy/bin/agy.exe'],
      });
      expect(result.ok).toBe(true);
    });

    it('tries the install-directory binary after a PATH shim fails to spawn', async () => {
      const exec: AntigravityCliExec = jest.fn(async (executable: string) => {
        if (executable === 'agy') throw errno('EINVAL');
        return SAMPLE;
      });
      const result = await readAntigravityCliUsage(undefined, {
        exec,
        executables: ['agy', 'C:/agy/bin/agy.exe'],
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.windows[0].label).toContain(' \u00B7 ');
    });

    it('still reaches a working second candidate while the first is in backoff', async () => {
      const clock = 1;
      const exec: AntigravityCliExec = jest.fn(async (executable: string) => {
        if (executable === 'agy') throw errno('EINVAL');
        return SAMPLE;
      });
      const options = { exec, executables: ['agy', 'C:/agy/bin/agy.exe'], now: () => clock };
      const first = await readAntigravityCliUsage(undefined, options);
      const second = await readAntigravityCliUsage(undefined, options);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) expect(second.readAt).toBe(first.readAt);
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('reports the first real failure when every candidate fails', async () => {
      const exec: AntigravityCliExec = async (executable: string) => {
        throw errno(executable === 'agy' ? 'EINVAL' : 'ENOENT');
      };
      const result = await readAntigravityCliUsage(undefined, {
        exec,
        executables: ['agy', 'C:/agy/bin/agy.exe'],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).not.toBe('cli-not-found');
    });

    it('reports cli-not-found when no binary exists', async () => {
      const exec: AntigravityCliExec = async () => {
        throw errno('ENOENT');
      };
      await expect(
        readAntigravityCliUsage(undefined, { exec, executables: ['agy'] }),
      ).resolves.toEqual({ ok: false, reason: 'cli-not-found' });
    });

    it.each([
      ['killed by the timeout', { killed: true, code: null }, 'cli-timeout'],
      ['ETIMEDOUT', { code: 'ETIMEDOUT' }, 'cli-timeout'],
      ['an abort', { name: 'AbortError', code: 'ABORT_ERR' }, 'cli-timeout'],
      [
        'a clear sign-in message',
        { code: 1, stderr: 'Error: you are not signed in' },
        'cli-not-signed-in',
      ],
      [
        'a sign-in hint on stdout',
        { code: 1, stdout: 'Please sign in first' },
        'cli-not-signed-in',
      ],
      [
        'not logged into Antigravity',
        { code: 1, stderr: 'Not logged into Antigravity' },
        'cli-not-signed-in',
      ],
      [
        'a bare login instruction',
        { code: 1, stderr: 'Login to continue' },
        'cli-not-signed-in',
      ],
      [
        'an unrelated non-zero exit',
        { code: 2, stderr: 'segfault in plugin' },
        'cli-exit-error',
      ],
      ['a non-process error', {}, 'cli-unavailable'],
    ])('classifies %s as %s', async (_, props, reason) => {
      const exec: AntigravityCliExec = async () => {
        throw Object.assign(new Error('failed'), props);
      };
      await expect(
        readAntigravityCliUsage(undefined, { exec, executables: ['agy'] }),
      ).resolves.toEqual({ ok: false, reason });
    });

    it('never parses a failing run output as usage', async () => {
      const exec: AntigravityCliExec = async () => {
        throw Object.assign(new Error('failed'), {
          code: 1,
          stdout: SAMPLE,
        });
      };
      await expect(
        readAntigravityCliUsage(undefined, { exec, executables: ['agy'] }),
      ).resolves.toEqual({ ok: false, reason: 'cli-exit-error' });
    });

    it('reports cli-parse-failed for unrecognised output', async () => {
      await expect(
        readAntigravityCliUsage(undefined, {
          exec: async () => 'Usage: agy [options]',
          executables: ['agy'],
        }),
      ).resolves.toEqual({ ok: false, reason: 'cli-parse-failed' });
    });

    it('reports cli-parse-failed when output exceeds the buffer', async () => {
      const overflow = Object.assign(new Error('maxBuffer'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      });
      await expect(
        readAntigravityCliUsage(undefined, {
          exec: async () => {
            throw overflow;
          },
          executables: ['agy'],
        }),
      ).resolves.toEqual({ ok: false, reason: 'cli-parse-failed' });
    });

    it('does not run when the caller already aborted', async () => {
      const exec = jest.fn();
      const controller = new AbortController();
      controller.abort();
      await expect(
        readAntigravityCliUsage(controller.signal, {
          exec,
          executables: ['agy'],
        }),
      ).resolves.toEqual({ ok: false, reason: 'cli-unavailable' });
      expect(exec).not.toHaveBeenCalled();
    });

    it('passes a shell metacharacter only as data, never through a shell', async () => {
      const exec = jest.fn(async () => SAMPLE);
      await readAntigravityCliUsage(undefined, {
        exec,
        executables: ['agy; rm -rf /'],
      });
      // The executable is one argv[0] entry; the arguments are fixed.
      expect(exec).toHaveBeenCalledWith(
        'agy; rm -rf /',
        ['-p', '/usage', '--output-format', 'json'],
        expect.any(AbortSignal),
      );
    });
  });

  describe('antigravityCliCandidates', () => {
    it('adds the Windows install directory only when the binary exists', () => {
      const env = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
      expect(antigravityCliCandidates(env, 'win32', () => true)).toEqual([
        'agy',
        expect.stringMatching(/agy[\\/]bin[\\/]agy\.exe$/),
      ]);
      expect(antigravityCliCandidates(env, 'win32', () => false)).toEqual([
        'agy',
      ]);
      expect(antigravityCliCandidates(env, 'linux', () => true)).toEqual([
        'agy',
      ]);
    });
  });
});
