/**
 * `ptah.route` namespace (TASK_2026_646, part A §8).
 *
 * `decide` resolves `LANE_ROUTING_TOKENS.ROUTE_DECIDE_SERVICE` on every
 * call. Hosts do not call `registerLaneRoutingServices` until Batch 30, so
 * this is a locator, not an `@inject` on a class a host constructs today.
 * An unregistered service throws {@link RoutingUnavailableError} (F9)
 * before any agent I/O.
 */
import type {
  CliDetectionResult,
  LaneLimitState,
} from '@ptah-extension/shared';
import {
  LANE_ROUTING_TOKENS,
  type RouteCandidateSource,
  type RouteDecideArgs,
  type RouteDecideResult,
  type RouteDecideService,
  type HostRoutingSetting,
} from '@ptah-extension/lane-routing';
import type { AgentNamespace } from '../types';
import { composeEffectiveToolList, type EffectiveToolListDependencies } from '../mcp-core/effective-tool-list';
import type { CliDetectionResult as CandidateRow } from '@ptah-extension/shared';
import { laneMcpTokenCapability, type SessionChildEligibility } from '@ptah-extension/cli-agent-runtime';

/** F9. The skill treats this sentence as "tool not listed". */
export const ROUTING_UNAVAILABLE_MESSAGE =
  "routing is not available in this host; use the skill's rule tables";

export class RoutingUnavailableError extends Error {
  constructor() {
    super(ROUTING_UNAVAILABLE_MESSAGE);
    this.name = 'RoutingUnavailableError';
  }
}

/**
 * The two container methods this namespace uses. `DependencyContainer`
 * satisfies it. `isRegistered(token, true)` includes parent containers.
 */
export interface RouteServiceLocator {
  isRegistered(token: symbol, recursive?: boolean): boolean;
  resolve<T>(token: symbol): T;
}

export interface RouteNamespace {
  decide(
    args: RouteDecideArgs,
    context?: { readonly sessionKey?: string },
  ): Promise<RouteDecideResult>;
}

export interface RouteNamespaceDependencies {
  readonly agent: Pick<AgentNamespace, 'list' | 'limits' | 'listRoles'>;
  /** Lazy caller-bound child eligibility; absent hosts offer no child session. */
  readonly childSession?: { canStart(): SessionChildEligibility };
  readonly hasIDECapabilities?: boolean;
  /** Read on every call. Absent or unregistered → F9, and no agent I/O. */
  readonly container: RouteServiceLocator | undefined;
}

type RouteAgent = RouteNamespaceDependencies['agent'];

/**
 * `RouteDecideService` when the host has registered it. `undefined` when
 * the container is missing or the token is not registered. Does not throw
 * for the unregistered case.
 */
export function resolveRouteDecideService(
  container: RouteServiceLocator | undefined,
): RouteDecideService | undefined {
  if (!container) return undefined;
  const token = LANE_ROUTING_TOKENS.ROUTE_DECIDE_SERVICE;
  if (!container.isRegistered(token, true)) return undefined;
  return container.resolve<RouteDecideService>(token);
}

/**
 * Limit-map key. Same rule as lane-routing's `laneCandidateId`: `ptahCliId`
 * for a Ptah CLI row that has one, otherwise `cli`. That helper is not on
 * the public barrel.
 */
function limitKey(row: Pick<CliDetectionResult, 'cli' | 'ptahCliId'>): string {
  if (row.cli === 'ptah-cli' && row.ptahCliId) return row.ptahCliId;
  return row.cli;
}

export function buildRouteCandidateSource(
  agent: RouteAgent,
  readListDeps?: () => EffectiveToolListDependencies | null,
  childSession?: { canStart(): SessionChildEligibility },
): RouteCandidateSource {
  const rowsById = new Map<string, CandidateRow>();
  return {
    childSessionEligible: () => childSession?.canStart().ok === true,
    rows: async () => {
      const rows = await agent.list();
      rowsById.clear();
      for (const row of rows) rowsById.set(limitKey(row), row);
      return rows;
    },

    limits: async (rows) => {
      const lookup = agent.limits;
      if (!lookup) return null;
      const listed = await lookup(rows);
      if (listed === undefined) return null;
      const map = new Map<string, LaneLimitState>();
      for (const entry of listed) {
        map.set(limitKey(entry.row), entry.state.state);
      }
      return map;
    },

    // A rejection stays a rejection. Gather records "roles unavailable"
    // and still offers built-in roles. Swallowing it as [] would hide that.
    roles: () => agent.listRoles(),

    tools: async (candidate, phase) => {
      const capability = candidate.kind === 'lane'
        ? laneMcpTokenCapability(candidate.cli)
        : 'privileged';
      if (capability === null) return [];
      if (candidate.kind === 'lane') {
        const row = rowsById.get(candidate.id);
        if (row?.manifest?.mcp.state === 'unsupported') return [];
        if (row?.manifest?.mcp.state !== 'supported') return null;
      }
      // An absent host config cannot prove the list matches tools/list.
      const effectiveListDeps = readListDeps?.();
      if (effectiveListDeps == null) return null;
      return composeEffectiveToolList(
        candidate.kind === 'lane' ? { kind: 'agent' } : { kind: 'session' },
        'coding',
        capability,
        { kind: candidate.kind === 'lane' ? 'agent' : 'session',
          capability,
          phaseKind: phase.kind,
          disallowedTools: phase.toolProfile?.disallowedTools ?? [],
        },
        effectiveListDeps,
      ).map((tool) => tool.name);
    },
  };
}

export function buildRouteNamespace(
  deps: RouteNamespaceDependencies,
): RouteNamespace {
  return {
    decide: async (args, context) => {
      const service = resolveRouteDecideService(deps.container);
      if (!service) throw new RoutingUnavailableError();
      return service.decide(
        args,
        buildRouteCandidateSource(deps.agent, () => {
          const token = LANE_ROUTING_TOKENS.HOST_ROUTING_SETTING;
          if (!deps.container?.isRegistered(token, true)) return null;
          const setting = deps.container.resolve<Pick<HostRoutingSetting, 'disabledMcpNamespaces'>>(token);
          const disabledMcpNamespaces = setting.disabledMcpNamespaces();
          return disabledMcpNamespaces === null || deps.hasIDECapabilities === undefined
            ? null
            : { hasIDECapabilities: deps.hasIDECapabilities, disabledMcpNamespaces };
        }, deps.childSession),
        context,
      );
    },
  };
}
