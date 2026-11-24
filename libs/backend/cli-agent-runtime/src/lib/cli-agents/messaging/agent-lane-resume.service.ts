import type {
  AgentProcessInfo,
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
   * `info.model` / `info.reasoningEffort` and `files` reach the resumed spawn.
   */
  async resume(
    info: AgentProcessInfo,
    task: string,
    guard?: LaneResumeGuard,
    files?: readonly string[],
  ): Promise<LaneResumeResult> {
    const blocked = guard ? blockedLaneCommand(guard.rawBody, guard.blocked) : undefined;
    if (blocked) throw new LaneResumeError('blocked-command', blockedLaneCommandReason(blocked));
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
    return this.manager.spawn({ ...request,
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
