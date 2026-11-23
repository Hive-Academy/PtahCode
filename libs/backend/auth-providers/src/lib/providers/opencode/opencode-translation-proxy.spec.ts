import 'reflect-metadata';
import * as http from 'http';
import type { Logger } from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  getAnthropicProvider,
  type OpenCodeProtocol,
  type OpenCodeProviderId,
} from '@ptah-extension/shared';
import { providerQuotaStore } from '../../auth/provider-quota.store';
import { translateAnthropicToResponses } from '../../translation/responses-request-translator';
import { guardResponsesToolNames } from '../../translation/responses-tool-names';
import { TOOL_OUTPUT_IMAGE_PLACEHOLDER } from '../../translation/responses-tool-output-images';
import type {
  AnthropicContentBlock,
  AnthropicMessagesRequest,
} from '../../translation/openai-translation.types';
import { OpenCodeTranslationProxy } from './opencode-translation-proxy';
import type { IOpenCodeAuthService } from './opencode-provider.types';
import { openCodeLiveRoutes } from './opencode-live-routes';

/**
 * Spec fixture standing in for the live gateway catalog. The proxy itself
 * holds no model list; it routes only what the gateway reports.
 */
const LIVE_ROUTES: Record<
  OpenCodeProviderId,
  Record<string, OpenCodeProtocol>
> = {
  'opencode-zen': {
    'claude-sonnet-5': 'messages',
    'claude-opus-5': 'messages',
    'claude-haiku-4-5': 'messages',
    'minimax-m3': 'chat/completions',
    'minimax-m2.7': 'chat/completions',
    'minimax-m2.5': 'chat/completions',
    'gpt-5.6-luna': 'responses',
  },
  'opencode-go': {
    'glm-5.3': 'chat/completions',
    'glm-5.3-flash': 'chat/completions',
    'kimi-k3': 'messages',
    'minimax-m3': 'messages',
    'minimax-m2.7': 'messages',
    'minimax-m2.5': 'messages',
    'gpt-5.6-luna': 'responses',
  },
};
let liveRoutes: typeof LIVE_ROUTES | null;

class TestProxy extends OpenCodeTranslationProxy {
  origin?: string;
  timeout = 600_000;
  /** Lets a spec exercise the base 401 refresh-and-retry path. */
  authRecovers = false;
  protected override async onAuthFailure() {
    return this.authRecovers || super.onAuthFailure();
  }
  public resolveRequestModelIdPublic(id: string) {
    return this.resolveRequestModelId(id);
  }
  public override async getApiEndpoint() {
    const actual = await super.getApiEndpoint();
    return this.origin ? this.origin + new URL(actual).pathname : actual;
  }
  protected override getUpstreamTimeoutMs() {
    return this.timeout;
  }
}

const nativeResponse = JSON.stringify({
  id: 'msg_native',
  type: 'message',
  role: 'assistant',
  content: [
    { type: 'text', text: 'hello' },
    { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a' } },
  ],
  model: 'minimax-m3',
  stop_reason: 'tool_use',
  usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 1 },
});
const nativeSse =
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_native","usage":{"input_tokens":3}}}\n\nevent: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"upstream event"}}\n\n';
const chatResponse = {
  id: 'chat_1',
  object: 'chat.completion',
  model: 'glm-5.3',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'hello',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"a"}' },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
};
const responsesResponse = {
  id: 'resp_1',
  status: 'completed',
  model: 'grok-4.7',
  output: [
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'hello' }],
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'read_file',
      arguments: '{"path":"a"}',
      status: 'completed',
    },
  ],
  usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
};

function post(url: string, body: string, headers: Record<string, string> = {}) {
  return new Promise<{
    status: number;
    body: string;
    headers: http.IncomingHttpHeaders;
  }>((resolve, reject) => {
    const req = http.request(
      `${url}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

describe('OpenCodeTranslationProxy', () => {
  let upstream: http.Server;
  let origin: string;
  let requests: Array<{
    path: string;
    headers: http.IncomingHttpHeaders;
    raw: string;
  }>;
  let respond: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: Record<string, unknown>,
  ) => void;
  const proxies: TestProxy[] = [];
  const logger = createMockLogger();

  async function proxy(id: OpenCodeProviderId, auth?: IOpenCodeAuthService) {
    const p = new TestProxy(
      logger as unknown as Logger,
      id,
      auth ?? {
        isAuthenticated: async () => true,
        getApiKey: async () => `${id}-key`,
        getHeaders: async () => ({
          Authorization: `Bearer ${id}-key`,
          'Content-Type': 'application/json',
        }),
      },
    );
    p.origin = origin;
    proxies.push(p);
    const { url } = await p.start();
    return { p, url };
  }

  beforeEach(async () => {
    providerQuotaStore.clear();
    jest.clearAllMocks();
    liveRoutes = LIVE_ROUTES;
    jest
      .spyOn(openCodeLiveRoutes, 'modelIds')
      .mockImplementation(async (id) =>
        liveRoutes ? Object.keys(liveRoutes[id]) : null,
      );
    jest
      .spyOn(openCodeLiveRoutes, 'resolve')
      .mockImplementation(async (id, model) => {
        if (!liveRoutes) return { outcome: 'catalog-unavailable' };
        const protocol = Object.prototype.hasOwnProperty.call(
          liveRoutes[id],
          model,
        )
          ? liveRoutes[id][model]
          : undefined;
        return protocol
          ? { outcome: 'routed', protocol }
          : { outcome: 'not-listed' };
      });
    requests = [];
    respond = (req, res, body) => {
      const native = req.url?.endsWith('/messages');
      const responses = req.url?.endsWith('/responses');
      if (body.stream) {
        res.setHeader('content-type', 'text/event-stream');
        if (native) res.end(nativeSse);
        else if (responses) {
          const events = [
            {
              type: 'response.output_text.delta',
              output_index: 0,
              delta: 'hello',
            },
            {
              type: 'response.output_item.added',
              output_index: 1,
              item: {
                type: 'function_call',
                id: 'fc_1',
                call_id: 'call_1',
                name: 'read_file',
                arguments: '',
              },
            },
            {
              type: 'response.function_call_arguments.delta',
              output_index: 1,
              delta: '{"path":"a"}',
            },
            {
              type: 'response.output_item.done',
              output_index: 1,
              item: responsesResponse.output[1],
            },
            { type: 'response.completed', response: responsesResponse },
          ];
          res.end(
            events
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join('') + 'data: [DONE]\n\n',
          );
        } else
          res.end(
            `data: ${JSON.stringify({
              id: 'chat_1',
              object: 'chat.completion.chunk',
              model: 'glm-5.3',
              choices: [
                {
                  index: 0,
                  delta: {
                    role: 'assistant',
                    content: 'hello',
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call_1',
                        type: 'function',
                        function: {
                          name: 'read_file',
                          arguments: '{"path":"a"}',
                        },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
              usage: chatResponse.usage,
            })}\n\ndata: [DONE]\n\n`,
          );
      } else {
        res.setHeader('content-type', 'application/json');
        res.end(
          native
            ? nativeResponse
            : JSON.stringify(responses ? responsesResponse : chatResponse),
        );
      }
    };
    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        requests.push({ path: req.url ?? '', headers: req.headers, raw });
        respond(req, res, JSON.parse(raw) as Record<string, unknown>);
      });
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    const address = upstream.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing fake upstream address');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await Promise.all(proxies.splice(0).map((p) => p.stop()));
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
    providerQuotaStore.clear();
    jest.restoreAllMocks();
  });

  describe('tier alias resolution', () => {
    it.each(['opencode-zen', 'opencode-go'] as const)(
      '%s resolves aliases to the listed preference and passes other ids through',
      async (id) => {
        const { p } = await proxy(id);
        const tiers = getAnthropicProvider(id)?.defaultTiers;
        for (const tier of ['sonnet', 'opus', 'haiku'] as const)
          expect(await p.resolveRequestModelIdPublic(tier)).toBe(tiers?.[tier]);
        expect(await p.resolveRequestModelIdPublic('default')).toBe(
          tiers?.sonnet,
        );
        for (const model of [
          'minimax-m3',
          'unknown',
          'toString',
          'constructor',
        ])
          expect(await p.resolveRequestModelIdPublic(model)).toBe(model);
        expect(logger.warn).not.toHaveBeenCalled();
      },
    );

    it('replaces a retired preference with the closest same-family live id, warning once', async () => {
      liveRoutes = {
        ...LIVE_ROUTES,
        'opencode-zen': {
          'claude-sonnet-5-1': 'messages',
          'claude-sonnet-6': 'messages',
          'minimax-m3': 'chat/completions',
        },
      };
      const { p } = await proxy('opencode-zen');
      expect(await p.resolveRequestModelIdPublic('sonnet')).toBe(
        'claude-sonnet-5-1',
      );
      expect(await p.resolveRequestModelIdPublic('default')).toBe(
        'claude-sonnet-5-1',
      );
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        '[provider-auth] tier preference not in live catalog',
        {
          providerId: 'opencode-zen',
          tier: 'sonnet',
          preferred: 'claude-sonnet-5',
          resolved: 'claude-sonnet-5-1',
          rule: 'family',
        },
      );
    });

    it('keeps the preference instead of switching family when no family member is live', async () => {
      liveRoutes = {
        ...LIVE_ROUTES,
        'opencode-go': { 'deepseek-v4': 'chat/completions' },
      };
      const { p } = await proxy('opencode-go');
      expect(await p.resolveRequestModelIdPublic('opus')).toBe('kimi-k3');
      expect(logger.warn).toHaveBeenCalledWith(
        '[provider-auth] tier preference not in live catalog',
        {
          providerId: 'opencode-go',
          tier: 'opus',
          preferred: 'kimi-k3',
          resolved: 'kimi-k3',
          rule: 'none',
        },
      );
    });

    it('uses the preference unverified when no catalog is on hand', async () => {
      liveRoutes = null;
      const { p } = await proxy('opencode-go');
      expect(await p.resolveRequestModelIdPublic('haiku')).toBe(
        getAnthropicProvider('opencode-go')?.defaultTiers?.haiku,
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['opencode-zen', 'claude-sonnet-5', '/zen/v1/messages'],
    ['opencode-zen', 'minimax-m3', '/zen/v1/chat/completions'],
    ['opencode-zen', 'gpt-5.6-luna', '/zen/v1/responses'],
    ['opencode-go', 'minimax-m3', '/zen/go/v1/messages'],
    ['opencode-go', 'glm-5.3', '/zen/go/v1/chat/completions'],
    ['opencode-go', 'gpt-5.6-luna', '/zen/go/v1/responses'],
  ] as const)(
    '%s %s forwards both stream modes to %s with its own Bearer key',
    async (id, model, path) => {
      const { url } = await proxy(id);
      for (const stream of [false, true]) {
        const raw = JSON.stringify({
          model,
          max_tokens: 64,
          messages: [{ role: 'user', content: 'hello' }],
          stream,
        });
        const result = await post(url, raw, {
          Authorization: 'Bearer local-placeholder',
          'x-api-key': 'untrusted-client-key',
          'anthropic-beta': 'test-beta',
        });
        expect(result.status).toBe(200);
        const request = requests[requests.length - 1];
        expect(request.path).toBe(path);
        expect(request.headers.authorization).toBe(`Bearer ${id}-key`);
        expect(request.headers['x-api-key']).toBeUndefined();
        if (path.endsWith('/messages')) {
          expect(request.raw).toBe(raw);
          expect(request.headers['anthropic-version']).toBe('2023-06-01');
          expect(request.headers['anthropic-beta']).toBe('test-beta');
          expect(result.body).toBe(stream ? nativeSse : nativeResponse);
        } else if (!stream) {
          const translated = JSON.parse(result.body);
          expect(translated.content).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ type: 'text', text: 'hello' }),
              expect.objectContaining({
                type: 'tool_use',
                name: 'read_file',
                input: { path: 'a' },
              }),
            ]),
          );
          expect(translated.usage).toMatchObject({
            input_tokens: 3,
            output_tokens: 2,
          });
        } else {
          expect(result.body).toContain('message_stop');
          expect(result.body).toContain('read_file');
          expect(result.body).toContain('hello');
          expect(result.body).toContain('output_tokens');
        }
        if (path.endsWith('/responses')) {
          expect(JSON.parse(request.raw)).toMatchObject({ store: false });
          expect(Boolean(JSON.parse(request.raw).stream)).toBe(stream);
        }
      }
    },
  );

  it.each(['minimax-m3', 'minimax-m2.7', 'minimax-m2.5'])(
    '%s concurrently uses Zen Chat and Go Messages without sharing credentials',
    async (model) => {
      const [zen, go] = await Promise.all([
        proxy('opencode-zen'),
        proxy('opencode-go'),
      ]);
      const raw = JSON.stringify({
        model,
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hi' }],
      });
      const results = await Promise.all([
        post(zen.url, raw),
        post(go.url, raw),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/zen/v1/chat/completions',
            headers: expect.objectContaining({
              authorization: 'Bearer opencode-zen-key',
            }),
          }),
          expect.objectContaining({
            path: '/zen/go/v1/messages',
            headers: expect.objectContaining({
              authorization: 'Bearer opencode-go-key',
            }),
          }),
        ]),
      );
    },
  );

  it.each(['opencode-zen', 'opencode-go'] as const)(
    '%s rejects unknown, foreign and excluded IDs before reading auth',
    async (id) => {
      const getHeaders = jest.fn(async () => ({}));
      const { url } = await proxy(id, {
        getHeaders,
        isAuthenticated: async () => false,
        getApiKey: async () => null,
      });
      const foreign = id === 'opencode-zen' ? 'longcat-2.0' : 'claude-sonnet-5';
      for (const model of [
        'unknown',
        foreign,
        'gemini-3.8-flash',
        'jev-1.13',
        'toString',
      ]) {
        const result = await post(
          url,
          JSON.stringify({ model, max_tokens: 1, messages: [] }),
        );
        expect(result.status).toBe(400);
        expect(JSON.parse(result.body).error).toEqual({
          type: 'invalid_request_error',
          message: `Model '${model}' is not offered by ${getAnthropicProvider(id)?.name} as a chat model. Choose a model from the list.`,
        });
      }
      expect(getHeaders).not.toHaveBeenCalled();
      expect(requests).toHaveLength(0);
    },
  );

  it.each(['opencode-zen', 'opencode-go'] as const)(
    '%s explains a request it cannot route without a catalog',
    async (id) => {
      liveRoutes = null;
      const getHeaders = jest.fn(async () => ({}));
      const { url } = await proxy(id, {
        getHeaders,
        isAuthenticated: async () => true,
        getApiKey: async () => 'key',
      });
      const result = await post(
        url,
        JSON.stringify({ model: 'minimax-m3', max_tokens: 1, messages: [] }),
      );
      expect(result.status).toBe(400);
      expect(JSON.parse(result.body).error).toEqual({
        type: 'invalid_request_error',
        message: `Couldn't load ${getAnthropicProvider(id)?.name}'s model list to route 'minimax-m3'. Check your connection and retry.`,
      });
      expect(getHeaders).not.toHaveBeenCalled();
      expect(requests).toHaveLength(0);
    },
  );

  describe('Responses tool-result images', () => {
    const PNG_1X1_B64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
    const toolTurn = (
      content: AnthropicContentBlock[],
    ): AnthropicMessagesRequest => ({
      model: 'gpt-5.6-luna',
      max_tokens: 64,
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'screenshot', input: {} },
          ],
        },
        { role: 'user', content },
      ],
    });
    const imageRequest = toolTurn([
      {
        type: 'tool_result',
        tool_use_id: 'call_1',
        content: [
          { type: 'text', text: 'captured' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: PNG_1X1_B64,
            },
          },
        ],
      },
    ]);
    const functionOutput = (raw: string) =>
      (JSON.parse(raw).input as Array<Record<string, unknown>>).find(
        (item) => item['type'] === 'function_call_output',
      );

    it.each(['opencode-zen', 'opencode-go'] as const)(
      '%s GPT route sends an image tool_result as a placeholder string',
      async (id) => {
        const { url } = await proxy(id);
        const result = await post(url, JSON.stringify(imageRequest));
        expect(result.status).toBe(200);
        expect(requests).toHaveLength(1);
        expect(requests[0].path.endsWith('/responses')).toBe(true);
        expect(functionOutput(requests[0].raw)).toEqual({
          type: 'function_call_output',
          call_id: 'call_1',
          output: `captured\n${TOOL_OUTPUT_IMAGE_PLACEHOLDER}`,
        });
        expect(requests[0].raw).not.toContain('input_image');
        expect(requests[0].raw).not.toContain(PNG_1X1_B64);
      },
    );

    it.each(['opencode-zen', 'opencode-go'] as const)(
      '%s sends a text-only tool_result byte-identical to the translator output',
      async (id) => {
        const { url } = await proxy(id);
        const textRequest = toolTurn([
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: 'plain result',
          },
        ]);
        expect((await post(url, JSON.stringify(textRequest))).status).toBe(200);
        expect(requests[0].raw).toBe(
          JSON.stringify(
            guardResponsesToolNames(
              translateAnthropicToResponses(textRequest, { modelPrefix: '' }),
            ).request,
          ),
        );
        expect(functionOutput(requests[0].raw)).toEqual({
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'plain result',
        });
      },
    );

    it.each(['opencode-zen', 'opencode-go'] as const)(
      '%s resends the same placeholder string on the 401 refresh retry',
      async (id) => {
        let calls = 0;
        respond = (_req, res) => {
          calls += 1;
          if (calls === 1) {
            res.writeHead(401);
            res.end('expired');
            return;
          }
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(responsesResponse));
        };
        const { p, url } = await proxy(id);
        p.authRecovers = true;
        expect((await post(url, JSON.stringify(imageRequest))).status).toBe(
          200,
        );
        expect(requests).toHaveLength(2);
        expect(requests[1].raw).toBe(requests[0].raw);
        expect(requests[1].raw).toContain(TOOL_OUTPUT_IMAGE_PLACEHOLDER);
        expect(requests[1].raw).not.toContain('input_image');
      },
    );
  });

  it('normalizes native aliases without dropping extension fields', async () => {
    const { url } = await proxy('opencode-zen');
    const body = {
      model: 'sonnet',
      max_tokens: 64,
      messages: [],
      thinking: { type: 'adaptive' },
      metadata: { user_id: 'test' },
    };
    expect((await post(url, JSON.stringify(body))).status).toBe(200);
    expect(JSON.parse(requests[0].raw)).toEqual({
      ...body,
      model: 'claude-sonnet-5',
    });
  });

  it('rejects invalid envelopes and a missing native version before forwarding', async () => {
    const { url } = await proxy('opencode-go');
    for (const body of [
      '{',
      'null',
      '{}',
      '{"model":2}',
      '{"model":"minimax-m3","messages":[]}',
    ]) {
      expect((await post(url, body)).status).toBe(400);
    }
    const result = await post(
      url,
      JSON.stringify({ model: 'minimax-m3', max_tokens: 1, messages: [] }),
      { 'anthropic-version': '' },
    );
    expect(result.status).toBe(400);
    expect(result.body).toContain('anthropic-version');
    expect(requests).toHaveLength(0);
  });

  it.each([401, 403, 402, 500, 503])(
    'sanitizes upstream %s without retrying or switching lanes',
    async (status) => {
      respond = (_req, res) => {
        res.writeHead(status);
        res.end('PRIVATE-UPSTREAM-KEY-AND-BODY');
      };
      const { url } = await proxy('opencode-go');
      const result = await post(
        url,
        JSON.stringify({ model: 'minimax-m3', max_tokens: 1, messages: [] }),
      );
      expect(result.status).toBe(status);
      expect(result.body).toContain('OpenCode Go');
      expect(result.body).not.toContain('PRIVATE-UPSTREAM');
      if (status === 401)
        expect(result.body).toContain(
          "Update that subscription's key in Settings > Authentication.",
        );
      expect(requests).toHaveLength(1);
      for (const log of [
        logger.debug,
        logger.info,
        logger.warn,
        logger.error,
      ]) {
        expect(JSON.stringify((log as jest.Mock).mock.calls)).not.toContain(
          'PRIVATE-UPSTREAM',
        );
        expect(JSON.stringify((log as jest.Mock).mock.calls)).not.toContain(
          'opencode-go-key',
        );
      }
    },
  );

  it('keeps rate-limit cooldowns separate for Zen and Go', async () => {
    respond = (req, res) => {
      if (req.url?.startsWith('/zen/go/')) res.end(nativeResponse);
      else {
        res.writeHead(429, { 'retry-after': '30' });
        res.end('private');
      }
    };
    const zen = await proxy('opencode-zen');
    const go = await proxy('opencode-go');
    const raw = JSON.stringify({
      model: 'minimax-m3',
      max_tokens: 1,
      messages: [],
    });
    const limited = await post(zen.url, raw);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('30');
    expect(limited.body).toContain('rate_limit_error');
    expect((await post(go.url, raw)).status).toBe(200);
  });

  it('times out native upstream requests without retrying', async () => {
    respond = () => {
      /* Deliberately leave the fake upstream pending. */
    };
    const { p, url } = await proxy('opencode-go');
    p.timeout = 20;
    expect(
      (
        await post(
          url,
          JSON.stringify({ model: 'minimax-m3', max_tokens: 1, messages: [] }),
        )
      ).status,
    ).toBe(504);
    expect(requests).toHaveLength(1);
  });
});
