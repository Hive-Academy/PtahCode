import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import { AnalysisStepStore } from './analysis-step.store';
import { AnalyzeSkillsPage } from './analyze-skills.page';
import type { SkillShEntry } from '@ptah-extension/shared';

jest.mock('@ptah-extension/setup-wizard', () => ({ WizardRpcService: class WizardRpcService {} }));

describe('AnalyzeSkillsPage', () => {
  const loaded = signal<{ manifest: { runId: string } } | null>({ manifest: { runId: 'run-1' } });
  const root = signal({ workspaceRoot: '/ws' });
  const call = jest.fn();
  beforeEach(() => {
    loaded.set({ manifest: { runId: 'run-1' } });
    root.set({ workspaceRoot: '/ws' });
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
  });

  function primaryButton(element: HTMLElement): HTMLButtonElement {
    const button = element.querySelector('button[variant="primary"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('Missing primary continue button');
    return button;
  }

  it('invalidates a pending manual search on rerun without leaving searching stuck', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    let finish: () => void = () => { throw new Error('Search was not started'); };
    call.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ isSuccess: () => true, data: { skills: [{ source: 'stale' }] } });
    }));
    const pending = page.search('angular');
    expect(page.state.searching()).toBe(true);
    page.retry();
    expect(page.state.searching()).toBe(false);
    finish();
    await pending;
    await fixture.whenStable();
    expect(page.state.searchResults()).toEqual([]);
    expect(page.state.searching()).toBe(false);
  });

  it('opens only one guidance tab while navigation is pending', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    let finish: () => void = () => { throw new Error('Navigation was not started'); };
    jest.mocked(router.navigate).mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      finish = () => resolve(true);
    }));
    const first = fixture.componentInstance.preview();
    await fixture.componentInstance.preview();
    fixture.detectChanges();
    expect(primaryButton(fixture.nativeElement).disabled).toBe(true);
    expect(TestBed.inject(TabManagerService).createTab).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(fixture.componentInstance.leaving()).toBe(false);
  });

  it('announces selection reset after a successful rerun', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Skill selection was reset to the new recommendations.');
  });

  it.each(['empty', 'error', 'nothing selected'])('continues to guidance with %s', async (state) => {
    if (state === 'error') call.mockRejectedValue(new Error('offline'));
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    if (state === 'nothing selected') {
      fixture.componentInstance.state.recommendations.set([{
        skill: { source: 'owner/repo', skillId: 'angular', name: 'Angular', description: 'Patterns', installs: 1, isInstalled: false },
        evidence: 'Angular', score: 100,
      }]);
      fixture.componentInstance.state.selectedIds.set(new Set());
    }
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = primaryButton(element);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Continue without skills');
    expect(element.textContent).toContain('Re-run skill search');
    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/onboarding/analyze/guidance'], expect.objectContaining({ queryParams: expect.objectContaining({ analysis: 'saved' }) }));
  });

  it('reviews selected skills, installs with consent, and continues to guidance', async () => {
    const skill: SkillShEntry = { source: 'owner/repo', skillId: 'angular', name: 'Angular', description: 'Patterns', installs: 1, isInstalled: false };
    call.mockResolvedValueOnce({ isSuccess: () => true, data: {
      skills: [{ skill, evidence: 'Angular', score: 100 }], detectedItems: [], unmatchedItems: [], searchFailures: [], summarySource: 'structured',
    } });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = primaryButton(element);
    expect(button.disabled).toBe(false);
    call.mockResolvedValueOnce({ isSuccess: () => true, data: { skills: [{ skillName: 'owner/repo/angular', contentHash: 'hash', hasScripts: false }] } });
    button.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.state.stage()).toBe('consent');
    call.mockResolvedValueOnce({ isSuccess: () => true, data: { success: true, installed: ['owner/repo/angular'] } });
    await fixture.componentInstance.install();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/onboarding/analyze/guidance'], expect.anything());
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
    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    const rerun = Array.from(buttons).find((button) => button.textContent?.includes('Re-run skill search'));
    expect(rerun?.disabled).toBe(true);
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
