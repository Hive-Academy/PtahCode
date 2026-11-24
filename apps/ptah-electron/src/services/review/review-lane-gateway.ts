import { z } from 'zod';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AgentProcessManager, AgentSpawnEnvironment, CliDetectionService, LaneLimitLookupService, PTAH_CLI_ROLE_DELIVERY, findBlockedLaneModel,
} from '@ptah-extension/cli-agent-runtime';
import { laneFamilyOf, type CliDetectionResult } from '@ptah-extension/shared';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type { LaneModelEntry, LaneModelListing } from '@ptah-extension/lane-routing';
import {
  REVIEW_LANE_CATALOG_MAX, RepoIdentitySchema, ReviewModelIdSchema, type RepoIdentity, type ReviewLaneCatalog,
} from '@ptah-extension/review-contracts';
import {
  ReviewLaneRunUsageSchema, ReviewLaneSpawnError, type IReviewLaneGateway, type ReviewLaneCandidate, type ReviewLaneRunUsage,
  type ReviewLaneSpawnResult,
} from '@ptah-extension/review-core';

const spawnInputSchema = z.object({
  laneId: z.string().min(1).max(128), cwd: z.string().min(1),
  prompt: z.string().min(1).max(200_000),
  model: z.string().trim().min(1).max(200).optional(),
  repo: RepoIdentitySchema,
}).strict();

/** Lane usage without the `partial` flag, which only the end of the lane decides. */
type LaneUsageRead = Omit<ReviewLaneRunUsage, 'partial'>;
const UNREAD_USAGE: LaneUsageRead = { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null,
  costUsd: null, model: null };
const USAGE_FIELDS = ReviewLaneRunUsageSchema.shape;

/** One top-level usage field, or null when it is missing or invalid; never 0 for unknown. */
function fieldOf<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const FAILED_CATALOG: ReviewLaneCatalog = { status: 'failed', models: [], truncated: false, verifiable: false };
const EMPTY_CATALOG: ReviewLaneCatalog = { status: 'empty', models: [], truncated: false, verifiable: false };

/**
 * Settles with `work`, or rejects as soon as `signal` aborts. `LaneModelListing` does not honour the
 * signal for every lane kind, so a read that loses the race is abandoned and its late result dropped.
 */
function untilAborted<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new Error('Review lane model listing aborted'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve().then(work).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Valid, unblocked ids in listing order, cut to the catalog bound (plan A5: truncation, never rejection). */
function catalogOf(entries: readonly LaneModelEntry[]): ReviewLaneCatalog {
  if (entries.length === 0) return EMPTY_CATALOG;
  const kept = new Map<string, LaneModelEntry['provenance']>();
  for (const entry of entries) {
    const id = ReviewModelIdSchema.safeParse(entry.id);
    if (!id.success || findBlockedLaneModel(id.data) !== undefined || kept.has(id.data)) continue;
    kept.set(id.data, entry.provenance);
  }
  const truncated = kept.size > REVIEW_LANE_CATALOG_MAX;
  const models = [...kept.keys()].slice(0, REVIEW_LANE_CATALOG_MAX);
  return { status: 'read', models, truncated,
    verifiable: !truncated && [...kept.values()].some((provenance) => provenance === 'reported') };
}

/** Prompts above this size go through a file, because argv lanes cannot carry them. */
const PROMPT_FILE_THRESHOLD_BYTES = 100_000;

function idOf(row: CliDetectionResult): string {
  return row.ptahCliId ? `ptah-cli:${row.ptahCliId}` : row.cli;
}

/** Ptah CLI rows carry their display name; system rows show the CLI id (plan A4). */
function labelOf(row: CliDetectionResult): string {
  return (row.ptahCliName?.trim() || idOf(row)).slice(0, 128);
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
    private readonly getModelListing?: () => LaneModelListing | undefined,
    /** The registered workspace folder that is the checkout of `repo`; the lane's usage ledger rows are keyed by it. */
    private readonly resolveUsageWorkspace?: (repo: RepoIdentity, signal: AbortSignal) => Promise<string | null>,
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

  /**
   * A lane whose model without a request model (its own setting, else the CLI default) is on the
   * block list: spawn would refuse it, so selection skips it when no model is chosen (M3).
   */
  private defaultModelBlocked(row: CliDetectionResult): boolean {
    return findBlockedLaneModel(this.spawnEnvironment.resolveModel(row.cli, undefined).model) !== undefined;
  }

  async list(): Promise<{ lanes: ReviewLaneCandidate[]; maxConcurrentAgents: number }> {
    const checked = await this.limits.lookup(await this.buildLanes());
    return {
      lanes: checked.map(({ row, state }) => ({
        id: idOf(row), label: labelOf(row), family: row.family ?? row.cli,
        limitState: state.state === 'confirmed-room' ? 'confirmed-room' as const :
          state.state === 'at-limit' ? 'at-limit' as const : 'unknown' as const,
        ...(this.defaultModelBlocked(row) ? { defaultModelBlocked: true } : {}),
      })),
      maxConcurrentAgents: this.spawnEnvironment.maxConcurrentAgents(),
    };
  }

  /** Live catalogs of the requested listed lanes. One lane's failure or abort maps to `failed`; never rejects for one lane. */
  async listModels(laneIds: readonly string[], signal: AbortSignal): Promise<Record<string, ReviewLaneCatalog>> {
    const listing = this.getModelListing?.();
    if (!listing || laneIds.length === 0) return {};
    const wanted = new Set(laneIds);
    const rows = (await this.buildLanes()).filter((row) => wanted.has(idOf(row)));
    const settled = await Promise.allSettled(rows.map((row) => untilAborted(() => listing.list(row, signal), signal)));
    const catalogs: Record<string, ReviewLaneCatalog> = {};
    rows.forEach((row, index) => {
      const outcome = settled[index];
      catalogs[idOf(row)] = outcome.status === 'fulfilled' ? catalogOf(outcome.value) : FAILED_CATALOG;
    });
    return catalogs;
  }

  /** The lane block list refuses this model at spawn, so selection must skip it (plan A6). */
  modelBlocked(model: string): boolean {
    return findBlockedLaneModel(model) !== undefined;
  }

  /**
   * Starts the lane and resolves with its usage once it ended. Every failure before the agent exists
   * rejects with `spawned: false`; every failure after it rejects with `spawned: true` and the usage read
   * at the end. Both keep the original message.
   */
  async spawn(input: { laneId: string; model?: string; cwd: string; prompt: string; signal: AbortSignal; repo: RepoIdentity }): Promise<ReviewLaneSpawnResult> {
    let taskDir: string | undefined;
    try {
      let agentId: string;
      try {
        const parsed = spawnInputSchema.parse({ laneId: input.laneId, cwd: input.cwd, prompt: input.prompt, repo: input.repo,
          ...(input.model !== undefined ? { model: input.model } : {}) });
        if (input.signal.aborted) throw new Error('Review lane cancelled');
        const lane = (await this.buildLanes()).find((entry) => idOf(entry) === parsed.laneId);
        if (!lane) throw new Error('Review lane unavailable');
        const [limit] = await this.limits.lookup([lane], { signal: input.signal });
        if (limit?.state.state === 'at-limit') throw new Error('Review lane is at its limit');
        // A fresh directory per spawn: no earlier lane can have planted a symlink
        // in it, and concurrent lanes in one attempt never share the file.
        taskDir = Buffer.byteLength(parsed.prompt, 'utf8') > PROMPT_FILE_THRESHOLD_BYTES
          ? await mkdtemp(join(parsed.cwd, 'task-')) : undefined;
        let task = parsed.prompt;
        if (taskDir) {
          const taskFile = join(taskDir, 'review-task.md');
          await writeFile(taskFile, parsed.prompt, { encoding: 'utf8', flag: 'wx' });
          task = `Read ${taskFile} with your file tool and follow its instructions exactly, `
            + 'including every output file it names.';
        }
        const folder = await this.usageWorkspace(parsed.repo, input.signal);
        // The lookup swallows its own abort, so an abort during it must stop here: no agent may start.
        if (input.signal.aborted) throw new Error('Review lane cancelled');
        // The model is a typed request field; this code never puts it into command text.
        const result = await this.manager.spawn({ task, cli: lane.cli,
          ...(lane.ptahCliId ? { ptahCliId: lane.ptahCliId } : {}), ...(parsed.model ? { model: parsed.model } : {}),
          workingDirectory: parsed.cwd, taskKind: 'review', attachMcp: false, deliverables: ['out/lane-output.json'],
          ...(folder ? { usageWorkspaceRoot: folder } : {}) });
        agentId = String(result.agentId);
      } catch (error: unknown) {
        // No agent id exists, so there is no usage to read; a ledger row the manager wrote still counts.
        throw ReviewLaneSpawnError.from(error, false, null);
      }
      return await this.runLane(agentId, input.signal);
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

  /** The usage ledger folder of `repo`, or undefined; a failed lookup never fails the lane. */
  private async usageWorkspace(repo: RepoIdentity, signal: AbortSignal): Promise<string | undefined> {
    if (!this.resolveUsageWorkspace) return undefined;
    try {
      return (await this.resolveUsageWorkspace(repo, signal)) ?? undefined;
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn here; the lane's usage rows keep the attempt-root key, stored but uncounted.
      // An abort is no lookup failure and is not logged: the caller re-checks the signal and cancels before spawning.
      if (signal.aborted) return undefined;
      this.logger?.warn('[ReviewLaneGateway] Review usage folder lookup failed', { error: messageOf(error) });
      return undefined;
    }
  }

  /** The agent's top-level usage counters (never its per-model rows), or null when none was read. */
  private readUsage(agentId: string): LaneUsageRead | null {
    let usage: ReturnType<AgentProcessManager['findAgentUsage']>;
    try {
      usage = this.manager.findAgentUsage(agentId);
    } catch {
      // degradation-audit: optional-capability - an unreadable usage stays unknown (null), never 0, and the lane outcome is unchanged.
      return null;
    }
    if (!usage) return null;
    return { inputTokens: fieldOf(USAGE_FIELDS.inputTokens, usage.inputTokens),
      outputTokens: fieldOf(USAGE_FIELDS.outputTokens, usage.outputTokens),
      cacheReadTokens: fieldOf(USAGE_FIELDS.cacheReadTokens, usage.cacheReadTokens),
      cacheWriteTokens: fieldOf(USAGE_FIELDS.cacheWriteTokens, usage.cacheWriteTokens),
      costUsd: fieldOf(USAGE_FIELDS.costUsd, usage.costUsd), model: fieldOf(USAGE_FIELDS.model, usage.model) };
  }

  private async runLane(agentId: string, signal: AbortSignal): Promise<ReviewLaneSpawnResult> {
    let last = this.readUsage(agentId);
    let pollFailed = false;
    let pollError: unknown;
    try {
      if (signal.aborted) throw new Error('Review lane cancelled');
      // Continuation-capable SDK handles can keep their process alive after the
      // turn completes. waitForAgents listens for process exit, which may be the
      // five-minute idle release rather than the end of the review turn.
      const deadline = Date.now() + 15 * 60_000;
      while (true) {
        last = this.readUsage(agentId) ?? last;
        if (signal.aborted) throw new Error('cancelled');
        if (Date.now() >= deadline) throw new Error('timeout');
        // Review attempts live outside the active editor workspace, so the
        // caller-scoped getStatus API would reject this internal lane.
        const status = this.manager.findAgentInfo(agentId);
        if (!status) throw new Error('status-failed: missing agent');
        if (status.status === 'completed') break;
        if (status.status === 'failed' || status.status === 'stopped' || status.status === 'timeout') {
          const detail = status.status === 'timeout' ? 'timeout' :
            `status-failed: ${status.failureKind ?? status.exitCode ?? status.status}`;
          throw new Error(detail);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(200, Math.max(1, deadline - Date.now()))));
      }
    } catch (error: unknown) {
      pollFailed = true;
      pollError = error;
    }
    let stopFailed = false;
    let stopError: unknown;
    try {
      // stop preserves the completed status while releasing a live SDK handle.
      await this.manager.stop(agentId);
    } catch (error: unknown) {
      // Kept aside: a poll failure wins over it, otherwise it rejects below.
      stopFailed = true;
      stopError = error;
      this.logger?.warn('[ReviewLaneGateway] Lane stop failed', { error: messageOf(error) });
    }
    // A record released by stop can read empty; the newest earlier read then stands.
    const usage = this.readUsage(agentId) ?? last ?? UNREAD_USAGE;
    if (pollFailed) throw ReviewLaneSpawnError.from(pollError, true, { ...usage, partial: true });
    if (stopFailed) throw ReviewLaneSpawnError.from(stopError, true, { ...usage, partial: true });
    return { usage: { ...usage, partial: false } };
  }
}
