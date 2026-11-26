import {
  computed,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ElectronLayoutService, VSCodeService } from '@ptah-extension/core';
import {
  SetupWizardStateService,
  WizardAnalysisRunner,
} from '@ptah-extension/setup-wizard';
import { combineLatest, firstValueFrom, timeout } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AnalysisStepStore } from '../analyze/analysis-step.store';

function resolveOptionalAnalysisRunner(
  injector: Injector,
): WizardAnalysisRunner | null {
  try {
    return injector.get(WizardAnalysisRunner, null);
  } catch {
    // degradation-audit: optional-capability - Workspace switches reset wizard state when runner is unavailable in isolated harnesses.
    return null;
  }
}

/** The onboarding entry screens' view of the Electron workspace selector. */
@Injectable({ providedIn: 'root' })
export class OnboardingWorkspaceStore {
  private readonly layout = inject(ElectronLayoutService);
  private readonly vscode = inject(VSCodeService);
  private readonly analysis = inject(AnalysisStepStore);
  private readonly wizard = inject(SetupWizardStateService);
  private readonly injector = inject(Injector);
  private readonly runner = resolveOptionalAnalysisRunner(this.injector);
  private readonly switching = signal(false);
  readonly folderError = signal<string | null>(null);
  readonly isElectron = this.vscode.config().isElectron;
  readonly folders = computed(() =>
    this.isElectron ? this.layout.workspaceFolders() : [],
  );
  readonly active = computed(() =>
    this.isElectron ? this.layout.activeWorkspace() : null,
  );
  readonly activeIndex = computed(() =>
    this.isElectron ? this.layout.activeWorkspaceIndex() : -1,
  );
  readonly activePath = computed(() =>
    this.isElectron
      ? (this.active()?.path ?? null)
      : (this.vscode.config().workspaceRoot ?? null),
  );
  readonly readyForActivePath = computed(
    () =>
      !this.isElectron ||
      (this.layout.workspaceResolved() &&
        !this.layout.workspaceSwitchPending()),
  );
  readonly canSwitch = computed(
    () => this.isElectron && this.readyForActivePath() && !this.switching(),
  );

  constructor() {
    let previous = this.activePath();
    this.analysis.setWorkspacePath?.(previous);
    this.runner?.setCurrentWorkspacePath?.(previous);
    effect(() => {
      const path = this.activePath();
      untracked(() => {
        this.analysis.setWorkspacePath?.(path);
        this.runner?.setCurrentWorkspacePath?.(path);
        if (path !== previous) {
          const prior = previous;
          previous = path;
          this.analysis.resetForWorkspace();
          if (!this.hasLiveAnalysis(prior, path)) {
            if (!this.runner?.isRunning() && !this.runner?.isCanceling()) {
              this.wizard.reset();
              this.runner?.reset?.();
            }
          }
        }
      });
    });
  }

  private hasLiveAnalysis(
    priorPath: string | null,
    nextPath: string | null,
  ): boolean {
    if (!this.runner) return false;
    if (typeof this.runner.isRunningForWorkspace === 'function') {
      return (
        this.runner.isRunningForWorkspace(priorPath) ||
        this.runner.isRunningForWorkspace(nextPath)
      );
    }
    return this.runner.isRunning() || this.runner.isCanceling();
  }

  switchTo(index: number): void {
    if (!this.canSwitch() || !this.folders()[index]) return;
    this.layout.switchWorkspace(index);
  }

  async openFolder(): Promise<void> {
    await this.pickFolder('open');
  }

  async createFolder(): Promise<void> {
    await this.pickFolder('create');
  }

  private async pickFolder(mode: 'open' | 'create'): Promise<void> {
    if (!this.canSwitch()) return;
    this.folderError.set(null);
    this.switching.set(true);
    try {
      const result = await this.layout.addFolder(mode);
      if (result === 'failed') {
        this.folderError.set('Could not open a folder. Please try again.');
      } else if (result === 'added') {
        const chosenPath = this.activePath();
        if (!this.readyForActivePath())
          await firstValueFrom(
            combineLatest([
              toObservable(this.readyForActivePath, {
                injector: this.injector,
              }),
              toObservable(this.activePath, { injector: this.injector }),
            ]).pipe(
              filter(([ready, path]) => ready || path !== chosenPath),
              timeout({ first: 35_000 }),
            ),
          );
        if (this.activePath() !== chosenPath)
          this.folderError.set(
            'Could not switch to that folder. Please try again.',
          );
      }
    } catch {
      // degradation-audit: reported — the header shows a retryable folder error.
      this.folderError.set('Could not open a folder. Please try again.');
    } finally {
      this.switching.set(false);
    }
  }
}
