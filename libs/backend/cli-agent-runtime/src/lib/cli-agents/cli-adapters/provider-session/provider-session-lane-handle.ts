/**
 * createProviderSessionLaneHandle — presents one provider session (an ACP
 * agent from `@ptah-extension/acp-runtime`) as a lane `SdkHandle` with the
 * lane semantics the ACP lane always had.
 *
 * - The agent process is spawned synchronously and the handle returned at
 *   once (Cursor/Pi convention). `done` is the first turn: the handshake,
 *   then the Ptah MCP attachment wait, then the task prompt.
 * - `continue(message, content?)` is a further prompt on the same session;
 *   images and files become ACP content blocks (`toAcpPromptContent`).
 * - Per-turn model and effort go through `session/set_config_option`
 *   (`applyTurnSettings`); the composer catalog is the session's models, the
 *   profile's effort entries and its `available_commands_update` (B8).
 * - There is no `steer`: an ACP agent queues a mid-turn prompt instead of
 *   injecting it. `interrupt` is offered when the profile's cancel behaviour
 *   keeps the process (`await-reply`): `session/cancel` ends the turn and the
 *   next `continue` runs on the same process and session. The interrupted
 *   turn's `done` resolves 0 (Cursor convention), so the lane is not failed.
 * - Abort = `session/cancel` (when a prompt is in flight), a short grace, then
 *   kill; the session stays resumable by id.
 * - Spawn: through the host `IProcessSpawner` with the lane base environment
 *   and command preparer (`lane-acp-spawn.ts`). Without a spawner the lane
 *   fails at once with one error.
 * - Each prompt is bounded by {@link LANE_ACP_PROMPT_TIMEOUT_MS}; a failed
 *   resume opens a new session instead.
 * - One transport: a lane whose ACP session cannot be opened (spawn,
 *   `initialize` or `session/new` failed) fails with the session's one error
 *   and `done` 1. Setup output reaches the lane as it happens.
 *
 * - MCP credential (round 4): `options.onMcpConfigRestored` is the
 *   manager's revoke of the lane's Ptah MCP credential. An ACP lane writes no
 *   config, so it calls the hook once the agent process exits on its own: a
 *   failed setup or a lost process. An abort is the manager's stop or idle
 *   release, which revoke the subject themselves
 *   (`AgentProcessManager.stop`, `releaseSubprocess`); calling the hook from
 *   that late exit could revoke a credential the manager has meanwhile minted
 *   for a resumed lane of the same id. A warm process keeps the credential
 *   for its continuations.
 *
 * Session events reach the lane twice: as segments (`projectToCliSegments`,
 * the text log and lane outcome) and as flat stream events
 * (`createFlatStreamProjector`, `onStreamEvent`), from which the renderer
 * builds the lane's execution cards. stderr lines are redacted and classified here (`laneStderrLine`). `done` and every continuation
 * `done` resolve with 0 or 1 and never reject; failures become one `error`
 * segment.
 */
import { createAcpSession, toAcpPromptContent } from '@ptah-extension/acp-runtime';
import type {
  AcpAvailableCommand,
  AcpSession,
  AcpTransportFactory,
  AcpVendorProfile,
} from '@ptah-extension/acp-runtime';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import {
  createFlatStreamProjector,
  projectToCliSegments,
} from '@ptah-extension/provider-session-contracts';
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
import {
  EFFORT_LEVELS,
  type CliAdapterManifest,
  type CliOutputSegment,
  type FlatStreamEventUnion,
  type LaneComposerCommandOption,
  type LaneTurnContent,
  type LaneTurnInputCapabilities,
  type LaneTurnSettings,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { MCP_ATTACHMENT_TIMEOUT_MS } from '../../mcp-attachment-probe.port';
import {
  LaneTurnSettingRefusal,
  type CliCommandOptions,
  type ContinuationOutcome,
  type LaneTurnOptionsCatalog,
  type LaneTurnSettingsResult,
  type SdkHandle,
} from '../cli-adapter.interface';
import { filterLaneCommands, leadingLaneCommand, matchesLaneCommand } from '../lane-command-filter';
import { buildTaskPrompt, createBufferedEmitter } from '../cli-adapter.utils';
import {
  LANE_ACP_PROMPT_TIMEOUT_MS,
  laneAcpBaseEnv,
  laneAcpCommandPreparer,
} from './lane-acp-spawn';
import { buildLaneMcpAttachments } from './lane-mcp-attachments';
import { laneStderrLine } from './lane-stderr-redaction';

/**
 * The per-turn sections every ACP lane manifest declares (B8, D9, D12).
 * Images and skills are narrowed live by {@link SdkHandle.turnInputSupport}:
 * images need `promptCapabilities.image`, skills an advertised `SKILL.md`
 * command. `commands.blocked` is the profile's hidden list, the static
 * source live and restored records share (D18).
 */
export function acpLaneManifestSections(
  profile: AcpVendorProfile,
  promptReason: string,
): Required<Pick<CliAdapterManifest, 'turnInput' | 'usage' | 'prompts'>> {
  const turnInput: LaneTurnInputCapabilities = {
    model: { state: 'supported', appliesAt: 'next-turn' },
    effort: { state: 'supported', appliesAt: 'next-turn' },
    images: { state: 'supported', onSteer: false },
    files: { state: 'supported', delivery: 'reference' },
    commands: { state: 'supported', blocked: [...(profile.hiddenLaneCommands ?? [])] },
    skills: { state: 'supported' },
  };
  return {
    turnInput,
    // A profile that reads per-call usage streams it during the turn; the
    // turn-end total still corrects the card.
    usage: profile.extensions?.usage
      ? { timing: 'live' }
      : {
          timing: 'turn-end',
          reason: `${profile.displayName} reports token usage when the turn ends.`,
        },
    prompts: {
      approvals: { state: 'unsupported', reason: promptReason },
      questions: { state: 'unsupported', reason: promptReason },
    },
  };
}

/**
 * The effort levels `profile` maps to a config entry other than the model,
 * for `model`. Pure, with no spawn options: the live handle and a stopped
 * lane (its record's model) derive the same list. A profile without
 * `sessionConfig` gives none.
 */
export function acpProfileEfforts(profile: AcpVendorProfile, model?: string): string[] {
  return EFFORT_LEVELS.filter((effort) =>
    (profile.sessionConfig?.({ model, reasoningEffort: effort }) ?? []).some(
      (entry) => entry.configId !== 'model',
    ),
  );
}

/** An advertised ACP command as a composer entry: a `SKILL.md` path marks a skill (D10). */
export function acpLaneCommandOption(command: AcpAvailableCommand): LaneComposerCommandOption {
  return {
    name: command.name,
    ...(command.description ? { description: command.description } : {}),
    group: command.path?.endsWith('SKILL.md') ? 'skill' : 'command',
  };
}

/** The base name of a host path, Windows or POSIX. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export interface ProviderSessionLaneHandleConfig {
  readonly profile: AcpVendorProfile;
  readonly options: CliCommandOptions;
  /** The binary to run: the resolved path from detection, or a bare name. */
  readonly command: string;
  /** Creates the child off-thread when present (TASK_2026_367). */
  readonly spawner?: IProcessSpawner;
  /** Defaults to the runtime's process transport (needs `spawner`); specs pass an in-memory one. */
  readonly transportFactory?: AcpTransportFactory;
  /** Receives the raw failure detail that user-facing segments summarise. */
  readonly logger?: Logger;
}

/**
 * Spawn the profile's agent and return its `SdkHandle` at once. The handshake
 * and the first prompt run inside `done`.
 */
export function createProviderSessionLaneHandle(
  config: ProviderSessionLaneHandleConfig,
): SdkHandle {
  const { profile, options, logger } = config;
  const name = profile.displayName;
  const logContext = { vendor: profile.vendor };

  const abort = new AbortController();
  const output = createBufferedEmitter<string>();
  const segment = createBufferedEmitter<CliOutputSegment>();

  if (!config.spawner && !config.transportFactory) {
    const message = `${name} cannot start: no process spawner was supplied for the lane`;
    logger?.error('[AcpSessionHandle] lane has no process spawner', logContext);
    output.emit(`\n[${name}] ${message}\n`);
    segment.emit({ type: 'error', content: message });
    // Nothing will ever use the credential minted for this lane.
    options.onMcpConfigRestored?.();
    return {
      abort,
      done: Promise.resolve(1),
      onOutput: output.subscribe,
      onSegment: segment.subscribe,
      getSessionId: () => options.resumeSessionId,
      supportsContinuation: () => false,
    };
  }

  const sessionResolved = createBufferedEmitter<string>();
  const stream = createBufferedEmitter<FlatStreamEventUnion>();
  let streamProjector = createFlatStreamProjector();
  let mcpTimedOut = false;
  let onMcpTimeout: (() => void) | undefined;

  /** Status of the last turn's `terminal` event. */
  let lastTerminalStatus: string | undefined;
  /** {@link interrupt} was called during the current turn. */
  let interruptRequested = false;

  /** The turn whose failure already reached the lane as an `error` segment. */
  let errorShownForTurn: string | undefined;
  /** Turns that already have stream rows (an open message to complete). */
  let streamedTurn: string | undefined;
  /**
   * The advertised `/command` the current turn runs (F9), or undefined for a
   * model turn. Grok runs some commands (`/context`, `/compact`) without a
   * model call: the turn ends with no output and no usage.
   */
  let commandTurn: { readonly name: string; output: boolean } | undefined;

  /**
   * A command turn's segments: any provider output marks the turn as
   * answered; a "telemetry unavailable" turn total is dropped, because a
   * command that called no model has no usage to miss (no budget handoff).
   */
  const commandTurnSegment = (item: CliOutputSegment): CliOutputSegment | undefined => {
    if (!commandTurn) return item;
    if (item.turnTelemetry?.status === 'unavailable') return undefined;
    if (item.type !== 'info' || item.usage === undefined) commandTurn.output = true;
    return item;
  };

  const project = (event: ProviderSessionEvent): void => {
    const turnKey = event.turnId ?? `${event.contextId}:setup`;
    if (event.type === 'diagnostic') {
      const { severity, text } = laneStderrLine(event.line, options.mcpToken);
      output.emit(`[stderr] ${text}\n`);
      segment.emit({ type: severity, content: text });
      return;
    }
    if (event.type === 'textDelta') output.emit(event.delta);
    // A refused tool request reaches the lane's output too: the parent reads
    // the output, and a refusal must never look like a silent empty turn.
    if (event.type === 'error' || (event.type === 'info' && event.notice === 'permission-refused')) {
      output.emit(
        `\n[${name}] ${event.type === 'error' ? event.error.message : event.message}\n`,
      );
    }
    for (const item of projectToCliSegments(event)) {
      const shown = commandTurnSegment(item);
      if (shown) segment.emit(shown);
    }
    // A failure already reaches the execution tree as its `error` segment
    // (the card renders error segments beside the event tree); projecting it
    // too would show the message twice. The same holds for the failed
    // `terminal` of a turn with no stream rows yet: the projector would open
    // a message only to repeat the failure.
    if (event.type === 'error') {
      errorShownForTurn = turnKey;
      return;
    }
    if (
      event.type === 'terminal' &&
      event.status === 'failed' &&
      errorShownForTurn === turnKey &&
      streamedTurn !== turnKey
    ) {
      return;
    }
    const rows = streamProjector.project(event);
    if (rows.length > 0) streamedTurn = turnKey;
    for (const item of rows) stream.emit(item);
  };

  const onEvent = (event: ProviderSessionEvent): void => {
    if (event.type === 'terminal') lastTerminalStatus = event.status;
    project(event);
  };

  const session = createAcpSession({
    profile,
    options: {
      ...options,
      mcp: buildLaneMcpAttachments(options),
      attachMethod: 'resume',
      attachFailure: 'new-session',
      promptTimeoutMs: LANE_ACP_PROMPT_TIMEOUT_MS,
    },
    command: config.command,
    baseEnv: laneAcpBaseEnv(),
    spawner: config.spawner,
    prepareCommand: laneAcpCommandPreparer,
    transportFactory: config.transportFactory,
    logger,
    signal: abort.signal,
    onEvent,
    onSessionResolved: sessionResolved.emit,
  });

  /** Wait for the lane's Ptah MCP attachment before the first prompt. */
  const awaitMcpAttachment = async (): Promise<void> => {
    if (
      !options.attachmentProbe ||
      !options.agentId ||
      !options.mcpPort ||
      !session.attachedMcpServers()
    ) {
      return;
    }
    const attachmentWait = new AbortController();
    const attached = await Promise.race([
      options.attachmentProbe.waitFor(
        options.agentId,
        options.mcpPort,
        MCP_ATTACHMENT_TIMEOUT_MS,
        attachmentWait.signal,
      ),
      session.exited.then(() => undefined),
      new Promise<undefined>((resolve) => {
        if (abort.signal.aborted) resolve(undefined);
        else
          abort.signal.addEventListener('abort', () => resolve(undefined), {
            once: true,
            signal: attachmentWait.signal,
          });
      }),
    ]);
    attachmentWait.abort();
    if (!attached && !session.isClosed() && !abort.signal.aborted) {
      mcpTimedOut = true;
      onMcpTimeout?.();
      logger?.warn(
        '[AcpSessionHandle] Ptah MCP did not connect before first prompt',
        {
          ...logContext,
          cause: 'handshake-timeout',
          agentId: options.agentId,
          port: options.mcpPort,
          timeoutMs: MCP_ATTACHMENT_TIMEOUT_MS,
        },
      );
      segment.emit({
        type: 'info',
        content:
          'Ptah MCP did not connect within 15s; report in your final message.',
      });
    }
  };

  /**
   * The task prompt goes first: until it is sent (the handshake and the up to
   * 15 s MCP attachment wait), `continue()` refuses (PR #1444 review). The
   * router parks a message sent meanwhile, because the first turn is running,
   * and delivers it once that turn settles.
   */
  let taskPromptSent = false;

  /**
   * Run one prompt. A turn Ptah interrupted to keep the session resolves 0,
   * as Cursor's does: the lane is healthy and the router continues it, so it
   * must not be recorded as a failed lane. A whole-lane abort stays 1.
   */
  const runTurn = (text: Parameters<AcpSession['prompt']>[0]): Promise<number> => {
    // An interrupted turn can leave a tool or its message open in the
    // projector; the next turn starts from a clean projection.
    if (lastTerminalStatus === 'interrupted') {
      streamProjector = createFlatStreamProjector();
    }
    interruptRequested = false;
    lastTerminalStatus = undefined;
    return session
      .prompt(text)
      .then((code) =>
        // Only a turn whose process takes the next prompt is healthy: a
        // process retired by a failed cancel reports `interrupted` too, but
        // the lane cannot continue on it (PR #1450 review).
        code !== 0 &&
        interruptRequested &&
        lastTerminalStatus === 'interrupted' &&
        !session.isClosed() &&
        !abort.signal.aborted
          ? 0
          : code,
      );
  };

  /**
   * The account-binding checkpoint (`CliCommandOptions.onAccountBinding`),
   * awaited before the task prompt as the Codex lane adapter does, so a named
   * lane never prompts before its binding to the session id persisted.
   * Resolves false, after one error segment and stopping the agent, when the
   * binding is incomplete or the checkpoint rejects.
   */
  const persistAccountBinding = async (sessionId: string): Promise<boolean> => {
    if (options.accountBinding === undefined && options.accountBindingId === undefined) {
      return true;
    }
    try {
      if (!options.accountBinding || !options.accountBindingId || !options.onAccountBinding) {
        throw new Error('the lane account binding is incomplete');
      }
      await options.onAccountBinding(
        {
          accountBinding: options.accountBinding,
          accountBindingId: options.accountBindingId,
        },
        sessionId,
      );
      return true;
    } catch (error: unknown) {
      logger?.error('[AcpSessionHandle] account binding checkpoint failed', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      const message = `${name} did not start: its account binding could not be recorded`;
      output.emit(`\n[${name}] ${message}\n`);
      segment.emit({ type: 'error', content: message });
      abort.abort();
      return false;
    }
  };

  /** Revoke the lane's MCP credential once, when the ACP process is gone. */
  let credentialReleased = false;
  const releaseCredential = (): void => {
    if (credentialReleased || abort.signal.aborted) return;
    credentialReleased = true;
    options.onMcpConfigRestored?.();
  };
  const releaseCredentialOnExit = (): void => {
    session.exited.then(releaseCredential, (error: unknown) => {
      logger?.warn('[AcpSessionHandle] agent exit watch failed; revoking the lane credential', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      releaseCredential();
    });
  };

  const runFirstTurn = async (): Promise<number> => {
    const setup = await session.start();
    releaseCredentialOnExit();
    if (!setup.ok || abort.signal.aborted) return 1;
    const sessionId = session.getSessionId();
    if (!sessionId || !(await persistAccountBinding(sessionId))) return 1;
    await awaitMcpAttachment();
    if (abort.signal.aborted || session.isClosed()) return 1;
    taskPromptSent = true;
    return runTurn(
      buildTaskPrompt(
        // A restored session ran its earlier turns in another handle — another
        // process, host or Ptah version — so what they carried (the policy
        // version, the messaging block) is unknown here. Claiming today's
        // preambles were delivered would drop the lane policy and messaging
        // from a resume that may never have carried them; no
        // resumeDeliveredPreambles is passed, so both blocks stay in this
        // first prompt. Same-process continuations (continueTurn) still send
        // bare messages and keep their dedup.
        { ...options, resumeRestoresContext: setup.restoredContext },
        profile.vendor,
      ),
    );
  };

  const supportsContinuation = (): boolean => {
    return (
      session.isSetupComplete() &&
      !!session.getSessionId() &&
      !session.isClosed() &&
      !abort.signal.aborted
    );
  };

  /** `done` never rejects: an unexpected throw is logged and becomes exit 1. */
  const onUnexpectedTurnError = (error: unknown): number => {
    logger?.error('[AcpSessionHandle] turn threw unexpectedly', {
      ...logContext,
      error: error instanceof Error ? error.message : String(error),
    });
    return 1;
  };

  const imageInputAdvertised = (): boolean =>
    session.getAgentCapabilities()?.promptCapabilities?.image === true;

  /** Text alone, or ACP content blocks when the turn carries images or files. */
  const turnPrompt = (
    message: string,
    content?: LaneTurnContent,
  ): Parameters<AcpSession['prompt']>[0] => {
    const images = content?.images ?? [];
    const files = content?.files ?? [];
    if (images.length === 0 && files.length === 0) return message;
    if (images.length > 0 && !imageInputAdvertised())
      throw new Error(`${name} did not advertise image input`);
    return toAcpPromptContent({
      text: message,
      images: images.map((image) => ({ mimeType: image.mediaType, data: image.data })),
      files: files.map((path) => ({ path, name: baseName(path) })),
    });
  };

  const continueTurn = (
    message: string,
    content?: LaneTurnContent,
  ): Promise<ContinuationOutcome> => {
    if (session.isClosed() || abort.signal.aborted) {
      return Promise.reject(
        new Error(`${name} is no longer running; resume the session by id`),
      );
    }
    if (!session.isSetupComplete() || !session.getSessionId()) {
      return Promise.reject(new Error(`${name} has no ACP session yet`));
    }
    if (!taskPromptSent) {
      return Promise.reject(
        new Error(`${name} has not sent its task prompt yet; send the message after it`),
      );
    }
    if (session.isTurnRunning()) {
      return Promise.reject(new Error(`${name} is still running a turn`));
    }
    let prompt: Parameters<AcpSession['prompt']>[0];
    try {
      prompt = turnPrompt(message, content);
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    // A raw command arrives as typed (no Ptah header), led by an advertised name.
    const command = typeof prompt === 'string' ? leadingLaneCommand(prompt) : undefined;
    commandTurn = command !== undefined && matchesLaneCommand(message, laneCommands().map((entry) => entry.name))
      ? { name: command, output: false }
      : undefined;
    // Counts only: no image data or file path reaches the log.
    if (typeof prompt !== 'string')
      logger?.info('[AcpSessionHandle] turn with content blocks', {
        ...logContext,
        imageCount: content?.images?.length ?? 0,
        fileCount: content?.files?.length ?? 0,
      });
    return Promise.resolve({
      done: runTurn(prompt).then(endCommandTurn).catch(onUnexpectedTurnError),
    });
  };

  /**
   * Ends a command turn: one that completed and returned nothing tells the
   * lane so, instead of a silent empty turn (F9). An interrupted or stopped
   * turn also resolves 0, but it did not run to its end: no notice.
   */
  const endCommandTurn = (code: number): number => {
    const ended = commandTurn;
    commandTurn = undefined;
    const ranToEnd = lastTerminalStatus === 'completed' && !interruptRequested &&
      !abort.signal.aborted && !session.isClosed();
    if (ended && !ended.output && code === 0 && ranToEnd)
      segment.emit({
        type: 'info',
        content: `${name} ran /${ended.name} and returned no output.`,
        hostNotice: true,
        sentAt: Date.now(),
      });
    return code;
  };

  /**
   * Model and effort for the next prompt (`session/set_config_option`). A
   * refused value rejects with fixed text; the ACP error detail itself goes
   * out through the session's own `readAcpErrorDetail` path.
   */
  const applyTurnSettings = async (
    settings: LaneTurnSettings,
  ): Promise<LaneTurnSettingsResult> => {
    const { model, reasoningEffort } = settings;
    if (!supportsContinuation())
      throw new LaneTurnSettingRefusal(
        model !== undefined ? 'model' : 'reasoningEffort',
        `${name} has no running ACP session.`,
      );
    const effortRefused = (): LaneTurnSettingRefusal =>
      new LaneTurnSettingRefusal(
        'reasoningEffort',
        `${name} did not accept the effort level "${reasoningEffort}".`,
      );
    // Both fields are checked before anything is sent (M2): an effort the
    // profile maps to no config entry would otherwise apply nothing.
    if (reasoningEffort !== undefined && !profileEfforts().includes(reasoningEffort))
      throw effortRefused();
    const previousModel = session.getModels().find((entry) => entry.isDefault)?.id;
    if (model !== undefined && !(await session.setModel(model)))
      throw new LaneTurnSettingRefusal('model', `${name} did not accept the model "${model}".`);
    if (reasoningEffort !== undefined && !(await session.setEffort(reasoningEffort))) {
      // A refusal leaves the settings as they were: the model is rolled back.
      if (model !== undefined && model !== previousModel && !(await rollBackModel(previousModel)))
        throw new LaneTurnSettingRefusal(
          'reasoningEffort',
          `${name} did not accept the effort level "${reasoningEffort}"; the model change could not be undone.`,
        );
      throw effortRefused();
    }
    return {
      ...(model !== undefined ? { model } : {}),
      ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      appliesAt: 'next-turn',
    };
  };

  /** Restores `previous` after a refused effort; false when it cannot. */
  const rollBackModel = async (previous: string | undefined): Promise<boolean> => {
    if (previous === undefined) return false;
    try {
      return await session.setModel(previous);
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn; the caller's refusal says the model change could not be undone.
      logger?.warn('[AcpSessionHandle] model rollback failed', {
        ...logContext,
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      return false;
    }
  };

  /** Effort values the profile maps for the lane's model. */
  const profileEfforts = (): string[] => acpProfileEfforts(profile, options.model);

  const laneCommands = (): LaneComposerCommandOption[] =>
    filterLaneCommands(
      session.getAvailableCommands().map(acpLaneCommandOption),
      profile.hiddenLaneCommands ?? [],
    );

  const listTurnOptions = async (): Promise<LaneTurnOptionsCatalog> => {
    const models = session.getModels();
    const current = models.find((model) => model.isDefault)?.id;
    return {
      models: models.map((model) => ({ id: model.id, name: model.name ?? model.id })),
      efforts: profileEfforts(),
      ...(current ? { currentModel: current } : {}),
      commands: laneCommands(),
    };
  };

  /** Live gates: images need the agent's advertisement, skills an advertised skill. */
  const turnInputSupport = (): Partial<LaneTurnInputCapabilities> => ({
    images: imageInputAdvertised()
      ? { state: 'supported', onSteer: false }
      : { state: 'unsupported', reason: `${name} did not advertise image input.` },
    skills: laneCommands().some((command) => command.group === 'skill')
      ? { state: 'supported' }
      : { state: 'unsupported', reason: `${name} advertises no skills to lanes.` },
  });

  /** Cancel the running turn; the process and session stay for `continue`. */
  const interrupt = async (): Promise<void> => {
    interruptRequested = true;
    const kept = await session.interrupt();
    logger?.info('[AcpSessionHandle] turn interrupted', {
      ...logContext,
      processKept: kept,
    });
  };

  /**
   * A first turn that threw before its task prompt went out leaves a session
   * that can never take a message (`continue` refuses without the task
   * prompt). The lane is aborted, so `supportsContinuation()` turns false
   * and the agent is released instead of idling until the lane's cleanup
   * (PR #1450 review). Every other early exit of the first turn already
   * aborts or closes the session.
   */
  const done = runFirstTurn().catch((error: unknown) => {
    const code = onUnexpectedTurnError(error);
    if (!taskPromptSent) abort.abort();
    return code;
  });

  return {
    abort,
    done,
    onOutput: output.subscribe,
    onSegment: segment.subscribe,
    onStreamEvent: stream.subscribe,
    onMcpAttachmentTimeout: (callback) => {
      onMcpTimeout = callback;
      if (mcpTimedOut) callback();
    },
    getSessionId: () => session.getSessionId() ?? options.resumeSessionId,
    onSessionResolved: sessionResolved.subscribe,
    supportsContinuation,
    continue: continueTurn,
    applyTurnSettings,
    turnInputSupport,
    listTurnOptions,
    // Before the task prompt there is no turn to cancel.
    supportsInterrupt: () =>
      taskPromptSent && session.supportsInterrupt() && !abort.signal.aborted,
    interrupt,
    getPid: () => session.getPid(),
    // ACP reports per-turn totals.
    outcomeUsageIsTurnTotal: true,
    usageScope: 'turn',
    getObservedNativeThreadId: () => session.getSessionId(),
  };
}
