import { TestBed } from '@angular/core/testing';
import { WizardRpcError, WizardRpcService } from './wizard-rpc.service';
import { ClaudeRpcService, ModelStateService } from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import { AgentSelection } from './setup-wizard-state.service';

/**
 * WizardRpcService tests.
 *
 * The service is a thin facade over {@link ClaudeRpcService}, so the tests
 * stub `ClaudeRpcService.call` and assert the RPC method names + payload
 * shapes, then verify the service translates `{ success, error }` results
 * into resolved values / thrown errors as designed.
 */
describe('WizardRpcService', () => {
  let service: WizardRpcService;
  let rpcCall: jest.Mock;
  let mockRpcService: Partial<ClaudeRpcService>;
  let mockModelState: Partial<ModelStateService>;

  beforeEach(() => {
    rpcCall = jest.fn();
    mockRpcService = {
      call: rpcCall as unknown as ClaudeRpcService['call'],
    };
    mockModelState = {
      currentModel: jest.fn().mockReturnValue('picker-model'),
    } as unknown as Partial<ModelStateService>;

    TestBed.configureTestingModule({
      providers: [
        WizardRpcService,
        { provide: ClaudeRpcService, useValue: mockRpcService },
        { provide: ModelStateService, useValue: mockModelState },
        {
          provide: TabManagerService,
          useValue: {
            findTabByIdAcrossWorkspaces: jest.fn(),
            getWorkspaceTabs: jest.fn().mockReturnValue([]),
          },
        },
      ],
    });

    service = TestBed.inject(WizardRpcService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /** Factory for a success-shape RPC result (both `success` and `isSuccess()`). */
  const okResult = (data?: unknown) => ({
    success: true,
    isSuccess: () => true,
    data,
  });

  /** Factory for a failure-shape RPC result. */
  const errResult = (error: string, errorCode?: string) => ({
    success: false,
    isSuccess: () => false,
    error,
    ...(errorCode ? { errorCode } : {}),
  });

  it('gets the current workspace analysis status', async () => {
    const status = {
      state: 'fresh',
      reason: 'ok',
      analysisDir: '.ptah/analysis/run',
      checkedAt: '2026-11-01',
      analyzedAt: '2026-10-31',
    };
    rpcCall.mockResolvedValue(okResult(status));
    await expect(service.getAnalysisStatus()).resolves.toEqual(status);
    expect(rpcCall).toHaveBeenCalledWith(
      'wizard:analysis-status',
      {},
      { timeout: 10_000 },
    );
    rpcCall.mockResolvedValue(errResult('unavailable'));
    await expect(service.getAnalysisStatus()).rejects.toThrow();
  });

  it('lets onboarding distinguish saved-list RPC failure while legacy callers still receive an empty list', async () => {
    rpcCall.mockResolvedValue(errResult('private host detail'));
    await expect(service.listAnalyses()).resolves.toEqual([]);
    await expect(service.listAnalyses({ throwOnError: true })).rejects.toThrow(
      'Saved analyses could not be loaded.',
    );
    rpcCall.mockResolvedValue(okResult({ analyses: [] }));
    await expect(service.listAnalyses({ throwOnError: true })).resolves.toEqual(
      [],
    );
  });

  it('sends no model on bound guidance starts even with a tab override model', async () => {
    rpcCall.mockResolvedValue(okResult({ accepted: { runId: 'r' } }));
    const binding = {
      tabId: 'guidance',
      workflow: 'setup-project-prompt' as const,
      workspacePath: '/ws',
    };
    const tabs = TestBed.inject(TabManagerService);
    jest.spyOn(tabs, 'findTabByIdAcrossWorkspaces').mockReturnValue({
      workspacePath: '/ws',
      tab: { overrideModel: 'tab-model' },
    } as ReturnType<TabManagerService['findTabByIdAcrossWorkspaces']>);
    await service.startBoundGuidance(binding);
    expect(rpcCall).toHaveBeenCalledWith(
      'enhancedPrompts:runWizard',
      { workspacePath: '/ws', tabBinding: binding },
      { timeout: 300_000 },
    );
    rpcCall.mockClear();
    await service.regenerateBoundGuidance(binding);
    expect(rpcCall).toHaveBeenCalledWith(
      'enhancedPrompts:regenerate',
      {
        workspacePath: '/ws',
        tabBinding: binding,
        force: true,
      },
      { timeout: 300_000 },
    );
    rpcCall.mockClear();
    await service.regenerateEnhancedPrompts('/ws');
    expect(rpcCall).toHaveBeenCalledWith(
      'enhancedPrompts:regenerate',
      { workspacePath: '/ws', force: true },
      { timeout: 300_000 },
    );
  });

  it.each(['start', 'regenerate'] as const)(
    'preserves the Setup code and message for a bound guidance %s',
    async (kind) => {
      const message =
        'Setup model cannot run guidance (not-signed-in; provider=openrouter). Update Background models and retry.';
      rpcCall.mockResolvedValue(errResult(message, 'SETUP_MODEL_INVALID'));
      const binding = {
        tabId: 'guidance',
        workflow: 'setup-project-prompt' as const,
        workspacePath: '/ws',
      };
      const request =
        kind === 'start'
          ? service.startBoundGuidance(binding)
          : service.regenerateBoundGuidance(binding);
      await expect(request).rejects.toMatchObject({
        code: 'SETUP_MODEL_INVALID',
        reason: 'not-signed-in',
        provider: 'openrouter',
        message: `SETUP_MODEL_INVALID reason=not-signed-in provider=openrouter: ${message}`,
      });
    },
  );

  it('sends no model for all bound starts despite conflicting tab override and picker models', async () => {
    rpcCall.mockResolvedValue(okResult({ accepted: { runId: 'r' } }));
    const tabs = TestBed.inject(TabManagerService);
    jest.spyOn(tabs, 'findTabByIdAcrossWorkspaces').mockReturnValue({
      workspacePath: null,
      tab: { overrideModel: 'tab-model' },
    } as ReturnType<TabManagerService['findTabByIdAcrossWorkspaces']>);
    jest
      .spyOn(tabs, 'getWorkspaceTabs')
      .mockReturnValue([{ id: 'tab' }] as ReturnType<
        TabManagerService['getWorkspaceTabs']
      >);
    const agentBinding = {
      tabId: 'tab',
      workflow: 'setup-agent-generation' as const,
      workspacePath: '/ws',
    };
    const guidanceBinding = {
      ...agentBinding,
      workflow: 'setup-project-prompt' as const,
    };
    await service.startBoundAgents(agentBinding, ['agent']);
    await service.startBoundGuidance(guidanceBinding);
    await service.regenerateBoundGuidance(guidanceBinding);
    expect(rpcCall.mock.calls.map((call) => call[0])).toEqual([
      'wizard:submit-selection',
      'enhancedPrompts:runWizard',
      'enhancedPrompts:regenerate',
    ]);
    for (const call of rpcCall.mock.calls) {
      expect(call[1]).not.toHaveProperty('model');
    }
  });

  describe('previewGeneration', () => {
    it('sends a tab binding only when provided', async () => {
      rpcCall.mockResolvedValue(okResult({ agents: [] }));
      const binding = {
        tabId: 'agent-tab',
        workspacePath: '/workspace',
        workflow: 'setup-agent-generation',
      } as const;
      await service.previewGeneration(['a'], undefined, binding);
      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:preview-generation',
        { selectedAgentIds: ['a'], tabBinding: binding },
        { timeout: 10_000 },
      );
    });
    it('calls wizard:preview-generation with selectedAgentIds and returns the preview', async () => {
      const preview = { agents: [] };
      rpcCall.mockResolvedValue(okResult(preview));
      await expect(service.previewGeneration(['a', 'b'])).resolves.toEqual(
        preview,
      );
      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:preview-generation',
        { selectedAgentIds: ['a', 'b'] },
        { timeout: 10_000 },
      );
    });

    it('throws the preview RPC failure reason', async () => {
      rpcCall.mockResolvedValue(errResult('preview denied'));
      await expect(service.previewGeneration(['a'])).rejects.toThrow(
        'preview denied',
      );
    });

    it('sends the chosen target only when one is given', async () => {
      rpcCall.mockResolvedValue(okResult({ agents: [] }));
      await service.previewGeneration(['a'], 'opened-folder');
      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:preview-generation',
        { selectedAgentIds: ['a'], target: 'opened-folder' },
        { timeout: 10_000 },
      );
    });

    it('propagates a rejected preview transport error', async () => {
      rpcCall.mockRejectedValue(new Error('transport down'));
      await expect(service.previewGeneration(['a'])).rejects.toThrow(
        'transport down',
      );
    });
  });

  describe('submitAgentSelection', () => {
    const agents: AgentSelection[] = [
      {
        id: '1',
        name: 'Agent 1',
        selected: true,
        score: 90,
        reason: 'Test',
        autoInclude: false,
      },
    ];

    it('should call wizard:submit-selection with selected agent ids', async () => {
      rpcCall.mockResolvedValue(okResult({ success: true }));

      await service.submitAgentSelection(agents);

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:submit-selection',
        expect.objectContaining({ selectedAgentIds: ['1'] }),
        expect.any(Object),
      );
    });

    it('should resolve with ack payload on success', async () => {
      const ack = { success: true };
      rpcCall.mockResolvedValue(okResult(ack));

      const result = await service.submitAgentSelection(agents);

      expect(result).toEqual(ack);
    });

    it('should throw when RPC fails', async () => {
      rpcCall.mockResolvedValue(errResult('denied'));

      await expect(service.submitAgentSelection(agents)).rejects.toThrow(
        'denied',
      );
    });

    it('sends the preview token, replace decisions and target of a confirmed preview', async () => {
      rpcCall.mockResolvedValue(okResult({ success: true }));

      await service.submitAgentSelection(agents, '/analysis', {
        previewToken: 'tok-1',
        fileDecisions: { '1': { decision: 'replace', revision: 'r1' } },
        target: 'opened-folder',
      });

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:submit-selection',
        {
          selectedAgentIds: ['1'],
          analysisDir: '/analysis',
          previewToken: 'tok-1',
          fileDecisions: { '1': { decision: 'replace', revision: 'r1' } },
          target: 'opened-folder',
        },
        { timeout: 300_000 },
      );
    });

    it('sends no decision fields for a submit without a preview', async () => {
      rpcCall.mockResolvedValue(okResult({ success: true }));

      await service.submitAgentSelection(agents, '/analysis');

      const params = rpcCall.mock.calls[0][1];
      expect(params).not.toHaveProperty('previewToken');
      expect(params).not.toHaveProperty('fileDecisions');
      expect(params).not.toHaveProperty('target');
    });

    it('returns a preview-required rejection to the caller', async () => {
      const ack = { success: false, rejection: { reason: 'preview-required' } };
      rpcCall.mockResolvedValue(okResult(ack));

      await expect(service.submitAgentSelection(agents)).resolves.toEqual(ack);
    });
  });

  describe('cancelWizard', () => {
    it('should call wizard:cancel with saveProgress=true by default', async () => {
      rpcCall.mockResolvedValue(okResult());

      await service.cancelWizard();

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:cancel',
        expect.objectContaining({ saveProgress: true }),
      );
    });

    it('should honor explicit saveProgress=false', async () => {
      rpcCall.mockResolvedValue(okResult());

      await service.cancelWizard(false);

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:cancel',
        expect.objectContaining({ saveProgress: false }),
      );
    });

    it('should log warning on RPC failure but not throw', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
        /* silence */
      });
      rpcCall.mockResolvedValue(errResult('timeout'));

      await expect(service.cancelWizard()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('cancelAnalysis', () => {
    it('should call wizard:cancel-analysis RPC method', async () => {
      rpcCall.mockResolvedValue(okResult());

      await service.cancelAnalysis();

      expect(rpcCall).toHaveBeenCalledWith('wizard:cancel-analysis', {});
    });

    it('should swallow errors (best-effort cancel)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
        /* silence */
      });
      rpcCall.mockRejectedValue(new Error('offline'));

      await expect(service.cancelAnalysis()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('deepAnalyze', () => {
    it('should call wizard:deep-analyze with no model or resume flag by default', async () => {
      rpcCall.mockResolvedValue(okResult({ isMultiPhase: true }));

      await service.deepAnalyze();

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:deep-analyze',
        {},
        { timeout: 3_660_000 },
      );
    });

    it('should pass resume: true when asked to continue a prior run', async () => {
      rpcCall.mockResolvedValue(okResult({ isMultiPhase: true }));

      await service.deepAnalyze({ resume: true });

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:deep-analyze',
        expect.objectContaining({ resume: true }),
        expect.any(Object),
      );
    });

    it('should throw when RPC fails', async () => {
      rpcCall.mockResolvedValue(errResult('no MCP'));

      await expect(service.deepAnalyze()).rejects.toThrow('no MCP');
    });
  });

  describe('getResumableRun', () => {
    it('distinguishes a failed pinned read from a confirmed empty response on request', async () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        rpcCall.mockResolvedValueOnce(errResult('offline'));
        const options = { throwOnError: true };
        await expect(
          service.getResumableRun('/workspace', options),
        ).rejects.toThrow('Resumable runs could not be loaded.');
        const empty = {
          analysis: null,
          generation: null,
          analysisActive: false,
        };
        rpcCall.mockResolvedValueOnce(okResult(empty));
        await expect(
          service.getResumableRun('/workspace', options),
        ).resolves.toEqual(empty);
      } finally {
        warn.mockRestore();
      }
    });

    it('should call wizard:get-resumable-run and return the response', async () => {
      const response = { analysis: null, generation: { runId: 'run-1' } };
      rpcCall.mockResolvedValue(okResult(response));

      const result = await service.getResumableRun();

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:get-resumable-run',
        {},
        expect.any(Object),
      );
      expect(result).toEqual(response);
    });

    it('should return an empty response when the RPC fails (best-effort)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
        /* silence */
      });
      rpcCall.mockResolvedValue(errResult('offline'));

      await expect(service.getResumableRun()).resolves.toEqual({
        analysis: null,
        generation: null,
      });
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should swallow a thrown transport error', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
        /* silence */
      });
      rpcCall.mockRejectedValue(new Error('transport down'));

      await expect(service.getResumableRun()).resolves.toEqual({
        analysis: null,
        generation: null,
      });

      warnSpy.mockRestore();
    });
  });

  describe('getSkillReview', () => {
    it('reads the stored review for a run with the list timeout', async () => {
      const stored = { review: null, reviewedAt: null };
      rpcCall.mockResolvedValue(okResult(stored));

      await expect(service.getSkillReview('run-7')).resolves.toEqual(stored);
      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:get-skill-review',
        { runId: 'run-7' },
        { timeout: 10_000 },
      );
    });

    it('throws a WizardRpcError that keeps the RPC error code', async () => {
      rpcCall.mockResolvedValue(
        errResult('private host detail', 'ANALYSIS_LOAD_FAILED'),
      );

      const error = await service.getSkillReview('run-7').catch((e) => e);
      expect(error).toBeInstanceOf(WizardRpcError);
      expect(error.code).toBe('ANALYSIS_LOAD_FAILED');
      expect(error.message).toBe('The saved skill review could not be read.');
      expect(error.message).not.toContain('private host detail');
    });

    it('throws without a code when the RPC returns no code', async () => {
      rpcCall.mockResolvedValue(errResult('offline'));

      const error = await service.getSkillReview('run-7').catch((e) => e);
      expect(error).toBeInstanceOf(WizardRpcError);
      expect(error.code).toBeUndefined();
    });
  });

  describe('recommendAnalysisSkills', () => {
    it('runs the skill review for a run with the review timeout', async () => {
      const review = {
        skills: [],
        judge: { status: 'skipped' },
        analysisPair: null,
        detectedItems: [],
        unmatchedItems: [],
        searchFailures: [],
        summarySource: 'none',
      };
      rpcCall.mockResolvedValue(okResult(review));

      await expect(service.recommendAnalysisSkills('run-7')).resolves.toEqual(
        review,
      );
      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:recommend-analysis-skills',
        { runId: 'run-7' },
        { timeout: 75_000 },
      );
    });

    it('throws a WizardRpcError that keeps the RPC error code', async () => {
      rpcCall.mockResolvedValue(
        errResult('private host detail', 'SETUP_MODEL_INVALID'),
      );

      const error = await service
        .recommendAnalysisSkills('run-7')
        .catch((e) => e);
      expect(error).toBeInstanceOf(WizardRpcError);
      expect(error.code).toBe('SETUP_MODEL_INVALID');
      expect(error.message).toBe('Could not load skill recommendations.');
    });

    it('treats a success without data as a failure', async () => {
      rpcCall.mockResolvedValue(okResult(undefined));

      await expect(service.recommendAnalysisSkills('run-7')).rejects.toThrow(
        WizardRpcError,
      );
    });
  });

  describe('resumeGeneration', () => {
    it('should call wizard:submit-selection with resume and an empty selection', async () => {
      rpcCall.mockResolvedValue(okResult({ success: true }));

      await service.resumeGeneration();

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:submit-selection',
        { selectedAgentIds: [], resume: true },
        expect.any(Object),
      );
    });

    it('should throw when RPC fails', async () => {
      rpcCall.mockResolvedValue(errResult('no checkpoint'));

      await expect(service.resumeGeneration()).rejects.toThrow('no checkpoint');
    });
  });

  describe('runEnhancedPromptsWizard', () => {
    it('sends no model field and resolves with the response payload', async () => {
      const response = { success: true };
      rpcCall.mockResolvedValue(okResult(response));

      await expect(
        service.runEnhancedPromptsWizard('/ws', '/analysis'),
      ).resolves.toEqual(response);
      expect(rpcCall).toHaveBeenCalledWith(
        'enhancedPrompts:runWizard',
        { workspacePath: '/ws', analysisDir: '/analysis' },
        { timeout: 300_000 },
      );
    });

    it('returns a failure response without a model field on RPC failure', async () => {
      rpcCall.mockResolvedValue(errResult('denied'));

      await expect(service.runEnhancedPromptsWizard('/ws')).resolves.toEqual({
        success: false,
        error: 'denied',
      });
      expect(rpcCall).toHaveBeenCalledWith(
        'enhancedPrompts:runWizard',
        { workspacePath: '/ws' },
        { timeout: 300_000 },
      );
    });
  });

  it('sends the preview token, replace decisions and target with a bound agent start', async () => {
    rpcCall.mockResolvedValue(okResult({ accepted: { runId: 'r' } }));
    const agentBinding = {
      tabId: 'tab',
      workflow: 'setup-agent-generation' as const,
      workspacePath: '/ws',
    };
    await service.startBoundAgents(agentBinding, ['tester'], false, {
      previewToken: 'token-1',
      fileDecisions: { tester: { decision: 'replace', revision: 'rev-1' } },
      target: 'opened-folder',
    });
    await service.startBoundAgents(agentBinding, ['tester']);
    expect(rpcCall).toHaveBeenNthCalledWith(
      1,
      'wizard:submit-selection',
      expect.objectContaining({
        tabBinding: agentBinding,
        selectedAgentIds: ['tester'],
        previewToken: 'token-1',
        fileDecisions: { tester: { decision: 'replace', revision: 'rev-1' } },
        target: 'opened-folder',
      }),
      { timeout: 300_000 },
    );
    const plain = rpcCall.mock.calls[1][1] as Record<string, unknown>;
    expect(plain).not.toHaveProperty('previewToken');
    expect(plain).not.toHaveProperty('fileDecisions');
    expect(plain).not.toHaveProperty('target');
    expect(plain).not.toHaveProperty('resume');
  });

  it('reports an unavailable selected model without exposing host error text', async () => {
    rpcCall.mockResolvedValue(
      errResult(
        'The selected model is unavailable for this provider. private-host-detail',
      ),
    );
    await expect(
      service.startBoundAgents(
        {
          tabId: 'tab',
          workspacePath: '/ws',
          workflow: 'setup-agent-generation',
        },
        ['a'],
      ),
    ).rejects.toThrow('The selected model is not available for this provider.');
  });

  describe('retryGenerationItem', () => {
    it('uses the exact bound run for retry and rejects an unsuccessful result', async () => {
      const tabBinding = {
        tabId: 'tab',
        workspacePath: '/ws',
        workflow: 'setup-agent-generation' as const,
        runId: 'run',
      };
      rpcCall
        .mockResolvedValueOnce(okResult({ success: true }))
        .mockResolvedValueOnce(okResult({ success: false }));
      await service.retryGenerationItem('agent', tabBinding);
      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:retry-item',
        { itemId: 'agent', tabBinding },
        { timeout: 300_000 },
      );
      await expect(
        service.retryGenerationItem('agent', tabBinding),
      ).rejects.toThrow('Failed to retry generation item');
    });
    it('should call wizard:retry-item with the given itemId', async () => {
      rpcCall.mockResolvedValue(okResult());

      await service.retryGenerationItem('item-42');

      expect(rpcCall).toHaveBeenCalledWith(
        'wizard:retry-item',
        {
          itemId: 'item-42',
        },
        { timeout: 300_000 },
      );
    });

    it('should throw when RPC fails', async () => {
      rpcCall.mockResolvedValue(errResult('not-found'));

      await expect(service.retryGenerationItem('item-42')).rejects.toThrow(
        'Failed to retry generation item',
      );
    });
  });

  it('sends no model on bound submit and resume even with a tab override model', async () => {
    const tabBinding = {
      tabId: 'tab',
      workspacePath: '/ws',
      workflow: 'setup-agent-generation' as const,
    };
    const tabs = TestBed.inject(TabManagerService);
    jest.spyOn(tabs, 'findTabByIdAcrossWorkspaces').mockReturnValue({
      workspacePath: '/ws',
      tab: { overrideModel: 'opus' },
    } as ReturnType<TabManagerService['findTabByIdAcrossWorkspaces']>);
    rpcCall.mockResolvedValue(okResult({ accepted: { runId: 'run' } }));
    await service.startBoundAgents(tabBinding, ['a']);
    await service.startBoundAgents(tabBinding, [], true);
    expect(rpcCall).toHaveBeenNthCalledWith(
      1,
      'wizard:submit-selection',
      expect.objectContaining({ selectedAgentIds: ['a'] }),
      expect.any(Object),
    );
    expect(rpcCall.mock.calls[0][1]).not.toHaveProperty('model');
    expect(rpcCall).toHaveBeenNthCalledWith(
      2,
      'wizard:submit-selection',
      expect.objectContaining({ resume: true }),
      expect.any(Object),
    );
    expect(rpcCall.mock.calls[1][1]).not.toHaveProperty('model');
  });

  it('looks up and stops a tab-bound run using its exact identity', async () => {
    const binding = {
      tabId: 'tab',
      workspacePath: '/ws',
      workflow: 'setup-agent-generation' as const,
    };
    rpcCall
      .mockResolvedValueOnce(okResult({ run: null }))
      .mockResolvedValueOnce(okResult({ cancelled: true }));
    await expect(service.getBoundRunState(binding, 'run')).resolves.toBeNull();
    expect(rpcCall).toHaveBeenCalledWith(
      'wizard:get-generation-run-state',
      { tabBinding: binding, runId: 'run' },
      expect.anything(),
    );
    await expect(
      service.cancelBoundRun({ ...binding, runId: 'run' }),
    ).resolves.toBe(true);
    expect(rpcCall).toHaveBeenCalledWith(
      'wizard:cancel',
      { tabBinding: { ...binding, runId: 'run' } },
      expect.anything(),
    );
  });
});
