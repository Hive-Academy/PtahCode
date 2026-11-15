import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppStateManager, ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import { OnboardingFlagService } from '../first-run/onboarding-flag.service';
import { OnboardingStepperComponent, type OnboardingStep } from '../shared/onboarding-stepper.component';

const STEPS: readonly OnboardingStep[] = [
  { id: 'analyze', label: 'Analyze', state: 'completed' },
  { id: 'skills', label: 'Review skills', state: 'completed' },
  { id: 'guidance', label: 'Project guidance', state: 'completed' },
  { id: 'done', label: 'Done', state: 'current-complete' },
];

@Component({
  selector: 'ptah-analyze-done-page',
  standalone: true,
  imports: [OnboardingStepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-[760px] space-y-4 p-4" aria-labelledby="analyze-done-title" data-testid="analyze-done-page">
      <h1 id="analyze-done-title" class="text-2xl font-semibold">Setup complete</h1>
      <p>Review skills and project guidance whenever your project changes.</p>
      <ptah-onboarding-stepper [steps]="steps" />
      <section class="rounded-[22px] border border-base-300 p-4" data-testid="done-skills">
        <h2 class="font-semibold">Project skills</h2>
        @if (skillsLoading()) { <p role="status">Loading workspace skills…</p> }
        @else if (skillsError()) { <p role="alert">Could not read workspace skills.</p> }
        @else if (skills().length) {
          <ul class="list-inside list-disc">@for (skill of skills(); track skill.slug) { <li>{{ skill.name }}</li> }</ul>
        } @else { <p>No workspace skills are available yet. You can review recommendations again.</p> }
        <button class="link" type="button" (click)="reviewSkills()">Review skills</button>
      </section>
      <section class="rounded-[22px] border border-base-300 p-4" data-testid="done-guidance">
        <h2 class="font-semibold">Project guidance</h2>
        <p>{{ guidanceStatus() }}</p>
      </section>
      <nav class="flex flex-wrap gap-2" aria-label="Next steps">
        <button class="btn btn-primary" type="button" (click)="openChat()">Open chat</button>
        <button class="btn" type="button" (click)="runAgain()">Run setup again</button>
      </nav>
    </section>
  `,
})
export class AnalyzeDonePage implements OnInit {
  protected readonly steps = STEPS;
  protected readonly skills = signal<readonly { slug: string; name: string }[]>([]);
  protected readonly skillsLoading = signal(true);
  protected readonly skillsError = signal(false);
  protected readonly guidanceStatus = signal('Loading project guidance…');
  private readonly rpc = inject(ClaudeRpcService);
  private readonly wizard = inject(WizardRpcService);
  private readonly tabs = inject(TabManagerService);
  private readonly vscode = inject(VSCodeService);
  private readonly appState = inject(AppStateManager);
  private readonly flags = inject(OnboardingFlagService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.flags.markCompleted();
    void this.loadFacts();
  }

  private async loadFacts(): Promise<void> {
    const root = this.tabs.activeWorkspacePath || this.vscode.config().workspaceRoot;
    try {
      const response = await this.rpc.call('harness:get-skill-selection', {});
      if (this.destroyRef.destroyed) return;
      if (!response.isSuccess()) throw new Error('Unavailable');
      this.skills.set(response.data.available);
    } catch {
      if (!this.destroyRef.destroyed) this.skillsError.set(true);
    } finally {
      if (!this.destroyRef.destroyed) this.skillsLoading.set(false);
    }
    if (!root) { this.guidanceStatus.set('No workspace selected.'); return; }
    try {
      const response = await this.wizard.getEnhancedPromptsStatus(root);
      if (!this.destroyRef.destroyed) this.guidanceStatus.set(response.error ? 'Could not read project guidance.' : response.enabled ? 'On' : 'Off');
    } catch {
      if (!this.destroyRef.destroyed) this.guidanceStatus.set('Could not read project guidance.');
    }
  }

  protected openChat(): void {
    this.vscode.postMessage({ type: MESSAGE_TYPES.SETUP_WIZARD_COMPLETE });
    this.appState.setCurrentView('chat');
  }
  protected async reviewSkills(): Promise<void> {
    await this.router.navigate(['/onboarding/analyze/skills'], { queryParams: { analysis: this.route.snapshot.queryParamMap.get('analysis') } });
  }
  protected async runAgain(): Promise<void> { await this.router.navigate(['/onboarding/analyze']); }
}
