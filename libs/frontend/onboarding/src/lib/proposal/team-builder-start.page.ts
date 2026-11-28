import {
  afterNextRender,
  ElementRef,
  Injector,
  viewChild,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Users } from 'lucide-angular';
import { TabManagerService } from '@ptah-extension/chat-state';
import { AppStateManager, ClaudeRpcService } from '@ptah-extension/core';
import type {
  DeepProjectAnalysis,
  ProjectGuidance,
} from '@ptah-extension/shared';
import {
  AttachmentTrayComponent,
  ComposerAttachmentsService,
} from '@ptah-extension/chat';
import {
  normalizeSetupWorkspacePath,
  SetupRunStore,
  type SetupRunRecord,
  type SetupRunStepOf,
} from '@ptah-extension/setup-wizard';
import { HarnessChatLauncherService } from '../launcher/harness-chat-launcher.service';
import { WorkspaceHeaderComponent } from '../shell/workspace-header.component';
import {
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahFieldComponent,
  PtahTextareaDirective,
} from '@ptah-extension/ui';
import { StackSkillStore } from './stack-skill.store';
import { StackSkillReviewComponent } from './stack-skill-review.component';
import { StackSkillConsentComponent } from './stack-skill-consent.component';
import {
  TeamBuilderRunCoordinator,
  type TeamBuilderRunOutcome,
} from './team-builder-run.coordinator';

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

@Component({
  selector: 'ptah-team-builder-start-page',
  standalone: true,
  imports: [
    FormsModule,
    AttachmentTrayComponent,
    WorkspaceHeaderComponent,
    LucideAngularModule,
    PtahButtonDirective,
    PtahCheckboxDirective,
    PtahFieldComponent,
    PtahTextareaDirective,
    StackSkillReviewComponent,
    StackSkillConsentComponent,
  ],
  providers: [ComposerAttachmentsService, StackSkillStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-builder-start.page.html',
})
export class TeamBuilderStartPage {
  public readonly tab = input<string | undefined>();
  protected readonly icons = { users: Users };
  public readonly attachments = inject(ComposerAttachmentsService);
  protected readonly launcher = inject(HarnessChatLauncherService);
  private readonly router = inject(Router);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly setupRuns = inject(SetupRunStore);
  private readonly coordinator = inject(TeamBuilderRunCoordinator);
  private readonly destroyRef = inject(DestroyRef);
  public readonly state = inject(StackSkillStore);
  private readonly injector = inject(Injector);
  private readonly tabManager = inject(TabManagerService, { optional: true });
  private readonly appState = inject(AppStateManager, { optional: true });
  private readonly recoveryContinue =
    viewChild<ElementRef<HTMLButtonElement>>('recoveryContinue');
  private readonly installingCancel =
    viewChild<ElementRef<HTMLButtonElement>>('installingCancel');
  private readonly currentRecordId = signal<string | null>(null);
  private attachedRecordId: string | null = null;
  private hydratedRecordId: string | null = null;
  private hadLocalAttachmentsForRecord = false;
  private lastTabInput: string | undefined;
  public readonly intent = this.state.intent;
  public readonly touched = signal(false);
  public readonly submitted = signal(false);
  public readonly missingAttachments = signal(false);
  public readonly activeRecord = computed<SetupRunRecord | null>(() => {
    const root = normalizeSetupWorkspacePath(this.launcher.workspaceRoot());
    const workspaceRuns = root
      ? this.setupRuns
          .runsFor(root)
          .filter((record) => record.workflow === 'team-builder')
      : [];
    const live = workspaceRuns.find(
      (record) =>
        record.status === 'running' || record.status === 'needs-input',
    );
    if (live) return live;
    const currentId = this.currentRecordId();
    if (currentId) {
      const current = workspaceRuns.find((record) => record.id === currentId);
      if (current) return current;
    }
    const tabId = this.tab();
    if (tabId) {
      const byTab = workspaceRuns.find((record) => record.id === tabId);
      if (byTab) return byTab;
    }
    return null;
  });
  public readonly viewStage = computed<SetupRunStepOf<'team-builder'>>(() => {
    const record = this.activeRecord();
    if (record?.status === 'completed' && record.step === 'handed-off') {
      return 'handed-off';
    }
    if (
      record?.status === 'running' &&
      (record.step === 'installing' || record.step === 'launching')
    ) {
      return record.step;
    }
    return this.state.stage();
  });
  public readonly launched = computed(() => this.viewStage() === 'handed-off');
  public readonly handoffTabId = computed<string | null>(() => {
    const record = this.activeRecord();
    return record?.status === 'completed'
      ? (record.handoffTabId ?? null)
      : null;
  });
  public readonly handoffTabExists = computed<boolean>(() => {
    const tabId = this.handoffTabId();
    if (!tabId || !this.tabManager) return false;
    if (this.tabManager.tabs().some((tab) => tab.id === tabId)) return true;
    this.tabManager.backgroundTabsRevision?.();
    return Boolean(this.tabManager.findTabByIdAcrossWorkspaces?.(tabId));
  });
  public readonly interrupted = computed(
    () => this.activeRecord()?.status === 'interrupted',
  );
  public readonly starting = computed(
    () =>
      this.viewStage() === 'installing' || this.viewStage() === 'launching',
  );
  public readonly guidanceNote = computed(() => {
    const id = this.activeRecord()?.id;
    return (
      (id ? this.coordinator.guidanceNoteFor(id) : '') ||
      this.state.guidanceNote()
    );
  });
  public readonly actionError = computed(() => {
    const localError = this.state.error();
    if (localError !== null) return localError;
    const record = this.activeRecord();
    return record?.status === 'failed' ? (record.error ?? null) : null;
  });
  public readonly invalid = computed(
    () => (this.submitted() || this.touched()) && !this.intent().trim(),
  );
  public readonly searching = this.state.searching;
  public readonly searchError = this.state.searchError;
  public readonly ownerDecisionRequired = computed(() =>
    this.state.guidanceFacts().some((fact) => fact.label !== 'follow'),
  );
  public readonly ownerDecisionError = signal(false);
  private requestVersion = 0;
  private searchVersion = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private returnFocus: HTMLElement | null = null;
  private workspace = '';
  private readonly guidanceLoadedFor = signal<{
    readonly loaded: boolean;
    readonly recordId: string | null;
  }>({ loaded: false, recordId: null });
  private guidanceAnalysis: DeepProjectAnalysis = {
    projectType: 'unknown',
    frameworks: [],
  };

  public constructor() {
    effect(() => {
      const root = this.launcher.workspaceRoot();
      if (this.workspace && !sameWorkspacePath(this.workspace, root)) {
        untracked(() => {
          this.coordinator.abortWorkspace(this.workspace);
          this.currentRecordId.set(null);
          this.hydratedRecordId = null;
          this.resetRecordViewState();
        });
      }
      this.workspace = root;
    });
    effect(() => {
      const tabId = this.tab();
      untracked(() => {
        if (tabId !== this.lastTabInput) {
          this.lastTabInput = tabId;
          if (tabId && tabId !== this.currentRecordId()) {
            this.currentRecordId.set(null);
          }
        }
      });
    });
    effect(() => {
      const record = this.activeRecord();
      untracked(() => {
        if (
          record &&
          (record.status === 'running' || record.status === 'needs-input')
        ) {
          this.bindUrlToRecord(record.id);
        }
        this.syncAttachedRecord(record?.id ?? null);
        this.hydrateFromRecord(record);
      });
    });
    effect(() => {
      const files = this.attachments.files();
      const images = this.attachments.images();
      untracked(() => {
        const hasFiles = files.length > 0 || images.length > 0;
        if (hasFiles) {
          this.missingAttachments.set(false);
        }
        const record = this.activeRecord();
        const root = this.launcher.workspaceRoot();
        if (
          !record ||
          !root ||
          this.hydratedRecordId !== record.id ||
          (record.status !== 'needs-input' &&
            record.status !== 'failed' &&
            record.status !== 'interrupted')
        ) {
          return;
        }
        if (!hasFiles && !this.hadLocalAttachmentsForRecord) {
          // Initial empty tray on mount/reload must not clobber persisted
          // recovery metadata (installCompleted, selection, hadAttachments).
          return;
        }
        this.hadLocalAttachmentsForRecord = hasFiles;
        const hadAttachments = hasFiles || this.missingAttachments();
        this.coordinator.saveDraft(record.id, {
          workspacePath: root,
          attachmentFiles: files,
          attachmentImages: images,
          hadAttachments,
        });
      });
    });
    this.destroyRef.onDestroy(() => {
      this.requestVersion++;
      this.searchVersion++;
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.syncAttachedRecord(null);
    });
  }

  public onIntentChange(value: string): void {
    this.state.setIntent(value);
    const record = this.activeRecord();
    const root = this.launcher.workspaceRoot();
    if (record && record.status === 'needs-input') {
      this.setupRuns.report(record.id, {
        teamBuilder: { intent: value, installed: this.currentInstalled() },
      });
      if (root) {
        this.coordinator.saveDraft(record.id, {
          workspacePath: root,
          intent: value,
        });
      }
    }
  }

  public onSelectionToggled(id: string): void {
    this.state.toggle(id);
    this.persistActiveDraft();
  }

  public onOwnerDecisionChange(decision: 'match' | 'raise'): void {
    this.state.setOwnerDecision(decision);
    this.ownerDecisionError.set(false);
    this.persistActiveDraft();
  }

  public guidanceLabel(value: ProjectGuidance['label']): string {
    return value === 'do_not_copy'
      ? 'Do not copy'
      : value === 'tolerate'
        ? 'Tolerate'
        : 'Follow';
  }

  public onApproveSkill(skillName: string): void {
    this.state.approve(skillName);
    this.persistActiveDraft();
  }

  public async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    if (
      this.invalid() ||
      this.starting() ||
      this.attachments.pendingReads() > 0
    ) {
      return;
    }
    if (!this.launcher.workspaceRoot()) {
      this.state.setError('Open a workspace to find skills.');
      return;
    }
    const record = this.ensureRecord('review', 'needs-input', {
      allowNewAfterTerminal: true,
    });
    const preserveInstalled = Boolean(
      record && this.coordinator.hasCompletedInstall(record.id),
    );
    if (record) {
      this.hydratedRecordId = record.id;
      this.hadLocalAttachmentsForRecord =
        this.attachments.files().length > 0 ||
        this.attachments.images().length > 0;
      if (preserveInstalled) {
        const root = this.launcher.workspaceRoot();
        const recovery = this.coordinator.recoveryFor(record);
        const installed = this.currentInstalled();
        if (record.status === 'failed' || record.status === 'interrupted') {
          await this.setupRuns.retry(record.id);
          if (
            this.destroyRef.destroyed ||
            !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
            this.activeRecord()?.id !== record.id
          ) {
            return;
          }
        }
        this.setupRuns.report(record.id, {
          status: 'needs-input',
          step: 'review',
          error: null,
          teamBuilder: { intent: this.intent(), installed },
        });
        this.persistDraftFor(record.id, {
          selectedIds:
            this.state.selectedIds().size > 0
              ? [...this.state.selectedIds()]
              : recovery.selectedIds,
          ownerDecision: this.state.ownerDecision() ?? recovery.ownerDecision,
          installCompleted: true,
        });
        this.skillsInstalledState.set(true);
        this.state.setInstalled(installed);
        this.state.setStage('review');
        this.state.setError(null);
        if (!this.hasLoadedGuidanceFor(record.id)) {
          await this.loadReview({
            preserveSelection: true,
            recordId: record.id,
          });
        }
        return;
      }
      this.setupRuns.report(record.id, {
        status: 'needs-input',
        step: 'review',
        error: null,
        teamBuilder: {
          intent: this.intent(),
          installed: record.teamBuilder?.installed ?? [],
        },
      });
      this.persistDraftFor(record.id, {
        selectedIds: [],
        ownerDecision: null,
        installCompleted: false,
      });
    }
    this.state.setStage('review');
    await this.loadReview({ recordId: record?.id });
  }

  private readonly loadErrorState = signal(false);
  public readonly loadError = this.loadErrorState.asReadonly();
  private readonly skillsInstalledState = signal(false);
  public readonly skillsInstalled = computed(() => {
    if (this.skillsInstalledState()) return true;
    const record = this.activeRecord();
    if (
      !record ||
      record.status === 'completed' ||
      record.status === 'cancelled'
    ) {
      return false;
    }
    return this.coordinator.hasCompletedInstall(record.id);
  });
  public readonly launchStatus = computed(() =>
    this.launched() ? 'Conversation opened' : 'Launching chat…',
  );

  public async loadReview(
    options: {
      preserveSelection?: boolean;
      preserveError?: boolean;
      recordId?: string;
    } = {},
  ): Promise<boolean> {
    if (!options.preserveSelection) {
      this.skillsInstalledState.set(false);
    }
    this.loadErrorState.set(true);
    const version = ++this.requestVersion;
    this.searchVersion++;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    const root = this.launcher.workspaceRoot();
    const boundRecordId = options.recordId ?? this.activeRecord()?.id ?? null;
    const isStale = (): boolean =>
      version !== this.requestVersion ||
      this.destroyRef.destroyed ||
      !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
      (boundRecordId !== null && this.activeRecord()?.id !== boundRecordId);
    this.guidanceLoadedFor.set({ loaded: false, recordId: null });
    if (
      boundRecordId !== null &&
      root &&
      this.coordinator.draftFor(boundRecordId)?.guidanceLoaded
    ) {
      this.coordinator.saveDraft(boundRecordId, {
        workspacePath: root,
        guidanceLoaded: false,
      });
    }
    this.state.setPreviewing(false);
    this.state.setPreview([]);
    this.state.setLoading(true);
    this.state.setSearching(false);
    if (!options.preserveError) {
      this.state.setError(null);
    }
    this.state.setRecommendations([]);
    if (!options.preserveSelection) {
      this.state.setSelectedIds(new Set());
      this.state.setOwnerDecision(null);
    }
    this.state.setGuidanceFacts([]);
    this.state.setSearchResults([]);
    this.state.setOwnerDecisionPrompt('');
    this.state.setGuidanceNote('');
    this.guidanceAnalysis = { projectType: 'unknown', frameworks: [] };
    let recommendationsLoaded = false;
    try {
      let analysis: DeepProjectAnalysis = {
        projectType: 'unknown',
        frameworks: [],
      };
      const listed = await this.rpc.call('wizard:list-analyses', {});
      if (isStale()) return false;
      if (listed.isSuccess() && listed.data.analyses.length) {
        const newest = [...listed.data.analyses].sort((a, b) =>
          b.savedAt.localeCompare(a.savedAt),
        )[0];
        const loaded = await this.rpc.call('wizard:load-analysis', {
          filename: newest.filename,
        });
        if (isStale()) return false;
        if (loaded.isSuccess()) {
          const profile = loaded.data.phaseContents['project-profile'] ?? '';
          const frameworksLine = profile.match(
            /^\s*(?:[-*]\s*)?(?:\*\*)?Frameworks(?:\*\*)?:\s*(.+)$/im,
          )?.[1];
          analysis = {
            projectType: newest.projectType,
            frameworks: frameworksLine
              ? frameworksLine
                  .split(/[,;|]/)
                  .map((value) => value.trim())
                  .filter(
                    (value) => Boolean(value) && value !== '(not detected)',
                  )
              : [],
          };
        } else
          this.state.setGuidanceNote(
            'Could not load stored project analysis. Guidance is limited.',
          );
      } else if (listed.isSuccess()) {
        this.state.setGuidanceNote(
          'No stored project analysis. Guidance is limited.',
        );
      } else
        this.state.setGuidanceNote(
          'Could not list project analyses. Guidance is limited.',
        );
      const recommended = await this.rpc.call('wizard:recommend-skills', {
        analysis,
      });
      if (isStale()) return false;
      if (!recommended.isSuccess()) {
        this.state.setError(
          this.rpcMessage(recommended, 'Could not load skill recommendations.'),
        );
        if (boundRecordId !== null) {
          this.persistDraftFor(boundRecordId);
        } else {
          this.persistActiveDraft();
        }
        return false;
      }
      recommendationsLoaded = true;
      this.loadErrorState.set(false);
      this.state.setRecommendations(recommended.data.skills);
      const guidance = await this.rpc.call('wizard:get-project-guidance', {
        analysis,
      });
      if (isStale()) return false;
      this.guidanceAnalysis = analysis;
      if (!guidance.isSuccess() || !Array.isArray(guidance.data?.facts)) {
        this.state.setGuidanceFacts([]);
        this.state.setGuidanceNote('Could not load project guidance.');
        if (this.skillsInstalled()) {
          this.state.setError(
            this.rpcMessage(guidance, 'Could not load project guidance.'),
          );
        }
        if (boundRecordId !== null) {
          this.persistDraftFor(boundRecordId);
        } else {
          this.persistActiveDraft();
        }
        return false;
      }
      this.guidanceLoadedFor.set({ loaded: true, recordId: boundRecordId });
      this.state.setGuidanceFacts(guidance.data.facts);
      this.state.setOwnerDecisionPrompt(guidance.data.ownerDecisionPrompt);
      if (boundRecordId !== null) {
        this.persistDraftFor(boundRecordId);
      } else {
        this.persistActiveDraft();
      }
      return true;
    } catch {
      // degradation-audit: reported - the page shows the load error for the
      // current record, and installed recovery stays blocked until guidance loads.
      if (!isStale()) {
        this.state.setError(
          recommendationsLoaded
            ? 'Could not load project guidance.'
            : 'Could not load skill recommendations.',
        );
        if (recommendationsLoaded) {
          this.state.setGuidanceNote('Could not load project guidance.');
        }
        if (boundRecordId !== null) {
          this.persistDraftFor(boundRecordId);
        } else {
          this.persistActiveDraft();
        }
      }
      return false;
    } finally {
      if (!isStale()) this.state.setLoading(false);
    }
  }

  public search(query: string): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    const version = ++this.searchVersion;
    this.state.setSearchQuery(query);
    this.state.setSearchResults([]);
    this.state.setSearchError(null);
    if (!query) {
      this.state.setSearchResults([]);
      this.state.setSearching(false);
      return;
    }
    this.state.setSearchResults([]);
    this.state.setSearching(true);
    const root = this.launcher.workspaceRoot();
    const boundRecordId = this.activeRecord()?.id ?? null;
    const isStale = (): boolean =>
      version !== this.searchVersion ||
      this.destroyRef.destroyed ||
      !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
      (boundRecordId !== null && this.activeRecord()?.id !== boundRecordId);
    this.searchTimer = setTimeout(async () => {
      try {
        const result = await this.rpc.call('wizard:search-skills', { query });
        if (isStale()) return;
        if (!result.isSuccess()) {
          this.state.setSearchError(
            this.rpcMessage(result, 'Could not search skills.'),
          );
          return;
        }
        this.state.setSearchResults(result.data.skills);
      } catch {
        if (!isStale()) this.state.setSearchError('Could not search skills.');
      } finally {
        if (!isStale()) this.state.setSearching(false);
      }
    }, 300);
  }

  public async reviewSelection(): Promise<void> {
    if (this.blockForOwnerDecision()) return;
    // "Continue without skills": there is nothing to preview, so start the chat.
    if (!this.state.selectedIds().size) {
      await this.launchChat();
      return;
    }
    if (this.state.loading() || this.state.previewing() || this.starting())
      return;
    this.returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    await this.previewSelectedSkills();
  }

  public closeConsent(): void {
    if (this.starting()) return;
    this.state.setStage('review');
    this.state.setError(null);
    const record = this.activeRecord();
    if (record && record.status === 'needs-input') {
      this.setupRuns.report(record.id, {
        status: 'needs-input',
        step: 'review',
        error: null,
      });
    }
    queueMicrotask(() => this.returnFocus?.focus());
  }

  public async install(): Promise<void> {
    if (this.skillsInstalled() || this.missingAttachments()) return;
    const previews = this.state.preview();
    if (
      this.starting() ||
      !previews.length ||
      previews.some(
        (item) =>
          item.hasScripts && !this.state.approvedIds().has(item.skillName),
      )
    )
      return;
    const root = this.launcher.workspaceRoot();
    if (!root) return;
    const record = this.ensureRecord('installing', 'running', {
      allowNewAfterTerminal: true,
    });
    if (!record) return;
    this.syncAttachedRecord(record.id);
    this.requestVersion++;
    this.searchVersion++;
    this.state.setLoading(false);
    this.state.setPreviewing(false);
    this.state.setSearching(false);
    this.state.setStage('installing');
    this.state.setError(null);
    afterNextRender(() => this.installingCancel()?.nativeElement.focus(), {
      injector: this.injector,
    });
    const snapshot = this.attachments.snapshotForSend();
    const outcome = await this.coordinator.installAndLaunch({
      recordId: record.id,
      workspacePath: root,
      intent: this.intent(),
      previews,
      guidanceAnalysis: this.guidanceAnalysis,
      guidanceFacts: this.state.guidanceFacts(),
      guidanceLoaded: this.hasLoadedGuidanceFor(record.id),
      ownerDecision: this.state.ownerDecision(),
      attachmentSnapshot: snapshot,
    });
    this.applyRunOutcome(record.id, root, outcome, true);
  }

  public async launchChat(fromInstall = false): Promise<void> {
    if (
      this.state.loading() ||
      this.blockForOwnerDecision() ||
      this.missingAttachments()
    ) {
      if (fromInstall) this.state.setStage('review');
      return;
    }
    if (
      this.viewStage() === 'launching' ||
      this.viewStage() === 'handed-off' ||
      (this.starting() && !fromInstall)
    ) {
      if (fromInstall) this.state.setStage('review');
      return;
    }
    const root = this.launcher.workspaceRoot();
    if (!root) return;
    const currentRecordId = this.activeRecord()?.id ?? null;
    if (
      this.skillsInstalled() &&
      !fromInstall &&
      !this.hasLoadedGuidanceFor(currentRecordId)
    ) {
      const loaded = await this.loadReview({
        preserveSelection: true,
        recordId: currentRecordId ?? undefined,
      });
      if (
        !loaded ||
        this.destroyRef.destroyed ||
        !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
        (currentRecordId !== null &&
          this.activeRecord()?.id !== currentRecordId) ||
        !this.hasLoadedGuidanceFor(this.activeRecord()?.id ?? null) ||
        this.blockForOwnerDecision() ||
        this.missingAttachments() ||
        this.viewStage() === 'launching' ||
        this.viewStage() === 'handed-off' ||
        this.starting()
      ) {
        return;
      }
    }
    const record = this.ensureRecord('launching', 'running', {
      allowNewAfterTerminal: !this.skillsInstalled(),
    });
    if (!record) return;
    this.syncAttachedRecord(record.id);
    this.requestVersion++;
    this.searchVersion++;
    this.state.setLoading(false);
    this.state.setPreviewing(false);
    this.state.setSearching(false);
    this.state.setStage('launching');
    this.state.setError(null);
    const snapshot = this.attachments.snapshotForSend();
    const installed = this.skillsInstalled() ? this.currentInstalled() : [];
    const outcome = await this.coordinator.launch({
      recordId: record.id,
      workspacePath: root,
      intent: this.intent(),
      installed,
      guidanceAnalysis: this.guidanceAnalysis,
      guidanceFacts: this.state.guidanceFacts(),
      guidanceLoaded: this.hasLoadedGuidanceFor(record.id),
      ownerDecision: this.state.ownerDecision(),
      attachmentSnapshot: snapshot,
    });
    this.applyRunOutcome(record.id, root, outcome, false);
  }

  public async continueWithoutAttachments(): Promise<void> {
    this.missingAttachments.set(false);
    const record = this.activeRecord();
    const root = this.launcher.workspaceRoot();
    if (record && root) {
      this.coordinator.saveDraft(record.id, {
        workspacePath: root,
        hadAttachments: false,
      });
    }
    if (record?.status === 'interrupted') {
      await this.continueInterrupted();
      return;
    }
    if (this.skillsInstalled()) {
      if (
        !this.state.loading() &&
        !this.hasLoadedGuidanceFor(record?.id ?? null)
      ) {
        const loaded = await this.loadReview({
          preserveSelection: true,
          preserveError: record?.status === 'failed',
          recordId: record?.id,
        });
        if (
          !loaded ||
          this.destroyRef.destroyed ||
          !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
          (record && this.activeRecord()?.id !== record.id) ||
          !this.hasLoadedGuidanceFor(record?.id ?? null)
        ) {
          return;
        }
      }
      await this.launchChat();
    }
  }

  public async cancelRun(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    this.requestVersion++;
    this.searchVersion++;
    const cancelled = await this.coordinator.cancel(record.id);
    if (
      this.destroyRef.destroyed ||
      !cancelled ||
      this.activeRecord()?.id !== record.id
    ) {
      return;
    }
    this.state.setStage('intent');
    this.state.setError(null);
    this.skillsInstalledState.set(false);
    this.missingAttachments.set(false);
  }

  public async continueInterrupted(): Promise<void> {
    const record = this.activeRecord();
    if (!record || record.status !== 'interrupted') return;
    const recordId = record.id;
    const root = this.launcher.workspaceRoot();
    const recovery = this.coordinator.recoveryFor(record);
    await this.setupRuns.retry(recordId);
    if (
      this.destroyRef.destroyed ||
      !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
      this.activeRecord()?.id !== recordId
    ) {
      return;
    }
    this.state.setStage('review');
    this.state.setError(null);
    if (recovery.selectedIds.length > 0 && this.state.selectedIds().size === 0) {
      this.state.setSelectedIds(new Set(recovery.selectedIds));
    }
    if (recovery.ownerDecision && !this.state.ownerDecision()) {
      this.state.setOwnerDecision(recovery.ownerDecision);
    }
    if (recovery.installCompleted) {
      this.skillsInstalledState.set(true);
      if (!this.hasLoadedGuidanceFor(recordId)) {
        const loaded = await this.loadReview({
          preserveSelection: true,
          recordId,
        });
        if (
          !loaded ||
          this.destroyRef.destroyed ||
          !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
          this.activeRecord()?.id !== recordId ||
          !this.hasLoadedGuidanceFor(recordId)
        ) {
          return;
        }
      }
      if (this.missingAttachments()) return;
      await this.launchChat();
      return;
    }
    await this.loadReview({ preserveSelection: true, recordId });
    if (
      this.destroyRef.destroyed ||
      !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
      this.activeRecord()?.id !== recordId
    ) {
      return;
    }
    if (this.state.selectedIds().size > 0 && !this.blockForOwnerDecision()) {
      await this.previewSelectedSkills(recordId);
    }
  }

  public openConversation(): void {
    const tabId = this.handoffTabId();
    if (!tabId || !this.handoffTabExists() || !this.tabManager) return;
    const workspace = this.launcher.workspaceRoot() || null;
    this.tabManager.switchTab(tabId);
    if (this.appState) {
      void this.appState.requestCanvasTab?.(
        tabId,
        workspace,
        'AI Team Builder',
        true,
      );
      this.appState.setCurrentView('chat');
    }
  }

  public backToIntent(): void {
    if (this.starting()) return;
    this.requestVersion++;
    this.searchVersion++;
    this.state.setLoading(false);
    this.state.setPreviewing(false);
    this.state.setSearching(false);
    this.state.setStage('intent');
    this.state.setError(null);
    const record = this.activeRecord();
    if (record && record.status === 'needs-input') {
      this.setupRuns.report(record.id, {
        status: 'needs-input',
        step: 'intent',
        error: null,
      });
    }
  }

  private blockForOwnerDecision(): boolean {
    const missing = this.ownerDecisionRequired() && !this.state.ownerDecision();
    this.ownerDecisionError.set(missing);
    return missing;
  }

  private rpcMessage(
    result: { error?: string; errorCode?: string },
    fallback: string,
  ): string {
    return result.errorCode && result.error ? result.error : fallback;
  }

  public async back(): Promise<void> {
    await this.router.navigate(['/onboarding']);
  }

  private currentInstalled(): string[] {
    const record = this.activeRecord();
    if (record?.teamBuilder) {
      return [...record.teamBuilder.installed];
    }
    return [...this.state.installed()];
  }

  private findLiveWorkspaceRecord(root: string): SetupRunRecord | null {
    const normalized = normalizeSetupWorkspacePath(root);
    if (!normalized) return null;
    return (
      this.setupRuns
        .runsFor(normalized)
        .find(
          (record) =>
            record.workflow === 'team-builder' &&
            (record.status === 'running' || record.status === 'needs-input'),
        ) ?? null
    );
  }

  private ensureRecord(
    step: SetupRunStepOf<'team-builder'>,
    status: 'needs-input' | 'running',
    options: { allowNewAfterTerminal?: boolean } = {},
  ): SetupRunRecord | null {
    const root = this.launcher.workspaceRoot();
    if (!root) return null;
    const live = this.findLiveWorkspaceRecord(root);
    if (live) {
      this.currentRecordId.set(live.id);
      this.bindUrlToRecord(live.id);
      return live;
    }
    const existing = this.activeRecord();
    if (existing) {
      if (
        existing.status === 'failed' ||
        existing.status === 'interrupted' ||
        !options.allowNewAfterTerminal
      ) {
        this.currentRecordId.set(existing.id);
        this.bindUrlToRecord(existing.id);
        return existing;
      }
    }
    const created = this.setupRuns.start('team-builder', root, {
      status,
      step,
    });
    if (created) {
      this.hydratedRecordId = created.id;
      this.hadLocalAttachmentsForRecord =
        this.attachments.files().length > 0 ||
        this.attachments.images().length > 0;
      this.currentRecordId.set(created.id);
      this.bindUrlToRecord(created.id);
    }
    return created;
  }

  private bindUrlToRecord(recordId: string): void {
    const boundTab = this.tab();
    if (!boundTab || boundTab === recordId) return;
    void this.router.navigate([], {
      queryParams: { tab: recordId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async previewSelectedSkills(recordId?: string): Promise<boolean> {
    const version = ++this.requestVersion;
    const root = this.launcher.workspaceRoot();
    const boundRecordId = recordId ?? this.activeRecord()?.id ?? null;
    const isStale = (): boolean =>
      version !== this.requestVersion ||
      this.destroyRef.destroyed ||
      !sameWorkspacePath(root, this.launcher.workspaceRoot()) ||
      (boundRecordId !== null && this.activeRecord()?.id !== boundRecordId);
    this.loadErrorState.set(false);
    this.state.setPreviewing(true);
    this.state.setError(null);
    try {
      const result = await this.rpc.call('wizard:preview-skills-for-consent', {
        skills: [...this.state.selectedIds()],
      });
      if (isStale()) return false;
      if (!result.isSuccess()) {
        this.state.setError(
          this.rpcMessage(result, 'Could not preview skills.'),
        );
        return false;
      }
      const ids = this.state.selectedIds();
      if (
        result.data.skills.length !== ids.size ||
        result.data.skills.some(
          (item) => !ids.has(item.skillName) || !item.contentHash,
        )
      )
        throw new Error('Skill preview was incomplete. Try again.');
      this.state.setPreview(result.data.skills);
      this.state.setApprovedIds(new Set());
      this.state.setStage('consent');
      const record = this.activeRecord();
      if (
        record &&
        record.status === 'needs-input' &&
        (boundRecordId === null || record.id === boundRecordId)
      ) {
        this.setupRuns.report(record.id, {
          status: 'needs-input',
          step: 'consent',
          error: null,
          teamBuilder: {
            intent: this.intent(),
            installed: this.currentInstalled(),
          },
        });
        this.persistDraftFor(record.id, {
          previews: result.data.skills,
          approvedIds: [],
        });
      }
      return true;
    } catch {
      // degradation-audit: reported - preview failure is displayed on the team-builder page.
      if (!isStale()) this.state.setError('Could not preview skills.');
      return false;
    } finally {
      if (!isStale()) this.state.setPreviewing(false);
    }
  }

  private async rehydrateConsent(recordId: string): Promise<void> {
    if (!this.state.loading() && this.state.recommendations().length === 0) {
      await this.loadReview({ preserveSelection: true, recordId });
      if (this.destroyRef.destroyed || this.activeRecord()?.id !== recordId) {
        return;
      }
    }
    if (this.activeRecord()?.id !== recordId) return;
    if (this.state.selectedIds().size === 0) {
      this.state.setStage('review');
      return;
    }
    const ok = await this.previewSelectedSkills(recordId);
    if (
      !ok &&
      !this.destroyRef.destroyed &&
      this.activeRecord()?.id === recordId
    ) {
      this.state.setStage('review');
    }
  }

  private applyRunOutcome(
    recordId: string,
    workspaceRoot: string,
    outcome: TeamBuilderRunOutcome,
    returnFocusOnInstallFailure: boolean,
  ): void {
    if (
      this.destroyRef.destroyed ||
      !sameWorkspacePath(workspaceRoot, this.launcher.workspaceRoot()) ||
      this.activeRecord()?.id !== recordId
    ) {
      return;
    }
    if (outcome.kind === 'ignored') return;
    if (outcome.kind === 'cancelled') {
      this.state.setStage('intent');
      this.state.setError(null);
      this.skillsInstalledState.set(false);
      this.missingAttachments.set(false);
      return;
    }
    if (outcome.kind === 'handed-off') {
      this.state.setInstalled([...outcome.installed]);
      this.skillsInstalledState.set(outcome.installed.length > 0);
      this.missingAttachments.set(false);
      this.state.setError(null);
      return;
    }
    this.state.setInstalled([...outcome.installed]);
    const installedComplete = this.coordinator.hasCompletedInstall(recordId);
    this.skillsInstalledState.set(installedComplete);
    this.state.setStage('review');
    this.state.setError(outcome.error);
    if (installedComplete) {
      afterNextRender(() => this.recoveryContinue()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } else if (returnFocusOnInstallFailure) {
      queueMicrotask(() => this.returnFocus?.focus());
    }
  }

  private syncAttachedRecord(nextId: string | null): void {
    if (nextId === this.attachedRecordId) return;
    if (this.attachedRecordId) {
      this.setupRuns.release(this.attachedRecordId);
      this.coordinator.detachView(this.attachedRecordId);
    }
    this.attachedRecordId = nextId;
    if (nextId) {
      this.setupRuns.attach(nextId);
      this.coordinator.attachView(nextId);
    }
  }

  private persistActiveDraft(): void {
    const record = this.activeRecord();
    if (!record) return;
    this.persistDraftFor(record.id);
  }

  private persistDraftFor(
    recordId: string,
    overrides: Partial<{
      selectedIds: readonly string[];
      ownerDecision: 'match' | 'raise' | null;
      previews: ReturnType<StackSkillStore['preview']>;
      approvedIds: readonly string[];
      installCompleted: boolean;
    }> = {},
  ): void {
    const root = this.launcher.workspaceRoot();
    if (!root) return;
    const files = this.attachments.files();
    const images = this.attachments.images();
    this.coordinator.saveDraft(recordId, {
      workspacePath: root,
      intent: this.intent(),
      selectedIds: overrides.selectedIds ?? [...this.state.selectedIds()],
      ownerDecision:
        overrides.ownerDecision !== undefined
          ? overrides.ownerDecision
          : this.state.ownerDecision(),
      guidanceAnalysis: this.guidanceAnalysis,
      guidanceFacts: this.state.guidanceFacts(),
      ownerDecisionPrompt: this.state.ownerDecisionPrompt(),
      guidanceNote: this.state.guidanceNote(),
      previews: overrides.previews ?? this.state.preview(),
      approvedIds: overrides.approvedIds ?? [...this.state.approvedIds()],
      attachmentFiles: files,
      attachmentImages: images,
      hadAttachments:
        files.length > 0 || images.length > 0 || this.missingAttachments(),
      guidanceLoaded: this.hasLoadedGuidanceFor(recordId),
      ...(overrides.installCompleted !== undefined
        ? { installCompleted: overrides.installCompleted }
        : {}),
    });
  }

  private hasLoadedGuidanceFor(recordId: string | null): boolean {
    const current = this.guidanceLoadedFor();
    if (!current.loaded) return false;
    return recordId === null || current.recordId === recordId;
  }

  private resetRecordViewState(): void {
    this.requestVersion++;
    this.searchVersion++;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.state.reset();
    this.attachments.restore([], []);
    this.attachments.clear();
    this.hadLocalAttachmentsForRecord = false;
    this.guidanceLoadedFor.set({ loaded: false, recordId: null });
    this.guidanceAnalysis = { projectType: 'unknown', frameworks: [] };
    this.loadErrorState.set(false);
    this.skillsInstalledState.set(false);
    this.missingAttachments.set(false);
    this.ownerDecisionError.set(false);
    this.touched.set(false);
    this.submitted.set(false);
  }

  private hydrateFromRecord(record: SetupRunRecord | null): void {
    if (!record) {
      if (this.hydratedRecordId !== null) {
        this.hydratedRecordId = null;
        this.resetRecordViewState();
      }
      return;
    }
    const switchedRecord = this.hydratedRecordId !== record.id;
    if (switchedRecord) {
      this.resetRecordViewState();
      this.hydratedRecordId = record.id;
    }
    const savedIntent = record.teamBuilder?.intent ?? '';
    if (switchedRecord || (savedIntent && !this.state.intent())) {
      this.state.setIntent(savedIntent);
    }
    const savedInstalled = record.teamBuilder?.installed ?? [];
    if (switchedRecord || savedInstalled.length > 0) {
      this.state.setInstalled([...savedInstalled]);
    }
    const draft = this.coordinator.draftFor(record.id);
    const recovery = this.coordinator.recoveryFor(record);
    if (switchedRecord) {
      this.state.setSelectedIds(new Set(recovery.selectedIds));
      this.state.setOwnerDecision(recovery.ownerDecision);
      const hasAvailableAttachments = Boolean(
        draft &&
          (draft.attachmentFiles.length > 0 ||
            draft.attachmentImages.length > 0),
      );
      if (draft) {
        this.guidanceLoadedFor.set({
          loaded: draft.guidanceLoaded,
          recordId: draft.guidanceLoaded ? record.id : null,
        });
        this.guidanceAnalysis = {
          projectType: draft.guidanceAnalysis.projectType,
          frameworks: [...draft.guidanceAnalysis.frameworks],
        };
        this.state.setGuidanceFacts([...draft.guidanceFacts]);
        this.state.setOwnerDecisionPrompt(draft.ownerDecisionPrompt);
        this.state.setGuidanceNote(draft.guidanceNote);
        this.attachments.restore(
          [...draft.attachmentFiles],
          [...draft.attachmentImages],
        );
        this.hadLocalAttachmentsForRecord = hasAvailableAttachments;
      } else {
        this.guidanceLoadedFor.set({ loaded: false, recordId: null });
        this.hadLocalAttachmentsForRecord = false;
      }
      this.missingAttachments.set(
        recovery.hadAttachments &&
          !hasAvailableAttachments &&
          record.status !== 'completed' &&
          record.status !== 'cancelled',
      );
    }
    if (record.status === 'failed') {
      this.state.setStage('review');
      this.state.setError(record.error ?? null);
      this.skillsInstalledState.set(recovery.installCompleted);
      if (switchedRecord) {
        if (recovery.installCompleted) {
          if (!this.hasLoadedGuidanceFor(record.id) && !this.state.loading()) {
            void this.loadReview({
              preserveSelection: true,
              preserveError: true,
              recordId: record.id,
            });
          }
        } else if (
          !this.state.loading() &&
          this.state.recommendations().length === 0
        ) {
          void this.loadReview({
            preserveSelection: true,
            preserveError: true,
            recordId: record.id,
          });
        }
      }
      return;
    }
    if (record.status === 'interrupted') {
      this.state.setStage('review');
      this.state.setError(null);
      this.skillsInstalledState.set(recovery.installCompleted);
      return;
    }
    if (record.status === 'cancelled') {
      this.state.setStage('intent');
      this.state.setError(null);
      this.skillsInstalledState.set(false);
      this.missingAttachments.set(false);
      return;
    }
    if (record.status === 'needs-input' && switchedRecord) {
      this.skillsInstalledState.set(recovery.installCompleted);
      if (record.step === 'intent') {
        this.state.setStage('intent');
      } else if (record.step === 'consent') {
        if (recovery.installCompleted) {
          this.state.setStage('review');
          if (!this.hasLoadedGuidanceFor(record.id) && !this.state.loading()) {
            void this.loadReview({
              preserveSelection: true,
              recordId: record.id,
            });
          }
        } else if (recovery.selectedIds.length > 0) {
          this.state.setStage('review');
          void this.rehydrateConsent(record.id);
        } else {
          this.state.setStage('review');
          if (
            !this.state.loading() &&
            this.state.recommendations().length === 0
          ) {
            void this.loadReview({
              preserveSelection: true,
              recordId: record.id,
            });
          }
        }
      } else if (record.step === 'review') {
        this.state.setStage('review');
        if (recovery.installCompleted) {
          if (!this.hasLoadedGuidanceFor(record.id) && !this.state.loading()) {
            void this.loadReview({
              preserveSelection: true,
              recordId: record.id,
            });
          }
        } else if (
          !this.state.loading() &&
          this.state.recommendations().length === 0
        ) {
          void this.loadReview({
            preserveSelection: true,
            recordId: record.id,
          });
        }
      }
    }
  }
}
