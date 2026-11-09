import { loggableErrorName } from '@ptah-extension/shared';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { originOf, systemOneUrl } from './decision-endpoint.url';
import type { DecisionPayload } from './decision-payload';
import {
  ollamaPsUrl,
  residentFromPsBody,
  selectRequestBudgetMs,
  SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS,
} from './system-one.residency';
import {
  SystemOneResultSchema,
  type SystemOneResult,
} from './system-one.schema';

/** Route path of the System One endpoint. Ollama and TypeSafe Jev share it. */
export const SYSTEM_ONE_PATH = '/v1/systemone';

/** Per-request abort budget (part A constants D8). */
export const SYSTEM_ONE_TIMEOUT_MS = 3000;

/** Request size limit for every kind (Req 12.6, part A limits table: 64 KiB). */
export const SYSTEM_ONE_MAX_REQUEST_BYTES = 64 * 1024;

/** Fixed failure text is cut to this length. Provider bodies are never copied. */
const DETAIL_MAX_CHARS = 200;

/**
 * Minimal fetch surface — satisfied by Node's global `fetch`, the same seam
 * `cli-agent-runtime` uses for OAuth discovery (`mcp-oauth-metadata.ts`).
 */
export type SystemOneFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** Failure classes the client reports (its share of the Req 12.7 causes). */
export type SystemOneFailureCause =
  | 'timeout'
  | 'unreachable'
  | 'auth'
  | 'provider-error'
  | 'bad-output'
  | 'payload-too-large';

export interface SystemOneCallSuccess {
  readonly ok: true;
  readonly result: SystemOneResult;
}

export interface SystemOneCallFailure {
  readonly ok: false;
  readonly cause: SystemOneFailureCause;
  readonly detail: string;
  /**
   * True only when the live call answered HTTP 404 or 405. Evidence for a
   * `recheckAfterLiveNotFound` re-run, never a route verdict (decision #46):
   * a live call names a model, so its 404/405 cannot tell a missing route
   * from a missing model. The client NEVER persists a mark itself.
   */
  readonly notFound: boolean;
}

export type SystemOneCallResult = SystemOneCallSuccess | SystemOneCallFailure;

export interface SystemOneClientOptions {
  /**
   * Resolved provider base URL (Ollama from `provider.ollama.baseUrl`, Jev
   * `https://api.typesafe.ai`). Comes from provider config, never from tool
   * args (NFR Security).
   */
  readonly baseUrl: string;
  /** Decision model id (`nimble`, `jev-1.13`, ...). */
  readonly model: string;
  /**
   * Bearer key bound to `baseUrl` by the endpoint resolver; sent only when
   * present (Jev, Ollama Cloud, a custom endpoint with a key). A local
   * Ollama call passes none.
   */
  readonly apiKey?: string;
  /** Per-request abort budget; defaults to `SYSTEM_ONE_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  /**
   * Ollama `keep_alive` for a local daemon. Omitted for Jev and for remote
   * calls: those servers do not use the field.
   */
  readonly keepAlive?: string;
  /**
   * Abort budget when a residency probe proves the model is not loaded.
   * Absent, or not larger than `timeoutMs`, means every call uses `timeoutMs`.
   */
  readonly coldTimeoutMs?: number;
}

export interface SystemOneClientDependencies {
  /** Test seam; the Node global `fetch` by default. */
  readonly fetch?: SystemOneFetch;
  readonly logger?: LaneRoutingLogger;
}

export class SystemOneClient {
  private readonly fetchImpl: SystemOneFetch;
  private readonly logger: LaneRoutingLogger | undefined;
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly options: SystemOneClientOptions,
    dependencies: SystemOneClientDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.logger = dependencies.logger;
  }

  /**
   * One POST; no retries (part A §5). A local daemon may first GET `/api/ps`
   * so a cold load is not aborted by the inference budget. Nothing is
   * persisted here: the result is plain data, and any `unsupported` mark
   * belongs to the status layer
   * (`DecisionModelStatus.recheckAfterLiveNotFound`), never to the client.
   */
  async decide(payload: DecisionPayload): Promise<SystemOneCallResult> {
    const requestBody: {
      model: string;
      state: DecisionPayload['state'];
      questions: DecisionPayload['questions'];
      keep_alive?: string;
    } = {
      model: this.options.model,
      state: payload.state,
      questions: payload.questions,
    };
    if (this.options.keepAlive !== undefined) {
      requestBody.keep_alive = this.options.keepAlive;
    }
    const body = JSON.stringify(requestBody);
    const bodyBytes = this.encoder.encode(body).byteLength;
    if (bodyBytes > SYSTEM_ONE_MAX_REQUEST_BYTES) {
      return this.logged(
        this.failure(
          'payload-too-large',
          `request body of ${bodyBytes} bytes exceeds ${SYSTEM_ONE_MAX_REQUEST_BYTES} bytes`,
        ),
      );
    }

    // Path-preserving join (DC11): `https://host/gw` keeps its `/gw` prefix.
    const url = systemOneUrl(this.options.baseUrl, SYSTEM_ONE_PATH);
    if (!URL.canParse(url)) {
      return this.logged(
        this.failure('unreachable', 'base url is not a valid absolute url'),
      );
    }

    const timeoutMs = await this.requestBudgetMs();
    const signal = AbortSignal.timeout(timeoutMs);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.options.apiKey) {
      headers['authorization'] = `Bearer ${this.options.apiKey}`;
    }
    // Origin only: a configured Ollama base URL may carry userinfo.
    this.logger?.debug('[lane-routing] system one request', {
      origin: originOf(url),
      model: this.options.model,
      questions: Object.keys(payload.questions).length,
      bodyBytes,
      timeoutMs,
    });

    let response: Awaited<ReturnType<SystemOneFetch>>;
    let bodyText: string;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal,
      });
      bodyText = await response.text();
    } catch (error: unknown) {
      return this.classifyTransportFailure(signal, timeoutMs, error);
    }

    if (response.status === 401 || response.status === 403) {
      return this.logged(this.failure('auth', `http ${response.status}`));
    }
    if (!response.ok) {
      const notFound = response.status === 404 || response.status === 405;
      return this.logged({
        ok: false,
        cause: 'provider-error',
        detail: `http ${response.status}`,
        notFound,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return this.logged(
        this.failure('bad-output', 'response body is not valid JSON'),
      );
    }
    const validated = SystemOneResultSchema.safeParse(parsed);
    if (!validated.success) {
      const first = validated.error.issues[0];
      const at = first ? first.path.join('.') : 'body';
      return this.logged(
        this.failure(
          'bad-output',
          `response schema failed at ${at}: ${first?.message ?? 'invalid response'}`,
        ),
      );
    }

    this.logger?.debug('[lane-routing] system one call succeeded', {
      model: this.options.model,
      answers: Object.keys(validated.data.answers).length,
    });
    return { ok: true, result: validated.data };
  }

  /**
   * Warm calls use `timeoutMs`. A local daemon whose model is not loaded
   * uses `coldTimeoutMs` instead, so the abort does not cancel the load.
   * A probe that fails or does not answer keeps the warm budget: an unknown
   * residency must not turn a dead daemon into a minute-long wait.
   */
  private async requestBudgetMs(): Promise<number> {
    const warm = this.options.timeoutMs ?? SYSTEM_ONE_TIMEOUT_MS;
    const cold = this.options.coldTimeoutMs;
    if (cold === undefined || cold <= warm) return warm;
    const resident = await this.probeResident();
    return selectRequestBudgetMs({ warmMs: warm, coldMs: cold, resident });
  }

  private async probeResident(): Promise<boolean | null> {
    const url = ollamaPsUrl(this.options.baseUrl);
    if (url === null) return null;
    const signal = AbortSignal.timeout(SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS);
    let response: Awaited<ReturnType<SystemOneFetch>> | undefined;
    let bodyText: string | undefined;
    let failed = false;
    try {
      response = await this.fetchImpl(url, { method: 'GET', signal });
      if (response.ok) bodyText = await response.text();
    } catch (error: unknown) {
      this.logger?.debug('[lane-routing] system one residency probe failed', {
        name: loggableErrorName(error),
      });
      failed = true;
    }
    if (failed || bodyText === undefined) return null;
    return residentFromPsBody(bodyText, this.options.model);
  }

  /**
   * Classify by the abort signal, never by message substring (the repo rule
   * from OAuth discovery): the signal's only source is the request timeout,
   * so an aborted signal is a timeout and every other rejection is a
   * network failure (connection refused, DNS, TLS — Req 12.7 `unreachable`).
   * The rejection message and name are untrusted and are not copied into
   * the detail or the log; only the fixed category of `loggableErrorName` is.
   */
  private classifyTransportFailure(
    signal: AbortSignal,
    timeoutMs: number,
    error: unknown,
  ): SystemOneCallFailure {
    if (signal.aborted) {
      return this.logged(
        this.failure('timeout', `request timed out after ${timeoutMs} ms`),
      );
    }
    return this.logged(
      this.failure(
        'unreachable',
        `transport error (${loggableErrorName(error)})`,
      ),
    );
  }

  private failure(
    cause: SystemOneFailureCause,
    detail: string,
  ): SystemOneCallFailure {
    return { ok: false, cause, detail: cutDetail(detail), notFound: false };
  }

  private logged(failure: SystemOneCallFailure): SystemOneCallFailure {
    this.logger?.warn('[lane-routing] system one call failed', {
      cause: failure.cause,
      detail: failure.detail,
      notFound: failure.notFound,
    });
    return failure;
  }
}

function cutDetail(text: string): string {
  return text.length <= DETAIL_MAX_CHARS
    ? text
    : text.slice(0, DETAIL_MAX_CHARS);
}
