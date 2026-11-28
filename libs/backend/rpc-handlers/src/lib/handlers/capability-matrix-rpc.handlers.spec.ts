/**
 * CapabilityMatrixRpcHandlers — routing learning item 7.
 *
 * The live store method is not on the lane-routing public index. These tests
 * pass a reader that returns the seed view and a local sample count, and
 * they pin the fail-closed path when `readMergedView` is absent.
 */

import 'reflect-metadata';

import type { Logger, RpcHandler } from '@ptah-extension/vscode-core';
import { RpcUserError } from '@ptah-extension/vscode-core';
import type { DependencyContainer } from 'tsyringe';
import { LANE_ROUTING_TOKENS } from '@ptah-extension/lane-routing';
import { CapabilityMatrixRpcHandlers } from './capability-matrix-rpc.handlers';

const METHOD = 'agent:getCapabilityMatrix';

type Registered = (params: unknown) => Promise<unknown>;

const UNKNOWN = { kind: 'unknown' as const };

/** The shipped seed shape: one z-ai / glm-5 implement value, five unknown kinds. */
function seedView(sampleCount?: number) {
  const implement =
    sampleCount === undefined
      ? {
          kind: 'value' as const,
          score: 80,
          source: 'seed' as const,
          sourceRef:
            'https://www.benchleader.com/benchmarks/swe_bench_verified_any',
          asOf: '2026-02-17',
          stale: true,
          note: 'backend implementation only',
        }
      : {
          kind: 'value' as const,
          score: 55,
          source: 'local' as const,
          sourceRef: null,
          asOf: '2026-11-01',
          stale: false,
          sampleCount,
        };
  return {
    version: 1,
    profiles: [
      {
        family: 'z-ai',
        model: 'glm-5',
        cells: {
          plan: UNKNOWN,
          implement,
          review: UNKNOWN,
          research: UNKNOWN,
          tests: UNKNOWN,
          docs: UNKNOWN,
        },
      },
    ],
  };
}

function setup(options?: {
  registered?: boolean;
  reader?: object | null;
  reject?: Error;
  view?: unknown;
  lastPicks?: readonly { key: string; candidateId: string }[];
  rotationReason?: string | null;
  rotationError?: Error;
}) {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const registered = new Map<string, Registered>();
  const rpcHandler = {
    registerMethod: (method: string, handler: Registered) => {
      registered.set(method, handler);
    },
  };
  const readMergedView = jest.fn(async () => {
    if (options?.reject) throw options.reject;
    return options?.view ?? seedView();
  });
  const store =
    options?.reader === undefined
      ? { readMergedView }
      : options.reader;
  const isRegistered = jest.fn((token: symbol) => {
    if (token === LANE_ROUTING_TOKENS.CAPABILITY_MATRIX_STORE) return options?.registered ?? true;
    return token === LANE_ROUTING_TOKENS.ROTATION_STORE && options !== undefined &&
      ('lastPicks' in options || 'rotationReason' in options || 'rotationError' in options);
  });
  const resolve = jest.fn((token: symbol) => {
    if (token === LANE_ROUTING_TOKENS.CAPABILITY_MATRIX_STORE) return store;
    if (token !== LANE_ROUTING_TOKENS.ROTATION_STORE) throw new Error('Unexpected dependency');
    if (options?.rotationError) throw options.rotationError;
    return {
      load: () => ({
        state: { version: 1, entries: options?.lastPicks ?? [] },
        reason: options?.rotationReason ?? null,
      }),
    };
  });
  const runtimeContainer = { isRegistered, resolve };

  new CapabilityMatrixRpcHandlers(
    logger as unknown as Logger,
    rpcHandler as unknown as RpcHandler,
    runtimeContainer as unknown as DependencyContainer,
  ).register();

  const call = (params: unknown) => {
    const handler = registered.get(METHOD);
    if (!handler) throw new Error(`${METHOD} was not registered`);
    return handler(params);
  };

  return { logger, call, readMergedView, isRegistered, resolve };
}

describe('CapabilityMatrixRpcHandlers', () => {
  it('reads a fresh rotation store without resolving the route decision service', async () => {
    const { call, resolve } = setup({ lastPicks: [] });
    await expect(call({})).resolves.toMatchObject({ lastPicks: [], lastPicksUnavailable: false });
    expect(resolve).toHaveBeenCalledWith(LANE_ROUTING_TOKENS.ROTATION_STORE);
    expect(resolve).not.toHaveBeenCalledWith(LANE_ROUTING_TOKENS.ROUTE_DECIDE_SERVICE);
  });

  it('keeps ratings available when the rotation store fails to resolve', async () => {
    const rotationError = new Error('rotation store failed to resolve');
    const { call, logger } = setup({ rotationError });
    await expect(call({})).resolves.toMatchObject({
      profiles: [expect.objectContaining({ family: 'z-ai' })],
      lastPicks: [],
      lastPicksUnavailable: true,
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), rotationError);
  });

  it('returns the last rotation pick when the read port is registered', async () => {
    const { call } = setup({ lastPicks: [{ key: 'implement|implement', candidateId: 'codex' }] });
    await expect(call({})).resolves.toMatchObject({ lastPicks: [{ key: 'implement|implement', candidateId: 'codex' }] });
  });
  it('reports unavailable rotation state instead of an empty history', async () => {
    const { call } = setup({ rotationReason: 'rotation-unavailable' });
    await expect(call({})).resolves.toMatchObject({ lastPicks: [], lastPicksUnavailable: true });
  });
  it('returns the seed implement value and unknown for the other five kinds', async () => {
    const { call, readMergedView, isRegistered } = setup();

    await expect(call(undefined)).resolves.toEqual({
      lastPicks: [],
      lastPicksUnavailable: false,
      profiles: [
        {
          family: 'z-ai',
          model: 'glm-5',
          cells: {
            plan: UNKNOWN,
            implement: {
              kind: 'value',
              score: 80,
              source: 'seed',
              sourceRef:
                'https://www.benchleader.com/benchmarks/swe_bench_verified_any',
              asOf: '2026-02-17',
              stale: true,
              note: 'backend implementation only',
              sampleCount: null,
            },
            review: UNKNOWN,
            research: UNKNOWN,
            tests: UNKNOWN,
            docs: UNKNOWN,
          },
        },
      ],
    });
    expect(isRegistered).toHaveBeenCalledWith(
      LANE_ROUTING_TOKENS.CAPABILITY_MATRIX_STORE,
      true,
    );
    expect(readMergedView).toHaveBeenCalledTimes(1);
  });

  it('passes a local cell sampleCount through', async () => {
    const { call } = setup({ view: seedView(2) });
    const result = await call({});
    expect(result).toMatchObject({
      profiles: [
        {
          cells: {
            implement: { kind: 'value', source: 'local', sampleCount: 2 },
            plan: { kind: 'unknown' },
          },
        },
      ],
    });
  });

  it('rejects a parameter', async () => {
    const { call, readMergedView } = setup();
    await expect(call({ refresh: true })).rejects.toMatchObject({
      errorCode: 'INVALID_PARAMS',
    });
    expect(readMergedView).not.toHaveBeenCalled();
  });

  it('fails closed when the store is not registered', async () => {
    const { call, resolve, logger } = setup({ registered: false });
    await expect(call(undefined)).rejects.toBeInstanceOf(RpcUserError);
    await expect(call(undefined)).rejects.toMatchObject({
      errorCode: 'PERSISTENCE_UNAVAILABLE',
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('fails closed when the reader throws', async () => {
    const { call, logger } = setup({ reject: new Error('disk') });
    await expect(call(undefined)).rejects.toMatchObject({
      errorCode: 'PERSISTENCE_UNAVAILABLE',
      message: 'Capability matrix is unavailable.',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'RPC: agent:getCapabilityMatrix failed',
      expect.any(Error),
    );
  });
});
