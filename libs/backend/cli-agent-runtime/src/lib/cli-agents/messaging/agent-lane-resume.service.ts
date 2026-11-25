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
 * The model a lane last ran, for a resume whose record stores none (F1). It
 * resolves undefined when nothing is known; the lookup logs that case.
 */
export type LaneResumeModelLookup = (info: AgentProcessInfo) => Promise<string | undefined>;

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
      'spawn' | 'prepareSdkHandleSpawn' | 'releaseIdleForResume' | 'findAgentInfo'
    >,
    private readonly ptahCli: Pick<PtahCliLaneResumer, 'resume' | 'resumePtahCli'>,
    private readonly parentLevel?: ParentLaneLevel,
    private readonly lastModel?: LaneResumeModelLookup,
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
    if (info.cli === 'ptah-cli') {
      return files && files.length > 0 ? this.ptahCli.resume(info, task, files) : this.ptahCli.resume(info, task);
    }
    // Only a lookup awaits: the release of the old handle keeps starting at once.
    const resumed = this.needsResumeModel(info) ? await this.withResumeModel(info) : info;
    if (hasImages) return this.system.resume(resumed, task, files, images);
    return files && files.length > 0 ? this.system.resume(resumed, task, files) : this.system.resume(resumed, task);
  }

  async resumeRequest(request: SpawnAgentRequest): Promise<SpawnAgentResult> {
    if (!request.resumeSessionId) {
      throw new LaneResumeError(
        'no-session',
        'No CLI session is available for resume.',
      );
    }
    // The ledger key override is host-internal; a resume never re-keys usage rows.
    const { usageWorkspaceRoot: _usageWorkspaceRoot, ...forwarded } = request;
    const previous = request.model === undefined && request.resumedFromAgentId
      ? this.manager.findAgentInfo(request.resumedFromAgentId) : undefined;
    const model = previous && previous.cli === request.cli
      ? (await this.withResumeModel(previous)).model : undefined;
    return this.manager.spawn({ ...forwarded,
      ...(model ? { model } : {}),
      ...(this.parentLevel && request.parentSessionId
        ? { parentLevel: this.parentLevel(request.parentSessionId) } : {}),
    });
  }

  /**
   * A Claude lane whose record stores no model resumes on the model it last
   * ran, never silently on the CLI default (F1): a fresh handoff starts a
   * new session, and the CLI default can be a pricier tier. Other CLIs keep
   * their record as is.
   */
  private needsResumeModel(info: AgentProcessInfo): boolean {
    return !info.model && info.cli === 'claude' && this.lastModel !== undefined;
  }

  private async withResumeModel(info: AgentProcessInfo): Promise<AgentProcessInfo> {
    if (!this.needsResumeModel(info) || !this.lastModel) return info;
    const model = await this.lastModel(info);
    return model ? { ...info, model } : info;
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
