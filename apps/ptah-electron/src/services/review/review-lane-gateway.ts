import { z } from 'zod';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentProcessManager, AgentSpawnEnvironment, CliDetectionService, LaneLimitLookupService, PTAH_CLI_ROLE_DELIVERY } from '@ptah-extension/cli-agent-runtime';
import { laneFamilyOf, type CliDetectionResult } from '@ptah-extension/shared';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import { type IReviewLaneGateway, type ReviewLaneCapability } from '@ptah-extension/review-core';

const spawnInputSchema = z.object({
  laneId: z.string().min(1).max(128), cwd: z.string().min(1),
  prompt: z.string().min(1).max(200_000),
}).strict();

/** Prompts above this size go through a file, because argv lanes cannot carry them. */
const PROMPT_FILE_THRESHOLD_BYTES = 100_000;

function idOf(row: CliDetectionResult): string {
  return row.ptahCliId ? `ptah-cli:${row.ptahCliId}` : row.cli;
}

type PtahCliEntry = { id: string; name: string; providerName: string; providerId?: string; enabled: boolean; hasApiKey: boolean };
export type ReviewPtahCliRegistry = { listAgents(): Promise<PtahCliEntry[]> };
type ReviewLaneLogger = { warn(message: string, ...args: unknown[]): void };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Adapts the existing agent manager and quota lookup to review's admission contract. */
export class ReviewLaneGateway implements IReviewLaneGateway {
  constructor(
    private readonly manager: AgentProcessManager,
    private readonly detection: CliDetectionService,
    private readonly limits: LaneLimitLookupService,
    private readonly spawnEnvironment: AgentSpawnEnvironment,
    private readonly getRegistry?: () => ReviewPtahCliRegistry | undefined,
    private readonly getWorkspaceProvider?: () => IWorkspaceProvider | undefined,
    private readonly logger?: ReviewLaneLogger,
  ) {}

  private async buildLanes(): Promise<CliDetectionResult[]> {
    const workspace = this.getWorkspaceProvider?.();
    const disabled = workspace?.getConfiguration<string[]>('ptah', 'agentOrchestration.disabledClis', []) ?? [];
    const system = (await this.detection.getInstalledClis()).filter((row) => row.installed && !disabled.includes(row.cli));
    let agents: CliDetectionResult[] = [];
    try {
      const registry = this.getRegistry?.();
      if (registry) agents = (await registry.listAgents())
        .filter((agent) => agent.enabled && agent.hasApiKey)
        .map((agent) => ({ cli: 'ptah-cli' as const, installed: true, messagingMode: 'queue' as const,
          ptahCliId: agent.id, ptahCliName: agent.name, providerName: agent.providerName,
          providerId: agent.providerId, ...PTAH_CLI_ROLE_DELIVERY }));
    } catch (error) {
      // An unavailable registry does not hide installed system lanes.
      this.logger?.warn('[ReviewLaneGateway] Ptah CLI agents are not available for review', { error: messageOf(error) });
    }
    const rows = [...system, ...agents].map((row) => ({ ...row, family: laneFamilyOf(row) }));
    const order = workspace?.getConfiguration<string[]>('ptah.agentOrchestration', 'preferredAgentOrder', []) ?? [];
    const rank = (row: CliDetectionResult) => {
      const id = row.cli === 'ptah-cli' && row.ptahCliId ? row.ptahCliId : row.cli;
      const index = order.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return rows.sort((a, b) => rank(a) - rank(b));
  }

  async list(): Promise<{ lanes: ReviewLaneCapability[]; maxConcurrentAgents: number }> {
    const checked = await this.limits.lookup(await this.buildLanes());
    return {
      lanes: checked.map(({ row, state }) => ({
        id: idOf(row), family: row.family ?? row.cli,
        limitState: state.state === 'confirmed-room' ? 'confirmed-room' as const :
          state.state === 'at-limit' ? 'at-limit' as const : 'unknown' as const,
      })),
      maxConcurrentAgents: this.spawnEnvironment.maxConcurrentAgents(),
    };
  }

  async spawn(input: { laneId: string; cwd: string; prompt: string; signal: AbortSignal }): Promise<void> {
    const parsed = spawnInputSchema.parse({ laneId: input.laneId, cwd: input.cwd, prompt: input.prompt });
    if (input.signal.aborted) throw new Error('Review lane cancelled');
    const lane = (await this.buildLanes()).find((entry) => idOf(entry) === parsed.laneId);
    if (!lane) throw new Error('Review lane unavailable');
    const [limit] = await this.limits.lookup([lane], { signal: input.signal });
    if (limit?.state.state === 'at-limit') throw new Error('Review lane is at its limit');
    // A fresh directory per spawn: no earlier lane can have planted a symlink
    // in it, and concurrent lanes in one attempt never share the file.
    const taskDir = Buffer.byteLength(parsed.prompt, 'utf8') > PROMPT_FILE_THRESHOLD_BYTES
      ? await mkdtemp(join(parsed.cwd, 'task-')) : undefined;
    try {
      let task = parsed.prompt;
      if (taskDir) {
        const taskFile = join(taskDir, 'review-task.md');
        await writeFile(taskFile, parsed.prompt, { encoding: 'utf8', flag: 'wx' });
        task = `Read ${taskFile} with your file tool and follow its instructions exactly, `
          + 'including every output file it names.';
      }
      await this.runLane(lane, task, parsed.cwd, input.signal);
    } finally {
      if (taskDir) {
        try {
          await rm(taskDir, { recursive: true, force: true });
        } catch (error) {
          this.logger?.warn('[ReviewLaneGateway] Could not remove the review task file', { error: messageOf(error) });
        }
      }
    }
  }

  private async runLane(lane: CliDetectionResult, task: string, cwd: string, signal: AbortSignal): Promise<void> {
    const result = await this.manager.spawn({ task, cli: lane.cli,
      ...(lane.ptahCliId ? { ptahCliId: lane.ptahCliId } : {}), workingDirectory: cwd,
      taskKind: 'review', attachMcp: false, deliverables: ['out/lane-output.json'] });
    const agentId = String(result.agentId);
    if (signal.aborted) {
      await this.manager.stop(agentId);
      throw new Error('Review lane cancelled');
    }
    // Continuation-capable SDK handles can keep their process alive after the
    // turn completes. waitForAgents listens for process exit, which may be the
    // five-minute idle release rather than the end of the review turn.
    const deadline = Date.now() + 15 * 60_000;
    try {
      while (true) {
        if (signal.aborted) throw new Error('cancelled');
        if (Date.now() >= deadline) throw new Error('timeout');
        // Review attempts live outside the active editor workspace, so the
        // caller-scoped getStatus API would reject this internal lane.
        const status = this.manager.findAgentInfo(agentId);
        if (!status) throw new Error('status-failed: missing agent');
        if (status.status === 'completed') return;
        if (status.status === 'failed' || status.status === 'stopped' || status.status === 'timeout') {
          const detail = status.status === 'timeout' ? 'timeout' :
            `status-failed: ${status.failureKind ?? status.exitCode ?? status.status}`;
          throw new Error(detail);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(200, Math.max(1, deadline - Date.now()))));
      }
    } finally {
      // stop preserves the completed status while releasing a live SDK handle.
      await this.manager.stop(agentId);
    }
  }
}
