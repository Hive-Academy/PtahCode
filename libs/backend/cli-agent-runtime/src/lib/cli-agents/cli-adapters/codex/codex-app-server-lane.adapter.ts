import {
  buildCodexExecutionProfile,
  CodexPreTurnConfigRejectedError,
  CodexUnsupportedMethodError,
  type ApprovalSink,
  type CodexAttachment,
  type CodexContext,
  type CodexExecutionProfile,
  type CodexExecutionProfileInput,
  type CodexMcpSecrets,
  type CodexModelInfo,
  type CodexRuntimeEvent,
  type CodexSelection,
  type CodexThreadIdentity,
  type CodexTurnInput,
  type CodexTurnReceipt,
} from '@ptah-extension/codex-runtime';
import {
  CLI_REASONING_EFFORT_VALUES,
  type CliAdapterManifest,
  type CliDetectionResult,
  type CliOutputSegment,
  type CodexSandboxMode,
  type LaneReportedSession,
  type LaneTurnContent,
  type LaneTurnSettings,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  LaneTurnInputRefusal,
  LaneTurnSettingRefusal,
  type CliAdapter,
  type CliCommandOptions,
  type CliModelInfo,
  type ContinuationOutcome,
  type LaneTurnOptionsCatalog,
  type LaneTurnSettingsResult,
  type SdkHandle,
  type StoppedLaneCatalog,
} from '../cli-adapter.interface';
import { bestMessagingCapability } from '../cli-adapter.interface';
import { translateLaneSpawnPolicy } from '../../lane-spawn-policy';
import {
  buildTaskPrompt,
  createBufferedEmitter,
  fullPromptPreambles,
  PTAH_LANE_POLICY,
  renderRoleBlock,
  stripAnsiCodes,
} from '../cli-adapter.utils';
import { leadingLaneCommand } from '../lane-command-filter';
import {
  buildCodexLaneProfileSettings,
  CODEX_LANE_PTAH_AUTH_REFERENCE,
  type CodexLaneProfileInput,
} from './codex-lane-profile';
import { CODEX_RESUME_RESENDS_ROLE } from './codex-lane-config.builder';
import { CodexLaneEvents } from './codex-lane-events';
import { readCodexUserMcpServerNames } from './codex-user-mcp-servers';
import { withCodexLaneStartupTimeout } from './codex-app-server-lane-startup';
import { listCodexLaneSkills, readCodexLaneCatalog } from './codex-app-server-lane-catalog';
import {
  handledRequirements,
  identitySchema,
} from './codex-app-server-lane-profile';
import {
  configRejectedNotice,
  essentialLaneSession,
  terminalModelAdvice,
  validatedEffort,
} from './codex-app-server-lane-rejection';
import {
  NativeCodexLaneBinaryProbe,
  type CodexLaneBinaryProbe,
} from './codex-app-server-lane-binary';
import {
  FileCodexLaneCredentialProbe,
  type CodexLaneCredentialProbe,
} from './codex-app-server-lane-auth';
import { codexAdvertisedEfforts, codexLaneModels, codexUnsendableEfforts } from './codex-app-server-lane-models';
import { CodexLaneWriteDacPreflight } from './codex-lane-write-dac-preflight';

/** Safety bound for app-server builds that omit a trailing usage notification. */
export const CODEX_LANE_USAGE_DRAIN_MS = 2_000;
/** Fixed refusal of `applyTurnSettings` (M7); the runtime's detail goes to the log. */
export const CODEX_TURN_SETTINGS_REFUSED_TEXT = 'Codex did not accept the turn settings.';

export class CodexLaneResumeIdentityError extends Error {
  constructor() {
    super('Codex lane resume requires a matching full thread identity.');
    this.name = 'CodexLaneResumeIdentityError';
  }
}

/** Host composition owns the approval scope and selected App Server runtime. */
export interface CodexLaneRuntimeProvider {
  open(
    profile: CodexExecutionProfile,
    resume: CodexThreadIdentity | undefined,
    approvals: ApprovalSink,
    binaryPath: string,
    selection: CodexSelection | undefined,
    secrets: CodexMcpSecrets,
  ): Promise<CodexContext>;
  /** A separate lane context for catalog reads; its owner closes it after listing. */
  openCatalog(
    binaryPath: string,
    home?: string,
    selection?: CodexSelection,
  ): Promise<CodexContext>;
  openFallback?(
    profile: CodexExecutionProfile,
    resume: CodexThreadIdentity | undefined,
    approvals: ApprovalSink,
    binaryPath: string,
    method: string,
    selection: CodexSelection | undefined,
    secrets: CodexMcpSecrets,
  ): Promise<CodexContext>;
}

/** Host resolves account, paths, budgets and trusted user MCP names. */
export interface CodexLaneProfileResolver {
  resolve(
    options: CliCommandOptions,
    variant: 'first-turn' | 'resume',
  ): Promise<{
    readonly lane: CodexLaneProfileInput;
    readonly paths: CodexExecutionProfileInput['paths'];
  }>;
}

/** Lookup is by CLI thread id; persistence precedes the named prompt. */
export interface CodexLaneIdentityStore {
  readByThreadId(threadId: string): Promise<CodexThreadIdentity | undefined>;
  persist(identity: CodexThreadIdentity): Promise<void>;
}

interface ActiveTurn {
  readonly receipt: CodexTurnReceipt;
  readonly mapper: CodexLaneEvents;
  readonly resolve: (exitCode: number) => void;
  readonly reject: (error: Error) => void;
}

interface LiveLaneWriter {
  isBusy(): boolean;
  close(): Promise<boolean>;
}

export class CodexLaneWriterConflictError extends Error {
  readonly code = 'CODEX_LANE_WRITER_ACTIVE';

  constructor() {
    super('Codex thread already has an active lane turn.');
    this.name = 'CodexLaneWriterConflictError';
  }
}

export class CodexLaneWriterCloseError extends Error {
  readonly code = 'CODEX_LANE_WRITER_CLOSE_FAILED';

  constructor(options?: ErrorOptions) {
    super('Codex thread writer could not be closed before resume.', options);
    this.name = 'CodexLaneWriterCloseError';
  }
}

const CODEX_SKILLS_UNAVAILABLE = 'Codex skills are unavailable.';

const CODEX_LANE_COMMANDS: LaneTurnOptionsCatalog['commands'] = [
  { name: 'compact', group: 'command', description: 'Compact the conversation' },
];

function codexLaneCommands(skills: readonly string[]): LaneTurnOptionsCatalog['commands'] {
  return [...CODEX_LANE_COMMANDS, ...skills.map((name) => ({ name, group: 'skill' as const }))];
}

/** Native lane consumer. The legacy SDK adapter remains a separate selectable adapter. */
export class CodexAppServerLaneAdapter implements CliAdapter {
  readonly name = 'codex' as const;
  readonly displayName = 'Codex CLI';
  readonly roleChannel = 'developer-instructions' as const;
  readonly supportsMcp = true;
  readonly builtinLaneCommands = CODEX_LANE_COMMANDS;

  static createWriterRegistry(): Map<string, LiveLaneWriter> {
    return new Map();
  }

  constructor(
    private readonly runtime: CodexLaneRuntimeProvider,
    private readonly profiles: CodexLaneProfileResolver,
    private readonly identities: CodexLaneIdentityStore,
    private readonly logger: Logger,
    private readonly binary: CodexLaneBinaryProbe = new NativeCodexLaneBinaryProbe(),
    private readonly credentials: CodexLaneCredentialProbe = new FileCodexLaneCredentialProbe(),
    private readonly home: () => Promise<string | undefined> = async () =>
      undefined,
    private readonly writers: Map<
      string,
      LiveLaneWriter
    > = CodexAppServerLaneAdapter.createWriterRegistry(),
    private readonly writeDacPreflight: Pick<
      CodexLaneWriteDacPreflight,
      'check'
    > = new CodexLaneWriteDacPreflight(logger),
  ) {}

  capabilities(): CliAdapterManifest {
    return {
      messaging: {
        steer: { state: 'supported' },
        interrupt: { state: 'supported' },
        continuation: { state: 'supported' },
        resume: { state: 'supported' },
      },
      roleChannel: this.roleChannel,
      permissionModes: {
        plan: { state: 'supported', nativeMode: 'read-only', networkModes: ['deny'] },
        ask: { state: 'unsupported', reason: 'Codex lanes force approvalPolicy never; no Ptah approval route exists.', networkModes: [] },
        'auto-edit': { state: 'supported', nativeMode: 'workspace-write', networkModes: ['allow', 'deny'] },
        yolo: { state: 'supported', nativeMode: 'danger-full-access', networkModes: ['allow'] },
      },
      networkModes: {
        allow: { state: 'supported' },
        deny: { state: 'supported' },
      },
      limitReader: { state: 'available', source: 'openai-codex' },
      mcp: { state: 'supported' },
      turnInput: {
        model: { state: 'supported', appliesAt: 'next-turn' },
        effort: { state: 'supported', appliesAt: 'next-turn' },
        // `turn/steer` carries the same input items as `turn/start` (A6).
        images: { state: 'supported', onSteer: true },
        files: { state: 'supported', delivery: 'reference' },
        commands: { state: 'supported' },
        skills: { state: 'supported' },
      },
      usage: { timing: 'live' },
      // D12: approvals stay with the manifest's `ask` reason; Codex lanes run approvalPolicy never.
      prompts: {
        approvals: { state: 'unsupported', reason: 'Codex lanes force approvalPolicy never; no Ptah approval route exists.' },
        questions: { state: 'unsupported', reason: 'Codex lane questions do not reach Ptah.' },
      },
    };
  }

  async detect(): Promise<CliDetectionResult> {
    const messagingMode = bestMessagingCapability(this.capabilities());
    try {
      const binary = await this.binary.resolve();
      if (!binary) return { cli: 'codex', installed: false, messagingMode };
      await this.ensureTokensFresh();
      return {
        cli: 'codex',
        installed: true,
        path: binary.path,
        version: binary.version,
        codexSource: binary.source,
        codexReason: binary.reason,
        messagingMode,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Codex home is empty') {
        this.logger.warn('[CodexAppServerLaneAdapter] Codex home is empty');
        return { cli: 'codex', installed: false, messagingMode };
      }
      this.logger.warn('[CodexAppServerLaneAdapter] Codex detection failed', {
        errorClass:
          error instanceof Error ? error.constructor.name : typeof error,
      });
      return { cli: 'codex', installed: false, messagingMode };
    }
  }

  async ensureTokensFresh(): Promise<boolean> {
    const status = await this.credentials.check(await this.home());
    if (status === 'stale' || status === 'unreadable')
      this.logger.warn(
        '[CodexAppServerLaneAdapter] Codex credentials are not usable',
        { status },
      );
    return status === 'fresh';
  }

  async listModels(): Promise<CliModelInfo[]> {
    try {
      return (await this.stoppedLaneCatalog()).models;
    } catch {
      // degradation-audit: optional-capability - stoppedLaneCatalog already
      // logged the failure, and an empty list lets the caller use its default model.
      return [];
    }
  }

  /**
   * Models and effort levels from one live catalog read (no lane needed),
   * for the composer of a stopped lane. Efforts are only what the catalog
   * advertises; nothing static is added. A failed read is logged and
   * rethrown, so the coordinator reports an error instead of a false
   * empty list.
   */
  async stoppedLaneCatalog(workingDirectory?: string): Promise<StoppedLaneCatalog> {
    try {
      const binary = await this.binary.resolve();
      if (!binary) throw new Error('Codex executable is unavailable');
      const home = await this.home();
      const { models, skills } = await readCodexLaneCatalog(
        () => this.runtime.openCatalog(binary.path, home, binary.selection),
        this.logger,
        workingDirectory,
      );
      const efforts = codexAdvertisedEfforts(models);
      const unsendableEfforts = codexUnsendableEfforts(efforts);
      return {
        models: codexLaneModels(models),
        efforts,
        commands: codexLaneCommands(skills ?? []),
        ...(skills === undefined ? { commandsUnavailable: true, unavailableReason: CODEX_SKILLS_UNAVAILABLE } : {}),
        ...(unsendableEfforts.length > 0 ? { unsendableEfforts } : {}),
      };
    } catch (error: unknown) {
      // degradation-audit: reported - logged here and rethrown to the caller.
      this.logger.warn(
        '[CodexAppServerLaneAdapter] Codex model catalog failed',
        {
          errorClass:
            error instanceof Error ? error.constructor.name : typeof error,
        },
      );
      throw error;
    }
  }

  parseOutput(raw: string): string {
    return stripAnsiCodes(raw).replace(/\r(?!\n)/g, '');
  }

  async runSdk(options: CliCommandOptions): Promise<SdkHandle> {
    const lanePolicy = translateLaneSpawnPolicy(this.name, this.capabilities(), options);
    const binary = await this.binary.resolve(options.binaryPath);
    if (!binary) throw new Error('Codex executable is unavailable');
    const resolved = await this.profiles.resolve(
      options,
      options.resumeSessionId ? 'resume' : 'first-turn',
    );
    const userServers = await readCodexUserMcpServerNames(
      resolved.lane.config.workingDirectory,
      {
        codexHome: resolved.lane.identity.normalizedHome,
      },
    );
    if (userServers.warnings.length > 0)
      this.logger.warn(
        '[CodexAppServerLaneAdapter] Some user MCP servers could not be classified',
        { warningCount: userServers.warnings.length },
      );
    const requestedEffort =
      options.reasoningEffort ?? resolved.lane.config.reasoningEffort;
    const reasoningEffort = validatedEffort(requestedEffort);
    const selectedModel = options.model || resolved.lane.identity.model || undefined;
    const policySandboxMode = lanePolicy.cli === 'codex'
      ? lanePolicy.sandboxMode
      : undefined;
    const codexSandboxMode: CodexSandboxMode | undefined =
      policySandboxMode === 'workspace-write'
        ? lanePolicy.cli === 'codex' && lanePolicy.networkAccess === false
          ? 'workspace-write-no-network'
          : options.network === 'allow' ||
              resolved.lane.codexSandboxMode === 'workspace-write-network' ||
              resolved.lane.codexSandboxMode === 'danger-full-access'
            ? 'workspace-write-network'
            : 'workspace-write-no-network'
        : policySandboxMode;
    if (options.network === 'allow' &&
      (codexSandboxMode === 'read-only' || codexSandboxMode === 'workspace-write-no-network' ||
        (!codexSandboxMode && (resolved.lane.codexSandboxMode === 'read-only' ||
          resolved.lane.codexSandboxMode === 'workspace-write-no-network')))) {
      throw new Error('The configured Codex sandbox cannot provide network access.');
    }
    const projected = buildCodexLaneProfileSettings({
      ...resolved.lane,
      ...(codexSandboxMode ? { codexSandboxMode } : {}),
      permissionLevel: options.permission ?? resolved.lane.permissionLevel,
      mcpToken: options.mcpToken,
      identity: {
        ...resolved.lane.identity,
        ...(selectedModel === undefined ? {} : { model: selectedModel }),
      },
      config: {
        ...resolved.lane.config,
        userMcpServerNames: [
          ...resolved.lane.config.userMcpServerNames,
          ...userServers.names,
        ],
        reasoningEffort,
        workingDirectory: resolved.lane.config.workingDirectory,
        mcpPort: options.mcpPort,
        agentId: options.agentId,
        developerInstructions: [
          options.role ? renderRoleBlock(options.role, this.name) : undefined,
          PTAH_LANE_POLICY,
        ]
          .filter((part): part is string => part !== undefined)
          .join('\n\n'),
      },
    });
    projected.assertAllRequirementsHandled(handledRequirements);
    const mcpSecrets: CodexMcpSecrets = options.mcpToken
      ? new Map([[CODEX_LANE_PTAH_AUTH_REFERENCE, options.mcpToken]])
      : new Map();
    let profile = buildCodexExecutionProfile({
      session: projected.settings,
      paths: resolved.paths,
    });
    if (profile.consumer !== 'lane')
      throw new Error('Codex lane profile selected another consumer');
    // The WRITE_DAC probe runs in parallel with the runtime startup. openContext
    // waits for its outcome before it persists an identity or starts a turn.
    // The rejection is captured as a value, so an early startup failure cannot
    // leave it unhandled.
    const writeDacDenial = this.writeDacPreflight
      .check(resolved.lane.config.workingDirectory, profile.sandboxPolicy.mode)
      .then(
        (): Error | undefined => undefined,
        (error: unknown) =>
          error instanceof Error
            ? error
            : new Error('Codex WRITE_DAC check failed'),
      );
    const resume = await this.resumeIdentity(options.resumeSessionId, profile);
    const output = createBufferedEmitter<string>();
    const segments = createBufferedEmitter<CliOutputSegment>();
    const sessionResolved = createBufferedEmitter<string>();
    const abort = new AbortController();
    let eventAbort = new AbortController();
    let context: CodexContext | undefined;
    const closePromises = new WeakMap<CodexContext, Promise<void>>();
    let active: ActiveTurn | undefined;
    // A raw skill lookup or turn start reserves the idle lane.
    let starting = false;
    let compacting = false;
    let initialTurnPending = false;
    let closed = false;
    let closePromise: Promise<boolean> | undefined;
    let registeredThreadId: string | undefined;
    let reservation: LiveLaneWriter | undefined;
    let sessionId = resume?.threadId;
    let hasTurnHistory = resume !== undefined;
    // The turn the host asked Codex to interrupt; its `interrupted` terminal resolves 0.
    let interruptedTurnId: string | undefined;
    let roleDelivery: 'developer-instructions' | 'task-prompt' =
      'developer-instructions';
    const pending: CodexRuntimeEvent[] = [];
    const emit = (segment: CliOutputSegment): void => {
      segments.emit(segment);
      if (segment.content) output.emit(this.parseOutput(segment.content));
    };
    const approvals: ApprovalSink = {
      request: async (request) => {
        const name =
          request.toolName &&
          /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(request.toolName)
            ? ` ${request.toolName}`
            : '';
        emit({
          type: 'info',
          content: `Codex approval declined: ${request.kind}${name}\n`,
        });
        return 'decline';
      },
    };
    for (const warning of projected.warnings) {
      this.logger.warn('[CodexAppServerLaneAdapter] Lane config warning', {
        warning,
      });
      emit({ type: 'info', content: warning });
    }
    if (requestedEffort !== undefined && reasoningEffort === undefined) {
      const warning =
        'Ignored invalid Codex reasoning effort; expected low, medium, high or xhigh.';
      this.logger.warn('[CodexAppServerLaneAdapter] Lane config warning', {
        warning,
      });
      emit({ type: 'info', content: warning });
    }
    const configRejection = createBufferedEmitter<void>();
    const closeContext = (opened: CodexContext): Promise<void> => {
      let closing = closePromises.get(opened);
      if (!closing) {
        closing = Promise.resolve()
          .then(() => opened.close())
          .catch((error: unknown) => {
            closePromises.delete(opened);
            throw error;
          });
        closePromises.set(opened, closing);
      }
      return closing;
    };
    let usageDrainTimer: ReturnType<typeof setTimeout> | undefined;
    const close = (): Promise<boolean> => {
      if (closePromise) return closePromise;
      closed = true;
      clearTimeout(usageDrainTimer);
      abort.abort();
      eventAbort.abort();
      active?.resolve(1);
      active = undefined;
      const attempt = (async (): Promise<boolean> => {
        try {
          if (context) await closeContext(context);
          if (
            registeredThreadId &&
            this.writers.get(registeredThreadId) === writer
          )
            this.writers.delete(registeredThreadId);
          return true;
        } catch (error: unknown) {
          this.logger.error(
            '[CodexAppServerLaneAdapter] Context close failed',
            error instanceof Error ? error : new Error(String(error)),
          );
          emit({ type: 'error', content: 'Codex lane context close failed.' });
          return false;
        }
      })();
      closePromise = attempt.then((released) => {
        if (!released) closePromise = undefined;
        return released;
      });
      return closePromise;
    };
    const writer: LiveLaneWriter = {
      isBusy: () => initialTurnPending || starting || compacting || active !== undefined,
      close,
    };
    abort.signal.addEventListener(
      'abort',
      () => {
        if (!closed) void close();
      },
      { once: true },
    );
    const openContext = async (
      identity: CodexThreadIdentity | undefined,
      fallbackMethod?: string,
    ): Promise<CodexContext> => {
      const opening =
        fallbackMethod && this.runtime.openFallback
          ? this.runtime.openFallback(
              profile,
              identity,
              approvals,
              binary.path,
              fallbackMethod,
              binary.selection,
              mcpSecrets,
            )
          : this.runtime.open(
              profile,
              identity,
              approvals,
              binary.path,
              binary.selection,
              mcpSecrets,
            );
      void opening.then(
        (late): void => {
          if (abort.signal.aborted) {
            void closeContext(late).catch(() => {
              this.logger.error(
                '[CodexAppServerLaneAdapter] Late context close failed',
                new Error('Codex lane late context close failed'),
              );
            });
          }
        },
        () => undefined,
      );
      context = await withCodexLaneStartupTimeout(opening, abort);
      if (abort.signal.aborted) {
        await closeContext(context);
        throw new Error('Codex lane aborted during startup');
      }
      const denial = await writeDacDenial;
      if (denial !== undefined) {
        const denied = context;
        context = undefined;
        await closeContext(denied);
        throw denial;
      }
      const openedIdentity = identitySchema.safeParse(context.identity);
      if (
        !openedIdentity.success ||
        openedIdentity.data.contextId !== profile.contextId ||
        openedIdentity.data.normalizedHome !== profile.normalizedHome ||
        openedIdentity.data.workspaceId !== profile.workspaceId ||
        openedIdentity.data.providerId !== profile.providerId ||
        openedIdentity.data.profileFingerprint !== profile.profileFingerprint ||
        (identity && openedIdentity.data.threadId !== identity.threadId)
      )
        throw new CodexLaneResumeIdentityError();
      sessionId = context.identity.threadId;
      await this.identities.persist(context.identity);
      const prior = this.writers.get(sessionId);
      if (prior && prior !== reservation && prior !== writer)
        throw new CodexLaneWriterConflictError();
      if (
        registeredThreadId &&
        registeredThreadId !== sessionId &&
        this.writers.get(registeredThreadId) === writer
      )
        this.writers.delete(registeredThreadId);
      registeredThreadId = sessionId;
      initialTurnPending = true;
      this.writers.set(sessionId, writer);
      if (closed || abort.signal.aborted) {
        if (this.writers.get(sessionId) === writer)
          this.writers.delete(sessionId);
        throw new Error('Codex lane aborted during startup');
      }
      if (
        options.accountBinding !== undefined ||
        options.accountBindingId !== undefined
      ) {
        if (
          !options.accountBinding ||
          !options.accountBindingId ||
          !options.onAccountBinding
        )
          throw new Error('Codex lane account binding is incomplete');
        await options.onAccountBinding(
          {
            accountBinding: options.accountBinding,
            accountBindingId: options.accountBindingId,
          },
          sessionId,
        );
      }
      sessionResolved.emit(sessionId);
      return context;
    };
    const retryConfig = async (
      error: CodexPreTurnConfigRejectedError,
    ): Promise<CodexContext> => {
      const notice = configRejectedNotice(
        projected.settings,
        error.rejectedKey,
      );
      emit({ type: 'info', content: notice });
      configRejection.emit(undefined);
      this.logger.warn(
        '[CodexAppServerLaneAdapter] Codex rejected lane config; retrying essential settings',
        {
          method: error.method,
        },
      );
      const previous = context;
      context = undefined;
      eventAbort.abort();
      if (previous) await closeContext(previous);
      eventAbort = new AbortController();
      pending.length = 0;
      profile = buildCodexExecutionProfile({
        session: essentialLaneSession(projected.settings, error.rejectedKey),
        paths: resolved.paths,
      });
      return openContext(previous?.identity ?? resume);
    };
    if (resume) {
      const previous = this.writers.get(resume.threadId);
      if (previous?.isBusy()) {
        emit({
          type: 'error',
          content: 'Codex thread already has an active lane turn.',
        });
        throw new CodexLaneWriterConflictError();
      }
      reservation = { isBusy: () => true, close: async () => false };
      this.writers.set(resume.threadId, reservation);
      if (previous) {
        const released = await previous.close();
        if (!released) {
          this.writers.set(resume.threadId, previous);
          const error = new CodexLaneWriterCloseError();
          emit({ type: 'error', content: error.message });
          throw error;
        }
      }
    }
    try {
      await openContext(resume);
    } catch (error: unknown) {
      if (error instanceof CodexPreTurnConfigRejectedError) {
        try {
          await retryConfig(error);
        } catch (retryError: unknown) {
          emit({
            type: 'error',
            content: 'Codex rejected the essential lane configuration.',
          });
          await close();
          if (resume && this.writers.get(resume.threadId) === reservation)
            this.writers.delete(resume.threadId);
          throw new Error('Codex rejected the essential lane configuration.', {
            cause: retryError,
          });
        }
      } else {
        await close();
        if (resume && this.writers.get(resume.threadId) === reservation)
          this.writers.delete(resume.threadId);
        throw error;
      }
    }
    if (!context) throw new Error('Codex lane context did not open');
    let opened: CodexContext = context;
    let catalogSnapshot: { context: CodexContext; models: CliModelInfo[] } | undefined;
    const readModelCatalog = async (source: CodexContext): Promise<{
      catalog: readonly CodexModelInfo[];
      models: CliModelInfo[];
    }> => {
      const catalog = await source.listModels();
      const models = codexLaneModels(catalog);
      if (context === source) catalogSnapshot = { context: source, models };
      return { catalog, models };
    };
    const reportedSession = (): LaneReportedSession => {
      const { model, effort } = context?.reportedSettings?.() ?? { model: null, effort: null };
      const efforts = catalogSnapshot && catalogSnapshot.context === context
        ? catalogSnapshot.models.find((entry) => entry.id === model)?.efforts
        : undefined;
      return { model, effort, efforts: efforts ?? { provenance: 'unknown' } };
    };
    let fallbackUsed = false;
    const processEvent = (event: CodexRuntimeEvent): void => {
      if (
        event.type === 'approvalRequested' ||
        event.type === 'approvalSettled'
      )
        return;
      if (!active) {
        if (!compacting) pending.push(event);
        return;
      }
      const modelMessage =
        event.type === 'terminal' && event.status === 'failed' && event.error
          ? terminalModelAdvice(`${event.error.code}: ${event.error.message}`, {
              ...options,
              model: selectedModel,
              modelSource: options.modelSource,
            })
          : undefined;
      const modelError = modelMessage ? new Error(modelMessage) : undefined;
      if (modelError) {
        emit({ type: 'error', content: modelError.message });
        const turn = active;
        active = undefined;
        turn.reject(modelError);
        void close();
        return;
      }
      const mapped = active.mapper.map(event);
      for (const segment of mapped.segments) emit(segment);
      if (mapped.awaitingUsage) {
        const turn = active;
        clearTimeout(usageDrainTimer);
        // The app server has no separate per-turn usage-flush event. Give its
        // trailing notification a bounded transport drain before failing closed.
        usageDrainTimer = setTimeout(() => {
          if (active !== turn) return;
          const telemetry = turn.mapper.finishPendingUsage();
          if (telemetry) emit(telemetry);
          active = undefined;
          turn.resolve(0);
        }, CODEX_LANE_USAGE_DRAIN_MS);
        usageDrainTimer.unref();
        return;
      }
      if (mapped.terminal) {
        clearTimeout(usageDrainTimer);
        const turn = active;
        active = undefined;
        const interrupted =
          mapped.terminal === 'interrupted' &&
          interruptedTurnId === turn.receipt.turnId;
        interruptedTurnId = undefined;
        // A host interrupt keeps the thread: the next message continues it.
        turn.resolve(mapped.terminal === 'completed' || interrupted ? 0 : 1);
        if (mapped.terminal !== 'completed' && !interrupted) void close();
      }
    };
    const pump = async (
      source: CodexContext,
      signal: AbortSignal,
    ): Promise<void> => {
      try {
        for await (const event of source.events(signal)) {
          if (closed || source !== context) return;
          processEvent(event);
        }
        if (!closed && source === context)
          throw new Error('Codex lane event stream ended');
      } catch (error: unknown) {
        // degradation-audit: optional-capability - a closed or replaced context's stream error is moot; the live context reports its own
        if (closed || source !== context) return;
        emit({ type: 'error', content: 'Codex lane event stream failed.' });
        active?.reject(
          error instanceof Error
            ? error
            : new Error('Codex event stream failed'),
        );
        active = undefined;
        await close();
      }
    };
    void pump(opened, eventAbort.signal);
    const nextTurnWarnings: string[] = [];
    const runTurn = (
      text: string,
      onStarted?: () => void,
      attachments?: readonly CodexAttachment[],
      skill?: CodexTurnInput['skill'],
    ): Promise<number> => {
      if (closed) return Promise.reject(new Error('Codex lane is closed'));
      if (active || starting)
        return Promise.reject(new Error('Codex lane turn is already active'));
      starting = true;
      if (nextTurnWarnings.length > 0) {
        this.logger.debug('[CodexAppServerLaneAdapter] Budget warning injected', {
          warningId: 'agent-budget-warning',
        });
        text = `${nextTurnWarnings.splice(0).join('\n\n')}\n\n${text}`;
      }
      return new Promise<number>((resolve, reject) => {
        const start = async (): Promise<void> => {
          try {
            const startTurn = () =>
              opened.startTurn({
                text,
                signal: abort.signal,
                ...(attachments && { attachments }),
                ...(skill && { skill }),
              });
            let receipt: CodexTurnReceipt;
            try {
              receipt = await withCodexLaneStartupTimeout(
                startTurn(),
                abort,
              );
            } catch (error: unknown) {
              if (
                !(error instanceof CodexUnsupportedMethodError) ||
                fallbackUsed ||
                !this.runtime.openFallback ||
                error.source !== 'installed' ||
                binary.source !== 'installed'
              )
                throw error;
              fallbackUsed = true;
              const previous = opened;
              context = undefined;
              eventAbort.abort();
              await closeContext(previous);
              eventAbort = new AbortController();
              pending.length = 0;
              opened = await openContext(
                hasTurnHistory ? previous.identity : undefined,
                error.method,
              );
              void pump(opened, eventAbort.signal);
              receipt = await withCodexLaneStartupTimeout(
                startTurn(),
                abort,
              );
            }
            hasTurnHistory = true;
            // Cleared in the same synchronous step that registers the turn.
            starting = false;
            if (closed) {
              resolve(1);
              return;
            }
            active = {
              receipt,
              mapper: new CodexLaneEvents({
                contextId: opened.identity.contextId,
                processGeneration: opened.identity.processGeneration,
                threadId: receipt.threadId,
                turnId: receipt.turnId,
              }),
              resolve,
              reject,
            };
            onStarted?.();
            for (const event of pending.splice(0)) processEvent(event);
          } catch (error: unknown) {
            starting = false;
            emit({
              type: 'error',
              content: 'Codex lane turn failed to start.',
            });
            await close();
            reject(
              error instanceof Error
                ? error
                : new Error('Codex lane turn failed'),
            );
          }
        };
        void start();
      });
    };
    const isCompactCommand = (message: string): boolean =>
      leadingLaneCommand(message)?.toLowerCase() === 'compact';
    const resolveRawSkill = async (message: string): Promise<NonNullable<CodexTurnInput['skill']>> => {
      let skill: CodexTurnInput['skill'];
      try {
        skill = await opened.resolveSkillCommand?.(message);
      } catch (error) {
        throw new LaneTurnInputRefusal(CODEX_SKILLS_UNAVAILABLE, { cause: error });
      }
      if (!skill) throw new LaneTurnInputRefusal('This Codex skill is no longer available or enabled.');
      return skill;
    };
    const runCompact = async (): Promise<number> => {
      compacting = true;
      try {
        await opened.compact();
        return 0;
      } finally {
        compacting = false;
      }
    };
    const prompt = buildTaskPrompt(
      {
        ...options,
        role: undefined,
        lanePolicyDelivery: 'developer-instructions',
        resumeRestoresContext: true,
      },
      this.name,
    );
    const promptPreambles = fullPromptPreambles({
      ...options,
      lanePolicyDelivery: 'developer-instructions',
    });
    let delivered: typeof promptPreambles | undefined;
    const markPromptDelivered = () => {
      delivered = promptPreambles;
    };
    const resumeCompact = resume && isCompactCommand(options.task);
    let initialSkill: CodexTurnInput['skill'];
    try {
      if (!resumeCompact && leadingLaneCommand(options.task)) {
        initialSkill = resume
          ? await resolveRawSkill(options.task)
          : await opened.resolveSkillCommand?.(options.task);
      }
    } catch (error) {
      await close();
      throw error;
    }
    initialTurnPending = false;
    const initial = resumeCompact
      ? runCompact()
      : runTurn(prompt, markPromptDelivered, undefined, initialSkill);
    const done = initial.then(async (code) => {
      // Model listing shares the live context's command queue. Read after the
      // first turn so catalog discovery cannot delay an in-flight steer or interrupt.
      const source = context;
      if (
        code === 0 && !closed && source?.reportedSettings?.().model &&
        catalogSnapshot?.context !== source
      ) {
        try {
          await readModelCatalog(source);
        } catch (error: unknown) {
          // degradation-audit: optional-capability - session settings still report without a catalog.
          this.logger.warn('[CodexAppServerLaneAdapter] Lane model catalog failed', {
            errorClass: error instanceof Error ? error.constructor.name : typeof error,
          });
        }
      }
      return code;
    });
    let currentModel = selectedModel;
    let currentEffort = reasoningEffort;
    const applyTurnSettings = async (
      settings: LaneTurnSettings,
    ): Promise<LaneTurnSettingsResult> => {
      const field = settings.model !== undefined ? 'model' : 'reasoningEffort';
      const { model, reasoningEffort: effort } = settings;
      if (closed || !context)
        throw new LaneTurnSettingRefusal(field, 'The Codex lane has ended.');
      if (effort !== undefined && validatedEffort(effort) === undefined)
        throw new LaneTurnSettingRefusal('reasoningEffort', `Codex has no effort level "${effort}".`);
      try {
        await context.updateNextTurn({
          ...(model !== undefined ? { model } : {}),
          ...(effort !== undefined ? { effort } : {}),
        });
      } catch (error: unknown) {
        // Fixed text only (M7): the runtime message can name paths, so it
        // goes to the redacting log, never into the refusal.
        this.logger.warn('[CodexAppServerLaneAdapter] Codex refused the turn settings', {
          field,
          detail: error instanceof Error ? error.message.slice(0, 200) : String(error),
        });
        throw new LaneTurnSettingRefusal(field, CODEX_TURN_SETTINGS_REFUSED_TEXT);
      }
      if (model !== undefined) currentModel = model;
      if (effort !== undefined) currentEffort = effort;
      return {
        ...(model !== undefined ? { model } : {}),
        ...(effort !== undefined ? { reasoningEffort: effort } : {}),
        appliesAt: 'next-turn',
      };
    };
    const listTurnOptions = async (): Promise<LaneTurnOptionsCatalog> => {
      if (closed || !context) throw new Error('Codex lane is closed');
      const [modelResult, skills] = await Promise.allSettled([
        readModelCatalog(context),
        listCodexLaneSkills(context),
      ]);
      if (modelResult.status === 'rejected') throw modelResult.reason;
      const { catalog, models } = modelResult.value;
      const advertised = codexAdvertisedEfforts(catalog);
      const unsendableEfforts = codexUnsendableEfforts(advertised);
      return {
        models,
        efforts: advertised.length > 0
          ? advertised
          : CLI_REASONING_EFFORT_VALUES.filter((effort) => validatedEffort(effort) !== undefined),
        ...(unsendableEfforts.length > 0 ? { unsendableEfforts } : {}),
        ...(currentModel ? { currentModel } : {}),
        ...(currentEffort ? { currentEffort } : {}),
        commands: codexLaneCommands(skills.status === 'fulfilled' ? skills.value : []),
        ...(skills.status === 'rejected' ? { commandsUnavailable: true, unavailableReason: CODEX_SKILLS_UNAVAILABLE } : {}),
      };
    };
    const assertIdle = (): void => {
      if (closed) throw new Error('Codex lane is closed');
      if (active || starting || compacting)
        throw new Error('Codex lane turn is already active');
    };
    const prepareContinuation = async (message: string, content?: LaneTurnContent): Promise<() => ContinuationOutcome> => {
      assertIdle();
      if (isCompactCommand(message)) return () => {
        assertIdle();
        return { done: runCompact() };
      };
      let skill: CodexTurnInput['skill'];
      if (leadingLaneCommand(message)) {
        starting = true;
        try {
          skill = await resolveRawSkill(message);
        } finally {
          starting = false;
        }
        if (closed) throw new Error('Codex lane is closed');
      }
      const role =
        CODEX_RESUME_RESENDS_ROLE && options.role
          ? `${renderRoleBlock(options.role, this.name)}\n\n`
          : '';
      const nextPrompt = buildTaskPrompt(
        {
          ...options,
          task: message,
          files: undefined,
          role: undefined,
          resumeSessionId: sessionId,
          lanePolicyDelivery: 'developer-instructions',
          resumeRestoresContext: true,
          resumeDeliveredPreambles: delivered,
        },
        this.name,
      );
      return () => {
        assertIdle();
        return { done: runTurn(role + nextPrompt, () => {
          markPromptDelivered();
          if (role) roleDelivery = 'task-prompt';
        }, codexAttachments(content), skill) };
      };
    };
    return {
      abort,
      done,
      providerId: profile.providerId,
      ...(options.accountBinding
        ? { accountBinding: options.accountBinding }
        : {}),
      ...(options.accountBindingId
        ? { accountBindingId: options.accountBindingId }
        : {}),
      getSessionId: () => sessionId,
      reportedSession,
      onSessionResolved: sessionResolved.subscribe,
      getLanePolicyDelivery: () => 'developer-instructions',
      getRoleDelivery: () => roleDelivery,
      onOutput: output.subscribe,
      onSegment: segments.subscribe,
      outcomeUsageIsTurnTotal: true,
      usageScope: 'turn',
      getObservedNativeThreadId: () => registeredThreadId,
      onLaneConfigRejected: configRejection.subscribe,
      supportsContinuation: () => !closed,
      supportsInterrupt: () => !closed && !starting && active !== undefined,
      interrupt: async (): Promise<void> => {
        const turnId = active?.receipt.turnId;
        if (closed || !turnId || !context) return;
        interruptedTurnId = turnId;
        let accepted: boolean;
        try {
          accepted = await context.interrupt(turnId);
        } catch (error: unknown) {
          if (interruptedTurnId === turnId) interruptedTurnId = undefined;
          throw error;
        }
        // `false` with the turn gone: it ended on its own, nothing to stop.
        if (!accepted && active?.receipt.turnId === turnId) {
          interruptedTurnId = undefined;
          throw new Error('Codex did not accept the interrupt');
        }
      },
      applyTurnSettings,
      // Codex accepts image and file input items on every turn and steer.
      turnInputSupport: () => ({ images: { state: 'supported', onSteer: true } }),
      listTurnOptions,
      steer: async (message: string, content?: LaneTurnContent): Promise<void> => {
        const expectedTurnId = active?.receipt.turnId;
        if (closed || !expectedTurnId || !context || starting)
          throw new Error('Codex active turn unavailable');
        const attachments = codexAttachments(content);
        const skill = leadingLaneCommand(message) ? await resolveRawSkill(message) : undefined;
        const receipt = await context.steer(
          { text: message, ...(attachments && { attachments }), ...(skill && { skill }) },
          expectedTurnId,
        );
        if (
          receipt.turnId !== expectedTurnId ||
          active?.receipt.turnId !== expectedTurnId
        )
          throw new Error('Codex active turn changed');
      },
      queueForNextTurn: (message: string): void => {
        if (closed) throw new Error('Codex lane is closed');
        if (nextTurnWarnings.length < 1) nextTurnWarnings.push(message);
      },
      prepareContinuation,
      continue: async (message, content) => (await prepareContinuation(message, content))(),
    };
  }

  private async resumeIdentity(
    threadId: string | undefined,
    profile: CodexExecutionProfile,
  ): Promise<CodexThreadIdentity | undefined> {
    if (!threadId) return undefined;
    const parsed = identitySchema.safeParse(
      await this.identities.readByThreadId(threadId),
    );
    if (!parsed.success) throw new CodexLaneResumeIdentityError();
    const identity = parsed.data;
    if (
      identity.threadId !== threadId ||
      identity.contextId !== profile.contextId ||
      identity.normalizedHome !== profile.normalizedHome ||
      identity.workspaceId !== profile.workspaceId ||
      identity.providerId !== profile.providerId ||
      identity.profileFingerprint !== profile.profileFingerprint
    )
      throw new CodexLaneResumeIdentityError();
    return identity;
  }
}

/**
 * Turn content as Codex input items (B7): images inline, files as native
 * references. `undefined` keeps a text-only turn free of an empty list.
 */
export function codexAttachments(
  content?: LaneTurnContent,
): readonly CodexAttachment[] | undefined {
  const items: CodexAttachment[] = [
    ...(content?.images ?? []).map((image): CodexAttachment => ({
      type: 'image',
      data: image.data,
      mediaType: image.mediaType,
    })),
    ...(content?.files ?? []).map((path): CodexAttachment => ({ type: 'file', path })),
  ];
  return items.length > 0 ? items : undefined;
}
