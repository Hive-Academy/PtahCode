import type {
  AgentProcessInfo,
  InlineImageAttachment,
  SpawnAgentRequest,
  SpawnAgentResult,
} from '@ptah-extension/shared';
import type { AgentProcessManager } from '../agent-process-manager.service';
import {
  blockedLaneCommand,
  blockedLaneCommandReason,
} from '../cli-adapters/lane-command-filter';
import {
  LaneResumeError,
  type LaneResumeGuard,
  type LaneResumeResult,
} from './lane-resumers/lane-resumer.port';
import type {
  PtahCliLaneResumer,
  PtahCliResumeParams,
} from './lane-resumers/ptah-cli-lane-resumer';
import { SystemCliLaneResumer } from './lane-resumers/system-cli-lane-resumer';
import type { ParentLaneLevel } from './parent-lane-level';
import { LANE_IMAGES_NEED_RUNNING_TEXT } from './agent-effective-capabilities';

/**
 * Explicit resume and cold message sends share the manager's resume gate.
 * Every Ptah CLI lane resumes through the registry-backed resumer, which every
 * host registers; a system CLI lane resumes through the manager's spawn.
 */
export class AgentLaneResumeService {
  private readonly system: SystemCliLaneResumer;

  constructor(
    private readonly manager: Pick<
      AgentProcessManager,
      'spawn' | 'prepareSdkHandleSpawn' | 'releaseIdleForResume'
    >,
    private readonly ptahCli: Pick<PtahCliLaneResumer, 'resume' | 'resumePtahCli'>,
    private readonly parentLevel?: ParentLaneLevel,
  ) {
    this.system = new SystemCliLaneResumer(manager, parentLevel);
  }

  /**
   * Cold-resume `info` with `task`. A `guard` whose raw body starts with a
   * blocked `/command` is refused with `blocked-command` before any spawn.
   * `info.model` / `info.reasoningEffort`, `files` and `images` reach the
   * resumed spawn. A Ptah CLI resume has no image channel, so it refuses
   * images before any spawn.
   */
  async resume(
    info: AgentProcessInfo,
    task: string,
    guard?: LaneResumeGuard,
    files?: readonly string[],
    images?: readonly InlineImageAttachment[],
  ): Promise<LaneResumeResult> {
    const blocked = guard ? blockedLaneCommand(guard.rawBody, guard.blocked) : undefined;
    if (blocked) throw new LaneResumeError('blocked-command', blockedLaneCommandReason(blocked));
    const hasImages = (images?.length ?? 0) > 0;
    if (hasImages && info.cli === 'ptah-cli')
      throw new LaneResumeError('turn-input-refused', LANE_IMAGES_NEED_RUNNING_TEXT);
    if (hasImages) return this.system.resume(info, task, files, images);
    const resumer = info.cli === 'ptah-cli' ? this.ptahCli : this.system;
    return files && files.length > 0 ? resumer.resume(info, task, files) : resumer.resume(info, task);
  }

  resumeRequest(request: SpawnAgentRequest): Promise<SpawnAgentResult> {
    if (!request.resumeSessionId) {
      throw new LaneResumeError(
        'no-session',
        'No CLI session is available for resume.',
      );
    }
    // The ledger key override is host-internal; a resume never re-keys usage rows.
    const { usageWorkspaceRoot: _usageWorkspaceRoot, ...forwarded } = request;
    return this.manager.spawn({ ...forwarded,
      ...(this.parentLevel && request.parentSessionId
        ? { parentLevel: this.parentLevel(request.parentSessionId) } : {}),
    });
  }

  prepareSdkResume(
    request: Parameters<AgentProcessManager['prepareSdkHandleSpawn']>[0],
  ): ReturnType<AgentProcessManager['prepareSdkHandleSpawn']> {
    if (!request.resumeSessionId) {
      throw new LaneResumeError(
        'no-session',
        'No CLI session is available for resume.',
      );
    }
    return this.manager.prepareSdkHandleSpawn(request);
  }

  resumePtahCli(
    params: PtahCliResumeParams,
    workspaceRoot: string,
  ): Promise<SpawnAgentResult> {
    return this.ptahCli.resumePtahCli(params, workspaceRoot);
  }
}
