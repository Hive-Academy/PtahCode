import 'reflect-metadata';
import * as http from 'http';
import type { AddressInfo } from 'net';
import type { ConfigManager, Logger } from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { LmStudioTranslationProxy } from './local-model-translation-proxy';
import { ModelListError } from '../../model-list-error';

/**
 * LM Studio `listModels` is the provider's live model-list route. A failure
 * must throw a classified `ModelListError` and never read as an empty list,
 * so a stopped server is not reported as "returned no models".
 */
describe('LmStudioTranslationProxy.listModels', () => {
  let server: http.Server;
  let baseUrl: string;
  let respond: (res: http.ServerResponse) => void;

  beforeAll(async () => {
    server = http.createServer((_req, res) => respond(res));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function proxy(url: () => string = () => baseUrl): LmStudioTranslationProxy {
    return new LmStudioTranslationProxy(
      createMockLogger() as unknown as Logger,
      { get: jest.fn(() => url()) } as unknown as ConfigManager,
    );
  }

  function answer(status: number, body: string): void {
    respond = (res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body);
    };
  }

  it('lists the served model ids', async () => {
    answer(200, JSON.stringify({ data: [{ id: 'qwen3-coder-30b' }, { x: 1 }] }));
    const models = await proxy().listModels();
    expect(models.map((m) => m.id)).toEqual(['qwen3-coder-30b']);
  });

  it('returns [] for a server that answers with no models', async () => {
    answer(200, JSON.stringify({ data: [] }));
    await expect(proxy().listModels()).resolves.toEqual([]);
  });

  it.each<[string, number, string, string]>([
    ['a 500', 500, 'boom', 'http-error'],
    ['a 401', 401, 'no', 'auth-rejected'],
    ['a non-JSON body', 200, '<html>', 'bad-response'],
    ['a body without a model array', 200, '{"ok":true}', 'bad-response'],
  ])('throws ModelListError for %s', async (_label, status, body, reason) => {
    answer(status, body);
    const failure = proxy().listModels();
    await expect(failure).rejects.toBeInstanceOf(ModelListError);
    await expect(failure).rejects.toMatchObject({ reason });
  });

  it('throws network for a stopped server', async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, '127.0.0.1', resolve),
    );
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    await expect(
      proxy(() => `http://127.0.0.1:${port}`).listModels(),
    ).rejects.toMatchObject({ reason: 'network' });
  });
});
