import 'reflect-metadata';
import * as http from 'http';
import type { AddressInfo } from 'net';
import type {
  Logger,
  ConfigManager,
  IAuthSecretsService,
  SentryService,
} from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { OllamaModelDiscoveryService } from './ollama-model-discovery.service';
import type {
  OllamaCloudMetadataService,
  OllamaCloudTag,
} from './ollama-cloud-metadata.service';
import { ModelListError } from '../../model-list-error';

const OLLAMA_COM_SHOW = 'https://ollama.com/api/show';

function refused(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
    code: 'ECONNREFUSED',
  });
}

function harness(
  options: {
    configGet?: jest.Mock;
    cloudTags?: readonly OllamaCloudTag[] | Error;
    localTags?: readonly { name: string }[] | Error;
  } = {},
) {
  const sentry = { captureException: jest.fn() };
  const fetchCloudTags = jest.fn();
  if (options.cloudTags instanceof Error)
    fetchCloudTags.mockRejectedValue(options.cloudTags);
  else fetchCloudTags.mockResolvedValue(options.cloudTags ?? []);
  const service = new OllamaModelDiscoveryService(
    createMockLogger() as unknown as Logger,
    { get: options.configGet ?? jest.fn() } as unknown as ConfigManager,
    { fetchCloudTags } as unknown as OllamaCloudMetadataService,
    {
      getProviderKey: jest.fn().mockResolvedValue(null),
    } as unknown as IAuthSecretsService,
    sentry as unknown as SentryService,
  );
  const transport = service as unknown as {
    httpGet: () => Promise<unknown>;
    httpPost: (url: string, body: unknown) => Promise<unknown>;
  };
  const get = jest.spyOn(transport, 'httpGet');
  const localTags = options.localTags ?? [{ name: 'llama3:latest' }];
  if (localTags instanceof Error) get.mockRejectedValue(localTags);
  else get.mockResolvedValue({ models: localTags });
  const post = jest.spyOn(transport, 'httpPost');
  return { service, post, get, sentry, fetchCloudTags };
}

describe('Ollama local discovery', () => {
  it.each([200000, undefined, 0, -1, NaN, Infinity])(
    'certifies only a valid /api/show window (%s), including cached reads',
    async (value) => {
      const { service, post } = harness();
      post.mockResolvedValue({ modelinfo: { 'llama.context_length': value } });
      for (let i = 0; i < 2; i++) {
        const [model] = await service.listLocalModels();
        if (value === 200000)
          expect(model).toHaveProperty('contextLengthSource', 'provider');
        else expect(model).not.toHaveProperty('contextLengthSource');
      }
      expect(post).toHaveBeenCalledTimes(1);
    },
  );

  it('validates each reported window before choosing one (general 0, llama 32768)', async () => {
    const { service, post } = harness();
    post.mockResolvedValue({
      modelinfo: {
        'general.context_length': 0,
        'llama.context_length': 32768,
      },
    });
    const [model] = await service.listLocalModels();
    expect(model.contextLength).toBe(32768);
    expect(model).toHaveProperty('contextLengthSource', 'provider');
  });

  it('reads model_info and any architecture key ending in .context_length', async () => {
    const { service, post } = harness();
    post.mockResolvedValue({
      model_info: {
        'general.architecture': 'gptoss',
        'gptoss.context_length': 131072,
      },
    });
    const [model] = await service.listLocalModels();
    expect(model.contextLength).toBe(131072);
    expect(model).toHaveProperty('contextLengthSource', 'provider');
  });

  it('does not certify a fractional reported window', async () => {
    const { service, post } = harness();
    post.mockResolvedValue({
      modelinfo: { 'general.context_length': 4096.5 },
    });
    const [model] = await service.listLocalModels();
    expect(model).not.toHaveProperty('contextLengthSource');
  });

  it('never reuses one server’s cached metadata for another base URL', async () => {
    let baseUrl = 'http://127.0.0.1:11434';
    const { service, post } = harness({ configGet: jest.fn(() => baseUrl) });
    post.mockResolvedValueOnce({
      modelinfo: { 'llama.context_length': 200000 },
    });
    post.mockResolvedValueOnce({
      modelinfo: { 'llama.context_length': 8000 },
    });

    const [first] = await service.listLocalModels();
    baseUrl = 'http://192.168.1.20:11434';
    const [second] = await service.listLocalModels();

    expect(first.contextLength).toBe(200000);
    expect(second.contextLength).toBe(8000);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith(
      'http://192.168.1.20:11434/api/show',
      { model: 'llama3:latest' },
    );
  });

  it('keeps a local show error unverified', async () => {
    const { service, post } = harness();
    post.mockRejectedValue(new Error('offline'));
    const [fallback] = await service.listLocalModels();
    expect(fallback.contextLength).toBe(8192);
    expect(fallback).not.toHaveProperty('contextLengthSource');
  });

  it('throws ModelListError(network) when the daemon is unreachable, and reports it', async () => {
    const { service, sentry } = harness({ localTags: refused() });
    const failure = service.listLocalModels();
    await expect(failure).rejects.toBeInstanceOf(ModelListError);
    await expect(failure).rejects.toMatchObject({ reason: 'network' });
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        errorSource: 'OllamaModelDiscoveryService.listModels',
        activeProvider: 'ollama',
      }),
    );
  });

  it('returns [] for a reachable daemon with no models', async () => {
    const { service } = harness({ localTags: [] });
    await expect(service.listLocalModels()).resolves.toEqual([]);
  });
});

describe('Ollama Cloud discovery', () => {
  it('lists the union of ollama.com and local cloud tags, ollama.com fields winning', async () => {
    const { service, post } = harness({
      cloudTags: [
        { id: 'glm-5.3:cloud', capabilities: ['completion', 'tools'] },
        { id: 'gpt-oss:120b-cloud', capabilities: ['completion', 'thinking'] },
      ],
      localTags: [
        { name: 'glm-5.3:cloud' },
        { name: 'qwen3-coder:480b-cloud' },
        { name: 'llama3:latest' },
      ],
    });
    post.mockImplementation(async (url: string) =>
      url === OLLAMA_COM_SHOW
        ? { model_info: { 'glm5.context_length': 1048576 } }
        : { modelinfo: { 'llama.context_length': 4096 }, template: 'tool' },
    );

    const models = await service.listCloudModels();

    expect(models.map((m) => m.id)).toEqual([
      'glm-5.3:cloud',
      'gpt-oss:120b-cloud',
      'qwen3-coder:480b-cloud',
    ]);
    const [glm, gptOss, qwen] = models;
    expect(glm).toMatchObject({
      contextLength: 1048576,
      contextLengthSource: 'provider',
      supportsToolUse: true,
    });
    expect(glm).not.toHaveProperty('toolUseUnknown');
    // The tool flag comes from the declared capabilities, not a name guess.
    expect(gptOss.supportsToolUse).toBe(false);
    // The local-only cloud tag keeps the daemon's metadata.
    expect(qwen.contextLength).toBe(4096);
    expect(post).toHaveBeenCalledWith(OLLAMA_COM_SHOW, {
      model: 'glm-5.3:cloud',
    });
  });

  it('drops ollama.com entries without completion and marks undeclared tool support unknown', async () => {
    const { service, post } = harness({
      cloudTags: [
        { id: 'clef:27b-cloud', capabilities: ['decision', 'vision'] },
        { id: 'mystery:cloud' },
      ],
      localTags: [],
    });
    post.mockResolvedValue({ model_info: { 'x.context_length': 32768 } });

    const models = await service.listCloudModels();

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: 'mystery:cloud',
      supportsToolUse: false,
      toolUseUnknown: true,
    });
  });

  it('keeps a row whose ollama.com enrichment fails, with an unknown window', async () => {
    const { service, post } = harness({
      cloudTags: [{ id: 'kimi-k3:cloud', capabilities: ['completion'] }],
      localTags: [],
    });
    post.mockRejectedValue(new ModelListError('timeout'));

    const [model] = await service.listCloudModels();

    expect(model.id).toBe('kimi-k3:cloud');
    expect(model.contextLength).toBe(0);
    expect(model).not.toHaveProperty('contextLengthSource');
  });

  it('throws the ollama.com reason when both sources fail', async () => {
    const { service } = harness({
      cloudTags: new ModelListError('timeout'),
      localTags: refused(),
    });
    const failure = service.listCloudModels();
    await expect(failure).rejects.toBeInstanceOf(ModelListError);
    await expect(failure).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('throws the ollama.com reason when it fails and the daemon has no cloud tags', async () => {
    const { service } = harness({
      cloudTags: new ModelListError('http-error'),
      localTags: [{ name: 'llama3:latest' }],
    });
    await expect(service.listCloudModels()).rejects.toMatchObject({
      reason: 'http-error',
    });
  });

  it('throws the ollama.com reason instead of a partial list when only ollama.com fails', async () => {
    // The local cloud tags alone would be cached and persisted as the full
    // live catalog (S2); the failure lets the caller show the saved list.
    const { service, post } = harness({
      cloudTags: new ModelListError('network'),
      localTags: [{ name: 'gpt-oss:20b-cloud' }],
    });
    post.mockResolvedValue({ modelinfo: {} });
    await expect(service.listCloudModels()).rejects.toMatchObject({
      reason: 'network',
    });
  });

  it('returns [] when ollama.com answers empty and the daemon is down', async () => {
    const { service } = harness({ cloudTags: [], localTags: refused() });
    await expect(service.listCloudModels()).resolves.toEqual([]);
  });
});

describe('Ollama HTTP transport', () => {
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

  function realService() {
    return new OllamaModelDiscoveryService(
      createMockLogger() as unknown as Logger,
      { get: jest.fn(() => baseUrl) } as unknown as ConfigManager,
      {} as unknown as OllamaCloudMetadataService,
      {} as unknown as IAuthSecretsService,
      { captureException: jest.fn() } as unknown as SentryService,
    );
  }

  it('rejects a body over 1 MiB as bad-response', async () => {
    respond = (res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(`{"models":[],"pad":"${'x'.repeat(1024 * 1024 + 16)}"}`);
    };
    await expect(realService().listLocalModels()).rejects.toMatchObject({
      reason: 'bad-response',
    });
  });

  it('rejects a non-2xx status as http-error', async () => {
    respond = (res) => {
      res.writeHead(500);
      res.end('boom');
    };
    await expect(realService().listLocalModels()).rejects.toMatchObject({
      reason: 'http-error',
    });
  });

  it.each([401, 403])('rejects HTTP %i as auth-rejected', async (status) => {
    respond = (res) => {
      res.writeHead(status);
      res.end('denied');
    };
    await expect(realService().listLocalModels()).rejects.toMatchObject({
      reason: 'auth-rejected',
    });
  });

  it('rejects a non-JSON body as bad-response', async () => {
    respond = (res) => {
      res.writeHead(200);
      res.end('<html>');
    };
    await expect(realService().listLocalModels()).rejects.toMatchObject({
      reason: 'bad-response',
    });
  });
});
