/**
 * `ISessionSpawner` (TASK_2026_584): child chat sessions a parent session
 * starts with `ptah_session_start`, each in its own git worktree and its own
 * tab.
 *
 * The spawner guards, provisions the worktree, records the parent → child
 * link and the child's unattended permission policy, then asks the host port
 * to start an ordinary chat session. It never owns the stream: it observes
 * the child through host-wide SDK fan-outs subscribed ONCE here (turn
 * ended/failed, SDK id resolved, session end, permission prompt lifecycle)
 * and released in `dispose()`. Nothing polls.
 *
 * Children keep running when their parent ends (user decision, Revision 1):
 * only `stop` (or the Stop button in the child's own tab) ends one. While the
 * parent is not live, the latest undelivered completion per child is held
 * and handed to the parent's next `ptah_session_*` call.
 *
 * Timers: runtime warning/cap, handoff grace, session-end grace, and a bounded
 * tool-driven predecessor retirement fallback; all cleared on release/dispose.
 */
import { inject, injectable, type DependencyContainer } from 'tsyringe';
import type { ProviderAccountPortRefusal } from '@ptah-extension/auth-providers-tokens';
import { isAbsolute, resolve } from 'node:path';
import { access, readFile, realpath } from 'node:fs/promises';
import {
  SDK_TOKENS,
  SessionAdmissionRefusedError,
  parseSessionEndCause,
  type PermissionPromptLifecycleEvent,
  type SdkAdapterEvents,
  type SdkAdapterTurnEndedEvent,
  type SdkAdapterTurnFailedEvent,
  type SdkPermissionHandler,
  type SessionBudgetService,
  type SessionEndCallbackRegistry,
  type SessionEndPayload,
  type SessionIdResolvedCallbackRegistry,
  type SessionIdResolvedPayload,
  type SessionLifecycleManager,
  type SessionTurnStateRegistry,
  type UnattendedSessionPolicy,
  type UnattendedSessionPolicyRegistry,
} from '@ptah-extension/agent-sdk';
import {
  MEMORY_CONTRACT_TOKENS,
  type ITranscriptReader,
} from '@ptah-extension/memory-contracts';
import {
  PLATFORM_TOKENS,
  isPathWithinRoots,
  resolveWorkspaceSkillPath,
  type IMcpServerStatus,
  type IMcpSubagentRootRegistrar,
  type IOutputChannel,
  type ISessionOrganizationRecorder,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  SessionId,
  normalizeWorkspaceRoot,
  type AgentSessionOpenedPayload,
  type ChildSettingSource,
  type AIMessageOrigin,
  type IAgentAdapter,
  type PermissionLevel,
  type SessionTurnPhase,
  type SessionEndCause,
} from '@ptah-extension/shared';
import {
  TOKENS,
  resolveWorktreePath,
  type Logger,
} from '@ptah-extension/vscode-core';
import { CLI_AGENT_RUNTIME_TOKENS } from '../di/tokens';
import type { AgentProcessManager } from '../cli-agents/agent-process-manager.service';
import { AgentSpawnEnvironment } from '../cli-agents/agent-spawn-environment.service';
import { LaneCompletionNotifier } from '../cli-agents/lane-completion-notifier.service';
import { childSettingSources } from './session-spawner.port';
import type {
  ChildChatSessionStartOutcome,
  IChildChatSessionHost,
} from './child-chat-session-host.port';
import type { IChildSettingRouter } from './child-setting-router.port';
import {
  ChildWorktreeProvisioner,
  type ChildWorktree,
} from './child-worktree.provisioner';
import {
  SessionChildRegistry,
  type SessionChildRecord,
  type SessionChildReservation,
} from './session-child.registry';
import {
  composeSessionChildPrompt,
  renderSessionChildContract,
} from './session-child-contract';
import {
  readSessionChildSettings,
  type SessionChildSettings,
} from './session-child-settings';
import {
  renderRuntimeCapWarning,
  renderSuccessorTask,
  routeSessionEndCause,
  runtimeWarnDelayMs,
  sessionChildHandoffPath,
  successionEndReason,
} from './session-child-succession';
import { childOutcomeOf } from './session-child-outcome';
import { transferHeldPeerMessages } from './session-held-message-transfer';
import type { HandoffPredecessorCloser } from './session-handoff.port';
import {
  SESSION_CHILD_FIRST_TURN_TIMEOUT_MS,
  firstTurnFailureText,
  firstTurnNotStarted,
  firstTurnVerdict,
  type FirstTurnProbe,
} from './session-child-first-turn.watchdog';
import type {
  ISessionSpawner,
  SessionChildClearQuery,
  SessionChildClearResult,
  SessionChildClearSkipReason,
  SessionChildCompletionDelivery,
  SessionChildCompletionEnvelope,
  SessionChildEligibility,
  SessionChildLookupRefusal,
  SessionChildQuery,
  SessionChildReadResult,
  SessionChildRollbackStep,
  SessionChildSendRequest,
  SessionChildSendResult,
  SessionChildSettle,
  SessionChildSnapshot,
  SessionChildStartRequest,
  SessionChildStartResult,
  SessionChildStatus,
  SessionChildStopQuery,
  SessionChildStopResult,
  SessionChildSuccessionCause,
  SessionChildSuccessionRequest,
  SessionChildSuccessionResult,
  SessionSpawnRefusalCode,
} from './session-spawner.port';

const LOG_PREFIX = '[SessionSpawner]';

/** How long an ended child session may take to re-register before it is ended. */
export const SESSION_CHILD_GRACE_MS = 30_000;
export const SESSION_READ_DEFAULT_TAIL_KIB = 32;
export const SESSION_READ_MAX_TAIL_KIB = 256;
/** JSONL bytes read per KiB of transcript returned: the JSONL is far more verbose. */
const TRANSCRIPT_BYTES_PER_OUTPUT_KIB = 4 * 1024;

/** Per-child state that is not part of the serialisable record. */
interface ChildRuntime {
  readonly worktree: ChildWorktree;
  readonly policy: UnattendedSessionPolicy;
  readonly settings: SessionChildSettings;
  readonly permissionLevel?: PermissionLevel;
  readonly model?: string;
  readonly effort?: SessionChildStartRequest['effort'];
  releasePolicy?: () => void;
  /** The exact string given to `retainRoot`; `releaseRoot` must get the same one. */
  mcpRoot?: string;
  runtimeTimer?: ReturnType<typeof setTimeout>;
  warnTimer?: ReturnType<typeof setTimeout>;
  handoffGraceTimer?: ReturnType<typeof setTimeout>;
  retireTimer?: ReturnType<typeof setTimeout>;
  /** First-turn watchdog (TASK_2026_932 E); re-armed at most once. */
  firstTurnTimer?: ReturnType<typeof setTimeout>;
  firstTurnRearmed?: boolean;
  endCause?: SessionEndCause;
  /** `turnsSettled` when the session ended; a later settle owns the turn. */
  turnsSettledAtEnd?: number;
  capReached: boolean;
  succeeding: boolean;
  graceTimer?: ReturnType<typeof setTimeout>;
  /** Timestamp of the last settled turn event, for dedupe. */
  lastSettleTimestamp?: number;
  /** Set while the spawner itself ends the child; events are then ignored. */
  stopping: boolean;
  pendingRequestId?: string;
}

type StartRefusal = Extract<SessionChildStartResult, { ok: false }>;

type OwnedLookup =
  | {
      readonly ok: true;
      readonly child: SessionChildRecord;
      readonly caller: SessionId;
    }
  | { readonly ok: false; readonly refusal: SessionChildLookupRefusal };

/** The checked arguments of a start, before any route or git work. */
interface PreparedStart {
  readonly root: string;
  readonly branch: string;
  readonly task: string;
  readonly paths: Extract<ChildPaths, { ok: true }>;
}

interface StartGuardPass {
  readonly ok: true;
  readonly caller: SessionId;
  readonly permissionLevel?: PermissionLevel;
  readonly adapter: IAgentAdapter;
  readonly host: IChildChatSessionHost;
  readonly settings: SessionChildSettings;
  readonly reservation: SessionChildReservation;
}

interface StartEligibilityPass {
  readonly ok: true;
  readonly caller: SessionId;
  readonly callerSdkId: string | undefined;
  readonly adapter: IAgentAdapter;
  readonly host: IChildChatSessionHost;
}

@injectable()
export class SessionSpawnerService implements ISessionSpawner {
  private readonly runtimes = new Map<string, ChildRuntime>();
  private readonly retiring = new Set<string>();
  /** The start promise of each pending (`starting`) child id. */
  private readonly pendingStarts = new Map<
    string,
    Promise<SessionChildStartResult>
  >();
  private readonly disposers: Array<() => void> = [];
  private disposed = false;

  constructor(
    @inject(SessionChildRegistry)
    private readonly registry: SessionChildRegistry,
    @inject(ChildWorktreeProvisioner)
    private readonly provisioner: ChildWorktreeProvisioner,
    @inject(LaneCompletionNotifier)
    private readonly notifier: LaneCompletionNotifier,
    @inject(AgentSpawnEnvironment)
    private readonly environment: AgentSpawnEnvironment,
    @inject(TOKENS.AGENT_PROCESS_MANAGER)
    private readonly agents: AgentProcessManager,
    @inject(SDK_TOKENS.SDK_UNATTENDED_SESSION_POLICY_REGISTRY)
    private readonly policies: UnattendedSessionPolicyRegistry,
    @inject(SDK_TOKENS.SDK_ADAPTER_EVENTS)
    adapterEvents: SdkAdapterEvents,
    @inject(SDK_TOKENS.SDK_SESSION_ID_RESOLVED_CALLBACK_REGISTRY)
    idResolved: SessionIdResolvedCallbackRegistry,
    @inject(SDK_TOKENS.SDK_SESSION_END_CALLBACK_REGISTRY)
    sessionEnd: SessionEndCallbackRegistry,
    @inject(SDK_TOKENS.SDK_PERMISSION_HANDLER)
    permissions: SdkPermissionHandler,
    @inject(SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER)
    private readonly lifecycle: SessionLifecycleManager,
    @inject(SDK_TOKENS.SDK_SESSION_TURN_STATE_REGISTRY)
    private readonly turnState: SessionTurnStateRegistry,
    @inject(MEMORY_CONTRACT_TOKENS.TRANSCRIPT_READER)
    private readonly transcripts: ITranscriptReader,
    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspace: IWorkspaceProvider,
    @inject(PLATFORM_TOKENS.OUTPUT_CHANNEL)
    private readonly output: IOutputChannel,
    /** Absent in a host without a chat runtime → `chat-runtime-unavailable`. */
    @inject(TOKENS.AGENT_ADAPTER, { isOptional: true })
    private readonly adapter: IAgentAdapter | null = null,
    /**
     * Where the chat host port (`CHILD_CHAT_SESSION_HOST`) is looked up, at
     * `start()` time and never here: `registerChatServices` registers it in a
     * later phase than this spawner, so a constructor injection would capture
     * `null` for the life of the process whenever anything resolves the
     * spawner first (B5 review, Task 6.6). Optional for the same reason as in
     * `PtahCliRegistry`: every host registers `DI_CONTAINER`. Absent, or no
     * host registered at `start()` → `chat-runtime-unavailable`.
     */
    @inject(PLATFORM_TOKENS.DI_CONTAINER, { isOptional: true })
    private readonly container: DependencyContainer | null = null,
    /** Absent or port-less (CLI host) → `mcp-unavailable`. */
    @inject(PLATFORM_TOKENS.MCP_SERVER_STATUS, { isOptional: true })
    private readonly mcpStatus: IMcpServerStatus | null = null,
    /** Absent → the child starts with `subagentPtahTools: 'unavailable'`. */
    @inject(PLATFORM_TOKENS.MCP_SUBAGENT_ROOT_REGISTRAR, { isOptional: true })
    private readonly rootRegistrar: IMcpSubagentRootRegistrar | null = null,
    /**
     * Durable organization of the child (TASK_2026_580, R-TL8): lineage,
     * worktree, branch and task link, written once its SDK id binds. Bound
     * only where SQLite is (not VS Code); absent → nothing is recorded.
     */
    @inject(PLATFORM_TOKENS.SESSION_ORGANIZATION_RECORDER, { isOptional: true })
    private readonly organizationRecorder: ISessionOrganizationRecorder | null = null,
    /**
     * The session budget (TASK_2026_597 N7). An interrupt keeps a session's
     * budget (a Stop is not an end), so the spawner releases a child's entry
     * itself when the child truly ends. Absent → nothing to release.
     */
    @inject(SDK_TOKENS.SDK_SESSION_BUDGET, { isOptional: true })
    private readonly sessionBudget: Pick<
      SessionBudgetService,
      'release'
    > | null = null,
    @inject(TOKENS.LOGGER, { isOptional: true })
    private readonly logger: Logger | null = null,
    /**
     * Override of the child setting router (direct unit tests). The real
     * lookup is lazy at start() time, because the token is bound after this
     * singleton can resolve.
     */
    @inject(CLI_AGENT_RUNTIME_TOKENS.CHILD_SETTING_ROUTER, { isOptional: true })
    private readonly childSettingRouter: IChildSettingRouter | null = null,
  ) {
    this.disposers.push(
      adapterEvents.onTurnEnded((event) => this.onTurnEnded(event)),
      adapterEvents.onTurnFailed((event) => this.onTurnFailed(event)),
      idResolved.register((payload) => this.onSessionIdResolved(payload)),
      sessionEnd.register((payload) => this.onSessionEnd(payload)),
      permissions.onPromptLifecycle((event) => this.onPromptLifecycle(event)),
    );
  }

  /* ------------------------------------------------------------------------
   * start
   * ---------------------------------------------------------------------- */

  async start(
    request: SessionChildStartRequest,
  ): Promise<SessionChildStartResult> {
    const guard = this.guardStart(request);
    if (!guard.ok) return guard;
    if (!('reservation' in guard)) return this.joinPendingStart(guard);
    // `add` consumes the reservation; releasing it afterwards is a no-op, so
    // every exit path can release unconditionally.
    try {
      return await this.provisionAndStart(request, guard);
    } finally {
      this.registry.release(guard.reservation);
    }
  }

  canStart(callerSessionId: string | undefined): SessionChildEligibility {
    const eligibility = this.checkStartEligibility(callerSessionId);
    if (!eligibility.ok) return eligibility;
    const settings = readSessionChildSettings(this.workspace);
    if (settings.maxConcurrent > 0 && this.registry.liveCount() >= settings.maxConcurrent) {
      return { ok: false, code: 'cap-reached', reason: `${settings.maxConcurrent} child sessions are already live in this host (agentSessions.maxConcurrent)` };
    }
    return { ok: true };
  }

  /** Shared, read-only checks. Request-specific branch and slot checks follow in start. */
  private checkStartEligibility(callerSessionId: string | undefined): StartEligibilityPass | Extract<SessionChildEligibility, { ok: false }> {
    if (this.disposed) {
      return { ok: false, code: 'chat-runtime-unavailable', reason: 'the host is shutting down' };
    }
    const host = this.lookupHost();
    const adapter = this.adapter;
    if (!host || !adapter) {
      return { ok: false, code: 'chat-runtime-unavailable', reason: 'this host has no chat runtime to start a child session in' };
    }
    const caller = SessionId.safeParse(callerSessionId?.trim());
    if (!caller || !adapter.isSessionActive(caller)) {
      return { ok: false, code: 'unattributed-caller', reason: 'ptah_session_start must be called from a live chat session; this ' +
        'caller has no live session id' };
    }
    const callerSdkId = this.sdkIdOf(caller);
    if (this.registry.isChild(caller) || this.registry.isChild(callerSdkId)) {
      return { ok: false, code: 'depth-exceeded', reason: 'a child session cannot start child sessions (depth is limited to 1)' };
    }
    if ((this.mcpStatus?.getPort() ?? null) === null) {
      return { ok: false, code: 'mcp-unavailable', reason: 'the Ptah MCP server is not running in this host, so a child could ' +
        'not report back or be steered' };
    }
    return { ok: true, caller, callerSdkId, adapter, host };
  }

  /** The synchronous guards, in order; the slot is reserved last. */
  private guardStart(
    request: SessionChildStartRequest,
  ): StartGuardPass | SessionChildStartResult {
    const eligibility = this.checkStartEligibility(request.callerSessionId);
    if (!eligibility.ok) return this.refuseStart(eligibility.code, eligibility.reason);
    const { caller, callerSdkId, adapter, host } = eligibility;
    const existing = !request.attachToSessionId && this.existingStart(
      [caller, callerSdkId],
      request.branch?.trim() ?? '',
    );
    if (existing) {
      this.log(
        `start for ${caller} on ${existing.branch} returns existing child ${existing.childSessionId}`,
      );
      return {
        ok: true,
        child: this.snapshotOf(existing),
        alreadyExists: true,
      };
    }
    const settings = readSessionChildSettings(this.workspace);
    const reservation = this.registry.reserveSlot(settings.maxConcurrent);
    if (!reservation) {
      const own = this.registry
        .childrenOf([caller, callerSdkId])
        .filter((child) => !child.terminalStatus)
        .map((child) => `${child.label} (${child.childSessionId})`);
      return this.refuseStart(
        'cap-reached',
        `${settings.maxConcurrent} child sessions are already live in this ` +
          'host (agentSessions.maxConcurrent). ' +
          (own.length > 0
            ? `Stop one of yours with ptah_session_stop: ${own.join(', ')}.`
            : 'None of them belongs to this session.'),
      );
    }
    return {
      ok: true,
      caller,
      permissionLevel: this.lifecycle.find(caller)?.permissionLevel,
      adapter,
      host,
      settings,
      reservation,
    };
  }

  /**
   * A pending or live child of this caller on `branch` (TASK_2026_932 E2): a
   * retried start after a client timeout gets that child, not a second one.
   */
  private existingStart(
    callerIds: readonly (string | undefined)[],
    branch: string,
  ): SessionChildRecord | undefined {
    if (!branch) return undefined;
    return [
      ...this.registry.pendingOf(callerIds),
      ...this.registry.childrenOf(callerIds).filter((c) => !c.terminalStatus),
    ].find((record) => record.branch === branch);
  }

  /**
   * Allocates the child id first and registers a pending `starting` record
   * after the cheap argument checks, before the model route and the worktree,
   * so `ptah_session_status` shows the start while it runs. Every exit drops
   * the pending record; a successful `registry.add` already replaced it.
   */
  private async provisionAndStart(
    request: SessionChildStartRequest,
    guard: StartGuardPass,
  ): Promise<SessionChildStartResult> {
    const childTabId = SessionId.create();
    const root = this.resolveRoot();
    if (typeof root !== 'string') return root;

    const branch = request.branch?.trim() ?? '';
    const task = request.task?.trim() ?? '';
    if (!task) return this.refuseStart('invalid-arguments', 'task is empty');
    if (!branch)
      return this.refuseStart('invalid-arguments', 'branch is empty');

    // The path the provisioner will create: the same deterministic function,
    // so task folder and deliverables are checked before any git work.
    const plannedPath = resolveWorktreePath(root, branch);
    if (request.attachToSessionId && !request.taskId) {
      return this.refuseStart(
        'invalid-arguments',
        'attachToSessionId requires taskId',
      );
    }
    const paths = resolveChildPaths(plannedPath, request);
    if (!paths.ok) return this.refuseStart('invalid-arguments', paths.detail);

    const skillPrompts: string[] = [];
    for (const skill of request.skills ?? request.phase?.skills ?? []) {
      if (skill.text !== undefined) {
        skillPrompts.push(`Skill ${skill.name}:\n${skill.text}`);
        continue;
      }
      if (!skill.path?.trim()) {
        return this.refuseStart(
          'invalid-arguments',
          `Skill ${skill.name} delivery unavailable: no text or path was provided`,
        );
      }
      let skillPath: string | undefined;
      try {
        skillPath = resolveWorkspaceSkillPath(root, skill.path);
      } catch (error: unknown) {
        // degradation-audit: reported - the skill path refusal is returned to the caller.
        return this.refuseStart('invalid-arguments', errorMessage(error));
      }
      if (!skillPath) {
        return this.refuseStart('invalid-arguments', `Skill ${skill.name} delivery unavailable: file not found`);
      }
      try {
        skillPrompts.push(`Skill ${skill.name}:\n${await readFile(skillPath, 'utf8')}`);
      } catch (error: unknown) {
        return this.refuseStart(
          'invalid-arguments',
          `Skill ${skill.name} delivery unavailable: cannot read ${skillPath}: ${errorMessage(error)}`,
        );
      }
    }

    this.registry.addPending(
      this.pendingRecordOf(childTabId, request, guard, {
        root,
        branch,
        task,
        plannedPath,
        paths,
      }),
    );
    const run = this.routeAndStart(childTabId, request, guard, {
      root,
      branch,
      task,
      paths,
      skillPrompts,
    });
    this.pendingStarts.set(childTabId, run);
    try {
      return await run;
    } finally {
      this.pendingStarts.delete(childTabId);
      this.registry.removePending(childTabId);
    }
  }

  /**
   * A retried start that found an existing child. When that child is still a
   * pending start, the retry waits for it and returns its real result, so a
   * start that fails later is not reported as started (review M3).
   */
  private async joinPendingStart(
    existing: Extract<SessionChildStartResult, { ok: true }>,
  ): Promise<SessionChildStartResult> {
    const run = this.pendingStarts.get(existing.child.childSessionId);
    if (!run) return existing;
    const settled = await run;
    return settled.ok ? { ...settled, alreadyExists: true } : settled;
  }

  private pendingRecordOf(
    childTabId: string,
    request: SessionChildStartRequest,
    guard: StartGuardPass,
    start: PreparedStart & { readonly plannedPath: string },
  ): SessionChildRecord {
    const parentSdkSessionId = this.sdkIdOf(guard.caller);
    return {
      childSessionId: childTabId,
      parentSessionId: guard.caller,
      ...(parentSdkSessionId ? { parentSdkSessionId } : {}),
      label: request.label?.trim() || start.branch,
      ...(request.taskId ? { taskId: request.taskId } : {}),
      branch: start.branch,
      baseRef: request.baseRef?.trim() ?? '',
      workspaceRoot: start.root,
      worktreePath: start.plannedPath,
      ...(start.paths.taskFolder ? { taskFolder: start.paths.taskFolder } : {}),
      deliverables: start.paths.deliverables,
      subagentPtahTools: 'unavailable',
      startedAt: new Date().toISOString(),
      turnsSettled: 0,
      reportsDelivered: 0,
      reportsRefused: 0,
      task: start.task,
    };
  }

  /** Model route, worktree, registry record and host start of a pending child. */
  private async routeAndStart(
    childTabId: string,
    request: SessionChildStartRequest,
    guard: StartGuardPass,
    { root, branch, task, paths, skillPrompts }: PreparedStart & { readonly skillPrompts: readonly string[] },
  ): Promise<SessionChildStartResult> {
    // After the cheap argument checks, still before any git work: a refused
    // model leaves no worktree, branch or registry record behind.
    let resolvedModel: string | undefined;
    let resolvedEffort = request.effort;
    let modelSource: ChildSettingSource = request.model ? 'pin' : 'default';
    let effortSource: ChildSettingSource = request.effort ? 'pin' : 'default';
    if (request.model) {
      try {
        const validation = await guard.host.resolveChildModel({
          model: request.model,
          workspaceRoot: root,
          parentSessionId: guard.caller,
        });
        if (!validation.accepted) {
          return this.refuseStart(
            validation.code,
            validation.acceptedModels?.length
              ? `${validation.message} Accepted models: ${validation.acceptedModels.slice(0, 30).join(', ')}${validation.acceptedModels.length > 30 ? ` (+${validation.acceptedModels.length - 30} more)` : ''}`
              : validation.message,
          );
        }
        resolvedModel = validation.resolvedModel;
      } catch (error: unknown) {
        this.logger?.error(
          '[SessionSpawner] Model catalog validation failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        return this.refuseStart(
          'model-catalog-unavailable',
          errorMessage(error),
        );
      }
    }

    const router = this.lookupChildSettingRouter();
    if (router && (!request.model || !request.effort)) {
      try {
        const models = request.model
          ? []
          : await guard.host.listChildModels({
              workspaceRoot: root,
              parentSessionId: guard.caller,
            });
        const routed = await router.route({
          brief: `${request.label ?? branch}\n${task}`,
          models,
          ...(resolvedModel ? { model: resolvedModel } : {}),
          ...(request.effort ? { effort: request.effort } : {}),
        });
        resolvedEffort = routed.effort;
        effortSource = routed.effortSource;
        if (!request.model && routed.model) {
          const admission = await guard.host.resolveChildModel({
            model: routed.model,
            workspaceRoot: root,
            parentSessionId: guard.caller,
          });
          if (admission.accepted) {
            resolvedModel = admission.resolvedModel;
            modelSource = routed.modelSource;
          } else {
            this.logger?.warn(
              '[SessionSpawner] Routed model was not admitted',
              { code: admission.code },
            );
          }
        }
      } catch (error: unknown) {
        this.logger?.warn('[SessionSpawner] Child setting route unavailable', {
          message: errorMessage(error),
        });
      }
    }

    let provisioned;
    if (request.attachToSessionId) {
      // Real paths close the symlink gap between a registered path and the
      // deterministic path a fresh start would otherwise create.
      let canonical: string;
      try {
        canonical = await realpath(resolveWorktreePath(root, branch));
      } catch {
        return this.refuseStart(
          'branch-exists',
          'registered attach worktree no longer exists',
        );
      }
      const target = this.registry.findAttachTarget(
        request.attachToSessionId,
        request.taskId ?? '',
        branch,
        canonical,
        [guard.caller, this.sdkIdOf(guard.caller)],
      );
      // degradation-audit: reported - an unresolvable registered path never
      // equals the canonical path, so the start is refused with the reason below.
      if (
        !target ||
        (await realpath(target.worktreePath).catch(() => '')) !== canonical
      ) {
        return this.refuseStart(
          'branch-exists',
          'attach requires a registered child with the same taskId, canonical worktree and branch',
        );
      }
      provisioned = await this.provisioner.attach(root, branch, canonical);
    } else {
      provisioned = await this.provisioner.create(
        root,
        branch,
        request.baseRef,
      );
    }
    if (!provisioned.ok) {
      this.log(`start refused (${provisioned.refusal}): ${provisioned.detail}`);
      return {
        ok: false,
        refusal: provisioned.refusal,
        detail: provisioned.detail,
        ...(provisioned.rollback ? { rollback: provisioned.rollback } : {}),
      };
    }
    // Stamped after `git worktree add` returned: every checked-out file is
    // older, so it never reads as this child's deliverable.
    const startedAt = new Date().toISOString();
    const { worktree } = provisioned;
    let canonicalWorktreePath: string;
    try {
      canonicalWorktreePath = await realpath(worktree.worktreePath);
    } catch (error: unknown) {
      // degradation-audit: reported - a vanished worktree is rolled back and refused.
      return {
        ok: false,
        refusal: 'session-start-failed',
        detail: `Could not resolve the child worktree: ${errorMessage(error)}`,
        rollback: worktree.owned === false ? [] : await this.provisioner.rollback(worktree),
      };
    }

    const parentSdkSessionId = this.sdkIdOf(guard.caller);
    const label = request.label?.trim() || branch;
    const record: SessionChildRecord = {
      childSessionId: childTabId,
      parentSessionId: guard.caller,
      ...(parentSdkSessionId ? { parentSdkSessionId } : {}),
      label,
      ...(resolvedModel ? { model: resolvedModel } : {}),
      ...(resolvedEffort ? { effort: resolvedEffort } : {}),
      modelSource,
      effortSource,
      ...(request.taskId ? { taskId: request.taskId } : {}),
      branch,
      baseRef: worktree.baseSha,
      workspaceRoot: root,
      worktreePath: canonicalWorktreePath,
      ...(paths.taskFolder ? { taskFolder: paths.taskFolder } : {}),
      deliverables: paths.deliverables,
      subagentPtahTools: 'unavailable',
      startedAt,
      turnsSettled: 0,
      reportsDelivered: 0,
      reportsRefused: 0,
      task,
      ...(request.phase
        ? {
            phaseKind: request.phase.kind,
            phaseDisallowedTools: [...request.phase.toolProfile.disallowedTools],
          }
        : {}),
    };

    const runtime: ChildRuntime = {
      worktree,
      policy: this.policyFor(guard.settings, label, worktree.worktreePath),
      settings: guard.settings,
      permissionLevel: guard.permissionLevel,
      model: resolvedModel,
      effort: resolvedEffort,
      capReached: false,
      succeeding: false,
      stopping: false,
    };
    try {
      this.registry.add(record, guard.reservation);
      this.runtimes.set(childTabId, runtime);
      runtime.releasePolicy = this.policies.register(
        childTabId,
        runtime.policy,
      );
      await this.retainMcpRoot(childTabId, runtime, worktree.worktreePath);

      const contract = renderSessionChildContract({
        parentLabel: `session ${guard.caller}`,
        label,
        branch,
        worktreePath: worktree.worktreePath,
        bashAllowlist: guard.settings.bashAllowlist,
        denyWindowMs: guard.settings.permissionDenyWindowMs,
        ...(paths.taskFolder ? { taskFolder: paths.taskFolder } : {}),
        deliverables: paths.deliverables,
      });
      const stored = this.registry.get(childTabId) ?? record;
      const outcome = await this.startOnHost(guard.host, {
        tabId: childTabId,
        workspaceRoot: root,
        worktreePath: worktree.worktreePath,
        prompt: composeSessionChildPrompt(
          contract,
          [
            request.phase?.text,
            ...skillPrompts,
            task,
          ]
            .filter(Boolean)
            .join('\n\n'),
        ),
        descriptor: this.descriptorOf(stored),
        sessionName: label,
        ...(guard.permissionLevel
          ? { permissionLevel: guard.permissionLevel }
          : {}),
        ...(resolvedModel ? { model: resolvedModel } : {}),
        ...(resolvedEffort ? { effort: resolvedEffort } : {}),
        ...(request.phase ? { phase: request.phase } : {}),
      });
      if (!outcome.started) {
        return await this.failStart(
          childTabId,
          runtime,
          outcome.error,
          outcome.accountRefusal,
        );
      }
      if (outcome.toolProfileApplied === true) {
        this.registry.update(childTabId, { toolProfileApplied: true });
      }

      this.armRuntimeCap(runtime, childTabId, guard.settings.maxRuntimeMinutes);
      this.armFirstTurnWatchdog(runtime, childTabId);
      this.log(
        `started ${childTabId} (${label}) for ${guard.caller} on ${branch} in ` +
          `${worktree.worktreePath}; tab announced: ${outcome.uiAnnounced}`,
      );
      const live = this.registry.get(childTabId) ?? stored;
      return { ok: true, child: this.snapshotOf(live) };
    } catch (error: unknown) {
      // degradation-audit: reported - an unexpected failure after the
      // worktree exists is rolled back and returned as `session-start-failed`
      // with the per-step table.
      return await this.failStart(childTabId, runtime, errorMessage(error));
    }
  }

  /** The parent root, inside the open folders. */
  private resolveRoot(): string | StartRefusal {
    let root: string | undefined;
    try {
      root = this.environment.scopedWorkspaceRoot();
    } catch (error: unknown) {
      // degradation-audit: reported - the caller declared a workspace this
      // host does not have open; refused by name as `no-workspace`.
      return this.refuseStart('no-workspace', errorMessage(error));
    }
    if (!root) {
      return this.refuseStart('no-workspace', 'no workspace folder is open');
    }
    if (!isPathWithinRoots(root, this.workspace.getWorkspaceFolders())) {
      return this.refuseStart(
        'no-workspace',
        `the workspace root ${root} is not inside an open folder`,
      );
    }
    return root;
  }

  private async startOnHost(
    host: IChildChatSessionHost,
    input: Parameters<IChildChatSessionHost['startChildSession']>[0],
  ): Promise<
    ChildChatSessionStartOutcome & {
      readonly accountRefusal?: ProviderAccountPortRefusal;
    }
  > {
    try {
      return await host.startChildSession(input);
    } catch (error: unknown) {
      // degradation-audit: reported - a throwing host is the same outcome as
      // `started: false`: the caller rolls back and reports the reason.
      return { started: false, error: errorMessage(error) };
    }
  }

  private async retainMcpRoot(
    childTabId: string,
    runtime: ChildRuntime,
    worktreePath: string,
  ): Promise<void> {
    if (!this.rootRegistrar) {
      this.log(
        `${childTabId}: no MCP root registrar; subagent Ptah tools unavailable`,
      );
      return;
    }
    try {
      const retention = await this.rootRegistrar.retainRoot(worktreePath);
      if (retention.registered) {
        runtime.mcpRoot = worktreePath;
        this.registry.update(childTabId, { subagentPtahTools: 'available' });
      } else {
        this.log(
          `${childTabId}: MCP root not retained (${retention.reason ?? 'no reason given'}); ` +
            'subagent Ptah tools unavailable',
        );
      }
    } catch (error: unknown) {
      // degradation-audit: optional-capability - the child still starts; its
      // status reports subagent Ptah tools as unavailable.
      this.log(`${childTabId}: MCP root retain failed: ${errorMessage(error)}`);
    }
  }

  /** Reverse rollback of everything this start created, every step reported. */
  private async failStart(
    childTabId: string,
    runtime: ChildRuntime,
    error: string,
    accountRefusal?: ProviderAccountPortRefusal,
  ): Promise<SessionChildStartResult> {
    this.log(`start of ${childTabId} failed: ${error}; rolling back`);
    const rollback: SessionChildRollbackStep[] = [];
    this.clearTimers(runtime);
    if (runtime.mcpRoot) {
      rollback.push(await this.releaseMcpRoot(runtime.mcpRoot));
      runtime.mcpRoot = undefined;
    }
    if (runtime.releasePolicy) {
      runtime.releasePolicy();
      runtime.releasePolicy = undefined;
      rollback.push({ step: 'release-policy', ok: true });
    }
    this.runtimes.delete(childTabId);
    const removed = this.registry.remove(childTabId);
    rollback.push(
      {
        step: 'remove-link',
        ok: removed,
        ...(removed ? {} : { detail: 'the child link was never recorded' }),
      },
      ...(runtime.worktree.owned === false
        ? []
        : await this.provisioner.rollback(runtime.worktree)),
    );
    for (const step of rollback) {
      this.log(`rollback ${step.step}: ${rollbackStepOutcome(step)}`);
    }
    return {
      ok: false,
      refusal: 'session-start-failed',
      detail: error,
      ...(accountRefusal ? { accountRefusal } : {}),
      rollback,
    };
  }

  /* ------------------------------------------------------------------------
   * send / status / read / stop
   * ---------------------------------------------------------------------- */

  async send(
    request: SessionChildSendRequest,
  ): Promise<SessionChildSendResult> {
    const owned = this.resolveOwned(
      request.callerSessionId,
      request.childSessionId,
    );
    if (!owned.ok) {
      return {
        delivered: false,
        reason: owned.refusal.reason,
        detail: owned.refusal.detail,
      };
    }
    const { child, caller } = owned;
    const target = this.activeIdOf(child);
    if (child.terminalStatus || !target || !this.adapter) {
      return {
        delivered: false,
        reason: 'session-ended',
        detail:
          `child ${child.childSessionId} is not running` +
          (child.endReason ? ` (${child.endReason})` : '') +
          '; the user can resume it from its tab',
      };
    }
    const adapter = this.adapter;
    const origin: AIMessageOrigin = {
      kind: 'peer',
      from: `ptah-session:${caller}`,
      name: 'parent session',
    };
    const busy = this.phaseOf(child) === 'generating';

    try {
      switch (request.mode) {
        case 'if-idle':
          await adapter.sendMessageToSession(target, request.message, {
            origin,
            admission: 'require-idle',
          });
          return this.sent(child, request.mode, 'started-turn');
        case 'steer': {
          if (!busy) {
            await adapter.sendMessageToSession(target, request.message, {
              origin,
            });
            return this.sent(child, request.mode, 'started-turn');
          }
          const interrupted = await this.interruptTurn(adapter, target);
          if (!interrupted.ok) {
            return {
              delivered: false,
              reason: 'interrupt-failed',
              detail: `the current turn could not be interrupted${interrupted.detail}; nothing was sent`,
            };
          }
          await adapter.sendMessageToSession(target, request.message, {
            origin,
          });
          return this.sent(child, request.mode, 'interrupted-and-started');
        }
        case 'queue':
        default:
          await adapter.sendMessageToSession(target, request.message, {
            origin,
          });
          return this.sent(
            child,
            request.mode,
            busy ? 'held-until-turn-end' : 'started-turn',
          );
      }
    } catch (error: unknown) {
      // degradation-audit: reported - every send failure is returned to the
      // parent as a closed refusal reason with the error text.
      this.log(
        `send to ${child.childSessionId} failed: ${errorMessage(error)}`,
      );
      return sendFailure(error);
    }
  }

  status(
    query: SessionChildQuery,
  ):
    | { readonly ok: true; readonly children: readonly SessionChildSnapshot[] }
    | SessionChildLookupRefusal {
    if (query.childSessionId !== undefined) {
      const pending = this.ownedPending(
        query.callerSessionId,
        query.childSessionId,
      );
      if (pending) return { ok: true, children: [this.snapshotOf(pending)] };
      const owned = this.resolveOwned(
        query.callerSessionId,
        query.childSessionId,
      );
      if (!owned.ok) return owned.refusal;
      return { ok: true, children: [this.snapshotOf(owned.child)] };
    }
    const caller = SessionId.safeParse(query.callerSessionId?.trim());
    if (!caller) return unattributed();
    const callerIds = [caller, this.sdkIdOf(caller)];
    const children = [
      ...this.registry.childrenOf(callerIds),
      ...this.registry.pendingOf(callerIds),
    ].map((child) => this.snapshotOf(child));
    return { ok: true, children };
  }

  async read(
    query: SessionChildQuery & {
      readonly childSessionId: string;
      readonly tailKiB?: number;
    },
  ): Promise<
    | { readonly ok: true; readonly result: SessionChildReadResult }
    | SessionChildLookupRefusal
  > {
    const owned = this.resolveOwned(
      query.callerSessionId,
      query.childSessionId,
    );
    if (!owned.ok) return owned.refusal;
    const { child } = owned;
    const snapshot = this.snapshotOf(child);
    const tailKiB = clampTail(query.tailKiB);

    if (!child.sdkSessionId) {
      return {
        ok: true,
        result: {
          child: snapshot,
          transcript:
            'No transcript yet: the child has not been assigned its SDK session id.',
          truncated: false,
          available: false,
        },
      };
    }
    let text = '';
    try {
      text = await this.transcripts.read(
        child.sdkSessionId,
        child.worktreePath,
        {
          tailBytes: tailKiB * TRANSCRIPT_BYTES_PER_OUTPUT_KIB,
        },
      );
    } catch (error: unknown) {
      // degradation-audit: reported - the result says `available: false`.
      this.log(
        `transcript read for ${child.childSessionId} failed: ${errorMessage(error)}`,
      );
    }
    if (!text) {
      return {
        ok: true,
        result: {
          child: snapshot,
          transcript: 'The transcript could not be read yet.',
          truncated: false,
          available: false,
        },
      };
    }
    const limit = tailKiB * 1024;
    const truncated = text.length > limit;
    return {
      ok: true,
      result: {
        child: snapshot,
        transcript: truncated ? text.slice(-limit) : text,
        truncated,
        available: true,
      },
    };
  }

  async stop(query: SessionChildStopQuery): Promise<SessionChildStopResult> {
    // A pending start has no session to interrupt yet (review m5).
    const pending = this.ownedPending(
      query.callerSessionId,
      query.childSessionId,
    );
    if (pending) {
      return {
        ok: false,
        reason: 'starting',
        detail: `session ${pending.childSessionId} is still starting (branch ${pending.branch}); nothing was stopped. Call ptah_session_status until it is live, then stop it.`,
      };
    }
    const owned = this.resolveOwned(
      query.callerSessionId,
      query.childSessionId,
      false,
    );
    if (!owned.ok) return owned.refusal;
    const requested = owned.child;
    const requestedSessionId = requested.childSessionId;
    let target = requested;
    let followed = false;
    if (requested.terminalStatus && requested.succeededBy) {
      const latest = this.registry.resolveLatest(requestedSessionId);
      const successorId =
        latest && latest.childSessionId !== requestedSessionId
          ? latest.childSessionId
          : requested.succeededBy;
      const successorStatus =
        latest && latest.childSessionId !== requestedSessionId
          ? this.statusOf(latest)
          : 'ended';
      if (!query.followHandoff) {
        return {
          ok: false,
          reason: 'handed-off',
          requestedSessionId,
          successorId,
          successorStatus,
          detail: `session ${requestedSessionId} already handed off to ${successorId} (status ${successorStatus}); nothing was stopped. Call again with followHandoff: true to stop ${successorId}.`,
        };
      }
      if (latest && latest.childSessionId !== requestedSessionId) {
        target = latest;
        followed = true;
      }
    }
    const id = target.childSessionId;
    if (target.terminalStatus) {
      return {
        ok: true,
        child: this.snapshotOf(target),
        requestedSessionId,
        followed,
        alreadyEnded: true,
      };
    }
    const runtime = this.runtimes.get(id);
    if (runtime) runtime.stopping = true;

    let reason = 'stopped-by-parent';
    const tabId = SessionId.safeParse(id);
    if (this.adapter && tabId) {
      try {
        await this.adapter.interruptSession(tabId, 'parent-stop');
      } catch (error: unknown) {
        // degradation-audit: reported - the child is still marked stopped;
        // the interrupt error is recorded in its end reason.
        reason = `stopped-by-parent (interrupt failed: ${errorMessage(error)})`;
      }
    }
    this.registry.markEnded(id, 'stopped', reason, undefined, 'parent-stop');
    this.releaseResources(id);
    // After the awaited interrupt: the run is over, so no late result can
    // bring the entry back.
    this.releaseBudget(id);
    this.log(
      `stopped ${id} (${target.label}): ${reason}; tab, worktree and branch kept`,
    );
    return {
      ok: true,
      child: this.snapshotOf(this.registry.get(id) ?? target),
      requestedSessionId,
      followed,
      alreadyEnded: false,
    };
  }

  clearFinished(query: SessionChildClearQuery): SessionChildClearResult {
    const caller = SessionId.safeParse(query.callerSessionId?.trim());
    if (!caller) return unattributed();
    const callerIds = new Set(
      [caller as string, this.sdkIdOf(caller)].filter(
        (id): id is string => !!id,
      ),
    );
    const ownChildren = this.registry.childrenOf([
      caller,
      this.sdkIdOf(caller),
    ]);
    const startOrder = new Map(
      ownChildren.map((child, index) => [child.childSessionId, index]),
    );
    const rawTargets =
      query.childSessionIds && query.childSessionIds.length > 0
        ? query.childSessionIds
        : ownChildren.map((child) => child.childSessionId);
    const seen = new Set<string>();
    const toClear = new Set<string>();
    const skipped: {
      readonly childSessionId: string;
      readonly reason: SessionChildClearSkipReason;
    }[] = [];

    for (const rawId of rawTargets) {
      const id = rawId.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const child = this.registry.get(id);
      if (!child) {
        skipped.push({ childSessionId: id, reason: 'unknown-child' });
        continue;
      }
      const owned =
        callerIds.has(child.parentSessionId) ||
        (!!child.parentSdkSessionId && callerIds.has(child.parentSdkSessionId));
      if (!owned) {
        skipped.push({ childSessionId: id, reason: 'not-a-child-of-caller' });
        continue;
      }
      // A runtime or a retire window means a succession can still be in
      // flight: its revert needs this record (TASK_2026_932 review M2).
      if (
        !child.terminalStatus ||
        this.runtimes.has(child.childSessionId) ||
        this.retiring.has(child.childSessionId)
      ) {
        skipped.push({
          childSessionId: child.childSessionId,
          reason: 'live',
        });
        continue;
      }
      // An undelivered completion goes to the parent first (review M1).
      if (child.heldCompletion) {
        skipped.push({
          childSessionId: child.childSessionId,
          reason: 'held-completion',
        });
        continue;
      }
      seen.add(child.childSessionId);
      toClear.add(child.childSessionId);
    }

    const orderedToClear = [...toClear].sort(
      (a, b) => (startOrder.get(a) ?? 0) - (startOrder.get(b) ?? 0),
    );
    const cleared: string[] = [];
    for (const childSessionId of orderedToClear) {
      if (this.registry.removeEnded(childSessionId)) {
        cleared.push(childSessionId);
      }
    }
    this.log(
      `cleared ${cleared.length} finished child session(s) for ${caller} (skipped ${skipped.length})`,
    );
    return { ok: true, cleared, skipped };
  }

  listUiDescriptors(
    workspaceRoot?: string,
  ): readonly AgentSessionOpenedPayload[] {
    const key =
      workspaceRoot === undefined
        ? undefined
        : normalizeWorkspaceRoot(workspaceRoot);
    return this.registry
      .live()
      .filter(
        (child) =>
          key === undefined ||
          normalizeWorkspaceRoot(child.workspaceRoot) === key,
      )
      .map((child) => this.descriptorOf(child));
  }

  takeHeldCompletions(
    callerSessionId: string | undefined,
  ): readonly SessionChildCompletionEnvelope[] {
    const caller = SessionId.safeParse(callerSessionId?.trim());
    if (!caller) return [];
    const envelopes: SessionChildCompletionEnvelope[] = [];
    for (const child of this.registry.childrenOf([
      caller,
      this.sdkIdOf(caller),
    ])) {
      const held = child.heldCompletion;
      if (!held) continue;
      envelopes.push(held.envelope);
      this.registry.update(child.childSessionId, {
        heldCompletion: undefined,
        lastCompletion: {
          turn: held.envelope.turn,
          verdict: held.envelope.verdict,
          delivered: true,
        },
      });
      this.log(
        `held completion of ${child.childSessionId} (turn ${held.envelope.turn}) handed to ${caller}`,
      );
    }
    return envelopes;
  }

  /**
   * Sync and idempotent. Live children end as `stopped (host-shutdown)` with
   * no completion push; their sessions are interrupted without awaiting.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of this.disposers.splice(0)) release();
    for (const child of this.registry.live()) {
      const runtime = this.runtimes.get(child.childSessionId);
      if (runtime) runtime.stopping = true;
      this.registry.markEnded(
        child.childSessionId,
        'stopped',
        'host-shutdown',
        undefined,
        'host-shutdown',
      );
      this.releaseResources(child.childSessionId);
      this.interruptInBackground(child.childSessionId);
    }
    for (const runtime of this.runtimes.values()) this.clearTimers(runtime);
    this.runtimes.clear();
    this.retiring.clear();
    this.log('disposed');
  }

  /* ------------------------------------------------------------------------
   * Event handlers (host-wide, subscribed once)
   * ---------------------------------------------------------------------- */

  private onTurnEnded(event: SdkAdapterTurnEndedEvent): void {
    if (this.retireForEvent(event.sessionId)) return;
    const child = this.liveChildForEvent(event.sessionId, event.cwd);
    if (!child) return;
    const runtime = this.runtimes.get(child.childSessionId);
    if (!runtime || runtime.lastSettleTimestamp === event.timestamp) return;
    if (event.backgroundTasks.length > 0) {
      this.log(
        `${child.childSessionId} turn ended with ${event.backgroundTasks.length} background task(s); waiting, no push`,
      );
      return;
    }
    if (runtime.capReached) {
      void this.hostSucceed(child, 'runtime-cap');
      return;
    }
    if (this.hasRunningLane(child)) {
      this.log(
        `${child.childSessionId} turn ended while its CLI lanes run; waiting, no push`,
      );
      return;
    }
    runtime.lastSettleTimestamp = event.timestamp;
    void this.settle(
      child.childSessionId,
      'completed',
      event.lastAssistantMessage,
      event.timestamp,
    );
  }

  private onTurnFailed(event: SdkAdapterTurnFailedEvent): void {
    if (this.retireForEvent(event.sessionId)) return;
    const child = this.liveChildForEvent(event.sessionId, event.cwd);
    if (!child) return;
    const runtime = this.runtimes.get(child.childSessionId);
    if (!runtime || runtime.lastSettleTimestamp === event.timestamp) return;
    if (runtime.capReached) {
      void this.hostSucceed(child, 'runtime-cap');
      return;
    }
    runtime.lastSettleTimestamp = event.timestamp;
    void this.settle(
      child.childSessionId,
      'failed',
      event.lastAssistantMessage,
      event.timestamp,
    );
  }

  private onSessionIdResolved(payload: SessionIdResolvedPayload): void {
    const tabId = payload.tabId;
    if (!tabId) return;
    const child = this.registry.get(tabId);
    if (child?.childSessionId !== tabId) return;
    this.registry.bindSdkSessionId(tabId, payload.realSessionId);
    this.log(`${tabId} bound to SDK session ${payload.realSessionId}`);
    this.recordOrganization(child, payload.realSessionId);
    const runtime = this.runtimes.get(tabId);
    if (runtime?.graceTimer) {
      clearTimeout(runtime.graceTimer);
      runtime.graceTimer = undefined;
      this.log(`${tabId} re-registered; grace cancelled`);
    }
  }

  /**
   * Hands the child's organization to the recorder. The store upserts, so a
   * second resolve for the same child rewrites the same row. The parent is
   * stored by its SDK id only: the one captured at start, else the parent
   * tab's live SDK id, else none — never the parent's tab id.
   */
  private recordOrganization(
    child: SessionChildRecord,
    realSessionId: string,
  ): void {
    const recorder = this.organizationRecorder;
    if (!recorder) return;
    const parentSessionId =
      child.parentSdkSessionId ?? this.sdkIdOf(child.parentSessionId);
    try {
      recorder.recordAgentStartedSession({
        sessionId: realSessionId,
        workspaceRoot: child.workspaceRoot,
        ...(parentSessionId ? { parentSessionId } : {}),
        worktreePath: child.worktreePath,
        branch: child.branch,
        ...(child.taskId ? { taskId: child.taskId } : {}),
      });
    } catch (error: unknown) {
      // The recorder's contract is never-throw; this only keeps a faulty
      // implementation from breaking the child's bind and grace handling.
      this.log(
        `${child.childSessionId} organization not recorded: ${errorMessage(error)}`,
      );
    }
  }

  private onSessionEnd(payload: SessionEndPayload): void {
    const child = this.registry.get(payload.sessionId);
    if (!child) return;
    const runtime = this.runtimes.get(child.childSessionId);
    if (!runtime || runtime.stopping) return;
    if (child.terminalStatus) {
      // A succession in flight marks the record handed-off before its start
      // settles. Keep the cause: a failed start routes this end afterwards.
      if (runtime.succeeding)
        runtime.endCause = parseSessionEndCause(payload.cause);
      return;
    }
    runtime.endCause = parseSessionEndCause(payload.cause);
    runtime.turnsSettledAtEnd = child.turnsSettled;
    const wasWorking = this.phaseOf(child) === 'generating';
    this.armGrace(runtime, child.childSessionId, wasWorking);
    this.log(
      `${child.childSessionId} session ended (${runtime.endCause}); ${SESSION_CHILD_GRACE_MS / 1000}s grace armed`,
    );
  }

  private async onGraceExpired(
    childSessionId: string,
    wasWorking: boolean,
  ): Promise<void> {
    const runtime = this.runtimes.get(childSessionId);
    if (runtime) runtime.graceTimer = undefined;
    const child = this.registry.get(childSessionId);
    if (!child || child.terminalStatus) return;
    if (this.activeIdOf(child)) {
      // The end was harmless: its cause must not route a later, different end.
      if (runtime) runtime.endCause = undefined;
      this.log(
        `${childSessionId} is live again after its session end; grace expired harmlessly`,
      );
      return;
    }
    const cause = runtime?.endCause ?? 'unknown';
    if (cause === 'unknown')
      this.log(`${childSessionId} session ended with unknown cause`);
    const probe = this.firstTurnProbe(child);
    if (
      routeSessionEndCause(cause) === 'succeed' &&
      firstTurnNotStarted(probe)
    ) {
      // A child that never ran is a failed start, never a succession. A
      // deliberate stop (user, parent, workspace, host) stays a stop.
      this.failFirstTurn(
        child,
        firstTurnFailureText(probe, `session ended: ${cause}`),
      );
      return;
    }
    if (routeSessionEndCause(cause) === 'succeed') {
      const result = await this.succeedChild(
        child,
        'session-ended',
        undefined,
        undefined,
        cause,
      );
      // A succession that already runs, or a child that became terminal while
      // this one waited, owns the outcome: do not end the record under it.
      if (
        result.ok ||
        result.refusal === 'succession-in-progress' ||
        child.terminalStatus
      )
        return;
      this.endOutside(
        child,
        cause,
        wasWorking,
        `automatic successor failed: ${result.detail}`,
      );
      return;
    }
    this.endOutside(child, cause, wasWorking);
  }

  private endOutside(
    child: SessionChildRecord,
    cause: SessionEndCause,
    wasWorking: boolean,
    failure?: string,
  ): void {
    const childSessionId = child.childSessionId;
    const endRuntime = this.runtimes.get(childSessionId);
    // A turn event that settled during the grace already told the parent.
    const turnUnsettled =
      endRuntime?.turnsSettledAtEnd === undefined ||
      endRuntime.turnsSettledAtEnd ===
        (this.registry.get(childSessionId)?.turnsSettled ?? child.turnsSettled);
    if (wasWorking && turnUnsettled) {
      // The turn in flight never settles on its own once the session is gone:
      // push its terminal completion, so the parent does not wait for a child
      // that no longer works. It names the true cause of the end.
      void this.settle(
        childSessionId,
        'failed',
        (cause === 'no-activity-timeout'
          ? 'session ended while it worked: no stream activity for 180 s ' +
            '(no-activity watchdog, cause no-activity-timeout); not stopped by a user. ' +
            'The session can be resumed: the user sends a message in its tab ' +
            '(ptah_session_send refuses an ended child), or start a successor'
          : `session ended while it worked (${cause})`) +
          (failure ? `; ${failure}` : ''),
        Date.now(),
      );
    }
    const runtime = this.runtimes.get(childSessionId);
    if (runtime) runtime.stopping = true;
    const lanes = this.adoptToParent(child);
    this.registry.markEnded(
      childSessionId,
      'ended',
      `ended outside the spawner (${cause}); uncommitted work is kept in ${child.worktreePath}` +
        (failure ? `; ${failure}` : '') +
        (lanes.length
          ? `; ${lanes.length} running lane(s) moved to the parent session`
          : ''),
      undefined,
      cause,
    );
    if (routeSessionEndCause(cause) === 'stop') {
      this.logger?.info(
        `${LOG_PREFIX} child ${childSessionId} ended outside spawner; worktree ${child.worktreePath}; branch ${child.branch}`,
      );
    }
    this.releaseResources(childSessionId);
    this.releaseBudget(childSessionId);
    this.log(
      `${childSessionId} ended (grace expired); slot, policy, MCP root and budget released`,
    );
  }

  /* ------------------------------------------------------------------------
   * First-turn watchdog (TASK_2026_932 E)
   * ---------------------------------------------------------------------- */

  private firstTurnProbe(child: SessionChildRecord): FirstTurnProbe {
    return {
      ...(child.sdkSessionId ? { sdkSessionId: child.sdkSessionId } : {}),
      turnsSettled: child.turnsSettled,
      phase: this.phaseOf(child),
      awaitingPermission: !!child.pendingPermission,
      lifecycleRecordPresent:
        this.lifecycle.find(child.childSessionId) !== undefined,
    };
  }

  private armFirstTurnWatchdog(
    runtime: ChildRuntime,
    childSessionId: string,
  ): void {
    if (runtime.firstTurnTimer) clearTimeout(runtime.firstTurnTimer);
    runtime.firstTurnTimer = this.armTimer(
      SESSION_CHILD_FIRST_TURN_TIMEOUT_MS,
      () => this.onFirstTurnTimeout(childSessionId),
    );
  }

  private onFirstTurnTimeout(childSessionId: string): void {
    const runtime = this.runtimes.get(childSessionId);
    if (!runtime || runtime.stopping) return;
    runtime.firstTurnTimer = undefined;
    const child = this.registry.get(childSessionId);
    if (!child || child.terminalStatus) return;
    const probe = this.firstTurnProbe(child);
    const verdict = firstTurnVerdict(probe, runtime.firstTurnRearmed === true);
    if (verdict === 'rearm') {
      runtime.firstTurnRearmed = true;
      this.log(
        `${childSessionId} first turn still generating without an SDK id; watchdog re-armed once`,
      );
      this.armFirstTurnWatchdog(runtime, childSessionId);
      return;
    }
    if (verdict === 'give-up') {
      this.log(
        `${childSessionId} still generating after the watchdog re-arm; left running`,
      );
      return;
    }
    if (verdict === 'fail') {
      const seconds = SESSION_CHILD_FIRST_TURN_TIMEOUT_MS / 1000;
      this.failFirstTurn(
        child,
        firstTurnFailureText(probe, `no first turn after ${seconds}s`),
      );
    }
  }

  /** End a child whose first turn never ran: `failed`, parent told, never a succession. */
  private failFirstTurn(child: SessionChildRecord, evidence: string): void {
    const childSessionId = child.childSessionId;
    const runtime = this.runtimes.get(childSessionId);
    if (!runtime || child.terminalStatus) return;
    runtime.stopping = true;
    const reason = `${evidence}; worktree kept in ${child.worktreePath}`;
    this.logger?.warn(`${LOG_PREFIX} child ${childSessionId} failed to start`, {
      evidence,
    });
    void this.settle(childSessionId, 'failed', reason, Date.now());
    this.registry.markEnded(
      childSessionId,
      'failed',
      reason,
      undefined,
      'first-turn-not-started',
    );
    this.releaseResources(childSessionId);
    this.interruptInBackground(childSessionId);
  }

  private onRuntimeExceeded(childSessionId: string, minutes: number): void {
    const child = this.registry.get(childSessionId);
    const runtime = this.runtimes.get(childSessionId);
    if (!child || child.terminalStatus || !runtime || runtime.stopping) return;
    runtime.runtimeTimer = undefined;
    if (runtime.succeeding) {
      runtime.capReached = true;
      runtime.handoffGraceTimer = this.armTimer(
        runtime.settings.handoffGraceMinutes * 60_000,
        () => {
          void this.onHandoffGraceExpired(childSessionId);
        },
      );
      return;
    }
    if ((child.successionCount ?? 0) >= runtime.settings.maxSuccessions) {
      this.runtimeSafetyNet(child, 'max successions reached');
      return;
    }
    runtime.capReached = true;
    if (this.statusOf(child) === 'idle') {
      void this.hostSucceed(child, 'runtime-cap');
    } else {
      runtime.handoffGraceTimer = this.armTimer(
        runtime.settings.handoffGraceMinutes * 60_000,
        () => {
          void this.onHandoffGraceExpired(childSessionId);
        },
      );
    }
  }

  private onPromptLifecycle(event: PermissionPromptLifecycleEvent): void {
    const child = this.registry.get(event.routingHint);
    if (!child || child.terminalStatus) return;
    const runtime = this.runtimes.get(child.childSessionId);
    if (!runtime) return;
    if (event.phase === 'requested') {
      runtime.pendingRequestId = event.requestId;
      this.registry.update(child.childSessionId, {
        pendingPermission: {
          toolName: event.toolName,
          description: event.description,
          deniesAt:
            event.timeoutMs === undefined
              ? 'unbounded'
              : new Date(Date.now() + event.timeoutMs).toISOString(),
        },
      });
      this.log(`${child.childSessionId} asks permission for ${event.toolName}`);
      return;
    }
    if (runtime.pendingRequestId !== event.requestId) return;
    runtime.pendingRequestId = undefined;
    this.registry.update(child.childSessionId, {
      pendingPermission: undefined,
    });
    this.log(
      `${child.childSessionId} permission for ${event.toolName}: ${event.outcome}`,
    );
  }

  /* ------------------------------------------------------------------------
   * Settle → completion push or hold
   * ---------------------------------------------------------------------- */

  private async settle(
    childSessionId: string,
    status: SessionChildSettle['status'],
    recap: string | null | undefined,
    timestampMs: number,
  ): Promise<void> {
    const current = this.registry.get(childSessionId);
    if (!current) return;
    const turn = current.turnsSettled + 1;
    const lastRecap = recap?.trim();
    const child =
      this.registry.update(childSessionId, {
        turnsSettled: turn,
        ...(lastRecap ? { lastRecap } : {}),
      }) ?? current;
    let delivery: SessionChildCompletionDelivery;
    try {
      delivery = await this.notifier.signalSessionChild(
        {
          childSessionId,
          label: child.label,
          ...(child.succeededBy ? { succeededBy: child.succeededBy } : {}),
          ...(child.succeededBy &&
          this.registry.get(child.succeededBy)?.undeliveredHeldMessages?.length
            ? {
                undeliveredHeldMessages: this.registry.get(child.succeededBy)
                  ?.undeliveredHeldMessages,
              }
            : {}),
          parentSessionIds: [
            child.parentSessionId,
            child.parentSdkSessionId,
          ].filter((id): id is string => !!id),
          task: child.task,
          ...(child.taskFolder ? { taskFolder: child.taskFolder } : {}),
          deliverables: child.deliverables,
          worktreePath: child.worktreePath,
          branch: child.branch,
          startedAt: child.startedAt,
          reportsDelivered: child.reportsDelivered,
          ...(child.lastRecap ? { lastRecap: child.lastRecap } : {}),
          ...(child.phaseKind ? { phaseKind: child.phaseKind } : {}),
          ...(child.phaseDisallowedTools
            ? { phaseDisallowedTools: child.phaseDisallowedTools }
            : {}),
          ...(child.toolProfileApplied ? { toolProfileApplied: true } : {}),
        },
        { turn, status, completedAt: new Date(timestampMs).toISOString() },
      );
    } catch (error: unknown) {
      // degradation-audit: reported - the notifier result-shapes its own
      // failures; a throw here is logged and the turn stays counted.
      this.log(
        `completion of ${childSessionId} turn ${turn} failed: ${errorMessage(error)}`,
      );
      return;
    }
    this.recordDelivery(childSessionId, turn, delivery);
  }

  private recordDelivery(
    childSessionId: string,
    turn: number,
    delivery: SessionChildCompletionDelivery,
  ): void {
    if (delivery.delivered) {
      this.registry.update(childSessionId, {
        heldCompletion: undefined,
        lastCompletion: {
          turn,
          verdict: delivery.envelope.verdict,
          delivered: true,
        },
      });
      this.log(
        `${childSessionId} turn ${turn} settled (${delivery.envelope.verdict}); delivered to ${delivery.parentSessionId}`,
      );
      return;
    }
    if (delivery.reason === 'already-signalled') return;
    const refusal = delivery.detail
      ? `${delivery.reason}: ${delivery.detail}`
      : delivery.reason;
    // Latest wins: a newer settle replaces an older held completion.
    this.registry.update(childSessionId, {
      heldCompletion: {
        heldSince: new Date().toISOString(),
        envelope: delivery.envelope,
      },
      lastCompletion: {
        turn,
        verdict: delivery.envelope.verdict,
        delivered: false,
        refusal,
      },
    });
    this.log(
      `${childSessionId} turn ${turn} settled (${delivery.envelope.verdict}); held for the parent (${refusal})`,
    );
  }

  /* ------------------------------------------------------------------------
   * Helpers
   * ---------------------------------------------------------------------- */

  /** A pending start (status `starting`) of this caller with this id. */
  private ownedPending(
    callerSessionId: string | undefined,
    childSessionId: string,
  ): SessionChildRecord | undefined {
    const caller = SessionId.safeParse(callerSessionId?.trim());
    if (!caller) return undefined;
    const id = childSessionId.trim();
    return this.registry
      .pendingOf([caller, this.sdkIdOf(caller)])
      .find((record) => record.childSessionId === id);
  }

  private resolveOwned(
    callerSessionId: string | undefined,
    childSessionId: string,
    follow = true,
  ): OwnedLookup {
    const caller = SessionId.safeParse(callerSessionId?.trim());
    if (!caller) return { ok: false, refusal: unattributed() };
    const child = this.registry.get(childSessionId);
    if (!child) {
      return {
        ok: false,
        refusal: {
          ok: false,
          reason: 'unknown-child',
          detail: `no child session ${childSessionId} is known to this host`,
        },
      };
    }
    const callerIds = new Set(
      [caller as string, this.sdkIdOf(caller)].filter(
        (id): id is string => !!id,
      ),
    );
    const owned =
      callerIds.has(child.parentSessionId) ||
      (!!child.parentSdkSessionId && callerIds.has(child.parentSdkSessionId));
    if (!owned) {
      return {
        ok: false,
        refusal: {
          ok: false,
          reason: 'not-a-child-of-caller',
          detail: `child session ${childSessionId} was started by another session`,
        },
      };
    }
    return {
      ok: true,
      child:
        follow && child.succeededBy
          ? (this.registry.resolveLatest(childSessionId) ?? child)
          : child,
      caller,
    };
  }

  /** A live child an SDK turn event belongs to; binds the SDK id when found by cwd. */
  private liveChildForEvent(
    sessionId: string,
    cwd: string,
  ): SessionChildRecord | undefined {
    let child = this.registry.get(sessionId);
    if (!child) {
      const byCwd = this.registry.findByCwd(cwd);
      if (!byCwd) return undefined;
      // Another session opened in the same worktree is not this child.
      if (byCwd.sdkSessionId && byCwd.sdkSessionId !== sessionId)
        return undefined;
      child = byCwd;
      if (!byCwd.sdkSessionId && sessionId) {
        child =
          this.registry.bindSdkSessionId(byCwd.childSessionId, sessionId) ??
          byCwd;
        this.log(
          `${byCwd.childSessionId} bound to SDK session ${sessionId} by cwd`,
        );
      }
    }
    if (child.terminalStatus) return undefined;
    const runtime = this.runtimes.get(child.childSessionId);
    if (!runtime || runtime.stopping) return undefined;
    return child;
  }

  private statusOf(child: SessionChildRecord): SessionChildStatus {
    if (child.terminalStatus) return child.terminalStatus;
    if (child.pendingPermission) return 'awaiting-permission';
    const phase = this.phaseOf(child);
    switch (phase) {
      case 'generating':
        return 'working';
      case 'awaiting-background':
      case 'sleeping':
        return 'waiting';
      case 'idle':
      case 'failed':
        return this.hasRunningLane(child) ? 'waiting' : 'idle';
      default:
        return 'starting';
    }
  }

  private phaseOf(child: SessionChildRecord): SessionTurnPhase | undefined {
    return (
      (child.sdkSessionId
        ? this.turnState.get(child.sdkSessionId)?.phase
        : undefined) ?? this.turnState.get(child.childSessionId)?.phase
    );
  }

  /** A Ptah CLI lane the child spawned is still running. */
  private hasRunningLane(child: SessionChildRecord): boolean {
    const ids = new Set(
      [child.childSessionId, child.sdkSessionId].filter(
        (id): id is string => !!id,
      ),
    );
    return this.agents
      .listTrackedAgents()
      .some(
        (agent) =>
          agent.status === 'running' &&
          !!agent.parentSessionId &&
          ids.has(agent.parentSessionId),
      );
  }

  /** The id the adapter knows the child's live session by, or null when it is not live. */
  private activeIdOf(child: SessionChildRecord): SessionId | null {
    if (!this.adapter) return null;
    for (const raw of [child.childSessionId, child.sdkSessionId]) {
      const id = SessionId.safeParse(raw);
      if (id && this.adapter.isSessionActive(id)) return id;
    }
    return null;
  }

  private sdkIdOf(sessionId: string): string | undefined {
    return this.lifecycle.find(sessionId)?.realSessionId ?? undefined;
  }

  private async interruptTurn(
    adapter: IAgentAdapter,
    target: SessionId,
  ): Promise<{ ok: boolean; detail: string }> {
    try {
      const ok = await adapter.interruptCurrentTurn(target);
      return { ok, detail: '' };
    } catch (error: unknown) {
      // degradation-audit: reported - returned as `interrupt-failed`.
      return { ok: false, detail: ` (${errorMessage(error)})` };
    }
  }

  private sent(
    child: SessionChildRecord,
    mode: SessionChildSendRequest['mode'],
    effect: Extract<SessionChildSendResult, { delivered: true }>['effect'],
  ): SessionChildSendResult {
    this.log(`message to ${child.childSessionId} (${mode}): ${effect}`);
    return { delivered: true, effect };
  }

  private snapshotOf(record: SessionChildRecord): SessionChildSnapshot {
    const snapshot: Record<string, unknown> = { ...record };
    delete snapshot['task'];
    delete snapshot['terminalStatus'];
    delete snapshot['endCause'];
    delete snapshot['heldCompletion'];
    delete snapshot['phaseKind'];
    delete snapshot['phaseDisallowedTools'];
    delete snapshot['toolProfileApplied'];
    const held = record.heldCompletion;
    const latest =
      record.terminalStatus === 'handed-off'
        ? this.registry.resolveLatest(record.childSessionId)
        : undefined;
    const latestSuccessorId =
      latest && latest.childSessionId !== record.childSessionId
        ? latest.childSessionId
        : record.succeededBy;
    const outcome = childOutcomeOf(record, latestSuccessorId);
    return {
      ...(snapshot as Omit<
        SessionChildSnapshot,
        'status' | 'heldCompletion' | 'outcome'
      >),
      status: this.statusOf(record),
      ...(held
        ? {
            heldCompletion: {
              turn: held.envelope.turn,
              verdict: held.envelope.verdict,
              heldSince: held.heldSince,
            },
          }
        : {}),
      ...(outcome ? { outcome } : {}),
    };
  }

  private descriptorOf(child: SessionChildRecord): AgentSessionOpenedPayload {
    return {
      tabId: child.childSessionId,
      sessionId: child.sdkSessionId ?? null,
      parentTabId: child.parentSessionId,
      parentSessionId:
        child.parentSdkSessionId ?? this.sdkIdOf(child.parentSessionId) ?? null,
      workspaceRoot: child.workspaceRoot,
      worktreePath: child.worktreePath,
      branch: child.branch,
      label: child.label,
      ...(child.model ? { model: child.model } : {}),
      ...(child.effort ? { effort: child.effort } : {}),
      ...childSettingSources(child),
      ...(child.taskId ? { taskId: child.taskId } : {}),
      displayPrompt: child.task,
      startedAt: Date.parse(child.startedAt),
    };
  }

  /** Clear timers and release the policy and MCP root of an ended child. */
  private releaseResources(childSessionId: string): void {
    const runtime = this.runtimes.get(childSessionId);
    if (!runtime) return;
    this.runtimes.delete(childSessionId);
    this.clearTimers(runtime);
    runtime.releasePolicy?.();
    runtime.releasePolicy = undefined;
    if (runtime.mcpRoot) {
      void this.releaseMcpRoot(runtime.mcpRoot);
      runtime.mcpRoot = undefined;
    }
  }

  private async releaseMcpRoot(
    root: string,
  ): Promise<SessionChildRollbackStep> {
    if (!this.rootRegistrar) return { step: 'release-mcp-root', ok: true };
    try {
      await this.rootRegistrar.releaseRoot(root);
      return { step: 'release-mcp-root', ok: true };
    } catch (error: unknown) {
      // degradation-audit: reported - a release failure never blocks an end
      // or a rollback; it is logged and reported in the rollback table.
      const detail = errorMessage(error);
      this.log(`MCP root release for ${root} failed: ${detail}`);
      return { step: 'release-mcp-root', ok: false, detail };
    }
  }

  /**
   * Interrupt an ended child without awaiting; its budget entry is released
   * once the interrupt settles, so a result the run emits meanwhile cannot
   * bring the entry back.
   */
  private interruptInBackground(childSessionId: string): Promise<boolean> {
    const id = SessionId.safeParse(childSessionId);
    if (!this.adapter || !id) {
      this.releaseBudget(childSessionId);
      return Promise.resolve(false);
    }
    return this.adapter
      .interruptSession(id, 'parent-stop')
      .then(() => true)
      .catch((error: unknown) => {
        this.log(
          `interrupt of ${childSessionId} failed: ${errorMessage(error)}`,
        );
        return false;
      })
      .finally(() => this.releaseBudget(childSessionId));
  }

  /**
   * Release the session budget entry of a child that truly ended, under each
   * key it may be held under (its tab id and its SDK id once bound).
   */
  private releaseBudget(childSessionId: string): void {
    const budget = this.sessionBudget;
    if (!budget) return;
    const sdkSessionId = this.registry.get(childSessionId)?.sdkSessionId;
    const keys = new Set([childSessionId]);
    if (sdkSessionId) keys.add(sdkSessionId);
    for (const key of keys) {
      try {
        budget.release(key);
      } catch (error: unknown) {
        // degradation-audit: reported - a budget release failure never blocks
        // a child's end; it is logged.
        this.log(
          `budget release for ${childSessionId} failed: ${errorMessage(error)}`,
        );
      }
    }
  }

  private clearTimers(runtime: ChildRuntime): void {
    if (runtime.runtimeTimer) clearTimeout(runtime.runtimeTimer);
    if (runtime.warnTimer) clearTimeout(runtime.warnTimer);
    if (runtime.handoffGraceTimer) clearTimeout(runtime.handoffGraceTimer);
    if (runtime.retireTimer) clearTimeout(runtime.retireTimer);
    if (runtime.graceTimer) clearTimeout(runtime.graceTimer);
    if (runtime.firstTurnTimer) clearTimeout(runtime.firstTurnTimer);
    runtime.runtimeTimer = undefined;
    runtime.firstTurnTimer = undefined;
    runtime.warnTimer = undefined;
    runtime.handoffGraceTimer = undefined;
    runtime.retireTimer = undefined;
    runtime.graceTimer = undefined;
  }

  private policyFor(
    settings: SessionChildSettings,
    label: string,
    worktreePath: string,
  ): UnattendedSessionPolicy {
    return {
      bashAllowlist: settings.bashAllowlist,
      writableRoot: worktreePath,
      denyWindowMs: settings.permissionDenyWindowMs,
      ownerLabel: `child session ${label}`,
    };
  }

  private armRuntimeCap(
    runtime: ChildRuntime,
    childSessionId: string,
    minutes: number,
  ): void {
    if (runtime.runtimeTimer) clearTimeout(runtime.runtimeTimer);
    if (runtime.warnTimer) clearTimeout(runtime.warnTimer);
    runtime.warnTimer = this.armTimer(
      runtimeWarnDelayMs(runtime.settings),
      () => {
        void this.onRuntimeWarning(childSessionId);
      },
    );
    runtime.runtimeTimer = this.armTimer(minutes * 60_000, () =>
      this.onRuntimeExceeded(childSessionId, minutes),
    );
  }

  private async onRuntimeWarning(childSessionId: string): Promise<void> {
    const child = this.registry.get(childSessionId);
    const runtime = this.runtimes.get(childSessionId);
    if (!child || child.terminalStatus || !runtime || runtime.stopping) return;
    runtime.warnTimer = undefined;
    const target = this.activeIdOf(child);
    if (!target || !this.adapter) {
      this.log(`${childSessionId} runtime warning skipped: no live session`);
      return;
    }
    try {
      await this.adapter.sendMessageToSession(
        target,
        renderRuntimeCapWarning({
          minutesLeft: runtime.settings.runtimeWarnLeadMinutes,
          graceMinutes: runtime.settings.handoffGraceMinutes,
          handoffPath: sessionChildHandoffPath(child),
        }),
        { origin: { kind: 'peer', from: 'ptah-host', name: 'Ptah host' } },
      );
    } catch (error: unknown) {
      // degradation-audit: reported - warning delivery failure leaves the session running.
      this.log(
        `${childSessionId} runtime warning failed: ${errorMessage(error)}`,
      );
    }
  }

  private async onHandoffGraceExpired(childSessionId: string): Promise<void> {
    const child = this.registry.get(childSessionId);
    const runtime = this.runtimes.get(childSessionId);
    if (!child || child.terminalStatus || !runtime || runtime.stopping) return;
    if (runtime.succeeding) {
      runtime.handoffGraceTimer = this.armTimer(60_000, () => {
        void this.onHandoffGraceExpired(childSessionId);
      });
      return;
    }
    runtime.handoffGraceTimer = undefined;
    const target = this.activeIdOf(child);
    if (target && this.adapter) {
      try {
        await this.adapter.interruptSession(target, 'parent-stop');
      } catch (error: unknown) {
        // degradation-audit: reported - interruption failure still allows succession.
        this.log(
          `${childSessionId} grace interrupt failed: ${errorMessage(error)}`,
        );
      }
    }
    await this.hostSucceed(child, 'runtime-cap-interrupted');
  }

  private adoptToParent(child: SessionChildRecord): string[] {
    const adopted = this.agents.adoptLanes(
      [child.childSessionId, child.sdkSessionId].filter(
        (id): id is string => !!id,
      ),
      child.parentSessionId,
    );
    this.agents.settleLaneAdoption(adopted, 'kept');
    return adopted;
  }

  private runtimeSafetyNet(child: SessionChildRecord, detail: string): void {
    const runtime = this.runtimes.get(child.childSessionId);
    if (!runtime || child.terminalStatus) return;
    if (this.phaseOf(child) === 'generating') {
      void this.settle(child.childSessionId, 'timeout', undefined, Date.now());
    }
    runtime.stopping = true;
    const lanes = this.adoptToParent(child);
    this.registry.markEnded(
      child.childSessionId,
      'timed-out',
      `exceeded the ${runtime.settings.maxRuntimeMinutes}-minute runtime cap (agentSessions.maxRuntimeMinutes); automatic handoff failed: ${detail}; uncommitted work is kept in ${child.worktreePath}; ${lanes.length} running lane(s) moved to the parent session`,
      undefined,
      'runtime-cap',
    );
    this.releaseResources(child.childSessionId);
    this.interruptInBackground(child.childSessionId);
  }

  private async hostSucceed(
    child: SessionChildRecord,
    cause: SessionChildSuccessionCause,
  ): Promise<void> {
    const result = await this.succeedChild(child, cause);
    if (
      !result.ok &&
      result.refusal !== 'succession-in-progress' &&
      !child.terminalStatus
    ) {
      this.runtimeSafetyNet(child, result.detail);
    }
  }

  /** Called by the child itself from its handoff tool. */
  async succeed(
    request: SessionChildSuccessionRequest,
  ): Promise<SessionChildSuccessionResult> {
    const child = this.registry.get(request.callerSessionId);
    if (!child || child.terminalStatus) {
      return {
        ok: false,
        refusal: 'not-a-live-child',
        detail: 'caller is not a live child',
      };
    }
    const result = await this.succeedChild(
      child,
      'child-handoff',
      request.prompt,
      request.label,
      undefined,
      request.handoffPath,
    );
    if (!result.ok && result.refusal === 'session-start-failed')
      this.recoverDeadCaller(child.childSessionId);
    return result;
  }

  /**
   * A failed tool-driven succession returns its refusal to the child. A child
   * whose session ended while that succession ran cannot act on the refusal,
   * and its session end was not routed. Route it now through the end-grace.
   */
  private recoverDeadCaller(childSessionId: string): void {
    const child = this.registry.get(childSessionId);
    const runtime = this.runtimes.get(childSessionId);
    if (!child || child.terminalStatus || !runtime || runtime.stopping) return;
    if (this.activeIdOf(child)) return;
    this.armGrace(runtime, childSessionId, false);
    this.log(
      `${childSessionId} session ended during a failed handoff (${runtime.endCause ?? 'unknown'}); ${SESSION_CHILD_GRACE_MS / 1000}s grace armed`,
    );
  }

  private async succeedChild(
    child: SessionChildRecord,
    cause: SessionChildSuccessionCause,
    prompt?: string,
    label?: string,
    endCause?: string,
    /** The file the child itself wrote; without it the default location is used. */
    writtenHandoffPath?: string,
  ): Promise<SessionChildSuccessionResult> {
    const runtime = this.runtimes.get(child.childSessionId);
    if (this.disposed || child.terminalStatus || !runtime)
      return {
        ok: false,
        refusal: 'not-a-live-child',
        detail: 'child is no longer live',
      };
    if (runtime.succeeding)
      return {
        ok: false,
        refusal: 'succession-in-progress',
        detail: 'succession is already running',
      };
    if ((child.successionCount ?? 0) >= runtime.settings.maxSuccessions)
      return {
        ok: false,
        refusal: 'max-successions-reached',
        detail: 'max successions reached',
      };
    const host = this.lookupHost();
    if (!host || !this.adapter)
      return {
        ok: false,
        refusal: 'chat-runtime-unavailable',
        detail: 'chat runtime unavailable',
      };
    const settings = readSessionChildSettings(this.workspace);
    const successorId = SessionId.create();
    const parentSdkSessionId =
      child.parentSdkSessionId ?? this.sdkIdOf(child.parentSessionId);
    const successor: SessionChildRecord = {
      childSessionId: successorId,
      parentSessionId: child.parentSessionId,
      ...(parentSdkSessionId ? { parentSdkSessionId } : {}),
      label: label?.trim() || child.label,
      ...(child.model ? { model: child.model } : {}),
      ...(child.effort ? { effort: child.effort } : {}),
      ...(child.taskId ? { taskId: child.taskId } : {}),
      branch: child.branch,
      baseRef: child.baseRef,
      workspaceRoot: child.workspaceRoot,
      worktreePath: child.worktreePath,
      ...(child.taskFolder ? { taskFolder: child.taskFolder } : {}),
      deliverables: child.deliverables,
      subagentPtahTools: child.subagentPtahTools,
      startedAt: child.startedAt,
      turnsSettled: 0,
      reportsDelivered: 0,
      reportsRefused: 0,
      task: child.task,
      ...(child.phaseKind ? { phaseKind: child.phaseKind } : {}),
      ...(child.phaseDisallowedTools
        ? { phaseDisallowedTools: child.phaseDisallowedTools }
        : {}),
      ...(child.toolProfileApplied ? { toolProfileApplied: true } : {}),
    };
    const nextRuntime: ChildRuntime = {
      worktree: runtime.worktree,
      settings,
      permissionLevel: runtime.permissionLevel,
      model: runtime.model,
      effort: runtime.effort,
      policy: this.policyFor(settings, successor.label, successor.worktreePath),
      stopping: false,
      capReached: false,
      succeeding: false,
    };
    runtime.succeeding = true;
    let adopted: string[] = [];
    try {
      this.registry.succeed(
        child.childSessionId,
        successor,
        successionEndReason(successorId, cause),
      );
      this.runtimes.set(successorId, nextRuntime);
      nextRuntime.releasePolicy = this.policies.register(
        successorId,
        nextRuntime.policy,
      );
      await this.retainMcpRoot(
        successorId,
        nextRuntime,
        successor.worktreePath,
      );
      adopted = this.agents.adoptLanes(
        [child.childSessionId, child.sdkSessionId].filter(
          (id): id is string => !!id,
        ),
        successorId,
      );
      const handoffPath =
        writtenHandoffPath?.trim() || sessionChildHandoffPath(child);
      let handoffExists = false;
      try {
        await access(handoffPath);
        handoffExists = true;
      } catch {
        // degradation-audit: reported - missing handoff is explicitly described in successor prompt.
        this.log(`${child.childSessionId} handoff file absent: ${handoffPath}`);
      }
      const contract = renderSessionChildContract({
        parentLabel: `session ${child.parentSessionId}`,
        label: successor.label,
        branch: child.branch,
        worktreePath: child.worktreePath,
        bashAllowlist: settings.bashAllowlist,
        denyWindowMs: settings.permissionDenyWindowMs,
        ...(child.taskFolder ? { taskFolder: child.taskFolder } : {}),
        deliverables: child.deliverables,
      });
      const outcome = await this.startOnHost(host, {
        tabId: successorId,
        workspaceRoot: child.workspaceRoot,
        worktreePath: child.worktreePath,
        prompt: composeSessionChildPrompt(
          contract,
          renderSuccessorTask({
            predecessorId: child.childSessionId,
            cause,
            originalTask: child.task,
            handoffPath,
            handoffExists,
            adoptedLanes: adopted,
            ...(prompt ? { prompt } : {}),
            ...(endCause ? { endCause } : {}),
          }),
        ),
        descriptor: this.descriptorOf(successor),
        sessionName: successor.label,
        ...(runtime.permissionLevel
          ? { permissionLevel: runtime.permissionLevel }
          : {}),
        ...(runtime.model ? { model: runtime.model } : {}),
        ...(runtime.effort ? { effort: runtime.effort } : {}),
      });
      if (!outcome.started) throw new Error(outcome.error);
      const undelivered = await transferHeldPeerMessages(
        this.adapter,
        child.childSessionId as SessionId,
        successorId,
        (message) => this.log(message),
      );
      if (undelivered.length > 0) {
        this.registry.update(successorId, {
          undeliveredHeldMessages: undelivered,
        });
      }
      this.agents.settleLaneAdoption(adopted, 'kept');
      this.armRuntimeCap(nextRuntime, successorId, settings.maxRuntimeMinutes);
      this.releaseBudget(child.childSessionId);
      void this.settle(
        child.childSessionId,
        'handed-off',
        undefined,
        Date.now(),
      );
      if (cause === 'child-handoff') {
        this.retiring.add(child.childSessionId);
        runtime.retireTimer = this.armTimer(60_000, () =>
          this.retirePredecessor(child.childSessionId),
        );
      } else if (cause === 'session-ended') {
        runtime.stopping = true;
        this.releaseResources(child.childSessionId);
        void this.closeRetiredPredecessor(child.childSessionId, child);
      } else this.retirePredecessor(child.childSessionId);
      this.log(`${child.childSessionId} handed off to ${successorId}`);
      return {
        ok: true,
        successor: this.snapshotOf(this.registry.get(successorId) ?? successor),
        adoptedLanes: adopted,
        tabOpened: outcome.uiAnnounced,
      };
    } catch (error: unknown) {
      // degradation-audit: reported - failed successor start reverts adoption and link; shared worktree is kept.
      this.agents.settleLaneAdoption(adopted, 'reverted');
      nextRuntime.releasePolicy?.();
      if (nextRuntime.mcpRoot) await this.releaseMcpRoot(nextRuntime.mcpRoot);
      this.runtimes.delete(successorId);
      this.registry.revertSuccession(child.childSessionId, successorId);
      this.log(
        `${child.childSessionId} successor start failed: ${errorMessage(error)}`,
      );
      return {
        ok: false,
        refusal: 'session-start-failed',
        detail: errorMessage(error),
      };
    } finally {
      runtime.succeeding = false;
    }
  }

  private retireForEvent(sessionId: string): boolean {
    const child = this.registry.get(sessionId);
    if (!child || !this.retiring.has(child.childSessionId)) return false;
    this.retirePredecessor(child.childSessionId);
    return true;
  }

  private retirePredecessor(childSessionId: string): void {
    if (!this.runtimes.has(childSessionId)) return;
    this.retiring.delete(childSessionId);
    const runtime = this.runtimes.get(childSessionId);
    if (runtime) runtime.stopping = true;
    this.releaseResources(childSessionId);
    // The registry retains the predecessor binding after its slot moves to the successor.
    const predecessor = this.registry.get(childSessionId);
    void this.interruptInBackground(childSessionId).then(async (stopped) => {
      if (!stopped || predecessor?.terminalStatus !== 'handed-off') return;
      await this.closeRetiredPredecessor(childSessionId, predecessor);
    });
  }

  private async closeRetiredPredecessor(
    childSessionId: string,
    predecessor: SessionChildRecord,
  ): Promise<void> {
    const token = CLI_AGENT_RUNTIME_TOKENS.HANDOFF_PREDECESSOR_CLOSER;
    const ids = `tabId=${childSessionId} sdkId=${predecessor.sdkSessionId ?? 'none'}`;
    if (!this.container?.isRegistered(token, true)) {
      this.log(`predecessor close unavailable: closer absent (${ids})`);
      return;
    }
    try {
      const result = await this.container
        .resolve<HandoffPredecessorCloser>(token)
        .close(childSessionId, predecessor.sdkSessionId ?? null);
      if (result.kind !== 'closed') {
        this.log(
          `predecessor close: ${result.kind}${result.kind === 'blocked' ? ` (${result.code})` : ''} (${ids})`,
        );
      }
    } catch (error: unknown) {
      // degradation-audit: reported - closing is best effort after retirement.
      this.log(`predecessor close failed: ${errorMessage(error)} (${ids})`);
    }
  }

  private armGrace(
    runtime: ChildRuntime,
    childSessionId: string,
    wasWorking: boolean,
  ): void {
    if (runtime.graceTimer) clearTimeout(runtime.graceTimer);
    runtime.graceTimer = this.armTimer(SESSION_CHILD_GRACE_MS, () =>
      this.onGraceExpired(childSessionId, wasWorking),
    );
  }

  /** A timer that never keeps the host process alive on its own. */
  private armTimer(
    ms: number,
    fire: () => void,
  ): ReturnType<typeof setTimeout> {
    const timer = setTimeout(fire, ms);
    timer.unref?.();
    return timer;
  }

  /**
   * The chat host port as registered NOW (Task 6.6). `null` when there is no
   * container, nothing is registered yet, or construction throws; the caller
   * refuses `chat-runtime-unavailable` in every one of those cases.
   */
  private lookupHost(): IChildChatSessionHost | null {
    const token = CLI_AGENT_RUNTIME_TOKENS.CHILD_CHAT_SESSION_HOST;
    if (this.container === null || !this.container.isRegistered(token, true)) {
      return null;
    }
    try {
      return this.container.resolve<IChildChatSessionHost>(token);
    } catch (error: unknown) {
      // degradation-audit: reported - logged below; the start is refused as
      // `chat-runtime-unavailable`, which the parent reads as a closed reason.
      this.log(`chat host could not be resolved: ${errorMessage(error)}`);
      return null;
    }
  }

  /**
   * The child setting router as available NOW. The constructor parameter is
   * an override (direct unit tests). The token is bound in a later phase than
   * this singleton resolves, so the real lookup is lazy at start() time.
   * `null` when there is no router or its resolution throws.
   */
  private lookupChildSettingRouter(): IChildSettingRouter | null {
    if (this.childSettingRouter !== null) return this.childSettingRouter;
    const token = CLI_AGENT_RUNTIME_TOKENS.CHILD_SETTING_ROUTER;
    if (this.container === null || !this.container.isRegistered(token, true)) {
      return null;
    }
    try {
      return this.container.resolve<IChildSettingRouter | null>(token);
    } catch (error: unknown) {
      // degradation-audit: reported - logged below; routing is skipped and the child starts with the default model.
      this.log(
        `child setting router could not be resolved: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  private refuseStart(
    refusal: SessionSpawnRefusalCode,
    detail: string,
  ): StartRefusal {
    this.log(`start refused (${refusal}): ${detail}`);
    return { ok: false, refusal, detail };
  }

  private log(message: string): void {
    this.output.appendLine(`${LOG_PREFIX} ${message}`);
  }
}

/* --------------------------------------------------------------------------
 * Pure helpers
 * ------------------------------------------------------------------------ */

type ChildPaths =
  | {
      readonly ok: true;
      readonly taskFolder?: string;
      readonly deliverables: readonly string[];
    }
  | { readonly ok: false; readonly detail: string };

/**
 * Resolve the task folder and every deliverable inside the child's future
 * worktree. A relative deliverable resolves against the task folder when one
 * is given (where the contract tells the child to write), else the worktree.
 */
export function resolveChildPaths(
  worktreePath: string,
  request: Pick<SessionChildStartRequest, 'taskFolder' | 'deliverables'>,
): ChildPaths {
  let taskFolder: string | undefined;
  if (request.taskFolder !== undefined) {
    const folder = request.taskFolder.trim();
    if (!folder || isAbsolute(folder)) {
      return {
        ok: false,
        detail: 'taskFolder must be a relative path inside the worktree',
      };
    }
    taskFolder = resolve(worktreePath, folder);
    if (!isPathWithinRoots(taskFolder, [worktreePath])) {
      return {
        ok: false,
        detail: `taskFolder "${folder}" escapes the worktree`,
      };
    }
  }
  const deliverables: string[] = [];
  for (const entry of request.deliverables ?? []) {
    const value = entry.trim();
    if (!value) return { ok: false, detail: 'a deliverable path is empty' };
    const absolute = isAbsolute(value)
      ? resolve(value)
      : resolve(taskFolder ?? worktreePath, value);
    if (!isPathWithinRoots(absolute, [worktreePath])) {
      return {
        ok: false,
        detail: `deliverable "${value}" is outside the worktree`,
      };
    }
    deliverables.push(absolute);
  }
  return { ok: true, ...(taskFolder ? { taskFolder } : {}), deliverables };
}

function clampTail(tailKiB: number | undefined): number {
  if (tailKiB === undefined || !Number.isFinite(tailKiB)) {
    return SESSION_READ_DEFAULT_TAIL_KIB;
  }
  return Math.max(1, Math.min(SESSION_READ_MAX_TAIL_KIB, Math.floor(tailKiB)));
}

function unattributed(): {
  readonly ok: false;
  readonly reason: 'unattributed-caller';
  readonly detail: string;
} {
  return {
    ok: false,
    reason: 'unattributed-caller',
    detail: 'this call carries no live chat session id',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `ok`, or `FAILED` with the step's detail in parentheses when it has one. */
function rollbackStepOutcome(step: SessionChildRollbackStep): string {
  if (step.ok) return 'ok';
  return step.detail ? `FAILED (${step.detail})` : 'FAILED';
}

/** The closed refusal a failed send is reported to the parent as. */
function sendFailure(error: unknown): SessionChildSendResult {
  if (error instanceof SessionAdmissionRefusedError) {
    return {
      delivered: false,
      reason: error.reason,
      detail:
        error.reason === 'busy'
          ? 'the child is mid-turn or has a message queued; nothing was queued (use mode "queue" to wait)'
          : error.message,
    };
  }
  return {
    delivered: false,
    reason: 'delivery-failed',
    detail: errorMessage(error),
  };
}
