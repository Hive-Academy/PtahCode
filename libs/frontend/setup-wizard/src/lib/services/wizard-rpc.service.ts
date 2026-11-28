import { Injectable, inject } from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import type {
  AnalysisStatus,
  EnhancedPromptsRunWizardResponse,
  EnhancedPromptsGetStatusResponse,
  MultiPhaseAnalysisResponse,
  SavedAnalysisMetadata,
  GenerationTargetChoice,
  SetupGenerationRejection,
  WizardGetResumableRunResponse,
  WizardPreviewGenerationParams,
  WizardPreviewGenerationResponse,
  SetupGenerationTabBinding,
  SetupGenerationRunBinding,
  SetupGenerationRunState,
  WizardSubmitSelectionParams,
  WizardSubmitSelectionResponse,
  WizardCancelResponse,
  EnhancedPromptsCancelResponse,
  WizardGetSkillReviewResult,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';
import { AgentSelection } from './setup-wizard-state.service';

/**
 * Centralized RPC timeout budget for wizard backend calls. The values
 * are chosen against the worst-case duration of the backing handler:
 *
 * - LIST: small directory reads / curated pack listings.
 * - PACK_INSTALL: download + write of a community agent pack.
 * - SHORT_LLM: bounded LLM completion (≤ a minute of model latency).
 * - GENERATION: full agent generation across selections.
 * - DEEP_ANALYSIS: end-to-end agentic workspace analysis (1h + buffer).
 */
const WIZARD_RPC_TIMEOUTS = {
  LIST_MS: 10_000,
  SHORT_LLM_MS: 60_000,
  SKILL_REVIEW_MS: 75_000,
  GENERATION_MS: 300_000,
  DEEP_ANALYSIS_MS: 3_660_000,
} as const;

/**
 * Keep/replace decisions a confirmed preview carries into
 * `wizard:submit-selection`: the preview token, one entry per Replace and the
 * target root. Absent fields keep the server defaults (keep, harness root).
 */
export type BoundAgentDecisions = Pick<
  WizardSubmitSelectionParams,
  'previewToken' | 'fileDecisions' | 'target'
>;

const SETUP_REFUSAL =
  /\((provider-unknown|provider-unsupported|provider-missing|model-missing|model-stale|not-signed-in|provider-unavailable)(?:;\s*provider=([a-z0-9][a-z0-9._-]{0,63}))?\)/i;

/** Transport failure with its stable code retained for fixed view copy. */
export class WizardRpcError extends Error {
  public constructor(
    message: string,
    public readonly code?: string,
    public readonly reason?: string,
    public readonly provider?: string,
  ) {
    super(message);
    this.name = 'WizardRpcError';
  }
}

function guidanceFailure(
  message: string | undefined,
  code: string | undefined,
  fallback: string,
): WizardRpcError {
  const text = message || fallback;
  const setup = code === 'SETUP_MODEL_INVALID' ? SETUP_REFUSAL.exec(text) : null;
  const reason = setup?.[1].toLowerCase();
  const provider = setup?.[2];
  const detail = reason
    ? ` reason=${reason}${provider ? ` provider=${provider}` : ''}`
    : '';
  return new WizardRpcError(
    code?.startsWith('SETUP_') ? `${code}${detail}: ${text}` : text,
    code,
    reason,
    provider,
  );
}

/** Only the decision fields that are set, so absent ones keep server defaults. */
function boundDecisionFields(
  decisions: BoundAgentDecisions | undefined,
): BoundAgentDecisions {
  return {
    ...(decisions?.previewToken !== undefined
      ? { previewToken: decisions.previewToken }
      : {}),
    ...(decisions?.fileDecisions !== undefined
      ? { fileDecisions: decisions.fileDecisions }
      : {}),
    ...(decisions?.target !== undefined ? { target: decisions.target } : {}),
  };
}

/**
 * Agent selection acknowledgment response from backend.
 */
export interface AgentSelectionResponse {
  /** Whether the selection was successfully received and processed */
  success: boolean;
  /** Why the server refused to start, e.g. `preview-required`. */
  rejection?: SetupGenerationRejection;
  /** Error message if the selection failed */
  error?: string;
}

/**
 * WizardRpcService
 *
 * Thin facade for wizard-specific RPC calls.
 * Delegates to ClaudeRpcService for actual RPC communication.
 *
 * Pattern: Facade pattern - provides wizard-specific API over unified RPC
 *
 * Supported RPC methods:
 * - wizard:submit-selection - Submit agent selection and trigger generation
 * - wizard:cancel - Cancel the wizard session
 * - wizard:retry-item - Retry a failed generation item
 * - wizard:cancel-analysis - Cancel a running analysis
 * - wizard:deep-analyze - Deep workspace analysis (supports resume)
 * - wizard:get-resumable-run - Read-only discovery of an unfinished run
 * - enhancedPrompts:runWizard - Run Enhanced Prompts wizard
 * - enhancedPrompts:getStatus - Get Enhanced Prompts status
 * - enhancedPrompts:toggle - Toggle enhanced prompts on/off
 * - enhancedPrompts:regenerate - Force regenerate enhanced prompts
 * - enhancedPrompts:getPromptContent - Get generated prompt content
 * - enhancedPrompts:download - Download prompt as .md file
 */
@Injectable({
  providedIn: 'root',
})
export class WizardRpcService {
  private readonly rpcService = inject(ClaudeRpcService);

  async getBoundRunState(
    binding: SetupGenerationTabBinding,
    runId?: string,
  ): Promise<SetupGenerationRunState | null> {
    const name =
      binding.workflow === 'setup-agent-generation'
        ? 'wizard:get-generation-run-state'
        : 'enhancedPrompts:getRunState';
    const result = await this.rpcService.call(
      name,
      { tabBinding: binding, runId },
      { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
    );
    if (!result.isSuccess() || !result.data)
      throw new Error('Run state unavailable');
    return result.data.run;
  }

  async cancelBoundRun(binding: SetupGenerationRunBinding): Promise<boolean> {
    const name =
      binding.workflow === 'setup-agent-generation'
        ? 'wizard:cancel'
        : 'enhancedPrompts:cancel';
    const result = await this.rpcService.call(
      name,
      { tabBinding: binding },
      { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
    );
    if (!result.isSuccess() || !result.data)
      throw new Error('Stop unconfirmed');
    const data: WizardCancelResponse | EnhancedPromptsCancelResponse =
      result.data;
    return data.cancelled;
  }

  async startBoundAgents(
    binding: SetupGenerationTabBinding,
    selectedAgentIds: string[],
    resume = false,
    decisions?: BoundAgentDecisions,
  ): Promise<WizardSubmitSelectionResponse> {
    const result = await this.rpcService.call(
      'wizard:submit-selection',
      {
        tabBinding: binding,
        selectedAgentIds,
        ...(resume ? { resume: true } : {}),
        ...boundDecisionFields(decisions),
      },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );
    if (!result.isSuccess() || !result.data) {
      if (
        result.error?.includes('selected model') &&
        result.error.includes('unavailable')
      )
        throw new Error(
          'The selected model is not available for this provider.',
        );
      throw new Error('Start unconfirmed');
    }
    return result.data;
  }

  async startBoundGuidance(
    binding: SetupGenerationTabBinding,
  ): Promise<EnhancedPromptsRunWizardResponse> {
    const result = await this.rpcService.call(
      'enhancedPrompts:runWizard',
      {
        workspacePath: binding.workspacePath,
        tabBinding: binding,
      },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );
    if (!result.isSuccess() || !result.data) {
      const error = !result.isSuccess() ? result.error : undefined;
      const code = !result.isSuccess() ? result.errorCode : undefined;
      throw guidanceFailure(error, code, 'Start unconfirmed');
    }
    return result.data;
  }

  async regenerateBoundGuidance(
    binding: SetupGenerationTabBinding,
  ): Promise<EnhancedPromptsRunWizardResponse> {
    const result = await this.rpcService.call(
      'enhancedPrompts:regenerate',
      {
        workspacePath: binding.workspacePath,
        tabBinding: binding,
        force: true,
      },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );
    if (!result.isSuccess() || !result.data) {
      const error = !result.isSuccess() ? result.error : undefined;
      const code = !result.isSuccess() ? result.errorCode : undefined;
      throw guidanceFailure(error, code, 'Regeneration unconfirmed');
    }
    return result.data;
  }

  /**
   * Read-only target preview; failure must not prevent generation.
   *
   * @param target - Root to compare against; absent = the harness root.
   */
  public async previewGeneration(
    selectedAgentIds: string[],
    target?: GenerationTargetChoice,
    tabBinding?: SetupGenerationTabBinding,
  ): Promise<WizardPreviewGenerationResponse> {
    const params: WizardPreviewGenerationParams = {
      selectedAgentIds,
      ...(target !== undefined ? { target } : {}),
      ...(tabBinding !== undefined ? { tabBinding } : {}),
    };
    const result = await this.rpcService.call(
      'wizard:preview-generation',
      params,
      { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
    );
    if (result.isSuccess() && result.data) {
      return result.data as WizardPreviewGenerationResponse;
    }
    throw new Error(result.error || 'Failed to preview generation');
  }

  /**
   * Submit agent selection (Step 4 -> Step 5 transition).
   * Triggers agent generation with selected agents.
   *
   * Returns acknowledgment response to verify backend received the selection.
   * The caller should check response.success before transitioning to generation step.
   *
   * Uses a 5-minute timeout since agent generation is a long-running operation.
   *
   * @param selections - Agent selections from the wizard
   * @param analysisDir - Multi-phase analysis directory path
   * @param decisions - Token, Replace entries and target of the confirmed
   *   preview; absent for "Generate without preview" (create-only).
   */
  public async submitAgentSelection(
    selections: AgentSelection[],
    analysisDir?: string,
    decisions?: BoundAgentDecisions,
  ): Promise<AgentSelectionResponse> {
    const selectedIds = selections.filter((s) => s.selected).map((s) => s.id);
    const result = await this.rpcService.call(
      'wizard:submit-selection',
      {
        selectedAgentIds: selectedIds,
        analysisDir,
        ...boundDecisionFields(decisions),
      },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );

    if (result.isSuccess()) {
      return (result.data as AgentSelectionResponse) ?? { success: true };
    }
    throw new Error(result.error || 'Failed to submit agent selection');
  }

  /**
   * Cancel wizard (any step -> close).
   * Optionally saves progress for resuming later.
   *
   * Safe to call even if no active session exists (backend handles gracefully).
   */
  public async cancelWizard(saveProgress = true): Promise<void> {
    const result = await this.rpcService.call('wizard:cancel', {
      saveProgress,
    });
    if (!result.isSuccess()) {
      console.warn('[WizardRpcService] cancelWizard failed:', result.error);
    }
  }

  /**
   * Retry a failed generation item.
   * Triggers regeneration of a specific agent.
   *
   * @param itemId - Identifier of the generation item to retry
   */
  public async retryGenerationItem(
    itemId: string,
    tabBinding?: SetupGenerationRunBinding,
  ): Promise<void> {
    const result = await this.rpcService.call(
      'wizard:retry-item',
      { itemId, ...(tabBinding ? { tabBinding } : {}) },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );
    if (!result.isSuccess() || (tabBinding && !result.data?.success)) {
      throw new Error('Failed to retry generation item');
    }
  }

  /**
   * Cancel a running agentic workspace analysis.
   *
   * Sends the `wizard:cancel-analysis` RPC call to the backend, which aborts
   * the active AbortController in AgenticAnalysisService. This terminates the
   * SDK query stream, preventing further token usage after the user clicks
   * "Cancel Scan" in the frontend.
   *
   * Safe to call even if no analysis is running (backend handles gracefully).
   */
  public async cancelAnalysis(): Promise<void> {
    try {
      await this.rpcService.call('wizard:cancel-analysis', {});
    } catch (error) {
      console.warn(
        '[WizardRpcService] cancelAnalysis failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Deep analyze the workspace project structure.
   * Calls wizard:deep-analyze backend handler (registered in RpcMethodRegistry).
   *
   * Pass `{ resume: true }` to continue an unfinished version-3 analysis
   * run instead of starting a new one.
   *
   * Returns MultiPhaseAnalysisResponse (MCP required).
   */
  public async deepAnalyze(options?: {
    resume?: boolean;
  }): Promise<MultiPhaseAnalysisResponse> {
    const result = await this.rpcService.call(
      'wizard:deep-analyze',
      {
        ...(options?.resume ? { resume: true } : {}),
      },
      { timeout: WIZARD_RPC_TIMEOUTS.DEEP_ANALYSIS_MS },
    );
    if (result.isSuccess() && result.data) {
      return result.data as MultiPhaseAnalysisResponse;
    }
    throw new Error(result.error || 'Deep analysis failed');
  }

  /**
   * Discover an unfinished analysis/generation run persisted by the backend.
   * Calls the read-only wizard:get-resumable-run handler.
   *
   * Discovery is best-effort: a failure returns an empty response so wizard
   * startup never breaks on it.
   */
  public async getResumableRun(): Promise<WizardGetResumableRunResponse> {
    try {
      const result = await this.rpcService.call(
        'wizard:get-resumable-run',
        {},
        { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
      );
      if (result.isSuccess() && result.data) {
        return result.data as WizardGetResumableRunResponse;
      }
      if (result.error) {
        console.warn(
          '[WizardRpcService] getResumableRun failed:',
          result.error,
        );
      }
    } catch (error: unknown) {
      console.warn(
        '[WizardRpcService] getResumableRun failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
    return { analysis: null, generation: null };
  }

  /**
   * Resume a persisted generation run.
   *
   * Sends `wizard:submit-selection` with `resume: true` and an empty
   * selection — the backend reuses the persisted selection and inputs from
   * its checkpoint, never a frontend-memory reconstruction. (The schema
   * allows an empty `selectedAgentIds` only together with `resume: true`.)
   */
  public async resumeGeneration(): Promise<AgentSelectionResponse> {
    const result = await this.rpcService.call(
      'wizard:submit-selection',
      { selectedAgentIds: [], resume: true },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );
    if (result.isSuccess()) {
      return (result.data as AgentSelectionResponse) ?? { success: true };
    }
    throw new Error(result.error || 'Failed to resume generation');
  }

  /**
   * Run Enhanced Prompts wizard to generate project-specific prompt guidance.
   * Uses the existing enhancedPrompts:runWizard RPC handler.
   *
   * @param workspacePath - Workspace path to analyze
   * @param analysisDir - Multi-phase analysis directory path (optional)
   * @returns Enhanced Prompts wizard response
   */
  public async runEnhancedPromptsWizard(
    workspacePath: string,
    analysisDir?: string,
  ): Promise<EnhancedPromptsRunWizardResponse> {
    const result = await this.rpcService.call(
      'enhancedPrompts:runWizard',
      {
        workspacePath,
        ...(analysisDir ? { analysisDir } : {}),
      },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );

    if (result.isSuccess() && result.data) {
      return result.data as EnhancedPromptsRunWizardResponse;
    }

    return {
      success: false,
      error: result.error || 'Failed to run Enhanced Prompts wizard',
    };
  }

  /**
   * Get Enhanced Prompts status for a workspace.
   * Uses the existing enhancedPrompts:getStatus RPC handler.
   *
   * @param workspacePath - Workspace path to check
   * @returns Enhanced Prompts status response
   */
  public async getEnhancedPromptsStatus(
    workspacePath: string,
  ): Promise<EnhancedPromptsGetStatusResponse> {
    const result = await this.rpcService.call('enhancedPrompts:getStatus', {
      workspacePath,
    });

    if (result.isSuccess() && result.data) {
      return result.data as EnhancedPromptsGetStatusResponse;
    }

    return {
      enabled: false,
      hasGeneratedPrompt: false,
      generatedAt: null,
      detectedStack: null,
      cacheValid: false,
      error: result.error || 'Failed to get Enhanced Prompts status',
    };
  }

  /**
   * Toggle enhanced prompts on or off for a workspace.
   * Calls the enhancedPrompts:setEnabled RPC handler.
   *
   * @param workspacePath - Workspace path to toggle for
   * @param enabled - Whether to enable or disable enhanced prompts
   */
  public async toggleEnhancedPrompts(
    workspacePath: string,
    enabled: boolean,
  ): Promise<void> {
    const result = await this.rpcService.call('enhancedPrompts:setEnabled', {
      workspacePath,
      enabled,
    });

    if (!result.isSuccess()) {
      throw new Error(result.error || 'Failed to toggle enhanced prompts');
    }
  }

  /**
   * Regenerate enhanced prompts for a workspace.
   * Calls the enhancedPrompts:regenerate RPC handler.
   * Uses a 5-minute timeout since regeneration is a long-running operation.
   *
   * @param workspacePath - Workspace path to regenerate for
   * @returns Regeneration response with success status
   */
  public async regenerateEnhancedPrompts(
    workspacePath: string,
  ): Promise<EnhancedPromptsRunWizardResponse> {
    const result = await this.rpcService.call(
      'enhancedPrompts:regenerate',
      { workspacePath, force: true },
      { timeout: WIZARD_RPC_TIMEOUTS.GENERATION_MS },
    );

    if (result.isSuccess() && result.data) {
      return result.data as EnhancedPromptsRunWizardResponse;
    }

    return {
      success: false,
      error: result.error || 'Failed to regenerate enhanced prompts',
    };
  }

  /**
   * Get the generated enhanced prompt content for a workspace.
   * Returns the full prompt text for preview, or null if not available.
   *
   * @param workspacePath - Workspace path to get content for
   * @returns The prompt content string, or null if no prompt exists
   */
  public async getEnhancedPromptContent(
    workspacePath: string,
  ): Promise<string | null> {
    const result = await this.rpcService.call(
      'enhancedPrompts:getPromptContent',
      { workspacePath },
    );

    if (result.isSuccess() && result.data) {
      return (result.data as { content: string | null }).content;
    }

    return null;
  }

  /**
   * Download the generated enhanced prompt as a .md file.
   * Opens a native VS Code save dialog and writes the prompt content.
   *
   * @param workspacePath - Workspace path to download prompt for
   * @returns Download result with success status and optional file path
   */
  public async downloadEnhancedPrompt(
    workspacePath: string,
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const result = await this.rpcService.call('enhancedPrompts:download', {
      workspacePath,
    });

    if (result.isSuccess() && result.data) {
      return result.data as {
        success: boolean;
        filePath?: string;
        error?: string;
      };
    }

    return {
      success: false,
      error: result.error || 'Failed to download enhanced prompt',
    };
  }

  /**
   * Read the skill review stored with an analysis run
   * (`wizard:get-skill-review`). Both fields are `null` when none is stored.
   *
   * Throws when the lookup fails, so a caller can tell "no review" from
   * "could not check".
   */
  public async getSkillReview(
    runId: string,
  ): Promise<WizardGetSkillReviewResult> {
    const result = await this.rpcService.call(
      'wizard:get-skill-review',
      { runId },
      { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
    );
    if (result.isSuccess() && result.data) return result.data;
    throw new WizardRpcError(
      'The saved skill review could not be read.',
      result.errorCode,
    );
  }

  /**
   * Run the judged skill review for an analysis run
   * (`wizard:recommend-analysis-skills`). The backend stores a successful
   * review with the analysis.
   *
   * Throws a {@link WizardRpcError} carrying the RPC error code
   * (`SETUP_MODEL_INVALID`, `ANALYSIS_LOAD_FAILED`, ...) so the view can pick
   * its fixed copy.
   */
  public async recommendAnalysisSkills(
    runId: string,
  ): Promise<WizardRecommendAnalysisSkillsResult> {
    const result = await this.rpcService.call(
      'wizard:recommend-analysis-skills',
      { runId },
      { timeout: WIZARD_RPC_TIMEOUTS.SKILL_REVIEW_MS },
    );
    if (result.isSuccess() && result.data) return result.data;
    throw new WizardRpcError(
      'Could not load skill recommendations.',
      result.errorCode,
    );
  }

  /**
   * List all saved analyses from .ptah/analysis/ directory.
   * Returns metadata only (lightweight, for listing cards).
   *
   * @returns Array of saved analysis metadata sorted by date (newest first)
   */
  public async listAnalyses(options?: {
    throwOnError?: boolean;
  }): Promise<SavedAnalysisMetadata[]> {
    const result = await this.rpcService.call(
      'wizard:list-analyses',
      {},
      { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
    );

    if (result.isSuccess() && result.data) {
      const analyses = (result.data as { analyses?: unknown }).analyses;
      if (Array.isArray(analyses)) return analyses as SavedAnalysisMetadata[];
    }

    if (options?.throwOnError)
      throw new Error('Saved analyses could not be loaded.');
    return [];
  }

  /**
   * Read the status of workspace analysis.
   */
  public async getAnalysisStatus(): Promise<AnalysisStatus> {
    const result = await this.rpcService.call(
      'wizard:analysis-status',
      {},
      { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
    );
    if (result.isSuccess() && result.data) return result.data;
    throw new Error(result.error || 'Failed to check analysis status');
  }

  /** Load the manifest and phase contents by directory slug or run ID. */
  public async loadAnalysis(
    filename: string,
    workspacePath?: string,
  ): Promise<MultiPhaseAnalysisResponse> {
    // The handler also accepts a workspace to pin recovery lookups.
    const params = workspacePath ? { filename, workspacePath } : { filename };
    const result = await this.rpcService.call(
      'wizard:load-analysis',
      params,
      { timeout: WIZARD_RPC_TIMEOUTS.LIST_MS },
    );

    if (result.isSuccess() && result.data) {
      return result.data as MultiPhaseAnalysisResponse;
    }

    throw new Error(result.error || 'Failed to load analysis');
  }

}
