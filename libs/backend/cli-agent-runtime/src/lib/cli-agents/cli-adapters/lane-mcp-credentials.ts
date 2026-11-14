import { z } from 'zod';
import type { IMcpCallerCredentials } from '@ptah-extension/platform-core';
import type {
  PhaseDispatchV1,
  ToolProfileAdapterResultV1,
} from '@ptah-extension/shared';
import { PHASE_KINDS } from '@ptah-extension/shared';
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

const phaseInputSchema = z.object({
  kind: z.enum(PHASE_KINDS),
  toolProfile: z.object({ disallowedTools: z.array(z.string().trim().min(1)) }).optional(),
  disallowedTools: z.array(z.string().trim().min(1)).optional(),
});

export class LaneMcpPhaseError extends Error {
  constructor() { super('Invalid lane MCP phase profile'); this.name = 'LaneMcpPhaseError'; }
}

function phaseDenials(phase: z.infer<typeof phaseInputSchema>): readonly string[] {
  if (phase.toolProfile) return phase.toolProfile.disallowedTools;
  return phase.disallowedTools ?? [];
}

/** Record a filtered result only after the adapter confirms enforcement. */
export function laneToolProfileAdapterResult(
  executorId: string,
  phase:
    | {
        readonly toolProfile?: {
          readonly disallowedTools?: readonly string[];
        };
      }
    | undefined,
  applied = false,
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
    toolProfileStatus: applied && (executorId === 'claude' || names.every(name => name.startsWith('ptah_')))
      ? 'filtered' : 'unfiltered',
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
  const parsedPhase = phase === undefined ? undefined : phaseInputSchema.safeParse(phase);
  if (parsedPhase && !parsedPhase.success) throw new LaneMcpPhaseError();
  const phaseBinding = parsedPhase?.data;
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
            ...(phaseBinding
              ? {
                  phaseKind: phaseBinding.kind,
                  disallowedTools: [...phaseDenials(phaseBinding)],
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
