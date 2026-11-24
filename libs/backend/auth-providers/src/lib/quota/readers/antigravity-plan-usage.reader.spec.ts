import 'reflect-metadata';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { accountOwnerKey, quotaOwnerRefFromKey } from '../provider-owner.resolver';
import { ANTIGRAVITY_CSRF_HEADER, ANTIGRAVITY_REQUEST_BODY } from './antigravity-ls.provisional';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import { antigravityFailure, type AntigravitySourceFailure, type AntigravityUsageReading } from './antigravity-oauth-plan-usage.reader';
import { createAntigravityPlanUsageReader, ANTIGRAVITY_CHAIN_TIMEOUT_MS, defaultRequest, readJsonResponse } from './antigravity-plan-usage.reader';
import { readAntigravityCliUsage } from './antigravity-cli-usage.source';

// No spec may start agy: the CLI stage is a module mock, answering "not
// found" unless a test says otherwise.
jest.mock('./antigravity-cli-usage.source', () => ({ readAntigravityCliUsage: jest.fn() }));
const readCli = jest.mocked(readAntigravityCliUsage);
const cliFailure = (statusReason: 'cli-not-found' | 'cli-not-signed-in', cause: 'cli-not-found' | 'signed-out'): AntigravityUsageReading => ({
  status: 'service-unavailable', statusReason, windowSetEstablished: false, windows: [],
  sourceFailures: [{ source: 'cli-command', reason: statusReason, cause }],
});
beforeEach(() => {
  readCli.mockReset();
  readCli.mockImplementation(async () => cliFailure('cli-not-found', 'cli-not-found'));
});

const owner = quotaOwnerRefFromKey('antigravity#cli-store:fixture');
const target = { providerId: 'antigravity', ownerRef: owner };
const processOutput = 'P 123 /opt/antigravity/language_server --csrf_token fixture --extension_server_port 4444';
const valid = { userStatus: { email: 'synthetic@example.test', cascadeModelConfigData: {
  clientModelConfigs: [{ label: 'Gemini', quotaInfo: { remainingFraction: 0.4 } }],
} } };
function setup(oauth: AntigravityUsageReading = antigravityFailure('provider-api', 'missing-token-file'),
  processes = '', response: () => Promise<unknown> = async () => valid, observe = () => owner.key) {
  const logger = createMockLogger();
  const run = jest.fn(async () => processes);
  const readOAuth = jest.fn(async () => oauth);
  const reader = createAntigravityPlanUsageReader(logger as Partial<Logger> as Logger, Date.now,
    run, response, observe, readOAuth, () => owner);
  return { reader, logger, run, readOAuth };
}

describe('Antigravity source chain', () => {
  it('does not run the CLI for an account owner that agy does not name', async () => {
    const readStore = jest.fn(() => owner);
    const reader = createAntigravityPlanUsageReader(createMockLogger() as Partial<Logger> as Logger, () => 1,
      async () => processOutput, async () => ({}), () => owner.key,
      async () => antigravityFailure('provider-api', 'missing-token-file'), readStore);
    const result = await reader({ target: { providerId: 'antigravity',
      ownerRef: quotaOwnerRefFromKey(accountOwnerKey('antigravity', 'fixture')) }, refresh: true });
    expect(readStore).toHaveBeenCalled();
    expect(readCli).not.toHaveBeenCalled();
    expect(result.statusReason).toBe('account-unverified');
    expect(result.sourceFailures).toContainEqual(expect.objectContaining({ source: 'cli-command', cause: 'account-mismatch' }));
  });
  it('reports timeout when lsof exhausts discovery with no extension port', async () => {
    jest.useFakeTimers();
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      const reader = createAntigravityPlanUsageReader(createMockLogger() as Partial<Logger> as Logger, () => 1,
        async (command) => command === 'lsof' ? new Promise<string>(() => undefined)
          : 'P 123 /opt/antigravity/language_server --csrf_token fixture',
        async () => ({}), () => owner.key, async () => antigravityFailure('provider-api', 'missing-token-file'));
      const work = reader({ target, refresh: true });
      await jest.advanceTimersByTimeAsync(3_000);
      expect((await work).sourceFailures).toContainEqual(expect.objectContaining({ source: 'local-rpc', cause: 'timeout' }));
    } finally { if (platform) Object.defineProperty(process, 'platform', platform); jest.useRealTimers(); }
  });
  it('asks the CLI last after both absent direct sources, on every read', async () => {
    const { reader, readOAuth, run } = setup();
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await reader({ target, refresh: true })).toMatchObject({
        status: 'service-unavailable', windowSetEstablished: false, windows: [], statusReason: 'cli-not-found',
        sourceFailures: [{ cause: 'missing-token-file' }, { cause: 'missing-local-server' }, { cause: 'cli-not-found' }],
      });
    }
    expect(readOAuth).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(2);
    expect(readCli).toHaveBeenCalledTimes(2);
    expect(readOAuth.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0]);
    expect(run.mock.invocationCallOrder[0]).toBeLessThan(readCli.mock.invocationCallOrder[0]);
    expect(run.mock.calls.flat()).not.toContain('agy');
  });
  it('uses CLI windows when the token file and the IDE are absent, inside the chain budget', async () => {
    readCli.mockImplementation(async () => ({ status: 'available', fetchedAt: 5, windowSetEstablished: true,
      windows: [{ key: 'other:cli-gemini-models-weekly', kind: 'weekly', label: 'Gemini Models weekly',
        used: { kind: 'percent', percent: 20 }, observedAt: 5 }] }));
    const { reader } = setup();
    expect(await reader({ target, refresh: false })).toMatchObject({ status: 'available', source: 'cli-command',
      readAt: 5, windows: [{ key: 'other:cli-gemini-models-weekly' }] });
    const [, options] = readCli.mock.calls[0];
    expect(options.ownerKey).toBe(owner.key);
    // The cache key carries the account the CLI store names (here the owner itself).
    expect(options.accountFingerprint).toBe(owner.key);
    expect(options.budgetMs).toBeGreaterThan(0);
    expect(options.budgetMs).toBeLessThan(ANTIGRAVITY_CHAIN_TIMEOUT_MS);
  });
  it('passes a manual refresh on to the CLI stage, and a normal read as not a refresh', async () => {
    const { reader } = setup();
    await reader({ target, refresh: true });
    await reader({ target, refresh: false });
    expect(readCli.mock.calls.map(([, options]) => options.refresh)).toEqual([true, false]);
  });
  it('says "not signed in" only when the agy sign-in check says so', async () => {
    readCli.mockImplementation(async () => cliFailure('cli-not-signed-in', 'signed-out'));
    expect((await setup().reader({ target, refresh: true })).statusReason).toBe('cli-not-signed-in');
    readCli.mockImplementation(async () => cliFailure('cli-not-found', 'cli-not-found'));
    expect((await setup().reader({ target, refresh: true })).statusReason).toBe('cli-not-found');
  });
  it('names the missing IDE, not a sign-in, when the CLI stage does not apply', async () => {
    const { reader } = setup();
    const result = await reader({ target: { providerId: 'antigravity',
      ownerRef: { ...owner, identityKind: 'credential' } }, refresh: true });
    expect(readCli).not.toHaveBeenCalled();
    expect(result.statusReason).toBe('no-local-server');
  });
  it.each<AntigravitySourceFailure['cause']>(['missing-token-file', 'invalid-grant', 'http-rejection', 'schema-mismatch', 'timeout'])(
    'preserves OAuth %s through the final reading and debug log', async (cause) => {
      const oauth = antigravityFailure('provider-api', cause, cause === 'http-rejection' ? 429 : undefined);
      const { reader, logger } = setup(oauth);
      const result = await reader({ target, refresh: true });
      // An absent token file says nothing about the sign-in: the CLI cause wins.
      expect(result.statusReason).toBe(cause === 'missing-token-file' ? 'cli-not-found' : oauth.statusReason);
      expect(result.sourceFailures).toContainEqual(oauth.sourceFailures?.[0]);
      expect(logger.debug).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cause }));
      expect(JSON.stringify(logger.debug.mock.calls)).not.toMatch(/synthetic@|refresh_token|csrf_token/);
    });
  it.each(['schema-mismatch', 'http-rejection', 'account-mismatch'] as const)('preserves local %s', async (cause) => {
    const response = async () => {
      if (cause === 'http-rejection') throw new Error('status 503');
      return cause === 'schema-mismatch' ? { invalid: true } : valid;
    };
    const { reader, logger } = setup(undefined, processOutput, response, () => 'other');
    const result = await reader({ target, refresh: true });
    expect(result.sourceFailures).toContainEqual(expect.objectContaining({ source: 'local-rpc', cause,
      ...(cause === 'http-rejection' && { httpStatus: 503 }) }));
    expect(logger.debug).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cause }));
  });
  it('preserves invalid grant while trying the remaining sources', async () => {
    const { reader, run } = setup(antigravityFailure('provider-api', 'invalid-grant', 400));
    expect(await reader({ target, refresh: true, allowCliFallback: true })).toMatchObject({
      status: 'service-unavailable', statusReason: 'usage-auth-rejected',
      sourceFailures: [{ cause: 'invalid-grant', httpStatus: 400 }, { cause: 'missing-local-server' }, { cause: 'cli-not-found' }],
    });
    expect(run).toHaveBeenCalled();
  });
  it('aborts active work when the outer waiter cancels', async () => {
    const controller = new AbortController();
    let child: AbortSignal | undefined;
    const run = jest.fn(async () => '');
    const reader = createAntigravityPlanUsageReader(createMockLogger() as Partial<Logger> as Logger,
      Date.now, run, async () => valid, () => owner.key,
      async (signal) => { child = signal; return new Promise(() => undefined); });
    const pending = reader({ target, refresh: true, signal: controller.signal });
    controller.abort();
    await pending;
    expect(child?.aborted).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it('accepts verified local windows', async () => {
    const { reader } = setup(undefined, processOutput);
    expect(await reader({ target, refresh: true })).toMatchObject({ status: 'available', source: 'local-rpc',
      windows: [{ used: { percent: 60 } }] });
  });
  it('accepts complete OAuth windows before touching local discovery', async () => {
    const { reader, run } = setup({ status: 'available', windowSetEstablished: true,
      windows: [{ key: 'weekly', kind: 'weekly', label: 'Weekly', used: { kind: 'percent', percent: 50 }, observedAt: 1 }] });
    expect((await reader({ target, refresh: true })).source).toBe('provider-api');
    expect(run).not.toHaveBeenCalled();
  });
  it('settles hanging stages inside the chain budget with linked aborts', async () => {
    jest.useFakeTimers();
    try {
      const start = Date.now();
      const signals: AbortSignal[] = [];
      const reader = createAntigravityPlanUsageReader(createMockLogger() as Partial<Logger> as Logger, Date.now,
        async (_command, _args, signal) => { signals.push(signal); return new Promise(() => undefined); },
        async () => valid, () => owner.key,
        async (signal) => { if (signal) signals.push(signal); return new Promise(() => undefined); });
      const pending = reader({ target, refresh: true, allowCliFallback: true });
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CHAIN_TIMEOUT_MS);
      const result = await pending;
      expect(result.sourceFailures?.filter(({ cause }) => cause === 'timeout')).toHaveLength(2);
      expect(Date.now() - start).toBeLessThanOrEqual(ANTIGRAVITY_CHAIN_TIMEOUT_MS);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});

describe('restored local RPC coverage', () => {
const TOKEN = 'csrf-token';
const EMAIL = 'fixture-user@example.test';
const PROCESS =
  'P 123 /opt/antigravity/language_server --csrf_token ' +
  TOKEN +
  ' --extension_server_port 4444\nL 123 5555';
const response = {
  userStatus: {
    email: EMAIL,
    cascadeModelConfigData: {
      clientModelConfigs: [
        {
          label: 'Gemini',
          modelOrAlias: { model: 'gemini-3' },
          quotaInfo: {
            remainingFraction: 0.4,
            resetTime: '2030-01-01T00:00:00Z',
          },
        },
        { label: 'empty', quotaInfo: {} },
        { label: 'skip' },
      ],
    },
  },
};
const owner = accountOwnerKey(
  'antigravity',
  join(homedir(), '.gemini') +
    '\0' +
    EMAIL,
);
function reader(
  request: (
    scheme: 'http' | 'https',
    port: number,
    token: string,
    signal: AbortSignal,
  ) => Promise<unknown>,
  observe = () => owner,
) {
  return createAntigravityPlanUsageReader(
    createMockLogger() as Partial<Logger> as Logger,
    () => 1,
    async (command) => (command === 'lsof' ? 'n127.0.0.1:5555' : PROCESS),
    request,
    observe,
    async () => undefined,
  );
}
  it('tries HTTPS then HTTP and maps the provisional response without exposing its email', async () => {
    const request = jest.fn(async (scheme: 'http' | 'https') =>
      scheme === 'https' ? Promise.reject(new Error('tls')) : response,
    );
    const observe = jest.fn(() => owner);
    const result = await reader(
      request,
      observe,
    )({ target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) }, refresh: true, allowCliFallback: true });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'https',
      'http',
    ]);
    expect(observe).toHaveBeenCalledWith(EMAIL);
    expect(JSON.stringify(result)).not.toContain(EMAIL);
    expect(result).toMatchObject({
      status: 'available',
      windows: [{ modelScope: 'gemini-3', used: { percent: 60 } }],
    });
  });
  it('uses the extension port when no listener can be discovered', async () => {
    const request = jest.fn(async () => response);
    const instance = createAntigravityPlanUsageReader(
      createMockLogger() as Partial<Logger> as Logger,
      () => 1,
      async (command) =>
        command === 'lsof' ? '' : PROCESS.replace('L 123 5555', ''),
      request,
      () => owner,
    );
    await instance({
      target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
      refresh: true, allowCliFallback: true,
    });
    expect(request).toHaveBeenCalledWith(
      'http',
      4444,
      TOKEN,
      expect.any(AbortSignal),
    );
  });
  it('accepts padded POSIX pids, rejects ambiguous servers, and rejects no ports', async () => {
    const request = jest.fn(async () => response);
    const padded = createAntigravityPlanUsageReader(
      createMockLogger() as Partial<Logger> as Logger,
      () => 1,
      async (command) =>
        command === 'lsof'
          ? 'n127.0.0.1:5555'
          : PROCESS.replace('P 123', '  123'),
      request,
      () => owner,
    );
    await padded({
      target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
      refresh: true, allowCliFallback: true,
    });
    expect(request).toHaveBeenCalled();
    const unavailable = createAntigravityPlanUsageReader(
      createMockLogger() as Partial<Logger> as Logger,
      () => 1,
      async () =>
        `${PROCESS}\nP 456 /opt/antigravity/language_server --csrf_token other --extension_server_port 9999`,
      request,
      () => owner,
    );
    await expect(
      unavailable({
        target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
        refresh: true, allowCliFallback: true,
      }),
    ).resolves.toMatchObject({ status: 'service-unavailable' });
    const noPorts = createAntigravityPlanUsageReader(
      createMockLogger() as Partial<Logger> as Logger,
      () => 1,
      async () => ' 812 /opt/antigravity/language_server --csrf_token token',
      request,
      () => owner,
    );
    await expect(
      noPorts({ target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) }, refresh: true, allowCliFallback: true }),
    ).resolves.toMatchObject({ status: 'service-unavailable' });
  });
  it('caps long model names, parses reset time, and keeps logger output private', async () => {
    const logger = createMockLogger() as Partial<Logger> as Logger;
    const long = 'x'.repeat(100);
    const instance = createAntigravityPlanUsageReader(
      logger,
      () => 2,
      async (command) => (command === 'lsof' ? 'n127.0.0.1:5555' : PROCESS),
      async () => ({
        userStatus: {
          email: EMAIL,
          cascadeModelConfigData: {
            clientModelConfigs: [
              {
                label: long,
                quotaInfo: {
                  remainingFraction: 1,
                  resetTime: '2030-01-01T00:00:00Z',
                },
              },
            ],
          },
        },
      }),
      () => owner,
    );
    const result = await instance({
      target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
      refresh: true, allowCliFallback: true,
    });
    expect(result.windows[0]).toMatchObject({
      modelScope: long.slice(0, 64),
      resetsAt: Date.parse('2030-01-01T00:00:00Z'),
    });
    expect(JSON.stringify(logger)).not.toContain(EMAIL);
    expect(JSON.stringify(logger)).not.toContain(TOKEN);
  });
  it('sends confirmed headers and JSON body over a real loopback request', async () => {
    const seen = await new Promise<{
      headers: Record<string, string | string[] | undefined>;
      body: string;
    }>((resolve) => {
      const server = createServer((request, reply) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
          resolve({
            headers: request.headers,
            body: Buffer.concat(chunks).toString(),
          });
          reply.end('{}');
          server.close();
        });
      });
      server.listen(0, '127.0.0.1', async () => {
        const address = server.address();
        if (address && typeof address !== 'string')
          await defaultRequest(
            'http',
            address.port,
            TOKEN,
            new AbortController().signal,
          );
      });
    });
    expect(seen.headers[ANTIGRAVITY_CSRF_HEADER.toLowerCase()]).toBe(TOKEN);
    expect(seen.headers['content-type']).toBe('application/json');
    expect(seen.headers['connect-protocol-version']).toBe('1');
    expect(JSON.parse(seen.body)).toEqual(ANTIGRAVITY_REQUEST_BODY);
  });
  it('removes caller abort listener after settling', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    await reader(async () => response)({
      target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
      refresh: true, allowCliFallback: true,
      signal: controller.signal,
    });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it('handles quoted arguments, aborts discovery, and rejects a real closed-port request', async () => {
    const quoted =
      ' 812 "/opt/antigravity/language_server" --csrf_token="' +
      TOKEN +
      '" --extension_server_port=4444';
    const request = jest.fn(async () => response);
    const quotedReader = createAntigravityPlanUsageReader(
      createMockLogger() as Partial<Logger> as Logger,
      () => 1,
      async () => quoted,
      request,
      () => owner,
    );
    await quotedReader({
      target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
      refresh: true, allowCliFallback: true,
    });
    expect(request).toHaveBeenCalledWith(
      'http',
      4444,
      TOKEN,
      expect.any(AbortSignal),
    );
    const controller = new AbortController();
    const pending = createAntigravityPlanUsageReader(
      createMockLogger() as Partial<Logger> as Logger,
      () => 1,
      async () => new Promise<string>(() => undefined),
      request,
    )({
      target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
      refresh: true, allowCliFallback: true,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toMatchObject({
      status: 'no-usage-source',
    });
    const port = await new Promise<number>((resolve) => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        server.close(() =>
          resolve((address as import('node:net').AddressInfo).port),
        );
      });
    });
    await expect(
      defaultRequest('http', port, TOKEN, new AbortController().signal),
    ).rejects.toBeDefined();
  });
  it('clears a stale observation when the server disappears', async () => {
    const observe = jest.fn(() => owner);
    const gone = createAntigravityPlanUsageReader(
      createMockLogger() as Partial<Logger> as Logger,
      () => 1,
      async () => '',
      async () => response,
      observe,
    );
    await gone({
      target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) },
      refresh: true, allowCliFallback: true,
    });
    expect(observe).toHaveBeenCalledWith(null);
  });
  it('omits a model with no remaining fraction and is unavailable when none remain', async () => {
    const result = await reader(async () => ({
      userStatus: {
        email: EMAIL,
        cascadeModelConfigData: {
          clientModelConfigs: [{ label: 'unknown', quotaInfo: {} }],
        },
      },
    }))({ target: { providerId: 'antigravity', ownerRef: quotaOwnerRefFromKey(owner) }, refresh: true, allowCliFallback: true });
    expect(result).toMatchObject({
      status: 'service-unavailable',
      windows: [],
    });
  });
  it('keeps the confirmed transport constants exact', () => {
    expect(ANTIGRAVITY_CSRF_HEADER).toBe('X-Codeium-Csrf-Token');
    expect(ANTIGRAVITY_REQUEST_BODY).toEqual({
      metadata: {
        ideName: 'antigravity',
        extensionName: 'antigravity',
        ideVersion: 'unknown',
        locale: 'en',
      },
    });
  });
  it('settles once on a request error', async () => {
    const request = { on: jest.fn(), end: jest.fn(), destroy: jest.fn() };
    (request.on as jest.Mock).mockImplementation((event, listener) => {
      if (event === 'error') listener(new Error('ECONNREFUSED'));
      return request;
    });
    await expect(readJsonResponse(() => request as never)).rejects.toThrow(
      'ECONNREFUSED',
    );
  });

});

describe('fallback regressions', () => {
  it('uses local windows after invalid_grant', async () => {
    const { reader, run } = setup(antigravityFailure('provider-api', 'invalid-grant', 400), processOutput);
    expect(await reader({ target, refresh: true })).toMatchObject({
      status: 'available', source: 'local-rpc', windows: [{ used: { percent: 60 } }],
    });
    expect(run).toHaveBeenCalled();
  });
  it.each(['transport', 'schema', 'timeout'] as const)('clears stale observation when all candidates fail: %s', async (cause) => {
    jest.useFakeTimers();
    try {
      const observe = jest.fn(() => owner.key);
      const { reader } = setup(undefined, processOutput, async () => {
        if (cause === 'transport') throw new Error('closed');
        if (cause === 'timeout') return new Promise(() => undefined);
        return {};
      }, observe);
      const pending = reader({ target, refresh: true });
      await jest.advanceTimersByTimeAsync(3_000);
      expect((await pending).status).toBe('service-unavailable');
      expect(observe).toHaveBeenCalledWith(null);
    } finally { jest.useRealTimers(); }
  });
  it.each([0, 6_500, 7_500])('caps the local budget after a full OAuth timeout with %i ms of other elapsed time', async (overhead) => {
    jest.useFakeTimers();
    try {
      const start = Date.now();
      let localSignal: AbortSignal | undefined;
      const run = jest.fn(async (_command: string, _args: readonly string[], signal: AbortSignal) => {
        localSignal = signal;
        return new Promise<string>(() => undefined);
      });
      const clock = () => Date.now() + (Date.now() - start >= 3_000 ? overhead : 0);
      const reader = createAntigravityPlanUsageReader(createMockLogger() as Partial<Logger> as Logger,
        clock, run, async () => valid, () => owner.key, async () => new Promise(() => undefined));
      const pending = reader({ target, refresh: true });
      await jest.advanceTimersByTimeAsync(3_000);
      const budget = Math.min(3_000, ANTIGRAVITY_CHAIN_TIMEOUT_MS - 3_000 - overhead);
      if (budget >= 1_000) {
        expect(run).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(budget - 1);
        expect(localSignal?.aborted).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        expect(localSignal?.aborted).toBe(true);
      } else expect(run).not.toHaveBeenCalled();
      const failures = (await pending).sourceFailures ?? [];
      expect(failures.slice(0, 2)).toEqual([
        expect.objectContaining({ source: 'provider-api', cause: 'timeout' }),
        expect.objectContaining({ source: 'local-rpc', cause: 'timeout' }),
      ]);
      expect(failures.slice(2).every((failure) => failure.source === 'cli-command')).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});
