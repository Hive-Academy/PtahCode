import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import {
  ActionBannerService,
  ChatStore,
  ComposerRestoreService,
  type ChatFile,
  type ComposerImage,
} from '@ptah-extension/chat';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  ClaudeRpcService,
  LoggingService,
} from '@ptah-extension/core';
import type {
  DeepProjectAnalysis,
  ProjectGuidance,
  WizardInstallSkillsWithConsentResponse,
  WizardSkillConsentPreview,
} from '@ptah-extension/shared';
import {
  normalizeSetupWorkspacePath,
  SetupRunStore,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
  type LauncherAttachmentSnapshot,
} from '../launcher/harness-chat-launcher.service';
import { teamBuilderGuidanceBrief } from './team-builder-guidance-brief';

export const TEAM_BUILDER_LAUNCH_ERROR =
  'Could not start the team builder. Try again.';
export const TEAM_BUILDER_INSTALLED_LAUNCH_ERROR =
  'Skills are installed. Could not start the team builder. Try again.';

const CANVAS_ADOPT_TIMEOUT_MS = 10_000;
const RECOVERY_STORAGE_KEY = 'ptah.team-builder-recovery.v1';
const MAX_RECOVERY_ENTRIES = 20;
const BUSY_TAB_STATUSES: ReadonlySet<string> = new Set([
  'streaming',
  'resuming',
  'switching',
  'awaiting-background',
  'sleeping',
]);

export interface TeamBuilderInstallRequest {
  readonly recordId: string;
  readonly workspacePath: string;
  readonly intent: string;
  readonly previews: readonly WizardSkillConsentPreview[];
  readonly guidanceAnalysis: DeepProjectAnalysis;
  readonly guidanceFacts: readonly ProjectGuidance[];
  readonly guidanceLoaded?: boolean;
  readonly ownerDecision: 'match' | 'raise' | null;
  readonly attachmentSnapshot: LauncherAttachmentSnapshot;
}

export interface TeamBuilderLaunchRequest {
  readonly recordId: string;
  readonly workspacePath: string;
  readonly intent: string;
  readonly installed: readonly string[];
  readonly guidanceAnalysis: DeepProjectAnalysis;
  readonly guidanceFacts: readonly ProjectGuidance[];
  readonly guidanceLoaded?: boolean;
  readonly ownerDecision: 'match' | 'raise' | null;
  readonly attachmentSnapshot: LauncherAttachmentSnapshot;
}

export interface TeamBuilderDraftState {
  readonly workspacePath: string;
  readonly intent: string;
  readonly selectedIds: readonly string[];
  readonly ownerDecision: 'match' | 'raise' | null;
  readonly guidanceAnalysis: DeepProjectAnalysis;
  readonly guidanceFacts: readonly ProjectGuidance[];
  readonly ownerDecisionPrompt: string;
  readonly guidanceNote: string;
  readonly previews: readonly WizardSkillConsentPreview[];
  readonly approvedIds: readonly string[];
  readonly attachmentFiles: readonly ChatFile[];
  readonly attachmentImages: readonly ComposerImage[];
  readonly hadAttachments: boolean;
  readonly installCompleted: boolean;
  readonly guidanceLoaded: boolean;
}

export interface TeamBuilderRecoveryState {
  readonly selectedIds: readonly string[];
  readonly ownerDecision: 'match' | 'raise' | null;
  readonly installCompleted: boolean;
  readonly hadAttachments: boolean;
}

interface PersistedRecoveryEntry {
  readonly selectedIds: string[];
  readonly ownerDecision: 'match' | 'raise' | null;
  readonly installCompleted: boolean;
  readonly hadAttachments: boolean;
  readonly updatedAt: number;
}

export type TeamBuilderRunOutcome =
  | {
      readonly kind: 'handed-off';
      readonly tabId: string;
      readonly installed: readonly string[];
    }
  | {
      readonly kind: 'failed';
      readonly error: string;
      readonly installed: readonly string[];
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'ignored' };

interface ActiveExecution {
  readonly workspacePath: string;
  readonly intent: string;
  readonly controller: AbortController;
  installRunId?: string;
  installed: string[];
  abortedForWorkspace: boolean;
  workspaceSwitchedDuringSend: boolean;
  uncommittedTabId: string | null;
  sendDispatched: boolean;
  sendInFlight: boolean;
  committed: boolean;
  sendSettled: Promise<void> | null;
}

interface StoppedInstallAttempt {
  readonly installRunId: string;
  readonly recordId: string;
  readonly workspacePath: string;
  readonly intent: string;
}

function rpcMessage(
  result: { error?: string; errorCode?: string },
  fallback: string,
): string {
  return result.errorCode && result.error ? result.error : fallback;
}

function sameWorkspacePath(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeSetupWorkspacePath(left);
  return (
    Boolean(normalizedLeft) &&
    normalizedLeft === normalizeSetupWorkspacePath(right)
  );
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // degradation-audit: optional-capability - unavailable storage keeps team-builder recovery in memory for this session.
    return null;
  }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parsePersistedEntry(value: unknown): PersistedRecoveryEntry | null {
  if (!isRecordObject(value)) return null;
  const rawIds = value['selectedIds'];
  if (
    !Array.isArray(rawIds) ||
    !rawIds.every((item) => typeof item === 'string' && item.length > 0)
  ) {
    return null;
  }
  const decision = value['ownerDecision'];
  if (decision !== 'match' && decision !== 'raise' && decision !== null) {
    return null;
  }
  if (
    typeof value['installCompleted'] !== 'boolean' ||
    typeof value['hadAttachments'] !== 'boolean' ||
    typeof value['updatedAt'] !== 'number' ||
    !Number.isFinite(value['updatedAt'])
  ) {
    return null;
  }
  return {
    selectedIds: [...rawIds],
    ownerDecision: decision,
    installCompleted: value['installCompleted'],
    hadAttachments: value['hadAttachments'],
    updatedAt: value['updatedAt'],
  };
}

/**
 * Root coordinator for the AI team builder's background install-then-launch
 * sequence (TASK_2026_2330, plan component 7).
 *
 * Lives in `onboarding` so `setup-wizard` never imports chat services.
 * Observes workspace changes directly, owns per-run AbortControllers and the
 * handoff commit boundary, and retains selection/launch inputs across route
 * teardown and reload.
 */
@Injectable({ providedIn: 'root' })
export class TeamBuilderRunCoordinator {
  private readonly setupRuns = inject(SetupRunStore);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly launcher = inject(HarnessChatLauncherService);
  private readonly logger = inject(LoggingService);
  private readonly tabs = inject(TabManagerService, { optional: true });
  private readonly appState = inject(AppStateManager, { optional: true });
  private readonly chatStore = inject(ChatStore, { optional: true });
  private readonly actionBanner = inject(ActionBannerService, {
    optional: true,
  });
  private readonly composerRestore = inject(ComposerRestoreService, {
    optional: true,
  });
  private readonly storage = browserStorage();

  private readonly executions = new Map<string, ActiveExecution>();
  private readonly stoppedInstalls = new Map<string, StoppedInstallAttempt>();
  private readonly inFlight = new Map<string, Promise<TeamBuilderRunOutcome>>();
  private readonly attachedViews = new Map<string, number>();
  private readonly drafts = new Map<string, TeamBuilderDraftState>();
  private readonly persistedRecovery = new Map<
    string,
    PersistedRecoveryEntry
  >();
  private readonly pendingTabCleanups = new Map<string, string>();
  private readonly closingTabIds = new Set<string>();
  private readonly completedInstalls = signal<ReadonlySet<string>>(new Set());
  private readonly guidanceNotes = signal<ReadonlyMap<string, string>>(
    new Map(),
  );
  private lastWorkspace = '';

  public constructor() {
    this.lastWorkspace = this.launcher.workspaceRoot();
    this.loadPersistedRecovery();
    effect(() => {
      const next = this.launcher.workspaceRoot();
      untracked(() => {
        const previous = this.lastWorkspace;
        this.lastWorkspace = next;
        if (previous && !sameWorkspacePath(previous, next)) {
          this.abortWorkspace(previous);
        }
        if (next) {
          void this.flushPendingTabCleanups(next);
        }
      });
    });
    effect(() => {
      this.tabs?.tabs?.();
      this.tabs?.activeTabId?.();
      this.tabs?.backgroundTabsRevision?.();
      untracked(() => {
        if (this.pendingTabCleanups.size > 0) {
          void this.flushPendingTabCleanups();
        }
      });
    });
    effect(() => {
      this.setupRuns.runs?.();
      const workspace = normalizeSetupWorkspacePath(
        this.launcher.workspaceRoot(),
      );
      if (workspace) {
        this.setupRuns.runsFor?.(workspace);
      }
      untracked(() => {
        if (this.persistedRecovery.size > 0 || this.drafts.size > 0) {
          this.pruneStaleRecovery();
        }
      });
    });
  }

  public attachView(recordId: string): void {
    this.attachedViews.set(
      recordId,
      (this.attachedViews.get(recordId) ?? 0) + 1,
    );
  }

  public detachView(recordId: string): void {
    const count = this.attachedViews.get(recordId) ?? 0;
    if (count <= 1) this.attachedViews.delete(recordId);
    else this.attachedViews.set(recordId, count - 1);
  }

  public isRunning(recordId: string): boolean {
    return this.inFlight.has(recordId);
  }

  public hasCompletedInstall(recordId: string): boolean {
    if (this.completedInstalls().has(recordId)) return true;
    if (this.drafts.get(recordId)?.installCompleted) return true;
    if (this.persistedRecovery.get(recordId)?.installCompleted) return true;
    return this.setupRuns.get(recordId)?.teamBuilder?.installCompleted === true;
  }

  public guidanceNoteFor(recordId: string): string {
    return this.guidanceNotes().get(recordId) ?? '';
  }

  public draftFor(recordId: string): TeamBuilderDraftState | null {
    return this.drafts.get(recordId) ?? null;
  }

  public recoveryFor(record: SetupRunRecord): TeamBuilderRecoveryState {
    const draft = this.drafts.get(record.id);
    const persisted = this.persistedRecovery.get(record.id);
    const tb = record.teamBuilder;
    const selectedIds = draft
      ? [...draft.selectedIds]
      : persisted !== undefined
        ? [...persisted.selectedIds]
        : tb?.selectedIds !== undefined
          ? [...tb.selectedIds]
          : [];
    const ownerDecision = draft
      ? draft.ownerDecision
      : persisted !== undefined
        ? persisted.ownerDecision
        : (tb?.ownerDecision ?? null);
    const installCompleted =
      draft !== undefined
        ? draft.installCompleted
        : this.completedInstalls().has(record.id) ||
          (persisted !== undefined
            ? persisted.installCompleted
            : Boolean(tb?.installCompleted));
    const hadAttachments = draft
      ? draft.hadAttachments
      : persisted !== undefined
        ? persisted.hadAttachments
        : Boolean(tb?.hadAttachments);
    return {
      selectedIds,
      ownerDecision,
      installCompleted,
      hadAttachments,
    };
  }

  public saveDraft(
    recordId: string,
    update: Partial<TeamBuilderDraftState> & { workspacePath: string },
  ): void {
    const prev = this.drafts.get(recordId);
    const persisted = this.persistedRecovery.get(recordId);
    const record = this.setupRuns.get(recordId);
    const tb = record?.teamBuilder;
    const recoveredSelectedIds =
      prev?.selectedIds ?? persisted?.selectedIds ?? tb?.selectedIds ?? [];
    const recoveredOwnerDecision =
      prev !== undefined
        ? prev.ownerDecision
        : persisted !== undefined
          ? persisted.ownerDecision
          : (tb?.ownerDecision ?? null);
    const recoveredHadAttachments =
      prev !== undefined
        ? prev.hadAttachments
        : persisted !== undefined
          ? persisted.hadAttachments
          : Boolean(tb?.hadAttachments);
    const recoveredInstallCompleted =
      prev !== undefined
        ? prev.installCompleted
        : this.completedInstalls().has(recordId) ||
          (persisted !== undefined
            ? persisted.installCompleted
            : Boolean(tb?.installCompleted));
    const next: TeamBuilderDraftState = {
      workspacePath: update.workspacePath,
      intent: update.intent ?? prev?.intent ?? tb?.intent ?? '',
      selectedIds:
        update.selectedIds !== undefined
          ? [...update.selectedIds]
          : [...recoveredSelectedIds],
      ownerDecision:
        update.ownerDecision !== undefined
          ? update.ownerDecision
          : recoveredOwnerDecision,
      guidanceAnalysis: update.guidanceAnalysis ??
        prev?.guidanceAnalysis ?? { projectType: 'unknown', frameworks: [] },
      guidanceFacts: update.guidanceFacts
        ? [...update.guidanceFacts]
        : [...(prev?.guidanceFacts ?? [])],
      ownerDecisionPrompt:
        update.ownerDecisionPrompt ?? prev?.ownerDecisionPrompt ?? '',
      guidanceNote: update.guidanceNote ?? prev?.guidanceNote ?? '',
      previews: update.previews
        ? [...update.previews]
        : [...(prev?.previews ?? [])],
      approvedIds: update.approvedIds
        ? [...update.approvedIds]
        : [...(prev?.approvedIds ?? [])],
      attachmentFiles: update.attachmentFiles
        ? [...update.attachmentFiles]
        : [...(prev?.attachmentFiles ?? [])],
      attachmentImages: update.attachmentImages
        ? [...update.attachmentImages]
        : [...(prev?.attachmentImages ?? [])],
      hadAttachments:
        update.hadAttachments !== undefined
          ? update.hadAttachments
          : recoveredHadAttachments,
      installCompleted:
        update.installCompleted !== undefined
          ? update.installCompleted
          : recoveredInstallCompleted,
      guidanceLoaded:
        update.guidanceLoaded !== undefined
          ? update.guidanceLoaded
          : (prev?.guidanceLoaded ?? false),
    };
    this.drafts.set(recordId, next);
    if (update.installCompleted !== undefined) {
      this.markCompletedInstall(recordId, update.installCompleted);
    } else if (next.installCompleted) {
      this.markCompletedInstall(recordId, true);
    }
    this.savePersistedEntry(recordId, {
      selectedIds: [...next.selectedIds],
      ownerDecision: next.ownerDecision,
      installCompleted: next.installCompleted,
      hadAttachments: next.hadAttachments,
      updatedAt: Date.now(),
    });
  }

  public clearRecovery(recordId: string): void {
    this.drafts.delete(recordId);
    if (this.persistedRecovery.delete(recordId)) {
      this.flushPersistedRecovery();
    }
    this.markCompletedInstall(recordId, false);
  }

  public installAndLaunch(
    request: TeamBuilderInstallRequest,
  ): Promise<TeamBuilderRunOutcome> {
    const existing = this.inFlight.get(request.recordId);
    if (existing) return existing;
    if (!this.canClaimWorkspace(request.recordId, request.workspacePath)) {
      return Promise.resolve({ kind: 'ignored' });
    }
    this.saveDraft(request.recordId, {
      workspacePath: request.workspacePath,
      intent: request.intent,
      selectedIds: request.previews.map((item) => item.skillName),
      ownerDecision: request.ownerDecision,
      guidanceAnalysis: request.guidanceAnalysis,
      guidanceFacts: request.guidanceFacts,
      ...(request.guidanceLoaded !== undefined
        ? { guidanceLoaded: request.guidanceLoaded }
        : {}),
      previews: request.previews,
      attachmentFiles: request.attachmentSnapshot.attachments.files,
      attachmentImages: request.attachmentSnapshot.attachments.images,
      hadAttachments: this.snapshotHasAttachments(request.attachmentSnapshot),
      installCompleted: false,
    });
    const existingRecord = this.setupRuns.get(request.recordId);
    const existingInstalled =
      existingRecord &&
      sameWorkspacePath(existingRecord.workspacePath, request.workspacePath)
        ? (existingRecord.teamBuilder?.installed ?? [])
        : [];
    const execution = this.beginExecution(
      request.recordId,
      request.workspacePath,
      request.intent,
      existingInstalled,
    );
    const run = this.executeInstallAndLaunch(request, execution).finally(() =>
      this.endExecution(request.recordId, execution, run),
    );
    this.inFlight.set(request.recordId, run);
    return run;
  }

  public launch(
    request: TeamBuilderLaunchRequest,
  ): Promise<TeamBuilderRunOutcome> {
    const existing = this.inFlight.get(request.recordId);
    if (existing) return existing;
    if (!this.canClaimWorkspace(request.recordId, request.workspacePath)) {
      return Promise.resolve({ kind: 'ignored' });
    }
    this.saveDraft(request.recordId, {
      workspacePath: request.workspacePath,
      intent: request.intent,
      ownerDecision: request.ownerDecision,
      guidanceAnalysis: request.guidanceAnalysis,
      guidanceFacts: request.guidanceFacts,
      ...(request.guidanceLoaded !== undefined
        ? { guidanceLoaded: request.guidanceLoaded }
        : {}),
      attachmentFiles: request.attachmentSnapshot.attachments.files,
      attachmentImages: request.attachmentSnapshot.attachments.images,
      hadAttachments: this.snapshotHasAttachments(request.attachmentSnapshot),
      installCompleted:
        request.installed.length > 0 ||
        this.hasCompletedInstall(request.recordId),
    });
    const existingRecord = this.setupRuns.get(request.recordId);
    const existingInstalled =
      existingRecord &&
      sameWorkspacePath(existingRecord.workspacePath, request.workspacePath)
        ? (existingRecord.teamBuilder?.installed ?? [])
        : [];
    const execution = this.beginExecution(
      request.recordId,
      request.workspacePath,
      request.intent,
      [...new Set([...existingInstalled, ...request.installed])],
    );
    const run = this.executeLaunch(request, execution).finally(() =>
      this.endExecution(request.recordId, execution, run),
    );
    this.inFlight.set(request.recordId, run);
    return run;
  }

  /**
   * Explicit Cancel: aborts any reversible in-flight install/launch, cleans up
   * any uncommitted chat tab, and marks the record cancelled. Once the first
   * send has been dispatched, waits for send settlement before confirming.
   */
  public async cancel(recordId: string): Promise<boolean> {
    const execution = this.executions.get(recordId);
    if (execution?.sendInFlight && execution.sendSettled) {
      await execution.sendSettled;
      if (execution.committed) {
        return false;
      }
      if (this.setupRuns.get(recordId)?.status === 'cancelled') {
        this.clearRecovery(recordId);
        return true;
      }
    }
    if (execution) {
      this.executions.delete(recordId);
      if (execution.installRunId) {
        const installRunId = execution.installRunId;
        execution.installRunId = undefined;
        void this.cancelSkillInstall(installRunId);
      }
    }
    this.setGuidanceNote(recordId, '');
    const cancelled = await this.setupRuns.cancel(recordId);
    if (execution) {
      execution.controller.abort();
      await this.cleanupUncommittedTab(execution);
    }
    if (cancelled) {
      this.clearRecovery(recordId);
      this.setupRuns.report(recordId, { step: 'intent', error: null });
    }
    return cancelled;
  }

  private async cancelSkillInstall(installRunId: string): Promise<void> {
    try {
      const result = await this.rpc.call('wizard:cancel-skill-install', {
        installRunId,
      });
      if (!result.isSuccess()) {
        throw new Error(
          rpcMessage(result, 'Could not request skill install cancellation.'),
        );
      }
    } catch (cause: unknown) {
      // degradation-audit: reported - a failed cancel request leaves the install reply observable.
      this.logger.debug?.(
        'TeamBuilderRunCoordinator',
        'Skill install cancellation request failed',
        {
          installRunId,
          error: cause instanceof Error ? cause.message : String(cause),
        },
      );
    }
  }

  /**
   * Stops pending executions belonging to a workspace the user switched away
   * from and immediately resolves their live records to `interrupted`.
   */
  public abortWorkspace(workspacePath: string): void {
    const normalized = normalizeSetupWorkspacePath(workspacePath);
    if (!normalized) return;
    for (const [recordId, execution] of [...this.executions.entries()]) {
      if (!sameWorkspacePath(execution.workspacePath, normalized)) continue;
      this.invalidateForWorkspace(recordId, execution);
    }
  }

  private canClaimWorkspace(recordId: string, workspacePath: string): boolean {
    const normalized = normalizeSetupWorkspacePath(workspacePath);
    if (
      !normalized ||
      !sameWorkspacePath(this.launcher.workspaceRoot(), normalized)
    ) {
      return false;
    }
    for (const [activeId, execution] of this.executions) {
      if (
        activeId !== recordId &&
        sameWorkspacePath(execution.workspacePath, normalized) &&
        !execution.abortedForWorkspace &&
        !execution.controller.signal.aborted
      ) {
        return false;
      }
    }
    const otherRunning = this.setupRuns
      .runsFor?.(normalized)
      ?.find(
        (record) =>
          record.workflow === 'team-builder' &&
          record.id !== recordId &&
          record.status === 'running',
      );
    return !otherRunning;
  }

  private beginExecution(
    recordId: string,
    workspacePath: string,
    intent: string,
    installed: readonly string[],
  ): ActiveExecution {
    if (!normalizeSetupWorkspacePath(this.lastWorkspace)) {
      this.lastWorkspace = workspacePath;
    }
    const execution: ActiveExecution = {
      workspacePath,
      intent,
      controller: new AbortController(),
      installed: [...installed],
      abortedForWorkspace: false,
      workspaceSwitchedDuringSend: false,
      uncommittedTabId: null,
      sendDispatched: false,
      sendInFlight: false,
      committed: false,
      sendSettled: null,
    };
    this.executions.set(recordId, execution);
    this.setGuidanceNote(recordId, '');
    return execution;
  }

  private endExecution(
    recordId: string,
    execution: ActiveExecution,
    run: Promise<TeamBuilderRunOutcome>,
  ): void {
    if (this.executions.get(recordId) === execution) {
      this.executions.delete(recordId);
    }
    if (this.inFlight.get(recordId) === run) {
      this.inFlight.delete(recordId);
    }
  }

  private invalidateForWorkspace(
    recordId: string,
    execution: ActiveExecution,
  ): void {
    if (execution.abortedForWorkspace) return;
    if (execution.sendInFlight) {
      // Honor the same dispatch boundary as explicit Cancel: keep execution
      // ownership and the tab intact until the dispatched send settles.
      execution.workspaceSwitchedDuringSend = true;
      return;
    }
    execution.abortedForWorkspace = true;
    if (this.executions.get(recordId) === execution) {
      this.executions.delete(recordId);
    }
    if (execution.installRunId) {
      const installRunId = execution.installRunId;
      execution.installRunId = undefined;
      void this.cancelSkillInstall(installRunId);
    }
    execution.controller.abort();
    void this.cleanupUncommittedTab(execution);
    this.setGuidanceNote(recordId, '');
    const record = this.setupRuns.get(recordId);
    if (
      record &&
      sameWorkspacePath(record.workspacePath, execution.workspacePath) &&
      (record.status === 'running' || record.status === 'needs-input')
    ) {
      this.setupRuns.report(recordId, {
        status: 'interrupted',
        error: null,
        teamBuilder: {
          intent: execution.intent,
          installed: this.currentInstalledNames(recordId, execution),
        },
      });
    }
  }

  private isStillActive(
    recordId: string,
    execution: ActiveExecution,
  ): boolean {
    if (execution.abortedForWorkspace) {
      return false;
    }
    if (
      !sameWorkspacePath(this.launcher.workspaceRoot(), execution.workspacePath)
    ) {
      this.invalidateForWorkspace(recordId, execution);
      return false;
    }
    if (
      this.executions.get(recordId) !== execution ||
      execution.controller.signal.aborted
    ) {
      return false;
    }
    const record = this.setupRuns.get(recordId);
    return record !== null && record.status === 'running';
  }

  private isForegroundFor(recordId: string, workspacePath: string): boolean {
    if ((this.attachedViews.get(recordId) ?? 0) <= 0) return false;
    if (!sameWorkspacePath(this.launcher.workspaceRoot(), workspacePath)) {
      return false;
    }
    const view = this.appState?.currentView?.();
    return view === undefined || view === 'onboarding';
  }

  private async executeInstallAndLaunch(
    request: TeamBuilderInstallRequest,
    execution: ActiveExecution,
  ): Promise<TeamBuilderRunOutcome> {
    this.markCompletedInstall(request.recordId, false);
    this.setupRuns.report(request.recordId, {
      status: 'running',
      step: 'installing',
      error: null,
      teamBuilder: {
        intent: request.intent,
        installed: [...execution.installed],
      },
    });

    try {
      const consentDate = new Date().toISOString();
      const consentRecords = request.previews
        .filter((item) => item.hasScripts)
        .map((item) => ({
          skillName: item.skillName,
          contentHash: item.contentHash,
          consentDate,
        }));
      // Keep the transport reply handler alive for the final install effects.
      // Local abort stops the launch while the cancel RPC stops backend work.
      const installRunId = crypto.randomUUID();
      execution.installRunId = installRunId;
      const installRpc = this.rpc.call('wizard:install-skills-with-consent', {
        skills: request.previews.map((item) => item.skillName),
        consentRecords,
        workspacePath: execution.workspacePath,
        installRunId,
      });
      const result = await this.awaitWithAbort(
        installRpc,
        execution.controller.signal,
      );

      if (result === null) {
        this.stoppedInstalls.set(installRunId, {
          installRunId,
          recordId: request.recordId,
          workspacePath: request.workspacePath,
          intent: request.intent,
        });
        void installRpc
          .then((lateResult) => {
            if (lateResult?.isSuccess?.()) {
              this.recordStoppedInstall(installRunId, lateResult.data);
            } else {
              this.stoppedInstalls.delete(installRunId);
            }
          })
          .catch((cause: unknown) => {
            this.stoppedInstalls.delete(installRunId);
            this.logger.debug?.(
              'TeamBuilderRunCoordinator',
              'Late team builder skill install failed after stop',
              {
                recordId: request.recordId,
                installRunId,
                error: cause instanceof Error ? cause.message : String(cause),
              },
            );
          });
        return this.inactiveOutcome(request.recordId, execution);
      }

      execution.installRunId = undefined;
      if (!this.isStillActive(request.recordId, execution)) {
        if (result?.isSuccess?.()) {
          this.stoppedInstalls.set(installRunId, {
            installRunId,
            recordId: request.recordId,
            workspacePath: request.workspacePath,
            intent: request.intent,
          });
          this.recordStoppedInstall(installRunId, result.data);
        }
        return this.inactiveOutcome(request.recordId, execution);
      }

      if (!result?.isSuccess?.()) {
        const error = rpcMessage(result ?? {}, 'Could not install skills.');
        const installed = this.currentInstalledNames(
          request.recordId,
          execution,
        );
        this.setupRuns.report(request.recordId, {
          status: 'failed',
          step: 'review',
          error,
          teamBuilder: { intent: request.intent, installed },
        });
        return { kind: 'failed', error, installed };
      }

      if (!result.data || !Array.isArray(result.data.installed)) {
        throw new Error('Skill install reply was malformed.');
      }
      if (!this.installRecord(request.recordId, result.data.workspacePath)) {
        throw new Error('Skill install reply did not match the run workspace.');
      }
      const confirmed = result.data.installed.filter(
        (name): name is string => typeof name === 'string' && name.length > 0,
      );
      const installed = this.mergeInstalledNames(
        request.recordId,
        execution,
        confirmed,
      );
      if (result.data.cancelled) {
        this.clearRecovery(request.recordId);
        this.setupRuns.report(request.recordId, {
          status: 'cancelled',
          step: 'intent',
          error: null,
          teamBuilder: { intent: request.intent, installed },
        });
        return { kind: 'cancelled' };
      }
      if (!result.data.success) {
        const failed = result.data.failedSkill
          ? `Failed: ${result.data.failedSkill}. `
          : 'Some skills could not be installed. ';
        const reason = result.data.reason ? `${result.data.reason} ` : '';
        const installedSummary = installed.length
          ? `Installed: ${installed.join(', ')}. `
          : '';
        const pending = request.previews.filter(
          (item) => !installed.includes(item.skillName),
        );
        const pendingSummary = pending.length
          ? `Still to install: ${pending.length}. `
          : '';
        const error = `${failed}${reason}${installedSummary}${pendingSummary}Review the skills and try again.`;
        this.setupRuns.report(request.recordId, {
          status: 'failed',
          step: 'review',
          error,
          teamBuilder: { intent: request.intent, installed },
        });
        return { kind: 'failed', error, installed };
      }

      this.markCompletedInstall(request.recordId, true);
      this.saveDraft(request.recordId, {
        workspacePath: request.workspacePath,
        installCompleted: true,
      });
      return await this.executeLaunch(
        {
          recordId: request.recordId,
          workspacePath: request.workspacePath,
          intent: request.intent,
          installed,
          guidanceAnalysis: request.guidanceAnalysis,
          guidanceFacts: request.guidanceFacts,
          ownerDecision: request.ownerDecision,
          attachmentSnapshot: request.attachmentSnapshot,
        },
        execution,
      );
    } catch (cause: unknown) {
      // degradation-audit: reported - install RPC rejection is logged and recorded as a review-stage failure when the run is still active.
      if (!this.isStillActive(request.recordId, execution)) {
        return this.inactiveOutcome(request.recordId, execution);
      }
      this.logger.error?.(
        'TeamBuilderRunCoordinator',
        'Team builder skill install failed',
        cause instanceof Error ? cause : new Error(String(cause)),
      );
      const error =
        'Could not install skills. Review the skills and try again.';
      const installed = this.currentInstalledNames(request.recordId, execution);
      this.setupRuns.report(request.recordId, {
        status: 'failed',
        step: 'review',
        error,
        teamBuilder: { intent: request.intent, installed },
      });
      return { kind: 'failed', error, installed };
    }
  }

  private mergeInstalledNames(
    recordId: string,
    execution: ActiveExecution,
    extra: readonly string[] = [],
  ): string[] {
    const record = this.setupRuns.get(recordId);
    const recordInstalled =
      record && sameWorkspacePath(record.workspacePath, execution.workspacePath)
        ? (record.teamBuilder?.installed ?? [])
        : [];
    const merged = [
      ...new Set([...recordInstalled, ...execution.installed, ...extra]),
    ];
    execution.installed = merged;
    return [...merged];
  }

  private currentInstalledNames(
    recordId: string,
    execution: ActiveExecution,
  ): string[] {
    return this.mergeInstalledNames(recordId, execution);
  }

  private recordStoppedInstall(
    installRunId: string,
    result: WizardInstallSkillsWithConsentResponse | null | undefined,
  ): void {
    const attempt = this.stoppedInstalls.get(installRunId);
    if (!attempt) return;
    this.stoppedInstalls.delete(installRunId);
    if (!result || !Array.isArray(result.installed)) return;
    if (!sameWorkspacePath(result.workspacePath, attempt.workspacePath)) {
      return;
    }
    const record = this.installRecord(attempt.recordId, result.workspacePath);
    if (!record) return;
    const confirmed = result.installed.filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    );
    if (confirmed.length === 0) return;
    const activeExecution = this.executions.get(attempt.recordId);
    const matchingExecution =
      activeExecution &&
      sameWorkspacePath(activeExecution.workspacePath, attempt.workspacePath)
        ? activeExecution
        : null;
    const installed = [
      ...new Set([
        ...(record.teamBuilder?.installed ?? []),
        ...(matchingExecution?.installed ?? []),
        ...confirmed,
      ]),
    ];
    if (matchingExecution) {
      matchingExecution.installed = [...installed];
    }
    this.setupRuns.report(attempt.recordId, {
      teamBuilder: {
        intent: record.teamBuilder?.intent ?? attempt.intent,
        installed,
      },
    });
  }

  private installRecord(
    recordId: string,
    replyWorkspacePath: string | undefined,
  ): SetupRunRecord | null {
    const record = this.setupRuns.get(recordId);
    return sameWorkspacePath(replyWorkspacePath, record?.workspacePath)
      ? record
      : null;
  }

  private async executeLaunch(
    request: TeamBuilderLaunchRequest,
    execution: ActiveExecution,
  ): Promise<TeamBuilderRunOutcome> {
    const initialInstalled = this.mergeInstalledNames(
      request.recordId,
      execution,
      request.installed,
    );
    const installCompleted =
      initialInstalled.length > 0 || this.hasCompletedInstall(request.recordId);
    if (installCompleted) {
      this.markCompletedInstall(request.recordId, true);
    }
    this.setupRuns.report(request.recordId, {
      status: 'running',
      step: 'launching',
      error: null,
      teamBuilder: { intent: request.intent, installed: initialInstalled },
    });

    try {
      if (request.ownerDecision) {
        try {
          const recorded = await this.rpc.call(
            'wizard:get-project-guidance',
            {
              analysis: request.guidanceAnalysis,
              ownerDecision: request.ownerDecision,
            },
            { signal: execution.controller.signal },
          );
          if (
            this.isStillActive(request.recordId, execution) &&
            (!recorded.isSuccess() || !recorded.data.recordPath)
          ) {
            this.setGuidanceNote(
              request.recordId,
              'Guidance record was not written.',
            );
          }
        } catch (error: unknown) {
          // degradation-audit: reported - optional guidance persistence failure is logged and surfaced on the active launch.
          this.logger.debug(
            'TeamBuilderRunCoordinator',
            'Guidance record was not written.',
            { error: error instanceof Error ? error.message : String(error) },
          );
          if (this.isStillActive(request.recordId, execution)) {
            this.setGuidanceNote(
              request.recordId,
              'Guidance record was not written.',
            );
          }
        }
      }

      if (!this.isStillActive(request.recordId, execution)) {
        return this.inactiveOutcome(request.recordId, execution);
      }

      const visibleMessage = teamBuilderGuidanceBrief(
        request.intent.trim(),
        request.guidanceFacts,
        request.ownerDecision,
      );

      if (this.tabs && this.appState && this.chatStore) {
        return await this.handoffDirect(request, execution, visibleMessage);
      }

      const launched = await this.launcher.launchTeamBuilder(
        visibleMessage,
        request.attachmentSnapshot,
        { signal: execution.controller.signal },
      );

      if (!this.isStillActive(request.recordId, execution)) {
        return this.inactiveOutcome(request.recordId, execution);
      }

      const finalInstalled = this.currentInstalledNames(
        request.recordId,
        execution,
      );
      this.clearRecovery(request.recordId);
      this.setupRuns.report(request.recordId, {
        status: 'completed',
        step: 'handed-off',
        handoffTabId: launched.tabId,
        error: null,
        teamBuilder: { intent: request.intent, installed: finalInstalled },
      });
      return {
        kind: 'handed-off',
        tabId: launched.tabId,
        installed: finalInstalled,
      };
    } catch (cause: unknown) {
      // degradation-audit: reported - active launch failures are logged and recorded as review-stage errors; workspace switches and explicit cancel settle without error.
      if (execution.sendDispatched) {
        const record = this.setupRuns.get(request.recordId);
        if (
          !record ||
          !sameWorkspacePath(record.workspacePath, execution.workspacePath) ||
          record.status !== 'running'
        ) {
          return this.inactiveOutcome(request.recordId, execution);
        }
        const error = installCompleted
          ? TEAM_BUILDER_INSTALLED_LAUNCH_ERROR
          : TEAM_BUILDER_LAUNCH_ERROR;
        const finalInstalled = this.currentInstalledNames(
          request.recordId,
          execution,
        );
        this.setupRuns.report(request.recordId, {
          status: 'failed',
          step: 'review',
          error,
          teamBuilder: { intent: request.intent, installed: finalInstalled },
        });
        return { kind: 'failed', error, installed: finalInstalled };
      }
      if (
        execution.abortedForWorkspace ||
        !sameWorkspacePath(
          this.launcher.workspaceRoot(),
          execution.workspacePath,
        )
      ) {
        this.invalidateForWorkspace(request.recordId, execution);
        return { kind: 'ignored' };
      }
      if (
        cause instanceof HarnessChatLaunchCancelledError ||
        execution.controller.signal.aborted
      ) {
        await this.cleanupUncommittedTab(execution);
        this.markCancelledIfLive(request.recordId, execution.workspacePath);
        return { kind: 'cancelled' };
      }
      if (!this.isStillActive(request.recordId, execution)) {
        await this.cleanupUncommittedTab(execution);
        return this.inactiveOutcome(request.recordId, execution);
      }
      this.logger.error?.(
        'TeamBuilderRunCoordinator',
        'Team builder chat handoff failed',
        cause instanceof Error ? cause : new Error(String(cause)),
      );
      const error = installCompleted
        ? TEAM_BUILDER_INSTALLED_LAUNCH_ERROR
        : TEAM_BUILDER_LAUNCH_ERROR;
      const finalInstalled = this.currentInstalledNames(
        request.recordId,
        execution,
      );
      this.setupRuns.report(request.recordId, {
        status: 'failed',
        step: 'review',
        error,
        teamBuilder: { intent: request.intent, installed: finalInstalled },
      });
      return { kind: 'failed', error, installed: finalInstalled };
    }
  }

  private async handoffDirect(
    request: TeamBuilderLaunchRequest,
    execution: ActiveExecution,
    visibleMessage: string,
  ): Promise<TeamBuilderRunOutcome> {
    const tabs = this.tabs;
    const appState = this.appState;
    const chatStore = this.chatStore;
    if (!tabs || !appState || !chatStore) {
      throw new Error('Chat handoff services are unavailable.');
    }
    const trimmed = visibleMessage.trim();
    if (!trimmed) {
      throw new Error('Describe the team you want before starting.');
    }

    const promptResult = await this.rpc.call(
      'harness:workflow-prompt',
      { mode: 'configure-harness', contextOnly: true },
      { signal: execution.controller.signal },
    );
    if (!this.isStillActive(request.recordId, execution)) {
      return this.inactiveOutcome(request.recordId, execution);
    }
    if (!promptResult.isSuccess() || !promptResult.data?.prompt) {
      const error = new Error(
        promptResult.error ||
          'Could not prepare the team builder prompt. Try again.',
      );
      this.logger.error?.(
        'TeamBuilderRunCoordinator',
        'harness:workflow-prompt RPC failed',
        error,
      );
      throw error;
    }

    const foreground = this.isForegroundFor(
      request.recordId,
      request.workspacePath,
    );
    const tabId = tabs.createTab('AI Team Builder', undefined, foreground);
    execution.uncommittedTabId = tabId;
    tabs.setWorkflow(tabId, 'harness-configure');
    tabs.setFirstMessagePreamble(tabId, promptResult.data.prompt);

    if (foreground) {
      const adoption = appState.requestCanvasTab(
        tabId,
        request.workspacePath,
        'AI Team Builder',
        true,
        { timeoutMs: CANVAS_ADOPT_TIMEOUT_MS },
      );
      appState.setCurrentView('chat');
      const adopted = await this.awaitWithAbort(
        adoption,
        execution.controller.signal,
      );
      if (!this.isStillActive(request.recordId, execution)) {
        await this.cleanupUncommittedTab(execution);
        return this.inactiveOutcome(request.recordId, execution);
      }
      if (!adopted) {
        await this.cleanupUncommittedTab(execution);
        const error = new Error(
          'Could not show the new chat on the canvas. Try again.',
        );
        this.logger.error?.(
          'TeamBuilderRunCoordinator',
          'Canvas did not adopt the chat tab for harness-configure',
          error,
        );
        this.actionBanner?.showError(error.message);
        throw error;
      }
    } else {
      void appState.requestCanvasTab(
        tabId,
        request.workspacePath,
        'AI Team Builder',
        false,
      );
      if (!this.isStillActive(request.recordId, execution)) {
        await this.cleanupUncommittedTab(execution);
        return this.inactiveOutcome(request.recordId, execution);
      }
    }

    // Commit boundary: last synchronous check before dispatching the first turn.
    if (!this.isStillActive(request.recordId, execution)) {
      await this.cleanupUncommittedTab(execution);
      return this.inactiveOutcome(request.recordId, execution);
    }

    let resolveSendSettled!: () => void;
    execution.sendSettled = new Promise<void>((resolve) => {
      resolveSendSettled = resolve;
    });
    execution.sendDispatched = true;
    execution.sendInFlight = true;
    try {
      const outcome = await chatStore.sendOrQueueMessage(trimmed, {
        ...request.attachmentSnapshot.options,
        tabId,
        workspacePath: request.workspacePath,
      });
      execution.sendInFlight = false;
      if (outcome.cancelled) {
        await this.cleanupUncommittedTab(execution);
        this.markCancelledIfLive(request.recordId, execution.workspacePath);
        resolveSendSettled();
        return { kind: 'cancelled' };
      }
      if (!outcome.success) {
        const error = new Error(
          outcome.error || 'Could not send the first message. Try again.',
        );
        const canRestoreForeground =
          foreground &&
          !execution.workspaceSwitchedDuringSend &&
          sameWorkspacePath(
            this.launcher.workspaceRoot(),
            execution.workspacePath,
          );
        await this.handleSendFailure(
          execution,
          tabId,
          trimmed,
          request.attachmentSnapshot,
          canRestoreForeground,
          error,
        );
        resolveSendSettled();
        throw error;
      }
      const finalInstalled = this.currentInstalledNames(
        request.recordId,
        execution,
      );
      execution.uncommittedTabId = null;
      execution.committed = true;
      request.attachmentSnapshot.removeSent();
      this.clearRecovery(request.recordId);
      this.setupRuns.report(request.recordId, {
        status: 'completed',
        step: 'handed-off',
        handoffTabId: tabId,
        error: null,
        teamBuilder: { intent: request.intent, installed: finalInstalled },
      });
      resolveSendSettled();
      return { kind: 'handed-off', tabId, installed: finalInstalled };
    } catch (cause: unknown) {
      if (execution.sendInFlight) {
        execution.sendInFlight = false;
        const error =
          cause instanceof Error
            ? cause
            : new Error('Could not send the first message. Try again.');
        const canRestoreForeground =
          foreground &&
          !execution.workspaceSwitchedDuringSend &&
          sameWorkspacePath(
            this.launcher.workspaceRoot(),
            execution.workspacePath,
          );
        await this.handleSendFailure(
          execution,
          tabId,
          trimmed,
          request.attachmentSnapshot,
          canRestoreForeground,
          error,
        );
        resolveSendSettled();
        throw error;
      }
      throw cause;
    }
  }

  private async handleSendFailure(
    execution: ActiveExecution,
    tabId: string,
    visibleMessage: string,
    snapshot: LauncherAttachmentSnapshot,
    foreground: boolean,
    error: Error,
  ): Promise<void> {
    this.logger.error?.(
      'TeamBuilderRunCoordinator',
      'Initial chat send failed for harness-configure',
      error,
    );
    if (foreground) {
      execution.uncommittedTabId = null;
      this.composerRestore?.restore(tabId, [visibleMessage]);
      this.composerRestore?.restoreAttachments(
        tabId,
        snapshot.attachments.files,
        snapshot.attachments.images,
      );
      this.actionBanner?.showError(error.message, tabId);
    } else {
      await this.cleanupUncommittedTab(execution);
    }
  }

  private async cleanupUncommittedTab(
    execution: ActiveExecution,
  ): Promise<void> {
    const tabId = execution.uncommittedTabId;
    if (!tabId || !this.tabs) return;
    execution.uncommittedTabId = null;
    await this.closeUncommittedTabForWorkspace(tabId, execution.workspacePath);
  }

  private isBusyTab(tab: { readonly status?: string }): boolean {
    return Boolean(tab.status && BUSY_TAB_STATUSES.has(tab.status));
  }

  private isUserVisibleTab(
    tabs: TabManagerService,
    tabId: string,
    lookup: { readonly workspacePath: string | null } | null,
  ): boolean {
    if (
      typeof tabs.activeTabId === 'function' &&
      tabs.activeTabId() === tabId
    ) {
      return true;
    }
    if (typeof tabs.tabs === 'function') {
      if (tabs.tabs().some((tab) => tab.id === tabId)) {
        return true;
      }
    }
    return (
      lookup !== null &&
      (lookup.workspacePath === null ||
        sameWorkspacePath(lookup.workspacePath, tabs.activeWorkspacePath))
    );
  }

  private async closeUncommittedTabForWorkspace(
    tabId: string,
    workspacePath: string,
    deferred = false,
  ): Promise<void> {
    const tabs = this.tabs;
    if (!tabs || this.closingTabIds.has(tabId)) return;
    this.closingTabIds.add(tabId);
    try {
      if (typeof tabs.findTabByIdAcrossWorkspaces === 'function') {
        const lookup = tabs.findTabByIdAcrossWorkspaces(tabId);
        if (!lookup) {
          this.pendingTabCleanups.delete(tabId);
          return;
        }
        if (
          lookup.workspacePath !== null &&
          !sameWorkspacePath(lookup.workspacePath, workspacePath)
        ) {
          this.pendingTabCleanups.delete(tabId);
          return;
        }
        const userVisible = this.isUserVisibleTab(tabs, tabId, lookup);
        if (userVisible) {
          // Deferred retries only close tabs still parked in a background
          // partition; once the user can see or has activated the tab in the
          // active workspace, retire automatic cleanup and never force-close.
          if (deferred || lookup.tab.isDirty || this.isBusyTab(lookup.tab)) {
            this.pendingTabCleanups.delete(tabId);
            return;
          }
          await tabs.closeTab(tabId, true);
          this.pendingTabCleanups.delete(tabId);
          return;
        }
        const sessionId = lookup.tab.claudeSessionId ?? null;
        let closed = false;
        if (
          sessionId !== null &&
          typeof tabs.closeTabAcrossWorkspaces === 'function'
        ) {
          closed = tabs.closeTabAcrossWorkspaces(tabId, sessionId);
        } else if (typeof tabs.closeHandoffPredecessor === 'function') {
          closed = await tabs.closeHandoffPredecessor(tabId, sessionId, false);
        }
        if (closed) {
          this.pendingTabCleanups.delete(tabId);
          return;
        }
        const after = tabs.findTabByIdAcrossWorkspaces(tabId);
        if (
          !after ||
          after.tab.isDirty ||
          this.isUserVisibleTab(tabs, tabId, after)
        ) {
          this.pendingTabCleanups.delete(tabId);
        } else {
          this.pendingTabCleanups.set(tabId, workspacePath);
        }
        return;
      }

      if (deferred) {
        if (
          this.isUserVisibleTab(tabs, tabId, null) ||
          sameWorkspacePath(this.launcher.workspaceRoot(), workspacePath)
        ) {
          this.pendingTabCleanups.delete(tabId);
        }
        return;
      }
      if (sameWorkspacePath(this.launcher.workspaceRoot(), workspacePath)) {
        await tabs.closeTab(tabId, true);
        this.pendingTabCleanups.delete(tabId);
      }
    } catch (cause: unknown) {
      // degradation-audit: reported - cleanup failure for an uncommitted chat tab is logged via LoggingService.
      this.logger.error?.(
        'TeamBuilderRunCoordinator',
        'Could not close uncommitted team-builder chat tab',
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    } finally {
      this.closingTabIds.delete(tabId);
    }
  }

  private async flushPendingTabCleanups(
    workspacePath?: string,
  ): Promise<void> {
    const tabs = this.tabs;
    if (!tabs) return;
    for (const [tabId, ownerWorkspace] of [
      ...this.pendingTabCleanups.entries(),
    ]) {
      if (workspacePath && !sameWorkspacePath(ownerWorkspace, workspacePath)) {
        continue;
      }
      if (this.closingTabIds.has(tabId)) continue;
      if (typeof tabs.findTabByIdAcrossWorkspaces === 'function') {
        const lookup = tabs.findTabByIdAcrossWorkspaces(tabId);
        if (
          !lookup ||
          (lookup.workspacePath !== null &&
            !sameWorkspacePath(lookup.workspacePath, ownerWorkspace)) ||
          lookup.tab.isDirty ||
          this.isUserVisibleTab(tabs, tabId, lookup)
        ) {
          this.pendingTabCleanups.delete(tabId);
          continue;
        }
        if (sameWorkspacePath(this.launcher.workspaceRoot(), ownerWorkspace)) {
          continue;
        }
        if (this.isBusyTab(lookup.tab)) {
          continue;
        }
      } else if (
        this.isUserVisibleTab(tabs, tabId, null) ||
        sameWorkspacePath(this.launcher.workspaceRoot(), ownerWorkspace)
      ) {
        this.pendingTabCleanups.delete(tabId);
        continue;
      }
      await this.closeUncommittedTabForWorkspace(tabId, ownerWorkspace, true);
    }
  }

  private awaitWithAbort<T>(
    promise: Promise<T>,
    signal: AbortSignal,
  ): Promise<T | null> {
    if (signal.aborted) return Promise.resolve(null);
    return new Promise<T | null>((resolve, reject) => {
      const onAbort = (): void => {
        resolve(null);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          if (signal.aborted) resolve(null);
          else reject(error);
        },
      );
    });
  }

  private inactiveOutcome(
    recordId: string,
    execution: ActiveExecution,
  ): TeamBuilderRunOutcome {
    if (execution.abortedForWorkspace) return { kind: 'ignored' };
    if (execution.controller.signal.aborted) {
      this.markCancelledIfLive(recordId, execution.workspacePath);
      return { kind: 'cancelled' };
    }
    const record = this.setupRuns.get(recordId);
    if (record?.status === 'cancelled') return { kind: 'cancelled' };
    return { kind: 'ignored' };
  }

  private markCancelledIfLive(
    recordId: string,
    workspacePath?: string,
  ): void {
    const record = this.setupRuns.get(recordId);
    if (!record) return;
    if (
      workspacePath &&
      !sameWorkspacePath(record.workspacePath, workspacePath)
    ) {
      return;
    }
    if (record.status === 'running' || record.status === 'needs-input') {
      this.clearRecovery(recordId);
      this.setupRuns.report(recordId, {
        status: 'cancelled',
        step: 'intent',
        error: null,
      });
    }
  }

  private markCompletedInstall(recordId: string, completed: boolean): void {
    const current = this.completedInstalls();
    if (current.has(recordId) === completed) return;
    const next = new Set(current);
    if (completed) next.add(recordId);
    else next.delete(recordId);
    this.completedInstalls.set(next);
  }

  private setGuidanceNote(recordId: string, note: string): void {
    const current = this.guidanceNotes();
    if ((current.get(recordId) ?? '') === note) return;
    const next = new Map(current);
    if (note) next.set(recordId, note);
    else next.delete(recordId);
    this.guidanceNotes.set(next);
  }

  private snapshotHasAttachments(
    snapshot: LauncherAttachmentSnapshot,
  ): boolean {
    return (
      (snapshot.options.files?.length ?? 0) > 0 ||
      (snapshot.options.images?.length ?? 0) > 0 ||
      snapshot.attachments.files.length > 0 ||
      snapshot.attachments.images.length > 0
    );
  }

  private loadPersistedRecovery(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(RECOVERY_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (
        !isRecordObject(parsed) ||
        parsed['version'] !== 1 ||
        !isRecordObject(parsed['byRecord'])
      ) {
        return;
      }
      let pruned = false;
      for (const [id, value] of Object.entries(parsed['byRecord'])) {
        const entry = parsePersistedEntry(value);
        if (!entry || this.setupRuns.get(id) === null) {
          pruned = true;
          continue;
        }
        this.persistedRecovery.set(id, entry);
        if (entry.installCompleted) {
          this.markCompletedInstall(id, true);
        }
      }
      if (pruned) {
        this.flushPersistedRecovery();
      }
    } catch {
      // degradation-audit: optional-capability - unreadable team-builder recovery cache is ignored for this session.
      this.persistedRecovery.clear();
    }
  }

  private pruneStaleRecovery(keepRecordId?: string, flush = true): boolean {
    let removedPersisted = false;
    for (const id of [...this.persistedRecovery.keys()]) {
      if (id === keepRecordId) continue;
      if (this.setupRuns.get(id) === null) {
        this.persistedRecovery.delete(id);
        this.drafts.delete(id);
        this.markCompletedInstall(id, false);
        removedPersisted = true;
      }
    }
    for (const id of [...this.drafts.keys()]) {
      if (id === keepRecordId) continue;
      if (this.setupRuns.get(id) === null) {
        this.drafts.delete(id);
        this.markCompletedInstall(id, false);
      }
    }
    if (removedPersisted && flush) {
      this.flushPersistedRecovery();
    }
    return removedPersisted;
  }

  private savePersistedEntry(
    recordId: string,
    entry: PersistedRecoveryEntry,
  ): void {
    this.pruneStaleRecovery(recordId, false);
    this.persistedRecovery.set(recordId, entry);
    if (this.persistedRecovery.size > MAX_RECOVERY_ENTRIES) {
      const evictable = [...this.persistedRecovery.entries()]
        .filter(([key]) => {
          if (key === recordId) return false;
          const record = this.setupRuns.get(key);
          return (
            !record ||
            record.status === 'completed' ||
            record.status === 'cancelled'
          );
        })
        .sort(([, a], [, b]) => a.updatedAt - b.updatedAt)
        .slice(0, this.persistedRecovery.size - MAX_RECOVERY_ENTRIES);
      for (const [key] of evictable) this.persistedRecovery.delete(key);
    }
    this.flushPersistedRecovery();
  }

  private flushPersistedRecovery(): void {
    if (!this.storage) return;
    try {
      const byRecord: Record<string, PersistedRecoveryEntry> = {};
      for (const [id, entry] of this.persistedRecovery) {
        byRecord[id] = entry;
      }
      this.storage.setItem(
        RECOVERY_STORAGE_KEY,
        JSON.stringify({ version: 1, byRecord }),
      );
    } catch {
      // degradation-audit: optional-capability - refused storage write keeps team-builder recovery in memory for this session.
    }
  }
}
