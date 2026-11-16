import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import { AnalysisStepStore } from './analysis-step.store';
import { AnalyzeSkillsPage } from './analyze-skills.page';

describe('AnalyzeSkillsPage', () => {
  const loaded = signal<{ manifest: { runId: string } } | null>({ manifest: { runId: 'run-1' } });
  const root = signal({ workspaceRoot: '/ws' });
  const call = jest.fn();
  beforeEach(() => {
    call.mockReset();
    call.mockResolvedValue({ isSuccess: () => true, data: {
      skills: [], detectedItems: [{ kind: 'framework', name: 'Angular', evidence: 'package.json', sourcePhase: 'project-profile' }],
      unmatchedItems: [], searchFailures: [], summarySource: 'structured',
    } });
    TestBed.configureTestingModule({ providers: [
      { provide: ClaudeRpcService, useValue: { call } },
      { provide: WizardRpcService, useValue: { getResumableRun: jest.fn() } },
      { provide: VSCodeService, useValue: { config: root } },
      { provide: AnalysisStepStore, useValue: { loaded, selected: signal('saved'), useAnalysis: jest.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ analysis: 'saved' }) }, queryParamMap: of(convertToParamMap({ analysis: 'saved' })) } },
      { provide: Router, useValue: { navigate: jest.fn() } },
      { provide: TabManagerService, useValue: { createTab: jest.fn(), setWorkflow: jest.fn() } },
    ] });
    TestBed.overrideComponent(AnalyzeSkillsPage, { set: { template: '' } });
  });
  it('loads recommendations for the completed run and drops responses after workspace change', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(call).toHaveBeenCalledWith('wizard:recommend-analysis-skills', { runId: 'run-1' }, { timeout: 75_000 });
    expect(fixture.componentInstance.summary()?.detectedItems[0].name).toBe('Angular');
    root.set({ workspaceRoot: '/other' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('shows the error when no analysis is loaded', async () => {
    loaded.set(null);
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.state.error()).toBe('Choose a completed analysis first.');
    expect(call).not.toHaveBeenCalled();
    loaded.set({ manifest: { runId: 'run-1' } });
  });

  it('restores the analysis directory for a resumed generation route', async () => {
    loaded.set(null);
    const useAnalysis = jest.fn().mockResolvedValue('loaded');
    const query = convertToParamMap({ run: 'generation-1' });
    TestBed.overrideProvider(AnalysisStepStore, { useValue: { loaded, selected: signal(null), useAnalysis } });
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { queryParamMap: query }, queryParamMap: of(query) } });
    TestBed.overrideProvider(WizardRpcService, { useValue: { getResumableRun: jest.fn().mockResolvedValue({ generation: { runId: 'generation-1', analysisDirectory: '/ws/.ptah/analysis/saved' } }) } });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(useAnalysis).toHaveBeenCalledWith('saved');
    loaded.set({ manifest: { runId: 'run-1' } });
  });
});
