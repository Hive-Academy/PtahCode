import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TabManagerService } from '@ptah-extension/chat-state';
import { AppStateManager, ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import { OnboardingFlagService } from '../first-run/onboarding-flag.service';
import { AnalyzeDonePage } from './analyze-done.page';

describe('AnalyzeDonePage', () => {
  const call = jest.fn();
  const navigate = jest.fn();
  beforeEach(() => {
    call.mockResolvedValue({ isSuccess: () => true, data: { mode: 'selected', slugs: ['angular'], available: [{ slug: 'angular', name: 'Angular', description: '', pluginId: null }] } });
    TestBed.configureTestingModule({ providers: [
      { provide: ClaudeRpcService, useValue: { call } },
      { provide: WizardRpcService, useValue: { getEnhancedPromptsStatus: jest.fn().mockResolvedValue({ enabled: true }) } },
      { provide: TabManagerService, useValue: { activeWorkspacePath: '/ws' } },
      { provide: VSCodeService, useValue: { config: () => ({ workspaceRoot: '/ws' }), postMessage: jest.fn() } },
      { provide: AppStateManager, useValue: { setCurrentView: jest.fn() } },
      { provide: OnboardingFlagService, useValue: { markCompleted: jest.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ analysis: 'saved' }) } } },
      { provide: Router, useValue: { navigate } },
    ] });
  });
  it('reads durable workspace skill candidates and guidance status', async () => {
    const fixture = TestBed.createComponent(AnalyzeDonePage);
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(call).toHaveBeenCalledWith('harness:get-skill-selection', {});
    expect(fixture.nativeElement.textContent).toContain('Angular');
    expect(fixture.nativeElement.textContent).toContain('On');
    expect(fixture.nativeElement.textContent).not.toContain('Generate agents');
  });
});
