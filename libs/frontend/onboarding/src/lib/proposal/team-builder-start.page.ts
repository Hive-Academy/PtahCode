import {
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
import { ClaudeRpcService } from '@ptah-extension/core';
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
import { TeamBuilderSkillStore } from './team-builder-skill.store';
import { TeamBuilderSkillReviewComponent } from './team-builder-skill-review.component';
import { TeamBuilderSkillConsentComponent } from './team-builder-skill-consent.component';
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
    TeamBuilderSkillReviewComponent,
    TeamBuilderSkillConsentComponent,
  ],
  providers: [ComposerAttachmentsService, TeamBuilderSkillStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-builder-start.page.html',
})
export class TeamBuilderStartPage {
  protected readonly icons = { users: Users };
  readonly attachments = inject(ComposerAttachmentsService);
  protected readonly launcher = inject(HarnessChatLauncherService);
  private readonly router = inject(Router);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = inject(TeamBuilderSkillStore);
  /** Cancels a pending launch when the user leaves this page. */
  private launch: AbortController | null = null;
  readonly intent = this.state.intent;
  readonly touched = signal(false);
  readonly submitted = signal(false);
  readonly starting = computed(
    () =>
      this.state.stage() === 'installing' || this.state.stage() === 'launching',
  );
  readonly actionError = this.state.error;
  readonly invalid = computed(
    () => (this.submitted() || this.touched()) && !this.intent().trim(),
  );
  readonly searching = this.state.searching;
  readonly searchError = this.state.searchError;
  readonly ownerDecisionRequired = computed(() =>
    this.state.guidanceFacts().some((fact) => fact.label !== 'follow'),
  );
  readonly ownerDecisionError = signal(false);
  private requestVersion = 0;
  private searchVersion = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private returnFocus: HTMLElement | null = null;
  private workspace = '';
  private guidanceAnalysis: DeepProjectAnalysis = { projectType: 'unknown', frameworks: [] };

  constructor() {
    effect(() => {
      const root = this.launcher.workspaceRoot();
      if (this.workspace && this.workspace !== root) {
        this.requestVersion++;
        this.searchVersion++;
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.launch?.abort();
        this.state.reset();
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
    });
  }

  async submit(event: Event): Promise<void> {
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
      this.actionError.set('Open a workspace to find skills.');
      return;
    }
    this.state.stage.set('review');
    await this.loadReview();
  }

  async loadReview(): Promise<void> {
    const version = ++this.requestVersion;
    this.searchVersion++;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const root = this.launcher.workspaceRoot();
    this.state.loading.set(true);
    this.searching.set(false);
    this.actionError.set(null);
    this.state.recommendations.set([]);
    this.state.selectedIds.set(new Set());
    this.state.ownerDecision.set(null);
    this.state.guidanceFacts.set([]);
    this.state.searchResults.set([]);
    this.state.ownerDecisionPrompt.set('');
    this.state.guidanceNote.set('');
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
                  .filter((value) => Boolean(value) && value !== '(not detected)')
              : [],
          };
        } else
          this.state.guidanceNote.set(
            'Could not load stored project analysis. Guidance is limited.',
          );
      } else if (listed.isSuccess()) {
        this.state.guidanceNote.set(
          'No stored project analysis. Guidance is limited.',
        );
      } else
        this.state.guidanceNote.set(
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
        this.actionError.set(
          this.rpcMessage(recommended, 'Could not load skill recommendations.'),
        );
        return;
      }
      this.state.recommendations.set(recommended.data.skills);
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
        this.state.guidanceFacts.set(guidance.data.facts);
        this.state.ownerDecisionPrompt.set(guidance.data.ownerDecisionPrompt);
      } else {
        this.state.guidanceFacts.set([]);
        this.state.guidanceNote.set('Could not load project guidance.');
      }
    } catch {
      if (version === this.requestVersion)
        this.actionError.set('Could not load skill recommendations.');
    } finally {
      if (version === this.requestVersion) this.state.loading.set(false);
    }
  }

  search(query: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const version = ++this.searchVersion;
    this.state.searchQuery.set(query);
    this.state.searchResults.set([]);
    this.searchError.set(null);
    if (!query) {
      this.state.searchResults.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
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
          this.searchError.set(
            this.rpcMessage(result, 'Could not search skills.'),
          );
          return;
        }
        this.state.searchResults.set(result.data.skills);
      } catch {
        if (version === this.searchVersion)
          this.searchError.set('Could not search skills.');
      } finally {
        if (version === this.searchVersion) this.searching.set(false);
      }
    }, 300);
  }

  async reviewSelection(): Promise<void> {
    if (this.blockForOwnerDecision()) return;
    if (
      !this.state.selectedIds().size ||
      this.state.loading() ||
      this.starting()
    )
      return;
    this.returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const version = ++this.requestVersion;
    const root = this.launcher.workspaceRoot();
    this.state.loading.set(true);
    this.actionError.set(null);
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
        this.actionError.set(
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
      this.state.preview.set(result.data.skills);
      this.state.approvedIds.set(new Set());
      this.state.stage.set('consent');
    } catch {
      if (version === this.requestVersion)
        this.actionError.set('Could not preview skills.');
    } finally {
      if (version === this.requestVersion) this.state.loading.set(false);
    }
  }

  closeConsent(): void {
    if (this.starting()) return;
    this.state.stage.set('review');
    this.actionError.set(null);
    queueMicrotask(() => this.returnFocus?.focus());
  }

  async install(): Promise<void> {
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
    this.state.stage.set('installing');
    this.actionError.set(null);
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
        this.state.stage.set('review');
        this.actionError.set(
          this.rpcMessage(result, 'Could not install skills.'),
        );
        return;
      }
      this.state.installed.set(result.data.installed);
      if (!result.data.success) {
        this.state.stage.set('review');
        const failed = result.data.failedSkill
          ? `Failed: ${result.data.failedSkill}. `
          : 'Some skills could not be installed. ';
        const reason = result.data.reason ? `${result.data.reason} ` : '';
        const installed = result.data.installed.length
          ? `Installed: ${result.data.installed.join(', ')}. `
          : '';
        this.actionError.set(
          `${failed}${reason}${installed}Review the skills and try again.`,
        );
        queueMicrotask(() => this.returnFocus?.focus());
        return;
      }
      await this.launchChat(true);
    } catch {
      if (version === this.requestVersion) {
        this.state.stage.set('review');
        this.actionError.set(
          'Could not install skills. Review the skills and try again.',
        );
        queueMicrotask(() => this.returnFocus?.focus());
      }
    }
  }

  async launchChat(fromInstall = false): Promise<void> {
    if (this.state.loading() || this.blockForOwnerDecision()) {
      if (fromInstall) this.state.stage.set('review');
      return;
    }
    if (this.state.stage() === 'launching' || (this.starting() && !fromInstall)) {
      if (fromInstall) this.state.stage.set('review');
      return;
    }
    this.requestVersion++;
    this.searchVersion++;
    this.state.loading.set(false);
    this.searching.set(false);
    this.state.stage.set('launching');
    this.actionError.set(null);
    const launch = new AbortController();
    this.launch = launch;
    const snapshot = this.attachments.snapshotForSend();
    try {
      const ownerDecision = this.state.ownerDecision();
      if (ownerDecision) {
        try {
          const recorded = await this.rpc.call('wizard:get-project-guidance', {
            analysis: this.guidanceAnalysis,
            ownerDecision,
          });
          if (!recorded.isSuccess() || !recorded.data.recordPath)
            this.state.guidanceNote.set('Guidance record was not written.');
        } catch {
          this.state.guidanceNote.set('Guidance record was not written.');
        }
      }
      if (launch.signal.aborted || this.destroyRef.destroyed) return;
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
    } catch (cause) {
      if (cause instanceof HarnessChatLaunchCancelledError) return;
      if (this.launch === launch && !this.destroyRef.destroyed) {
        this.actionError.set('Could not start the team builder. Try again.');
        this.state.stage.set('review');
      }
    } finally {
      if (this.launch === launch) this.launch = null;
    }
  }

  backToIntent(): void {
    if (this.starting()) return;
    this.requestVersion++;
    this.searchVersion++;
    this.state.loading.set(false);
    this.searching.set(false);
    this.state.stage.set('intent');
    this.actionError.set(null);
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

  async back(): Promise<void> {
    if (this.state.stage() === 'installing') return;
    this.requestVersion++;
    this.searchVersion++;
    this.launch?.abort();
    this.launch = null;
    this.state.stage.set('intent');
    this.actionError.set(null);
    await this.router.navigate(['/onboarding']);
  }
}
