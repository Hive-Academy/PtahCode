import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  MultiPhaseAnalysisResponse,
  SavedAnalysisMetadata,
} from '@ptah-extension/shared';
import {
  SetupWizardStateService,
  WizardAnalysisRunner,
  WizardRpcService,
} from '@ptah-extension/setup-wizard';

export type PhaseStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export interface PhaseRow {
  readonly id: string;
  readonly label: string;
  readonly status: PhaseStatus;
  readonly durationMs?: number;
}
export interface StreamCounts {
  readonly total: number;
  readonly text: number;
  readonly thinking: number;
  readonly tool: number;
  readonly errors: number;
}

const phaseLabels: Readonly<Record<string, string>> = {
  'project-profile': 'Project profile',
  'architecture-assessment': 'Architecture assessment',
  'quality-audit': 'Quality audit',
  'elevation-plan': 'Elevation plan',
};
const phaseStatuses: readonly PhaseStatus[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
];

@Injectable({ providedIn: 'root' })
export class AnalysisStepStore {
  private readonly rpc = inject(WizardRpcService);
  private readonly wizard = inject(SetupWizardStateService);
  private readonly runner = inject(WizardAnalysisRunner);
  private readonly savedValue = signal<readonly SavedAnalysisMetadata[]>([]);
  private readonly hiddenValue = signal<ReadonlySet<string>>(new Set());
  private readonly selectedValue = signal<string | null>(null);
  private readonly loadedValue = signal<MultiPhaseAnalysisResponse | null>(
    null,
  );
  private readonly attachedValue = signal(false);
  private workspaceRevision = 0;
  private selectionRevision = 0;
  readonly saved = this.savedValue.asReadonly();
  readonly hidden = this.hiddenValue.asReadonly();
  readonly selected = this.selectedValue.asReadonly();
  readonly loaded = computed(() =>
    this.selectedValue() ? this.loadedValue() : this.completedLiveResult(),
  );
  readonly phaseRows = computed<readonly PhaseRow[]>(() => {
    const result = this.loaded();
    const phases = result?.manifest.phases;
    const live = this.selectedValue() ? [] : this.wizard.phaseStatuses();
    const ids = phases ? Object.keys(phases) : live.map((phase) => phase.id);
    return ids.map((id) => {
      const raw =
        live.find((phase) => phase.id === id)?.status ??
        phases?.[id]?.status ??
        'pending';
      const status: PhaseStatus = phaseStatuses.includes(raw as PhaseStatus)
        ? (raw as PhaseStatus)
        : 'pending';
      return {
        id,
        label: phaseLabels[id] ?? id.replaceAll('-', ' '),
        status,
        ...(result && phases?.[id]
          ? { durationMs: phases[id].durationMs }
          : {}),
      };
    });
  });
  readonly phaseHeader = computed(() => {
    if (
      !this.attachedValue() ||
      !this.runner.isRunning() ||
      this.selectedValue()
    )
      return null;
    const current = this.wizard.currentPhaseNumber();
    const total = this.wizard.totalPhaseCount();
    return current !== null && total !== null ? { current, total } : null;
  });
  readonly streamCounts = computed<StreamCounts | null>(() => {
    if (
      !this.attachedValue() ||
      !this.runner.isRunning() ||
      this.selectedValue()
    )
      return null;
    const events = this.wizard.analysisStream();
    return {
      total: events.length,
      text: events.filter((event) => event.kind === 'text').length,
      thinking: events.filter((event) => event.kind === 'thinking').length,
      tool: events.filter((event) => event.kind.startsWith('tool_')).length,
      errors: events.filter((event) => event.kind === 'error' || event.isError)
        .length,
    };
  });

  private completedLiveResult(): MultiPhaseAnalysisResponse | null {
    const result = this.wizard.multiPhaseResult();
    return result?.manifest.lifecycle === 'completed' ? result : null;
  }

  async listAnalyses(): Promise<void> {
    const revision = this.workspaceRevision;
    const saved = await this.rpc.listAnalyses({ throwOnError: true });
    if (revision === this.workspaceRevision) this.savedValue.set(saved);
  }
  attachStream(): void {
    this.attachedValue.set(true);
  }
  detachStream(): void {
    this.attachedValue.set(false);
  }
  hideAnalysis(filename: string): void {
    this.hiddenValue.update((current) => new Set([...current, filename]));
  }
  async selectAnalysis(
    filename: string,
  ): Promise<'loaded' | 'not-found' | 'failed'> {
    if (!this.savedValue().some((item) => item.filename === filename))
      return 'not-found';
    const revision = this.workspaceRevision;
    const selectionRevision = ++this.selectionRevision;
    try {
      const result = await this.rpc.loadAnalysis(filename);
      if (revision !== this.workspaceRevision || selectionRevision !== this.selectionRevision) return 'not-found';
      if (result.manifest.lifecycle !== 'completed') return 'not-found';
      this.selectedValue.set(filename);
      this.loadedValue.set(result);
      return 'loaded';
    } catch {
      // degradation-audit: reported — callers map failed to the saved-analysis retry message.
      return 'failed';
    }
  }
  async useAnalysis(slug: string): Promise<'loaded' | 'not-found' | 'failed'> {
    if (!slug || slug.includes('/') || slug.includes('\\')) return 'not-found';
    const revision = this.workspaceRevision;
    const selectionRevision = ++this.selectionRevision;
    try {
      const result = await this.rpc.loadAnalysis(slug);
      if (revision !== this.workspaceRevision || selectionRevision !== this.selectionRevision) return 'not-found';
      if (result.manifest.lifecycle !== 'completed') return 'not-found';
      this.selectedValue.set(slug);
      this.loadedValue.set(result);
      return 'loaded';
    } catch {
      // degradation-audit: reported — the card presents a retryable load failure.
      return 'failed';
    }
  }
  resetForWorkspace(): void {
    this.workspaceRevision++;
    this.selectionRevision++;
    this.savedValue.set([]);
    this.hiddenValue.set(new Set());
    this.selectedValue.set(null);
    this.loadedValue.set(null);
    this.attachedValue.set(false);
  }
  clearSelection(): void {
    this.selectionRevision++;
    this.selectedValue.set(null);
    this.loadedValue.set(null);
  }
}


