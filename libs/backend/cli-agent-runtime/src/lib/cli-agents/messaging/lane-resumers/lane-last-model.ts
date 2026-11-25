import type { AgentProcessInfo, CliOutputSegment } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { observedModelFrom } from '../../lane-model-log';

/** One page of a lane's persisted output, as `SessionMetadataStore.getAgentOutputPage` returns it. */
export interface LaneOutputPage {
  readonly items: readonly (
    | { readonly tag: 'segment'; readonly value: CliOutputSegment }
    | { readonly tag: 'streamEvent'; readonly value: unknown }
  )[];
  readonly nextCursor: string | null;
  readonly done: boolean;
}

/** Reads one page of `agentId`'s persisted output in `sessionId`'s store. */
export type LaneOutputPageReader = (
  agentId: string,
  cursor: string | undefined,
  sessionId: string | undefined,
) => Promise<LaneOutputPage>;

/** Pages read at most; the persisted output is capped, so this bounds a corrupt cursor chain. */
const MAX_OUTPUT_PAGES = 64;

/**
 * The model one persisted segment says the lane ran: the turn telemetry's
 * reported model, else the usage model. Placeholder ids (`unknown`,
 * `multi-model`) say nothing and are skipped.
 */
export function segmentModel(cli: AgentProcessInfo['cli'], segment: CliOutputSegment): string | undefined {
  const reported = segment.turnTelemetry ? observedModelFrom(cli, segment.turnTelemetry) : undefined;
  if (reported) return reported;
  const usage = segment.usage?.model?.trim();
  if (!usage || usage === 'unknown' || usage.endsWith('/unknown') || usage.endsWith('/multi-model')) return undefined;
  return usage.slice(0, 128);
}

/**
 * The model the lane's last persisted turn ran (F1), read forward through its
 * persisted output so the last reported model wins. Undefined when the
 * output names none.
 */
export async function lastRunModelFromOutput(
  read: LaneOutputPageReader,
  info: Pick<AgentProcessInfo, 'agentId' | 'cli' | 'parentSessionId'>,
): Promise<string | undefined> {
  let model: string | undefined;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_OUTPUT_PAGES; page++) {
    const result = await read(String(info.agentId), cursor, info.parentSessionId);
    for (const item of result.items) {
      if (item.tag !== 'segment') continue;
      const found = segmentModel(info.cli, item.value);
      if (found) model = found;
    }
    if (result.done || result.nextCursor === null) return model;
    cursor = result.nextCursor;
  }
  return model;
}

/**
 * The resume model lookup the lane resume service uses (F1): the model of
 * the lane's last persisted turn. When the output names none, or cannot be
 * read, it logs a warning naming the lane and resolves undefined, so the
 * resume runs on the CLI default knowingly, never silently.
 */
export function laneResumeModelLookup(
  read: LaneOutputPageReader,
  logger: Pick<Logger, 'info' | 'warn'>,
): (info: AgentProcessInfo) => Promise<string | undefined> {
  return async (info) => {
    try {
      const model = await lastRunModelFromOutput(read, info);
      if (model) {
        logger.info('[AgentLaneResume] Resuming on the model the lane last ran', {
          agentId: info.agentId, cli: info.cli, model,
        });
        return model;
      }
    } catch (error: unknown) {
      // degradation-audit: reported - logged here; the resume continues on the CLI default with the warning below.
      logger.warn('[AgentLaneResume] Lane output could not be read for its last model', {
        agentId: info.agentId, error: error instanceof Error ? error.name : 'unknown',
      });
    }
    logger.warn('[AgentLaneResume] No stored or last-run model for the lane; it resumes on the CLI default', {
      agentId: info.agentId, cli: info.cli,
    });
    return undefined;
  };
}
