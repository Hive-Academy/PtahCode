/**
 * Setup RPC Handlers
 *
 * Handles setup-related RPC methods:
 * - setup-status:get-status - Get agent configuration status
 * - wizard:deep-analyze - Perform deep project analysis
 * - wizard:get-resumable-run - Resume paused analysis
 * - wizard:cancel-analysis - Cancel running analysis
 */

import * as path from 'path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { injectable, inject, DependencyContainer } from 'tsyringe';
import { z } from 'zod';
import {
  Logger,
  RpcHandler,
  RpcUserError,
  TOKENS,
} from '@ptah-extension/vscode-core';
import type { SentryService } from '@ptah-extension/vscode-core';
import { CodeExecutionMCP } from '@ptah-extension/vscode-lm-tools';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import type {
  IWorkspaceProvider,
  IFileSystemProvider,
  IMemoryWriter,
  MemoryWriteRequest,
} from '@ptah-extension/platform-core';
import { deriveWorkspaceFingerprint } from '@ptah-extension/memory-curator';
import {
  AGENT_GENERATION_TOKENS,
  normalizeAgentOutput,
  AnalysisStorageService,
  AnalysisFreshnessService,
  AnalysisClaudeMdLinker,
} from '@ptah-extension/agent-generation';
import { SDK_TOKENS, PluginLoaderService } from '@ptah-extension/agent-sdk';
import type {
  IWorkspaceLlmResolver,
  SetupResolution,
} from '@ptah-extension/agent-sdk';
import {
  SETTINGS_TOKENS,
  type WorkspaceScopeResolver,
} from '@ptah-extension/settings-core';
import type {
  ModelPair,
  SetupPairState,
  MultiPhaseAnalysisResponse,
  SavedAnalysisMetadata,
  WizardDeepAnalyzeParams,
  WizardGenerateSkillDraftParams,
  WizardGenerateSkillDraftResult,
  WizardGetSetupModelParams,
  WizardGetSetupModelResult,
  WizardSetSetupModelParams,
  WizardSetSetupModelResult,
  WizardGetResumableRunParams,
  WizardGetResumableRunResponse,
  WizardAnalysisStatusParams,
  WizardAnalysisStatusResponse,
  WizardRecommendSkillsParams,
  WizardRecommendSkillsResponse,
  WizardRecommendAnalysisSkillsParams,
  WizardRecommendAnalysisSkillsResult,
  WizardSearchSkillsParams,
  WizardSearchSkillsResponse,
  WizardGetProjectGuidanceParams,
  WizardGetProjectGuidanceResponse,
  WizardPreviewSkillsForConsentParams,
  WizardPreviewSkillsForConsentResponse,
  WizardInstallSkillsWithConsentParams,
  WizardInstallSkillsWithConsentResponse,
} from '@ptah-extension/shared';
import type {
  MultiPhaseAnalysisService,
  MultiPhaseManifest,
} from '@ptah-extension/agent-generation';
import type { RpcMethodName } from '@ptah-extension/shared';
import { isAuthorizedWorkspace } from '../utils/workspace-authorization';
import { toResumableGenerationRun } from './wizard-generation-checkpoint.service';
import {
  WizardDeepAnalyzeParamsSchema,
  WizardGetResumableRunParamsSchema,
  WizardAnalysisStatusParamsSchema,
  WizardListAnalysesParamsSchema,
  WizardLoadAnalysisParamsSchema,
  WizardRecommendSkillsParamsSchema,
  WizardRecommendAnalysisSkillsParamsSchema,
  WizardSearchSkillsParamsSchema,
  WizardGetProjectGuidanceParamsSchema,
  WizardPreviewSkillsForConsentParamsSchema,
  WizardInstallSkillsWithConsentParamsSchema,
} from './setup-rpc.schema';
import { SkillsShApiClient } from '@ptah-extension/cli-agent-runtime';
import { SkillsShRpcHandlers } from './skills-sh-rpc.handlers';
import { stageSkillsInstall, STAGED_SKILLS_REL } from '../utils/skills-sh-cli';
import {
  HARNESS_SYNC_TOKENS,
  type HarnessPropagationService,
  type SkillSyncGate,
} from '@ptah-extension/harness-sync';
import {
  SKILL_CONSENT_SERVICE,
  SKILL_DRAFT_GENERATION_SERVICE,
  SKILL_RECOMMENDATION_SERVICE,
  SKILL_SELECTION_SERVICE,
  SKILL_PROJECT_GUIDANCE_SERVICE,
} from '../di/tokens';
import type { SkillRecommendationService } from '../skills-sh/services/skill-recommendation.service';
import type { SkillDraftGenerationService } from '../skills-sh/services/skill-draft-generation.service';
import type { SkillSelectionService } from '../skills-sh/services/skill-selection.service';
import type { ProjectGuidanceService } from '../skills-sh/services/project-guidance.service';

const RECOMMEND_PRE_SEARCH_MS = 6_000;
const SETUP_RESOLUTION_MS = 15_000;
let setupCommitSeq = 0;

const SetupModelParamsSchema = z.strictObject({
  provider: z.string().trim(),
  model: z.string().trim(),
});

function draftText(max: number, multiline = false) {
  return z
    .string()
    .max(max)
    .transform((value) => {
      const text = value
        .replace(/\r\n?/g, '\n')
        .replace(/[\p{Cc}\p{Bidi_Control}]/gu, (char) =>
          multiline && char === '\n' ? '\n' : ' ',
        );
      return text.trim();
    });
}

const DraftParamsSchema = z.strictObject({
  runId: draftText(200).pipe(z.string().min(1)),
  proposalId: draftText(200).pipe(z.string().min(1)),
  proposalName: draftText(64).pipe(z.string().min(1)),
  items: z
    .array(
      z.strictObject({
        itemId: draftText(200).pipe(z.string().min(1)),
        name: draftText(200).pipe(z.string().min(1)),
        kind: draftText(200).pipe(z.string().min(1)),
        evidence: draftText(2_000, true),
        buildReasons: z.array(draftText(2_000, true)).max(10),
      }),
    )
    .min(1)
    .max(30),
});

async function beforeDeadline<T>(
  deadline: number,
  operation: () => Promise<T>,
  failure: RpcUserError,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw failure;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(failure), remaining);
    });
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeProviderId(
  provider: string | null | undefined,
): string | null {
  const cleaned = provider?.replace(/[\p{Cc}\p{Bidi_Control}]/gu, ' ').trim();
  return cleaned ? cleaned.slice(0, 64) : null;
}

function setupModelError(
  resolution?: Extract<SetupResolution, { kind: 'invalid' | 'unavailable' }>,
  fallbackProvider?: string,
): RpcUserError {
  const provider = sanitizeProviderId(resolution?.provider ?? fallbackProvider);
  const sourceLabel = resolution
    ? resolution.source === 'setup'
      ? 'Setup'
      : 'workspace'
    : null;
  const parts: string[] = [];
  if (sourceLabel && provider) {
    parts.push(`${sourceLabel} provider ${provider}`);
  } else if (sourceLabel) {
    parts.push(sourceLabel);
  } else if (provider) {
    parts.push(`Setup provider ${provider}`);
  }
  if (resolution) {
    parts.push(resolution.cause);
  }
  const detail = parts.length > 0 ? ` (${parts.join(': ')})` : '';
  return new RpcUserError(
    `The Setup model could not be resolved${detail}. Update Background models and retry.`,
    'SETUP_MODEL_INVALID',
  );
}

function requireSetup(resolution: SetupResolution) {
  if (resolution.kind === 'invalid' || resolution.kind === 'unavailable') {
    throw setupModelError(resolution);
  }
  return resolution.snapshot;
}

function setupPairState(resolution: SetupResolution): SetupPairState {
  if (resolution.kind === 'invalid' || resolution.kind === 'unavailable') {
    return resolution;
  }
  const pair = {
    provider: resolution.snapshot.providerId,
    model: resolution.snapshot.model,
  };
  return resolution.kind === 'set'
    ? { kind: 'set', pair }
    : { kind: 'unset', effective: pair };
}

type SkillConsentPort = {
  hasScripts(packagePath: string): boolean;
  computeContentHash(packagePath: string): string;
  canInstall(skillName: string, contentHash: string): boolean;
  recordConsent(skillName: string, contentHash: string): void;
};

/**
 * SetupStatus response type for setup-status:get-status RPC method
 */
interface SetupStatusResponse {
  isConfigured: boolean;
  agentCount: number;
  lastModified: string | null;
  projectAgents: string[];
  userAgents: string[];
}

/**
 * RPC handlers for setup operations
 */
@injectable()
export class SetupRpcHandlers {
  static readonly METHODS = [
    'setup-status:get-status',
    'wizard:deep-analyze',
    'wizard:get-setup-model',
    'wizard:set-setup-model',
    'wizard:generate-skill-draft',
    'wizard:get-resumable-run',
    'wizard:analysis-status',
    'wizard:recommend-skills',
    'wizard:recommend-analysis-skills',
    'wizard:search-skills',
    'wizard:get-project-guidance',
    'wizard:preview-skills-for-consent',
    'wizard:install-skills-with-consent',
    'wizard:cancel-analysis',
    'wizard:list-analyses',
    'wizard:load-analysis',
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.RPC_HANDLER) private readonly rpcHandler: RpcHandler,
    @inject(SDK_TOKENS.SDK_PLUGIN_LOADER)
    private readonly pluginLoader: PluginLoaderService,
    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspaceProvider: IWorkspaceProvider,
    @inject(PLATFORM_TOKENS.DI_CONTAINER)
    private readonly container: DependencyContainer,
    @inject(TOKENS.SENTRY_SERVICE)
    private readonly sentryService: SentryService,
    @inject(SkillsShApiClient)
    private readonly skillsShApi: SkillsShApiClient,
  ) {}

  /**
   * Safely resolve a service from the DI container with validation.
   */
  private resolveService<T>(token: symbol | string, serviceName: string): T {
    try {
      const service = this.container.resolve(token);

      if (service === null || service === undefined) {
        throw new Error(`${serviceName} resolved to null/undefined`);
      }

      return service as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to resolve ${serviceName}`, { error: message });
      throw new Error(
        `${serviceName} not available. Ensure the agent-generation module is properly initialized. Details: ${message}`,
      );
    }
  }

  /**
   * Safely read the active in-process analysis run for a workspace without
   * failing in test or minimal DI containers where MultiPhaseAnalysisService
   * is not registered.
   */
  private getActiveAnalysisRun(
    workspaceRoot: string,
  ): ReturnType<MultiPhaseAnalysisService['getActiveRun']> {
    try {
      const multiPhaseService =
        this.container.resolve<MultiPhaseAnalysisService>(
          AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        );
      return multiPhaseService &&
        typeof multiPhaseService.getActiveRun === 'function'
        ? multiPhaseService.getActiveRun(workspaceRoot)
        : null;
    } catch {
      // degradation-audit: optional-capability - tests or minimal containers may not register MultiPhaseAnalysisService
      return null;
    }
  }

  /**
   * Resolve plugin paths for the analysis run.
   */
  private resolvePluginPaths(): string[] | undefined {
    try {
      const config = this.pluginLoader.getWorkspacePluginConfig();
      if (!config.enabledPluginIds || config.enabledPluginIds.length === 0) {
        return undefined;
      }
      const paths = this.pluginLoader.resolvePluginPaths(
        config.enabledPluginIds,
      );
      return paths.length > 0 ? paths : undefined;
    } catch (error) {
      // degradation-audit: optional-capability - plugin paths are an optional
      // analysis input; undefined runs the analysis with no plugin dirs.
      this.logger.debug('Failed to resolve plugin paths for analysis', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Register all setup RPC methods
   */
  register(): void {
    this.registerGetStatus();
    this.registerDeepAnalyze();
    this.registerSetupModel();
    this.registerGenerateSkillDraft();
    this.registerGetResumableRun();
    this.registerAnalysisStatus();
    this.registerRecommendSkills();
    this.registerRecommendAnalysisSkills();
    this.registerSearchSkills();
    this.registerGetProjectGuidance();
    this.registerPreviewSkillsForConsent();
    this.registerInstallSkillsWithConsent();
    this.registerCancelAnalysis();
    this.registerListAnalyses();
    this.registerLoadAnalysis();

    this.logger.debug('Setup RPC handlers registered', {
      methods: [...SetupRpcHandlers.METHODS],
    });
  }

  /** Parse RPC params at the boundary; a schema failure is a typed user error. */
  private parse<T>(schema: z.ZodType<T>, params: unknown): T {
    const result = schema.safeParse(params ?? {});
    if (!result.success) {
      throw new RpcUserError(
        'Invalid setup wizard request parameters.',
        'INVALID_PARAMS',
      );
    }
    return result.data;
  }

  private async resolveSetup(
    workspaceRoot: string | undefined,
    deadline = Date.now() + SETUP_RESOLUTION_MS,
    pair?: ModelPair,
  ): Promise<SetupResolution> {
    const failure = setupModelError(undefined, pair?.provider);
    try {
      return await beforeDeadline(
        deadline,
        () => {
          const resolver = this.container.resolve<IWorkspaceLlmResolver>(
            SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER,
          );
          if (!pair) return resolver.resolveSetup(workspaceRoot);
          if (!resolver.validateSetupPair) throw failure;
          return resolver.validateSetupPair(workspaceRoot, pair);
        },
        failure,
      );
    } catch {
      throw failure;
    }
  }

  private registerSetupModel(): void {
    this.rpcHandler.registerMethod<
      WizardGetSetupModelParams,
      WizardGetSetupModelResult
    >('wizard:get-setup-model', async (rawParams) => {
      this.parse(z.strictObject({}), rawParams);
      const resolution = await this.resolveSetup(
        this.workspaceProvider.getWorkspaceRoot(),
      );
      const state = setupPairState(resolution);
      return resolution.kind === 'set'
        ? { state, committed: resolution.storedPair }
        : { state };
    });

    this.rpcHandler.registerMethod<
      WizardSetSetupModelParams,
      WizardSetSetupModelResult
    >('wizard:set-setup-model', async (rawParams) => {
      const pair = this.parse(SetupModelParamsSchema, rawParams);
      const workspaceRoot = this.workspaceProvider.getWorkspaceRoot();
      if (pair.provider || pair.model) {
        requireSetup(await this.resolveSetup(workspaceRoot, undefined, pair));
      }

      let committed: ModelPair | null;
      try {
        const scope = this.container.resolve<WorkspaceScopeResolver>(
          SETTINGS_TOKENS.WORKSPACE_SCOPE_RESOLVER,
        );
        committed = await scope.commitSetupPair(pair);
      } catch {
        this.logger.warn('Could not persist the Setup model settings.');
        throw new RpcUserError(
          'Could not save the Setup model.',
          'PERSISTENCE_UNAVAILABLE',
        );
      }
      const commitSeq = ++setupCommitSeq;
      let state: SetupPairState;
      try {
        state = setupPairState(await this.resolveSetup(workspaceRoot));
      } catch {
        this.logger.warn(
          'Could not resolve the Setup model state after commit.',
        );
        state = {
          kind: 'unavailable',
          source: committed ? 'setup' : 'workspace',
          provider: committed?.provider ?? '',
          model: committed?.model ?? '',
          cause: 'provider-unavailable',
        };
      }
      return { committed, state, commitSeq };
    });
  }

  private registerGenerateSkillDraft(): void {
    this.rpcHandler.registerMethod<
      WizardGenerateSkillDraftParams,
      WizardGenerateSkillDraftResult
    >('wizard:generate-skill-draft', async (rawParams) => {
      const params = this.parse(DraftParamsSchema, rawParams);
      try {
        const service = this.container.resolve<SkillDraftGenerationService>(
          SKILL_DRAFT_GENERATION_SERVICE,
        );
        return await service.generateDraft(
          params,
          this.workspaceProvider.getWorkspaceRoot(),
        );
      } catch {
        this.logger.warn('Could not generate the skill draft.');
        return {
          ok: false,
          category: 'provider-error',
          message: 'Could not generate the skill draft.',
        };
      }
    });
  }

  /**
   * setup-status:get-status - Get agent configuration status
   */
  private registerGetStatus(): void {
    this.rpcHandler.registerMethod<void, SetupStatusResponse>(
      'setup-status:get-status',
      async () => {
        this.logger.debug('RPC: setup-status:get-status called');

        const workspaceRoot = this.workspaceProvider.getWorkspaceRoot();
        if (!workspaceRoot) {
          throw new RpcUserError(
            'No workspace folder open. Please open a folder to configure agents.',
            'WORKSPACE_NOT_OPEN',
          );
        }

        const setupStatusService = this.resolveService<{
          getStatus: (workspacePath: string) => Promise<{
            isErr: () => boolean;
            value?: SetupStatusResponse;
            error?: Error;
          }>;
        }>(AGENT_GENERATION_TOKENS.SETUP_STATUS_SERVICE, 'SetupStatusService');

        const result = await setupStatusService.getStatus(workspaceRoot);

        if (result.isErr()) {
          this.logger.error('Failed to get setup status', result.error);
          throw new Error(
            result.error?.message || 'Failed to retrieve agent setup status',
          );
        }

        return result.value as SetupStatusResponse;
      },
    );
  }

  /**
   * wizard:deep-analyze - Perform deep project analysis.
   *
   * With `resume: true` the service continues the workspace's unfinished
   * version-3 manifest instead of starting a fresh run. The response is the
   * same either way; a paused run comes back with `lifecycle: 'paused'`.
   */
  private registerDeepAnalyze(): void {
    this.rpcHandler.registerMethod<
      WizardDeepAnalyzeParams & { workspacePath?: string },
      MultiPhaseAnalysisResponse
    >('wizard:deep-analyze', async (rawParams) => {
      const params = this.parse(WizardDeepAnalyzeParamsSchema, rawParams);
      this.logger.debug('RPC: wizard:deep-analyze called', {
        resume: params.resume === true,
      });

      const workspaceRoot =
        params?.workspacePath || this.workspaceProvider.getWorkspaceRoot();
      if (!workspaceRoot) {
        throw new RpcUserError(
          'No workspace folder open. Please open a folder to analyze.',
          'WORKSPACE_NOT_OPEN',
        );
      }
      if (
        params?.workspacePath &&
        !isAuthorizedWorkspace(params.workspacePath, this.workspaceProvider)
      ) {
        throw new RpcUserError(
          'Access denied: workspace path is not an open folder.',
          'UNAUTHORIZED_WORKSPACE',
        );
      }

      let mcpServerRunning = false;
      let mcpPort: number | undefined;
      try {
        const codeExecutionMcp = this.resolveService<CodeExecutionMCP>(
          TOKENS.CODE_EXECUTION_MCP,
          'CodeExecutionMCP',
        );
        const actualPort = codeExecutionMcp.getPort();
        mcpServerRunning = actualPort !== null;
        mcpPort = actualPort ?? undefined;
      } catch (error) {
        this.logger.debug('Could not resolve MCP service for analysis', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (!mcpServerRunning) {
        throw new Error('MCP server required for workspace analysis.');
      }

      const setupSnapshot = requireSetup(
        await this.resolveSetup(workspaceRoot),
      );
      const pluginPaths = this.resolvePluginPaths();

      const multiPhaseService = this.resolveService<MultiPhaseAnalysisService>(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        'MultiPhaseAnalysisService',
      );

      const multiPhaseResult = await multiPhaseService.analyzeWorkspace(
        workspaceRoot,
        {
          setupSnapshot,
          mcpServerRunning,
          mcpPort,
          pluginPaths,
          resume: params.resume === true,
        },
      );

      if (multiPhaseResult.isErr() || !multiPhaseResult.value) {
        throw new Error(
          multiPhaseResult.error?.message ||
            'Multi-phase analysis failed. Please try again.',
        );
      }

      const manifest = multiPhaseResult.value;

      const storageService = this.resolveService<AnalysisStorageService>(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        'AnalysisStorageService',
      );

      const slugDir = storageService.getSlugDir(workspaceRoot, manifest.slug);

      const phaseContents = await this.readCompletedPhases(
        storageService,
        slugDir,
        manifest,
      );

      this.logger.info('Multi-phase analysis settled', {
        slug: manifest.slug,
        lifecycle: manifest.lifecycle,
        totalDurationMs: manifest.totalDurationMs,
        completedPhases: Object.entries(manifest.phases)
          .filter(([, r]) => r.status === 'completed')
          .map(([id]) => id),
        phaseContentCount: Object.keys(phaseContents).length,
      });
      try {
        await this.seedWizardMemory(workspaceRoot, manifest, phaseContents);
      } catch (error) {
        this.logger.warn('[SetupWizard] Memory seeding failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
          stage: 'outer-guard',
          workspaceRoot,
        });
      }

      return storageService.toResponse(slugDir, manifest, phaseContents);
    });
  }

  /**
   * wizard:get-resumable-run - Read-only discovery of an unfinished run.
   *
   * Returns the latest resumable analysis (as the same response
   * `wizard:deep-analyze` gives) and, when present, its generation checkpoint
   * DTO. Nothing on disk is changed; the UI decides whether to call
   * `wizard:deep-analyze { resume: true }` or
   * `wizard:submit-selection { resume: true }`.
   */
  private registerGetResumableRun(): void {
    this.rpcHandler.registerMethod<
      WizardGetResumableRunParams,
      WizardGetResumableRunResponse
    >('wizard:get-resumable-run', async (rawParams) => {
      this.parse(WizardGetResumableRunParamsSchema, rawParams);
      this.logger.debug('RPC: wizard:get-resumable-run called');
      const none: WizardGetResumableRunResponse = {
        analysis: null,
        generation: null,
        analysisActive: false,
      };

      const workspaceRoot = this.workspaceProvider.getWorkspaceRoot();
      if (!workspaceRoot) return none;

      const activeBefore = this.getActiveAnalysisRun(workspaceRoot);
      const storageService = this.resolveService<AnalysisStorageService>(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        'AnalysisStorageService',
      );
      let run = await storageService.findLatestResumableRun(workspaceRoot);
      let activeAfter = this.getActiveAnalysisRun(workspaceRoot);
      if (
        activeBefore !== null &&
        activeAfter === null &&
        run?.manifest?.lifecycle === 'running'
      ) {
        run = await storageService.findLatestResumableRun(workspaceRoot);
        activeAfter = this.getActiveAnalysisRun(workspaceRoot);
      }

      if (!run) {
        return activeAfter
          ? {
              analysis: null,
              generation: null,
              analysisActive: true,
              activeAnalysisStartedAt: activeAfter.startedAt,
            }
          : none;
      }

      let analysis: MultiPhaseAnalysisResponse | null = null;
      if (run.manifest && run.slugDir) {
        const phaseContents = await this.readCompletedPhases(
          storageService,
          run.slugDir,
          run.manifest,
        );
        analysis = storageService.toResponse(
          run.slugDir,
          run.manifest,
          phaseContents,
        );
      }

      const wasActiveBeforePhases = activeAfter !== null;
      activeAfter = this.getActiveAnalysisRun(workspaceRoot);
      if (
        wasActiveBeforePhases &&
        activeAfter === null &&
        run.manifest?.lifecycle === 'running'
      ) {
        const refreshed =
          await storageService.findLatestResumableRun(workspaceRoot);
        activeAfter = this.getActiveAnalysisRun(workspaceRoot);
        if (!refreshed) {
          return activeAfter
            ? {
                analysis: null,
                generation: null,
                analysisActive: true,
                activeAnalysisStartedAt: activeAfter.startedAt,
              }
            : none;
        }
        run = refreshed;
        if (run.manifest && run.slugDir) {
          const phaseContents = await this.readCompletedPhases(
            storageService,
            run.slugDir,
            run.manifest,
          );
          analysis = storageService.toResponse(
            run.slugDir,
            run.manifest,
            phaseContents,
          );
        } else {
          analysis = null;
        }
      }

      const generation = run.generation
        ? toResumableGenerationRun(run.generation)
        : null;

      this.logger.info('Resumable wizard run discovered', {
        analysisLifecycle: run.manifest?.lifecycle ?? null,
        generationLifecycle: generation?.lifecycle ?? null,
        analysisActive: activeAfter !== null,
      });
      return {
        analysis,
        generation,
        ...(activeAfter
          ? {
              analysisActive: true,
              activeAnalysisStartedAt: activeAfter.startedAt,
            }
          : { analysisActive: false }),
      };
    });
  }

  /** Report whether the current workspace analysis is usable. */
  private registerAnalysisStatus(): void {
    this.rpcHandler.registerMethod<
      WizardAnalysisStatusParams,
      WizardAnalysisStatusResponse
    >('wizard:analysis-status', async (rawParams) => {
      this.parse(WizardAnalysisStatusParamsSchema, rawParams);
      const freshnessService = this.resolveService<AnalysisFreshnessService>(
        AGENT_GENERATION_TOKENS.ANALYSIS_FRESHNESS_SERVICE,
        'AnalysisFreshnessService',
      );
      const workspaceRoot = this.workspaceProvider.getWorkspaceRoot() ?? null;
      const activeRun = workspaceRoot
        ? this.getActiveAnalysisRun(workspaceRoot)
        : null;
      return activeRun
        ? freshnessService.getStatus(workspaceRoot, {
            excludeRunId: activeRun.runId,
            excludeSlug: activeRun.slug,
          })
        : freshnessService.getStatus(workspaceRoot);
    });
  }

  /** Contents of every `completed` phase file; failed partials stay excluded. */
  private async readCompletedPhases(
    storageService: AnalysisStorageService,
    slugDir: string,
    manifest: MultiPhaseManifest,
  ): Promise<Record<string, string>> {
    const phaseContents: Record<string, string> = {};
    for (const [phaseId, phaseResult] of Object.entries(manifest.phases)) {
      if (phaseResult.status !== 'completed') continue;
      const content = await storageService.readPhaseFile(
        slugDir,
        phaseResult.file,
      );
      if (content) phaseContents[phaseId] = content;
    }
    return phaseContents;
  }

  /**
   * wizard:cancel-analysis - Cancel a running workspace analysis
   */
  private registerCancelAnalysis(): void {
    this.rpcHandler.registerMethod<void, { cancelled: boolean }>(
      'wizard:cancel-analysis',
      async () => {
        this.logger.debug('RPC: wizard:cancel-analysis called');

        let cancelled = false;

        try {
          const multiPhaseService = this.resolveService<{
            cancelAnalysis: () => void;
          }>(
            AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
            'MultiPhaseAnalysisService',
          );

          multiPhaseService.cancelAnalysis();
          cancelled = true;
          this.logger.info('Multi-phase analysis cancellation requested');
        } catch (error) {
          this.logger.debug(
            'Could not cancel multi-phase analysis (may not be running)',
            {
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }

        try {
          const agenticService = this.resolveService<{
            cancelAnalysis: () => void;
          }>(
            AGENT_GENERATION_TOKENS.AGENTIC_ANALYSIS_SERVICE,
            'AgenticAnalysisService',
          );

          agenticService.cancelAnalysis();
          cancelled = true;
          this.logger.info('Agentic analysis cancellation requested');
        } catch (error) {
          this.logger.debug(
            'Could not cancel agentic analysis (may not be running)',
            {
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }

        return { cancelled };
      },
    );
  }

  /**
   * wizard:list-analyses - List saved analyses from .ptah/analysis/
   */
  private registerListAnalyses(): void {
    this.rpcHandler.registerMethod<
      { workspacePath?: string },
      { analyses: SavedAnalysisMetadata[] }
    >('wizard:list-analyses', async (rawParams) => {
      const params = this.parse(WizardListAnalysesParamsSchema, rawParams);
      this.logger.debug('RPC: wizard:list-analyses called');

      const workspaceRoot =
        params?.workspacePath || this.workspaceProvider.getWorkspaceRoot();
      if (!workspaceRoot) {
        return { analyses: [] };
      }
      if (
        params?.workspacePath &&
        !isAuthorizedWorkspace(params.workspacePath, this.workspaceProvider)
      ) {
        throw new RpcUserError(
          'Access denied: workspace path is not an open folder.',
          'UNAUTHORIZED_WORKSPACE',
        );
      }

      const storageService = this.resolveService<AnalysisStorageService>(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        'AnalysisStorageService',
      );

      const analyses = await storageService.list(workspaceRoot);
      const activeRun = this.getActiveAnalysisRun(workspaceRoot);
      if (!activeRun || activeRun.slug === null) {
        return { analyses };
      }
      return {
        analyses: analyses.map((item) =>
          item.filename === activeRun.slug ? { ...item, isActive: true } : item,
        ),
      };
    });
  }

  /**
   * wizard:load-analysis - Load a specific saved multi-phase analysis
   */
  private registerLoadAnalysis(): void {
    this.rpcHandler.registerMethod<
      { filename: string; workspacePath?: string },
      MultiPhaseAnalysisResponse
    >('wizard:load-analysis', async (rawParams) => {
      const params = this.parse(WizardLoadAnalysisParamsSchema, rawParams);
      this.logger.debug('RPC: wizard:load-analysis called', {
        filename: params.filename,
      });

      const workspaceRoot =
        params?.workspacePath || this.workspaceProvider.getWorkspaceRoot();
      if (!workspaceRoot) {
        throw new RpcUserError(
          'No workspace folder open.',
          'WORKSPACE_NOT_OPEN',
        );
      }
      if (
        params?.workspacePath &&
        !isAuthorizedWorkspace(params.workspacePath, this.workspaceProvider)
      ) {
        throw new RpcUserError(
          'Access denied: workspace path is not an open folder.',
          'UNAUTHORIZED_WORKSPACE',
        );
      }

      let loaded: MultiPhaseAnalysisResponse;
      try {
        const storageService = this.container.resolve<AnalysisStorageService>(
          AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        );
        loaded = await storageService.loadMultiPhase(
          workspaceRoot,
          path.basename(params.filename),
        );
      } catch {
        this.logger.warn('Could not read the saved analysis.');
        throw new RpcUserError(
          'Could not read the saved analysis.',
          'ANALYSIS_LOAD_FAILED',
        );
      }
      if (loaded.manifest.lifecycle === 'completed') {
        const linker = this.resolveService<AnalysisClaudeMdLinker>(
          AGENT_GENERATION_TOKENS.ANALYSIS_CLAUDE_MD_LINKER,
          'AnalysisClaudeMdLinker',
        );
        const linked = await linker.link(workspaceRoot);
        if (linked.error)
          this.logger.warn(`Analysis CLAUDE.md link: ${linked.error}`);
      }
      return loaded;
    });
  }

  private registerRecommendAnalysisSkills(): void {
    this.rpcHandler.registerMethod<
      WizardRecommendAnalysisSkillsParams,
      WizardRecommendAnalysisSkillsResult
    >('wizard:recommend-analysis-skills', async (rawParams) => {
      const rpcEntry = Date.now();
      const { runId } = this.parse(
        WizardRecommendAnalysisSkillsParamsSchema,
        rawParams,
      );
      const empty = (
        warning: string,
        analysisPair: ModelPair | null = null,
      ): WizardRecommendAnalysisSkillsResult => ({
        skills: [],
        detectedItems: [],
        unmatchedItems: [],
        searchFailures: [],
        summarySource: 'none',
        warning,
        analysisPair,
        judge: {
          method: 'none',
          counts: { decision: 0, normal: 0, notJudged: 0 },
          items: [],
          candidates: [],
          proposals: [],
          stages: [],
        },
      });

      const workspaceRoot = this.workspaceProvider.getWorkspaceRoot();
      if (!workspaceRoot)
        return empty('Open a workspace to review recommended skills.');

      const preSearchDeadline = rpcEntry + RECOMMEND_PRE_SEARCH_MS;
      const resolved = requireSetup(
        await this.resolveSetup(workspaceRoot, preSearchDeadline),
      );
      const loadError = new RpcUserError(
        'Could not read the saved analysis.',
        'ANALYSIS_LOAD_FAILED',
      );
      let saved: MultiPhaseAnalysisResponse | null;
      try {
        saved = await beforeDeadline(
          preSearchDeadline,
          () => {
            const storage = this.container.resolve<AnalysisStorageService>(
              AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
            );
            return storage.loadByRunId(workspaceRoot, runId);
          },
          loadError,
        );
      } catch {
        this.logger.warn(loadError.message);
        throw loadError;
      }

      if (!saved)
        return empty('The saved analysis run was not found in this workspace.');
      const analysisPair = saved.analysisPair ?? null;
      const summary = saved.stackSummary;
      if (!summary?.items.length)
        return empty(
          'No technology stack was found in this analysis.',
          analysisPair,
        );

      try {
        const recommendation =
          this.container.resolve<SkillRecommendationService>(
            SKILL_RECOMMENDATION_SERVICE,
          );
        return await recommendation.recommendAnalysis({
          workspaceRoot,
          items: summary.items,
          summarySource: summary.source,
          search: (query) => this.skillsShApi.search(query),
          rpcEntry,
          resolved,
          analysisPair,
        });
      } catch (error: unknown) {
        if (error instanceof RpcUserError) throw error;
        this.logger.warn('Could not load skill recommendations.');
        throw new RpcUserError(
          'Could not load skill recommendations.',
          'SKILLS_RECOMMEND_FAILED',
        );
      }
    });
  }

  private registerRecommendSkills(): void {
    this.rpcHandler.registerMethod<
      WizardRecommendSkillsParams,
      WizardRecommendSkillsResponse
    >('wizard:recommend-skills', async (rawParams) => {
      const { analysis } = this.parse(
        WizardRecommendSkillsParamsSchema,
        rawParams,
      );
      const root = this.workspaceProvider.getWorkspaceRoot();
      if (!root)
        throw new RpcUserError(
          'No workspace folder open.',
          'WORKSPACE_NOT_OPEN',
        );
      const packageContents = await fs
        .readFile(path.join(root, 'package.json'), 'utf8')
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            this.logger.debug(
              '[Setup] package.json missing for skill recommendation',
            );
            return '{}';
          }
          this.logger.error('[Setup] could not read package.json', error);
          throw error;
        });
      const parsedPackage: unknown = JSON.parse(packageContents);
      const packageJson =
        parsedPackage &&
        typeof parsedPackage === 'object' &&
        !Array.isArray(parsedPackage)
          ? (parsedPackage as Record<string, unknown>)
          : {};
      const dependencyNames = (value: unknown): string[] =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null)
          ? Object.keys(value)
          : [];
      const dependencies = [
        ...new Set([
          ...dependencyNames(packageJson['dependencies']),
          ...dependencyNames(packageJson['devDependencies']),
          ...dependencyNames(packageJson['optionalDependencies']),
        ]),
      ];
      const service = this.resolveService<SkillRecommendationService>(
        SKILL_RECOMMENDATION_SERVICE,
        'SkillRecommendationService',
      );
      const recommendations = await service.recommend({
        analysis: normalizeAgentOutput(analysis),
        dependencies,
        search: (query) => this.skillsShApi.search(query),
      });
      const selection = this.resolveService<SkillSelectionService>(
        SKILL_SELECTION_SERVICE,
        'SkillSelectionService',
      );
      return {
        skills: selection
          .select(recommendations)
          .map(({ skill, evidence, score }) => ({ skill, evidence, score })),
      };
    });
  }

  private registerSearchSkills(): void {
    this.rpcHandler.registerMethod<
      WizardSearchSkillsParams,
      WizardSearchSkillsResponse
    >('wizard:search-skills', async (rawParams) => {
      const { query } = this.parse(WizardSearchSkillsParamsSchema, rawParams);
      return { skills: await this.skillsShApi.search(query) };
    });
  }

  private registerGetProjectGuidance(): void {
    this.rpcHandler.registerMethod<
      WizardGetProjectGuidanceParams,
      WizardGetProjectGuidanceResponse
    >('wizard:get-project-guidance', async (rawParams) => {
      const { analysis, ownerDecision } = this.parse(
        WizardGetProjectGuidanceParamsSchema.extend({
          ownerDecision: z.enum(['match', 'raise']).optional(),
        }),
        rawParams,
      );
      const service = this.resolveService<ProjectGuidanceService>(
        SKILL_PROJECT_GUIDANCE_SERVICE,
        'ProjectGuidanceService',
      );
      const supplied = rawParams?.analysis;
      const source =
        supplied && typeof supplied === 'object'
          ? (supplied as unknown as Record<string, unknown>)
          : {};
      const normalized = normalizeAgentOutput(analysis);
      return service.getGuidance(
        {
          frameworks: Object.hasOwn(source, 'frameworks')
            ? normalized.frameworks
            : [],
          ...(Object.hasOwn(source, 'architecturePatterns')
            ? { architecturePatterns: normalized.architecturePatterns }
            : {}),
          ...(Object.hasOwn(source, 'codeConventions') &&
          source['codeConventions'] &&
          typeof source['codeConventions'] === 'object' &&
          Object.keys(source['codeConventions']).length > 0
            ? { codeConventions: normalized.codeConventions }
            : {}),
          ...(Object.hasOwn(source, 'existingIssues')
            ? { existingIssues: normalized.existingIssues }
            : {}),
        },
        this.workspaceProvider.getWorkspaceRoot() ?? undefined,
        ownerDecision,
      );
    });
  }

  private registerPreviewSkillsForConsent(): void {
    this.rpcHandler.registerMethod<
      WizardPreviewSkillsForConsentParams,
      WizardPreviewSkillsForConsentResponse
    >('wizard:preview-skills-for-consent', async (rawParams) => {
      const { skills } = this.parse(
        WizardPreviewSkillsForConsentParamsSchema,
        rawParams,
      );
      const consent = this.resolveService<SkillConsentPort>(
        SKILL_CONSENT_SERVICE,
        'SkillConsentService',
      );
      const previews = [];
      for (const skillName of [...new Set(skills)]) {
        const { packagePath, stagingDir } =
          await this.stageConsentSkill(skillName);
        try {
          const files = await this.listSkillFiles(packagePath);
          const scriptFiles = files.filter((file) =>
            /\.(sh|ps1|bat|cmd|js|mjs|cjs|ts|py|rb)$/i.test(file),
          );
          previews.push({
            skillName,
            files,
            scriptFiles,
            hasScripts: consent.hasScripts(packagePath),
            contentHash: consent.computeContentHash(packagePath),
          });
        } finally {
          await fs.rm(stagingDir, { recursive: true, force: true });
        }
      }
      return { skills: previews };
    });
  }

  private async listSkillFiles(
    root: string,
    relativeDir = '',
  ): Promise<string[]> {
    const directory = path.join(root, relativeDir);
    if (
      !this.isInsideRoot(await fs.realpath(directory), await fs.realpath(root))
    )
      throw new RpcUserError('Skill path escapes its root.', 'INVALID_PARAMS');
    const entries = await fs.readdir(directory, {
      withFileTypes: true,
    });
    const files: string[] = [];
    for (const entry of entries) {
      const relativePath = path.posix.join(
        relativeDir.replaceAll('\\', '/'),
        entry.name,
      );
      if (entry.isDirectory())
        files.push(...(await this.listSkillFiles(root, relativePath)));
      else if (entry.isFile()) {
        if (
          !this.isInsideRoot(
            await fs.realpath(path.join(root, relativePath)),
            await fs.realpath(root),
          )
        )
          throw new RpcUserError(
            'Skill path escapes its root.',
            'INVALID_PARAMS',
          );
        files.push(relativePath);
      }
    }
    return files.sort();
  }

  private isInsideRoot(candidate: string, root: string): boolean {
    const rel = path.relative(root, candidate);
    return (
      rel === '' ||
      (rel !== '..' &&
        !rel.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(rel))
    );
  }

  private async stageConsentSkill(
    skillName: string,
  ): Promise<{ packagePath: string; stagingDir: string }> {
    const parts = skillName.split('/');
    if (
      parts.length !== 3 ||
      parts.some((part) => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part))
    ) {
      throw new RpcUserError(
        'Invalid skill name. Expected owner/repo/skill.',
        'INVALID_PARAMS',
      );
    }
    const [owner, repo, skillId] = parts;
    const stagingDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ptah-skill-consent-'),
    );
    try {
      const staged = await stageSkillsInstall(
        { source: `${owner}/${repo}`, skillId },
        stagingDir,
      );
      const packagePath = path.join(stagingDir, ...STAGED_SKILLS_REL, skillId);
      const packageStat = await fs
        .stat(packagePath)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            this.logger.debug('[Setup] staged skill directory missing');
            return null;
          }
          this.logger.error('[Setup] could not stat staged skill', error);
          throw error;
        });
      if (!staged.success || !packageStat?.isDirectory()) {
        throw new RpcUserError(
          'Could not stage skill for consent.',
          'INVALID_PARAMS',
        );
      }
      if (
        !this.isInsideRoot(
          await fs.realpath(packagePath),
          await fs.realpath(stagingDir),
        )
      )
        throw new RpcUserError(
          'Skill path escapes its root.',
          'INVALID_PARAMS',
        );
      return { packagePath, stagingDir };
    } catch (error) {
      await fs.rm(stagingDir, { recursive: true, force: true });
      throw error;
    }
  }

  private registerInstallSkillsWithConsent(): void {
    this.rpcHandler.registerMethod<
      WizardInstallSkillsWithConsentParams,
      WizardInstallSkillsWithConsentResponse
    >('wizard:install-skills-with-consent', async (rawParams) => {
      const params = this.parse(
        WizardInstallSkillsWithConsentParamsSchema,
        rawParams,
      );
      if (params.skills.length === 0) return { success: true, installed: [] };
      const workspaceRoot = this.workspaceProvider.getWorkspaceRoot();
      if (!workspaceRoot)
        throw new RpcUserError(
          'No workspace folder open.',
          'WORKSPACE_NOT_OPEN',
        );
      const consent = this.resolveService<SkillConsentPort>(
        SKILL_CONSENT_SERVICE,
        'SkillConsentService',
      );
      const installed: string[] = [];
      let failure: { failedSkill: string; reason: string } | undefined;
      const installer = this.container.resolve(SkillsShRpcHandlers);
      for (const skillName of [...new Set(params.skills)]) {
        const parts = skillName.split('/');
        if (
          parts.length !== 3 ||
          parts.some((part) => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part))
        ) {
          failure = {
            failedSkill: skillName,
            reason: 'Invalid skill name. Expected owner/repo/skill.',
          };
          break;
        }
        try {
          const [owner, repo, skillId] = parts;
          let verifiedHash: string | undefined;
          let hasScripts = false;
          const result = await installer.install(
            { source: `${owner}/${repo}`, skillId, scope: 'workspace' },
            (staged) => {
              if (staged.length !== 1 || staged[0].slug !== skillId) {
                throw new RpcUserError(
                  'Unexpected skill in install.',
                  'INVALID_PARAMS',
                );
              }
              const dir = staged[0].dir;
              const expectedHash = consent.computeContentHash(dir);
              verifiedHash = expectedHash;
              const record = params.consentRecords.find(
                (entry) => entry.skillName === skillName,
              );
              if (record && record.contentHash.toLowerCase() !== expectedHash) {
                throw new RpcUserError(
                  'Skill content changed since preview. Preview it again.',
                  'INVALID_PARAMS',
                );
              }
              hasScripts = consent.hasScripts(dir);
              if (hasScripts) {
                const approved = !!record;
                if (!approved && !consent.canInstall(skillName, expectedHash)) {
                  throw new RpcUserError(
                    'This skill contains scripts and requires consent for its current content.',
                    'INVALID_PARAMS',
                  );
                }
              }
            },
          );
          if (!result.success || !verifiedHash)
            throw new Error('Skill install failed.');
          if (hasScripts) consent.recordConsent(skillName, verifiedHash);
          installed.push(skillName);
          this.skillsShApi.invalidateInstallCaches();
        } catch (error) {
          this.logger.error(
            `Failed to install skill ${skillName}`,
            error instanceof Error ? error : new Error(String(error)),
          );
          failure = {
            failedSkill: skillName,
            reason:
              error instanceof RpcUserError
                ? error.message
                : 'Skill install failed.',
          };
          break;
        }
      }
      if (installed.length === 0)
        return { success: false, installed, ...failure };
      const gate = this.resolveService<SkillSyncGate>(
        HARNESS_SYNC_TOKENS.SKILL_SYNC_GATE,
        'SkillSyncGate',
      );
      const selectionSaved = gate.keepSelected(
        workspaceRoot,
        installed.map((name) => name.split('/')[2]),
      );
      if (!selectionSaved) {
        throw new RpcUserError(
          'Could not save the skill selection.',
          'PERSISTENCE_UNAVAILABLE',
        );
      }
      const propagation = this.resolveService<HarnessPropagationService>(
        HARNESS_SYNC_TOKENS.PROPAGATION,
        'HarnessPropagationService',
      );
      await propagation.propagate(
        workspaceRoot,
        'wizard:install-skills-with-consent',
      );
      return { success: !failure, installed, ...failure };
    });
  }

  /**
   * Seed three memory entries (project-profile, code-conventions, key-files)
   * from a finalized multi-phase analysis. Non-blocking and non-fatal — the
   * caller awaits this but any failure is logged and swallowed so the wizard
   * analysis response always reaches the RPC caller.
   *
   * Layered safety (plan §3.8):
   *  1. Resolution guard — `resolveMemoryWriterOrNull()` returns null when no
   *     adapter is registered (current VS Code state) → log skip + return.
   *  2. Fingerprint guard — try/catch around `deriveWorkspaceFingerprint`.
   *  3. Per-seed try/catch — each upsert is independent.
   */
  private async seedWizardMemory(
    workspaceRoot: string,
    manifest: MultiPhaseManifest,
    phaseContents: Record<string, string>,
  ): Promise<void> {
    const writer = this.resolveMemoryWriterOrNull();
    if (!writer) {
      this.logger.info(
        '[SetupWizard] Memory seeding skipped (store unavailable)',
      );
      return;
    }

    let fingerprintResult: Awaited<
      ReturnType<typeof deriveWorkspaceFingerprint>
    >;
    try {
      const fs = this.resolveService<IFileSystemProvider>(
        PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER,
        'IFileSystemProvider',
      );
      fingerprintResult = await deriveWorkspaceFingerprint(workspaceRoot, fs);
    } catch (error: unknown) {
      // degradation-audit: optional-capability - workspace fingerprinting is
      // the optional memory-seeding step; returning skips seeding and leaves
      // the wizard's generated output intact.
      this.logger.warn('[SetupWizard] Memory seeding failed (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        stage: 'fingerprint',
      });
      return;
    }

    if (fingerprintResult.source === 'path') {
      this.logger.info(
        '[SetupWizard] Workspace fingerprint falling back to path; memories will not survive moves',
        { workspaceRoot },
      );
    }

    const seeds: ReadonlyArray<MemoryWriteRequest> = [
      {
        workspaceFingerprint: fingerprintResult.fp,
        workspaceRoot,
        subject: 'project-profile',
        content: this.buildProjectProfileContent(manifest, phaseContents),
        tier: 'core',
        kind: 'preference',
        pinned: true,
        salience: 1.0,
        decayRate: 0,
      },
      {
        workspaceFingerprint: fingerprintResult.fp,
        workspaceRoot,
        subject: 'code-conventions',
        content: this.buildCodeConventionsContent(manifest, phaseContents),
        tier: 'core',
        kind: 'preference',
        pinned: true,
        salience: 1.0,
        decayRate: 0,
      },
      {
        workspaceFingerprint: fingerprintResult.fp,
        workspaceRoot,
        subject: 'key-files',
        content: this.buildKeyFilesContent(manifest, phaseContents),
        tier: 'recall',
        kind: 'entity',
        pinned: false,
        salience: 0.6,
        decayRate: 0.01,
      },
    ];

    let inserted = 0;
    let replaced = 0;
    let unchanged = 0;
    for (const req of seeds) {
      try {
        const result = await writer.upsert(req);
        if (result.status === 'inserted') inserted++;
        else if (result.status === 'replaced') replaced++;
        else unchanged++;
      } catch (error: unknown) {
        this.logger.warn('[SetupWizard] Memory seeding failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
          subject: req.subject,
          workspaceRoot,
        });
      }
    }

    this.logger.info(
      `[SetupWizard] Seeded ${inserted + replaced + unchanged} memory entries for workspace ${workspaceRoot}`,
      {
        inserted,
        replaced,
        unchanged,
        fingerprintSource: fingerprintResult.source,
      },
    );
  }

  /**
   * Resolve the IMemoryWriter port lazily. Returns null when no adapter is
   * registered (graceful no-op for VS Code without SQLite today).
   */
  private resolveMemoryWriterOrNull(): IMemoryWriter | null {
    try {
      return this.container.resolve<IMemoryWriter>(
        PLATFORM_TOKENS.MEMORY_WRITER,
      );
    } catch {
      // degradation-audit: optional-capability - the memory writer port is
      // unregistered on hosts without SQLite; null makes seeding a no-op.
      return null;
    }
  }

  private buildProjectProfileContent(
    manifest: MultiPhaseManifest,
    phaseContents: Record<string, string>,
  ): string {
    const md = phaseContents['project-profile'] ?? '';
    const slug = manifest.slug;
    const sourceLine = `Source: .ptah/analysis/${slug}/01-project-profile.md`;

    if (!md) {
      const out =
        `## Project Profile\n` +
        `Type: (not detected)\n` +
        `Frameworks: (not detected)\n` +
        `Monorepo: (not detected)\n` +
        `Tech stack: (not detected)\n` +
        `Architecture patterns: (not detected)\n` +
        sourceLine;
      return capUtf8(out, 1500);
    }
    const h1 = /^#\s+(.+?)\s*$/m.exec(md);
    const typeLine = h1 ? h1[1].trim() : '(not detected)';
    const grabBoldLine = (label: string): string | null => {
      const re = new RegExp(
        `^\\s*[*-]?\\s*\\*\\*${label}\\*\\*\\s*:\\s*(.+?)\\s*$`,
        'mi',
      );
      const m = re.exec(md);
      return m ? m[1].trim() : null;
    };

    const frameworksRaw = grabBoldLine('Frameworks');
    const monorepoRaw = grabBoldLine('Monorepo');
    const techStackRaw =
      grabBoldLine('Tech Stack') ?? grabBoldLine('Tech stack');

    const frameworksLine = truncateList(frameworksRaw) ?? '(not detected)';
    const monorepoLine = monorepoRaw ?? 'none';
    const techStackLine = truncateList(techStackRaw) ?? '(not detected)';
    let archLine = '(not detected)';
    const archHeadMatch =
      /^##\s+Architecture\b[^\n]*\n+([\s\S]*?)(?:\n#{1,6}\s|$)/m.exec(md);
    if (archHeadMatch) {
      const body = archHeadMatch[1].trim();
      const firstPara = body.split(/\n\s*\n/)[0]?.trim() ?? '';
      if (firstPara) {
        const oneLine = firstPara.replace(/\s+/g, ' ').trim();
        archLine = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
      }
    }

    const out =
      `## Project Profile\n` +
      `Type: ${typeLine}\n` +
      `Frameworks: ${frameworksLine}\n` +
      `Monorepo: ${monorepoLine}\n` +
      `Tech stack: ${techStackLine}\n` +
      `Architecture patterns: ${archLine}\n` +
      sourceLine;

    return capUtf8(out, 1500);
  }

  private buildCodeConventionsContent(
    manifest: MultiPhaseManifest,
    phaseContents: Record<string, string>,
  ): string {
    const candidates: Array<{ phase: string; file: string; md: string }> = [
      {
        phase: 'quality-audit',
        file: manifest.phases['quality-audit']?.file ?? '03-quality-audit.md',
        md: phaseContents['quality-audit'] ?? '',
      },
      {
        phase: 'architecture-assessment',
        file:
          manifest.phases['architecture-assessment']?.file ??
          '02-architecture-assessment.md',
        md: phaseContents['architecture-assessment'] ?? '',
      },
    ];

    for (const c of candidates) {
      if (!c.md) continue;
      const section = extractH2Section(c.md, [
        'Code Conventions',
        'Coding Standards',
      ]);
      if (!section) continue;
      const bullets = extractBullets(section, 12, 80);
      if (bullets.length === 0) continue;
      const out =
        `## Code Conventions\n` +
        bullets.map((b) => `- ${b}`).join('\n') +
        `\nSource: .ptah/analysis/${manifest.slug}/${c.file}`;
      return capUtf8(out, 1500);
    }

    const fallback =
      `## Code Conventions\n` +
      `(not detected — see analysis files)\n` +
      `Source: .ptah/analysis/${manifest.slug}/`;
    return capUtf8(fallback, 1500);
  }

  private buildKeyFilesContent(
    manifest: MultiPhaseManifest,
    phaseContents: Record<string, string>,
  ): string {
    type Category =
      | 'Entry points'
      | 'Configs'
      | 'Tests'
      | 'Routes'
      | 'Components'
      | 'Services'
      | 'Models';

    const buckets: Record<Category, Set<string>> = {
      'Entry points': new Set(),
      Configs: new Set(),
      Tests: new Set(),
      Routes: new Set(),
      Components: new Set(),
      Services: new Set(),
      Models: new Set(),
    };
    const isBareConfigName = (s: string): boolean =>
      /^(package\.json|tsconfig[^\s]*\.json|nx\.json|jest\.config[^\s]*|webpack\.config[^\s]*|vite\.config[^\s]*|astro\.config[^\s]*|eslint\.config[^\s]*|\.eslintrc[^\s]*|\.prettierrc[^\s]*|docker-compose[^\s]*\.ya?ml|electron-builder\.ya?ml|tailwind\.config[^\s]*|content-manifest\.json|agent-pack-manifest\.json|skills-lock\.json|\.mcp\.json)$/i.test(
        s,
      );

    const isPathLike = (s: string): boolean =>
      (/[/\\]/.test(s) || isBareConfigName(s)) &&
      /^[A-Za-z0-9._@/\\-]{2,}$/.test(s) &&
      !/^https?:/i.test(s);

    const classify = (p: string): Category | null => {
      const lower = p.toLowerCase();
      if (
        /(^|[/\\])(main|index|server|app|bootstrap|entry|preload)\.(ts|tsx|js|mjs|cjs|py|go|rs|java)$/i.test(
          p,
        )
      ) {
        return 'Entry points';
      }
      if (
        /(^|[/\\])(package\.json|tsconfig[^\s]*\.json|nx\.json|jest\.config[^\s]*|webpack\.config[^\s]*|vite\.config[^\s]*|astro\.config[^\s]*|eslint\.config[^\s]*|\.eslintrc[^\s]*|\.prettierrc[^\s]*|docker-compose[^\s]*\.ya?ml|prisma[/\\]schema\.prisma|electron-builder\.ya?ml|tailwind\.config[^\s]*)$/i.test(
          p,
        )
      ) {
        return 'Configs';
      }
      if (
        /(^|[/\\])(__tests__|tests?|e2e|spec)([/\\]|$)/.test(lower) ||
        /\.(spec|test|e2e)\.(ts|tsx|js|jsx)$/.test(lower)
      ) {
        return 'Tests';
      }
      if (
        /(^|[/\\])(routes?|api|controllers?)([/\\]|$)/.test(lower) ||
        /\.controller\.(ts|js)$/.test(lower) ||
        /\.routes?\.(ts|js)$/.test(lower)
      ) {
        return 'Routes';
      }
      if (
        /\.component\.(ts|tsx|jsx)$/.test(lower) ||
        /(^|[/\\])components?([/\\]|$)/.test(lower)
      ) {
        return 'Components';
      }
      if (
        /\.service\.(ts|js)$/.test(lower) ||
        /(^|[/\\])services?([/\\]|$)/.test(lower)
      ) {
        return 'Services';
      }
      if (
        /\.(model|entity|schema|dto)\.(ts|js)$/.test(lower) ||
        /(^|[/\\])(models?|entities|schemas?|dtos?)([/\\]|$)/.test(lower)
      ) {
        return 'Models';
      }
      return null;
    };

    const consume = (raw: string): void => {
      const trimmed = raw
        .trim()
        .replace(/[`'",;]+$/g, '')
        .replace(/^[`'",]+/, '');
      if (!trimmed || !isPathLike(trimmed)) return;
      const cat = classify(trimmed);
      if (cat) buckets[cat].add(trimmed);
    };

    for (const md of Object.values(phaseContents)) {
      if (!md) continue;
      const fenceRe = /```(?:text|json|yaml|yml)?\n([\s\S]*?)```/gi;
      const bulletPathRe = /^\s*[-*]\s+`([^`\n]+)`/gm;
      let m: RegExpExecArray | null;
      while ((m = fenceRe.exec(md)) !== null) {
        const block = m[1];
        for (const line of block.split(/\r?\n/)) {
          const tokens = line
            .replace(/^[\s│├└─*-]+/, '')
            .split(/\s+#|\s{2,}|\s+\/\//)[0]
            ?.trim();
          if (tokens) consume(tokens);
        }
      }
      let b: RegExpExecArray | null;
      while ((b = bulletPathRe.exec(md)) !== null) {
        consume(b[1]);
      }
    }

    const order: Category[] = [
      'Entry points',
      'Configs',
      'Tests',
      'Routes',
      'Components',
      'Services',
      'Models',
    ];

    const sectionLines: string[] = [];
    for (const cat of order) {
      const set = buckets[cat];
      if (set.size === 0) continue;
      const all = Array.from(set);
      const head = all.slice(0, 16);
      const more = all.length - head.length;
      const list = head.join(', ') + (more > 0 ? `, +${more} more` : '');
      sectionLines.push(`${cat}: ${list}`);
    }

    if (sectionLines.length === 0) {
      return capUtf8(`## Key File Locations\n(none detected)`, 2048);
    }

    const out =
      `## Key File Locations\n` +
      sectionLines.join('\n') +
      `\nSource: .ptah/analysis/${manifest.slug}/`;
    return capUtf8(out, 2048);
  }
}

/**
 * Truncate a string to fit within `maxBytes` UTF-8 bytes. Adds an ellipsis
 * marker when truncation actually occurs.
 */
function capUtf8(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  const marker = '\n…(truncated)';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  let cut = s.length;
  while (
    cut > 0 &&
    Buffer.byteLength(s.slice(0, cut), 'utf8') + markerBytes > maxBytes
  ) {
    cut -= 32;
  }
  return s.slice(0, Math.max(0, cut)) + marker;
}

/**
 * Truncate a comma- or pipe-separated list to first 8 items, append `+N more`
 * when truncated. Returns null if input is null/empty.
 */
function truncateList(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw
    .split(/\s*(?:,|\||;| and )\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const head = parts.slice(0, 8);
  const more = parts.length - head.length;
  return head.join(', ') + (more > 0 ? `, +${more} more` : '');
}

/**
 * Extract the body of the first matching `## <name>` section from a markdown
 * document. Body ends at the next `#{1,6} ` heading or end-of-file.
 */
function extractH2Section(md: string, names: readonly string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `^##\\s+${escapeRegExp(name)}\\s*$([\\s\\S]*?)(?=^#{1,6}\\s|(?![\\s\\S]))`,
      'mi',
    );
    const m = re.exec(md);
    if (m) return m[1];
  }
  return null;
}

function extractBullets(
  body: string,
  maxBullets: number,
  maxLineChars: number,
): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    let text = m[1].trim();
    if (text.length === 0) continue;
    if (text.length > maxLineChars) {
      text = text.slice(0, maxLineChars - 1) + '…';
    }
    out.push(text);
    if (out.length >= maxBullets) break;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
