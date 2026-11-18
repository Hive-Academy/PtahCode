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
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Users } from 'lucide-angular';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import type { DeepProjectAnalysis } from '@ptah-extension/shared';
import {
  AttachmentTrayComponent,
  ComposerAttachmentsService,
} from '@ptah-extension/chat';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
} from '../launcher/harness-chat-launcher.service';
import { WorkspaceHeaderComponent } from '../shell/workspace-header.component';
import {
  PtahButtonDirective,
  PtahFieldComponent,
  PtahTextareaDirective,
} from '@ptah-extension/ui';
import { StackSkillStore } from './stack-skill.store';
import { StackSkillReviewComponent } from './stack-skill-review.component';
import { StackSkillConsentComponent } from './stack-skill-consent.component';
import { teamBuilderGuidanceBrief } from './team-builder-guidance-brief';

@Component({
  selector: 'ptah-team-builder-start-page',
  standalone: true,
  imports: [
    FormsModule,
    AttachmentTrayComponent,
    WorkspaceHeaderComponent,
    LucideAngularModule,
    PtahButtonDirective,
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
  protected readonly icons = { users: Users };
  public readonly attachments = inject(ComposerAttachmentsService);
  protected readonly launcher = inject(HarnessChatLauncherService);
  private readonly router = inject(Router);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly state = inject(StackSkillStore);
  /** Cancels a pending launch when the user leaves this page. */
  private launch: AbortController | null = null;
  private readonly injector = inject(Injector);
  private readonly recoveryContinue =
    viewChild<ElementRef<HTMLButtonElement>>('recoveryContinue');
  public readonly intent = this.state.intent;
  public readonly touched = signal(false);
  public readonly submitted = signal(false);
  public readonly launched = signal(false);
  public readonly starting = computed(
    () =>
      this.state.stage() === 'installing' || this.state.stage() === 'launching',
  );
  public readonly actionError = this.state.error;
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
  private guidanceAnalysis: DeepProjectAnalysis = {
    projectType: 'unknown',
    frameworks: [],
  };

  public constructor() {
    effect(() => {
      const root = this.launcher.workspaceRoot();
      if (this.workspace && this.workspace !== root) {
        this.requestVersion++;
        this.searchVersion++;
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.launch?.abort();
        this.state.reset();
        this.skillsInstalledState.set(false);
        this.ownerDecisionError.set(false);
        this.touched.set(false);
        this.submitted.set(false);
      }
      this.workspace = root;
    });
    this.destroyRef.onDestroy(() => {
      this.requestVersion++;
      this.searchVersion++;
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.launch?.abort();
      this.state.reset();
      this.skillsInstalledState.set(false);
    });
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
    this.state.setStage('review');
    await this.loadReview();
  }

  private readonly loadErrorState = signal(false);
  public readonly loadError = this.loadErrorState.asReadonly();
  private readonly skillsInstalledState = signal(false);
  public readonly skillsInstalled = this.skillsInstalledState.asReadonly();
  public readonly launchStatus = computed(() =>
    this.launched()
      ? 'Chat opened. Use Back to leave this page.'
      : 'Launching chat…',
  );

  public async loadReview(): Promise<void> {
    this.skillsInstalledState.set(false);
    this.loadErrorState.set(true);
    const version = ++this.requestVersion;
    this.searchVersion++;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const root = this.launcher.workspaceRoot();
    this.state.setPreviewing(false);
    this.state.setPreview([]);
    this.state.setLoading(true);
    this.state.setSearching(false);
    this.state.setError(null);
    this.state.setRecommendations([]);
    this.state.setSelectedIds(new Set());
    this.state.setOwnerDecision(null);
    this.state.setGuidanceFacts([]);
    this.state.setSearchResults([]);
    this.state.setOwnerDecisionPrompt('');
    this.state.setGuidanceNote('');
    this.guidanceAnalysis = { projectType: 'unknown', frameworks: [] };
    try {
      let analysis: DeepProjectAnalysis = {
        projectType: 'unknown',
        frameworks: [],
      };
      const listed = await this.rpc.call('wizard:list-analyses', {});
      if (
        version !== this.requestVersion ||
        root !== this.launcher.workspaceRoot()
      )
        return;
      if (listed.isSuccess() && listed.data.analyses.length) {
        const newest = [...listed.data.analyses].sort((a, b) =>
          b.savedAt.localeCompare(a.savedAt),
        )[0];
        const loaded = await this.rpc.call('wizard:load-analysis', {
          filename: newest.filename,
        });
        if (
          version !== this.requestVersion ||
          root !== this.launcher.workspaceRoot()
        )
          return;
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
      if (
        version !== this.requestVersion ||
        root !== this.launcher.workspaceRoot()
      )
        return;
      if (!recommended.isSuccess()) {
        this.state.setError(
          this.rpcMessage(recommended, 'Could not load skill recommendations.'),
        );
        return;
      }
      this.loadErrorState.set(false);
      this.state.setRecommendations(recommended.data.skills);
      const guidance = await this.rpc.call('wizard:get-project-guidance', {
        analysis,
      });
      if (
        version !== this.requestVersion ||
        root !== this.launcher.workspaceRoot()
      )
        return;
      this.guidanceAnalysis = analysis;
      if (guidance.isSuccess()) {
        this.state.setGuidanceFacts(guidance.data.facts);
        this.state.setOwnerDecisionPrompt(guidance.data.ownerDecisionPrompt);
      } else {
        this.state.setGuidanceFacts([]);
        this.state.setGuidanceNote('Could not load project guidance.');
      }
    } catch {
      if (version === this.requestVersion)
        this.state.setError('Could not load skill recommendations.');
    } finally {
      if (version === this.requestVersion) this.state.setLoading(false);
    }
  }

  public search(query: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
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
    this.searchTimer = setTimeout(async () => {
      try {
        const result = await this.rpc.call('wizard:search-skills', { query });
        if (
          version !== this.searchVersion ||
          root !== this.launcher.workspaceRoot()
        )
          return;
        if (!result.isSuccess()) {
          this.state.setSearchError(
            this.rpcMessage(result, 'Could not search skills.'),
          );
          return;
        }
        this.state.setSearchResults(result.data.skills);
      } catch {
        if (version === this.searchVersion)
          this.state.setSearchError('Could not search skills.');
      } finally {
        if (version === this.searchVersion) this.state.setSearching(false);
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
    const version = ++this.requestVersion;
    const root = this.launcher.workspaceRoot();
    this.loadErrorState.set(false);
    this.state.setPreviewing(true);
    this.state.setError(null);
    try {
      const result = await this.rpc.call('wizard:preview-skills-for-consent', {
        skills: [...this.state.selectedIds()],
      });
      if (
        version !== this.requestVersion ||
        root !== this.launcher.workspaceRoot()
      )
        return;
      if (!result.isSuccess()) {
        this.state.setError(
          this.rpcMessage(result, 'Could not preview skills.'),
        );
        return;
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
    } catch {
      if (version === this.requestVersion)
        this.state.setError('Could not preview skills.');
    } finally {
      if (version === this.requestVersion) this.state.setPreviewing(false);
    }
  }

  public closeConsent(): void {
    if (this.starting()) return;
    this.state.setStage('review');
    this.state.setError(null);
    queueMicrotask(() => this.returnFocus?.focus());
  }

  public async install(): Promise<void> {
    if (this.skillsInstalled()) return;
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
    this.state.setStage('installing');
    this.state.setError(null);
    const root = this.launcher.workspaceRoot();
    const version = ++this.requestVersion;
    try {
      const consentDate = new Date().toISOString();
      const consentRecords = previews
        .filter((item) => item.hasScripts)
        .map((item) => ({
          skillName: item.skillName,
          contentHash: item.contentHash,
          consentDate,
        }));
      const result = await this.rpc.call('wizard:install-skills-with-consent', {
        skills: previews.map((item) => item.skillName),
        consentRecords,
      });
      if (
        version !== this.requestVersion ||
        root !== this.launcher.workspaceRoot()
      )
        return;
      if (!result.isSuccess()) {
        this.state.setStage('review');
        this.state.setError(
          this.rpcMessage(result, 'Could not install skills.'),
        );
        return;
      }
      this.state.setInstalled(result.data.installed);
      if (!result.data.success) {
        this.state.setStage('review');
        const failed = result.data.failedSkill
          ? `Failed: ${result.data.failedSkill}. `
          : 'Some skills could not be installed. ';
        const reason = result.data.reason ? `${result.data.reason} ` : '';
        const installed = result.data.installed.length
          ? `Installed: ${result.data.installed.join(', ')}. `
          : '';
        this.state.setError(
          `${failed}${reason}${installed}Review the skills and try again.`,
        );
        queueMicrotask(() => this.returnFocus?.focus());
        return;
      }
      this.skillsInstalledState.set(true);
      await this.launchChat(true);
    } catch {
      if (version === this.requestVersion) {
        this.state.setStage('review');
        this.state.setError(
          'Could not install skills. Review the skills and try again.',
        );
        queueMicrotask(() => this.returnFocus?.focus());
      }
    }
  }

  public async launchChat(fromInstall = false): Promise<void> {
    if (this.state.loading() || this.blockForOwnerDecision()) {
      if (fromInstall) this.state.setStage('review');
      return;
    }
    if (
      this.state.stage() === 'launching' ||
      (this.starting() && !fromInstall)
    ) {
      if (fromInstall) this.state.setStage('review');
      return;
    }
    this.launched.set(false);
    this.requestVersion++;
    this.searchVersion++;
    this.state.setLoading(false);
    this.state.setPreviewing(false);
    this.state.setSearching(false);
    this.state.setStage('launching');
    this.state.setError(null);
    const launch = new AbortController();
    this.launch = launch;
    const root = this.launcher.workspaceRoot();
    const isActive = (): boolean =>
      this.launch === launch &&
      !launch.signal.aborted &&
      !this.destroyRef.destroyed &&
      root === this.launcher.workspaceRoot();
    const snapshot = this.attachments.snapshotForSend();
    try {
      const ownerDecision = this.state.ownerDecision();
      if (ownerDecision) {
        try {
          const recorded = await this.rpc.call('wizard:get-project-guidance', {
            analysis: this.guidanceAnalysis,
            ownerDecision,
          });
          if (
            isActive() &&
            (!recorded.isSuccess() || !recorded.data.recordPath)
          )
            this.state.setGuidanceNote('Guidance record was not written.');
        } catch (error: unknown) {
          // degradation-audit: reported - optional guidance persistence failure is shown for the active launch.
          this.logger.debug(
            'TeamBuilderStartPage',
            'Guidance record was not written.',
            { error: error instanceof Error ? error.message : String(error) },
          );
          if (isActive())
            this.state.setGuidanceNote('Guidance record was not written.');
        }
      }
      if (!isActive()) return;
      await this.launcher.launchTeamBuilder(
        teamBuilderGuidanceBrief(
          this.intent().trim(),
          this.state.guidanceFacts(),
          this.state.ownerDecision(),
        ),
        snapshot,
        {
          signal: launch.signal,
        },
      );
      if (isActive()) this.launched.set(true);
    } catch (cause: unknown) {
      // degradation-audit: optional-capability - Back cancels this launch without an error.
      if (cause instanceof HarnessChatLaunchCancelledError) return;
      if (isActive()) {
        this.state.setError(
          this.skillsInstalled()
            ? 'Skills are installed. Could not start the team builder. Try again.'
            : 'Could not start the team builder. Try again.',
        );
        this.state.setStage('review');
        if (this.skillsInstalled())
          afterNextRender(
            () => this.recoveryContinue()?.nativeElement.focus(),
            { injector: this.injector },
          );
      }
    } finally {
      if (this.launch === launch) this.launch = null;
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
    if (this.state.stage() === 'installing') return;
    this.launched.set(false);
    this.requestVersion++;
    this.searchVersion++;
    this.launch?.abort();
    this.launch = null;
    this.state.setStage('intent');
    this.state.setError(null);
    await this.router.navigate(['/onboarding']);
  }
}
