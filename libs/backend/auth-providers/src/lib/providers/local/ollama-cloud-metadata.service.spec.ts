import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { OllamaCloudMetadataService } from './ollama-cloud-metadata.service';
import type { OpenRouterPricingService } from '../openrouter';
import { ModelListError } from '../../model-list-error';

function jsonResponse(body: unknown, status = 200): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status });
}

describe('OllamaCloudMetadataService.fetchCloudTags', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function service() {
    return new OllamaCloudMetadataService(
      createMockLogger() as unknown as Logger,
      {
        getCatalog: jest.fn().mockResolvedValue([]),
        clearCache: jest.fn(),
      } as unknown as OpenRouterPricingService,
    );
  }

  it('maps names to cloud ids and copies a string-array capabilities list', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        models: [
          { name: 'glm-5.3', capabilities: ['completion', 'tools'] },
          { name: 'gpt-oss:120b', capabilities: ['completion', 7] },
          { model: 'kimi-k3' },
          { name: 'glm-5.3:cloud' },
        ],
      }),
    );

    const tags = await service().fetchCloudTags(null);

    expect(tags).toEqual([
      { id: 'glm-5.3:cloud', capabilities: ['completion', 'tools'] },
      { id: 'gpt-oss:120b-cloud' },
      { id: 'kimi-k3:cloud' },
    ]);
  });

  it('caches a successful empty list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [] }));
    const svc = service();
    await expect(svc.fetchCloudTags(null)).resolves.toEqual([]);
    await expect(svc.fetchCloudTags(null)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each<[string, () => Promise<Response>, string]>([
    ['a non-2xx status', async () => jsonResponse('nope', 503), 'http-error'],
    [
      'a missing models array',
      async () => jsonResponse({ data: [] }),
      'bad-response',
    ],
    ['a non-JSON body', async () => jsonResponse('<html>'), 'bad-response'],
    ['an empty body', async () => jsonResponse(''), 'bad-response'],
    [
      'a connection failure',
      async () => {
        throw new TypeError('fetch failed');
      },
      'network',
    ],
  ])(
    'throws ModelListError for %s and does not cache it',
    async (_label, answer, reason) => {
      fetchMock.mockImplementationOnce(answer);
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ models: [{ name: 'glm-5.3' }] }),
      );
      const svc = service();

      const failure = svc.fetchCloudTags(null);
      await expect(failure).rejects.toBeInstanceOf(ModelListError);
      await expect(failure).rejects.toMatchObject({ reason });

      // The failure was not cached: the next call fetches again.
      await expect(svc.fetchCloudTags(null)).resolves.toEqual([
        { id: 'glm-5.3:cloud' },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('throws timeout when the request is aborted by its deadline', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const failure = service().fetchCloudTags(null);
      jest.advanceTimersByTime(10_000);
      await expect(failure).rejects.toMatchObject({ reason: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends the API key as a Bearer token when one is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [] }));
    await service().fetchCloudTags('oc_key');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ollama.com/api/tags',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer oc_key' }),
      }),
    );
  });
});
