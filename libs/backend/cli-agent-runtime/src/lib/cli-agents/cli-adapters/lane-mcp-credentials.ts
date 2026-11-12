import { z } from 'zod';
import type { IMcpCallerCredentials } from '@ptah-extension/platform-core';
import type {
  PhaseDispatchV1,
  ToolProfileAdapterResultV1,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

export const LANE_MCP_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Phase handoff, or the two fields a lane credential copies from it.
 * `toolProfile` wins when both shapes could apply.
 */
export type LaneMcpPhaseInput =
  | Pick<PhaseDispatchV1, 'kind' | 'toolProfile'>
  | {
      readonly kind: string;
      readonly disallowedTools?: readonly string[];
    };

/** Claude is the only lane whose built-in tools take `disallowedTools`. */
const BUILTIN_TOOL_PROFILE_ADAPTERS = new Set<string>(['claude']);

function phaseDenials(phase: LaneMcpPhaseInput): readonly string[] {
  if ('toolProfile' in phase) return phase.toolProfile.disallowedTools;
  return phase.disallowedTools ?? [];
}

/**
 * One result for a spawn whose phase names at least one tool. Claude records
 * `filtered` because its SDK options deny those names. Every other executor
 * records `unfiltered`: Ptah MCP follows the credential, and that CLI has no
 * built-in deny channel.
 */
export function laneToolProfileAdapterResult(
  executorId: string,
  phase:
    | {
        readonly toolProfile?: {
          readonly disallowedTools?: readonly string[];
        };
      }
    | undefined,
): ToolProfileAdapterResultV1 | undefined {
  const listed = phase?.toolProfile?.disallowedTools;
  if (!Array.isArray(listed) || listed.length === 0) return undefined;
  const names = listed.filter(
    (name): name is string =>
      typeof name === 'string' && name.trim().length > 0,
  );
  if (names.length === 0) return undefined;
  return {
    executorId,
    toolProfileStatus: BUILTIN_TOOL_PROFILE_ADAPTERS.has(executorId)
      ? 'filtered'
      : 'unfiltered',
  };
}

/** Lane-report credentials may briefly live in Antigravity's spawn config. */
export function issueLaneMcpToken(
  credentials: IMcpCallerCredentials | undefined,
  logger: Logger,
  agentId: string | undefined,
  workingDirectory: string,
  capability: 'privileged' | 'lane-report' = 'privileged',
  phase?: LaneMcpPhaseInput,
): string | undefined {
  if (!credentials || !agentId || !workingDirectory) {
    logger.warn('[Lane MCP] Credentials unavailable; omitting ptah MCP server');
    return undefined;
  }
  try {
    return z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .parse(
        credentials.issue(
          {
            kind: 'agent',
            agentId,
            workspaceRoot: workingDirectory,
            capability,
            ...(phase
              ? {
                  phaseKind: phase.kind,
                  disallowedTools: phaseDenials(phase),
                }
              : {}),
          },
          agentId,
          LANE_MCP_TTL_MS,
        ),
      );
  } catch {
    logger.warn(
      '[Lane MCP] Credential issuance failed; omitting ptah MCP server',
    );
    return undefined;
  }
}

export function laneMcpAuthUrl(url: string, token: string): string {
  const target = new URL(url);
  return `${target.origin}/auth/${token}${target.pathname}`;
}
