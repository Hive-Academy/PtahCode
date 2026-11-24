import { randomUUID } from 'node:crypto';
import {
  ClaudeCertifiedLaunchRefusal,
  assertCertifiedLaunch,
  claudeIdentityReference,
  claudePersonalLoginCheck,
  claudeVersionIdentity,
  claudePersonalLoginPassed,
  createNamedAccountPromptGate,
  isChildExitProved,
  spawnedChildPid,
  withNamedAccountToolGate,
} from '@ptah-extension/agent-sdk';
import type {
  ClaudePersonalLoginCheck,
  SDKUserMessage,
  SessionMetadata,
} from '@ptah-extension/agent-sdk';
import {
  EFFORT_LEVELS,
  resolveImageMediaType,
  type EffortLevel,
  type LaneCapabilitySupport,
  type LaneComposerCommandOption,
  type LaneImageInputSupport,
  type LanePermissionMode,
  type LanePromptCapabilities,
  type LaneTurnContent,
  type LaneTurnInputCapabilities,
  type LaneTurnSettings,
  type ProviderAccountBinding,
  type ProviderAccountIdentityEvidence,
} from '@ptah-extension/shared';
import type {
  ClaudeAccountNamedRoute,
  ClaudeAccountRunReservation,
  ClaudeCertifiedLaunchContext,
  ClaudeLaunchBoundary,
  ClaudeLaunchBoundaryOutcome,
  ProviderAccountAdmissionPort,
  ProviderAccountPortRefusal,
} from '@ptah-extension/auth-providers-tokens';
import { claudeActualLaunch } from './claude-sdk-lane-options';
import {
  LaneTurnSettingRefusal,
  type CliModelInfo,
  type LaneAccountBindingPort,
  type LaneAccountReference,
  type LaneTurnOptionsCatalog,
  type LaneTurnSettingsResult,
} from '../cli-agents/cli-adapters/cli-adapter.interface';
import { filterLaneCommands } from '../cli-agents/cli-adapters/lane-command-filter';
import { withFileReferences } from '../cli-agents/messaging/lane-resumers/ptah-cli-lane-resumer';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  Options,
  SdkModuleLoader,
  SdkMessageTransformer,
} from '@ptah-extension/agent-sdk';
import type { SdkHandle } from '../cli-agents/cli-adapters';
import {
  PtahCliStreamLoop,
  type PtahCliStreamLoopConfig,
} from '../ptah-cli/helpers/ptah-cli-stream-loop.service';
import {
  isPlanBilledLaneProvider,
  type PtahCliLanePlanLimits,
} from '../ptah-cli/helpers/ptah-cli-lane-plan-limits';
import {
  toUserMessage,
  type PromptMailbox,
  type PromptTurn,
  type PromptTurnContent,
} from '../ptah-cli/helpers/ptah-cli-prompt-mailbox';

/** D17: the SDK's interrupt must settle within 3 s or the router reports `interrupt-failed`. */
const CLAUDE_INTERRUPT_TIMEOUT_MS = 3_000;
/** `setModel` / `applyFlagSettings` bound (B5). */
const CLAUDE_SETTINGS_TIMEOUT_MS = 10_000;
/** `supportedModels` / `supportedCommands` bound, each (D17). */
const CLAUDE_CATALOG_TIMEOUT_MS = 5_000;
export const CLAUDE_INTERRUPT_TIMEOUT_TEXT = 'Claude did not stop the turn in 3 s';
export const CLAUDE_LATE_INTERRUPT_TEXT =
  'The turn ended after a late interrupt; your message was not sent.';
/** Info segment when a steer was not folded into the turn it was sent to (B6). */
export const CLAUDE_STEER_MISSED_TEXT = 'A message may start the next turn.';
const CLAUDE_STEER_REFUSED_TEXT =
  'Claude takes a message mid-turn only while one of its tools runs.';
const CLAUDE_TURN_OPTIONS_ERROR = 'Lane options could not be read.';
/**
 * Claude commands hidden from lanes (D18). Empty until a permission-policy
 * command is proven to exist for Claude lanes.
 */
export const CLAUDE_HIDDEN_LANE_COMMANDS: readonly string[] = [];

/**
 * Per-turn input of every Claude SDK lane (Claude and Ptah CLI, B5). Each
 * supported item has its handle operation (Req 4.3): `applyTurnSettings`,
 * `continue` with content, `turnInputSupport`, `listTurnOptions`.
 */
export const CLAUDE_SDK_LANE_TURN_INPUT: LaneTurnInputCapabilities = {
  model: { state: 'supported', appliesAt: 'next-turn' },
  effort: { state: 'supported', appliesAt: 'next-turn' },
  images: { state: 'supported', onSteer: false },
  files: { state: 'supported', delivery: 'path-text' },
  commands: { state: 'supported', blocked: CLAUDE_HIDDEN_LANE_COMMANDS },
  skills: { state: 'supported' },
};

/** Reason a Ptah CLI lane on a provider without known image support gives (S1). */
export const CLAUDE_SDK_LANE_IMAGES_UNKNOWN_TEXT =
  'This provider does not report which of its models accept images.';

/**
 * The Claude SDK turn input with images narrowed to `images`. A Ptah CLI lane
 * passes its provider's image support; the native Claude lane keeps the
 * default.
 */
export function claudeSdkLaneTurnInput(
  images: LaneImageInputSupport,
): LaneTurnInputCapabilities {
  return { ...CLAUDE_SDK_LANE_TURN_INPUT, images };
}

/** Fixed refusal texts of `applyTurnSettings` (M7): no provider text reaches a caller. */
const CLAUDE_MODEL_REFUSED_TEXT = 'Claude did not accept the model.';
const CLAUDE_EFFORT_REFUSED_TEXT = 'Claude did not accept the effort level.';
const CLAUDE_EFFORT_REFUSED_MODEL_KEPT_TEXT =
  'Claude did not accept the effort level; the model change could not be undone.';

/**
 * Approval prompts reach the host through `canUseTool`. In `yolo` (native
 * `bypassPermissions`) every tool runs without one; `ask`, `auto-edit` and
 * `plan` still ask for the tools they do not auto-allow. `AskUserQuestion`
 * reaches the host in every mode (B11). Without a known mode the CLI's own
 * capability is reported.
 */
export function claudeSdkLanePrompts(
  permission?: LanePermissionMode,
): LanePromptCapabilities {
  return {
    approvals: permission === 'yolo'
      ? { state: 'unsupported', reason: 'This lane runs in yolo mode: every tool runs without an approval prompt.' }
      : { state: 'supported' },
    questions: { state: 'supported' },
  };
}

/** Rejects with `text` when `call` has not settled within `ms`. */
function boundedCall<T>(call: Promise<T>, ms: number, text: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    call,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(text)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * The user turn's content (B5): plain text, or text plus base64 image
 * blocks. Attached files go into the text as paths (`path-text`, D14). An
 * image whose media type cannot be resolved rejects the turn; it is never
 * dropped silently.
 */
export function claudeLaneTurnContent(
  message: string,
  content?: LaneTurnContent,
): PromptTurnContent {
  const text = withFileReferences(message, content?.files);
  const images = content?.images ?? [];
  if (images.length === 0) return text;
  const blocks: Exclude<PromptTurnContent, string> = [{ type: 'text', text }];
  for (const image of images) {
    const mediaType = resolveImageMediaType(image.mediaType, image.data);
    if (mediaType === null)
      throw new Error('An attached image is not a PNG, JPEG, GIF or WebP image.');
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: image.data },
    });
  }
  return blocks;
}

/** Claude's built-in commands are commands; every other entry is a skill or user command (D10). */
function laneCommandOption(command: {
  name: string;
  description?: string;
  builtin?: boolean;
}): LaneComposerCommandOption {
  return {
    name: command.name,
    ...(command.description ? { description: command.description } : {}),
    group: command.builtin ? 'command' : 'skill',
  };
}

type LaneQueryFunction = Awaited<
  ReturnType<SdkModuleLoader['getQueryFunction']>
>;
export interface ClaudeSdkLaneRunContext {
  queryFn: LaneQueryFunction;
  options: Options & { abortController: AbortController };
  mailbox: PromptMailbox;
  named?: ClaudeNamedLaneAdmission;
  providerId: string;
  agentName: string;
  agentIdHolder: { value?: string };
  lanePlanLimits: Pick<
    PtahCliLanePlanLimits,
    'attach' | 'onSystemInit' | 'onSignal' | 'end' | 'settled'
  >;
  outputCallbacks: Array<(data: string) => void>;
  onSegment: NonNullable<SdkHandle['onSegment']>;
  onStreamEvent: NonNullable<SdkHandle['onStreamEvent']>;
  emitOutput: PtahCliStreamLoopConfig['emitOutput'];
  emitSegment: PtahCliStreamLoopConfig['emitSegment'];
  emitStreamEvent: PtahCliStreamLoopConfig['emitStreamEvent'];
  disposeCallbacks: () => void;
  stopProxy: () => Promise<void>;
  /**
   * The lane manifest's `messaging.steer` (B6). Steer is exposed only when it
   * is `supported`; absent keeps the fold-in dormant.
   */
  manifestSteer?: LaneCapabilitySupport;
  /**
   * The manifest's `turnInput.images` (S1). Absent means supported (the
   * native Claude lane); an unsupported value refuses image turns.
   */
  imageInput?: LaneImageInputSupport;
}

/** One turn sent to the CLI whose result frame has not arrived yet. */
interface InFlightTurn {
  /**
   * The prompt's uuid; absent for the spawn's first turn. A missed steer's
   * placeholder carries the steer's uuid, so a frame that lists it (two
   * missed steers run as one turn) drops the placeholder as folded.
   */
  readonly uuid?: string;
  readonly resolve: (exitCode: number) => void;
}

/** One native query and stream loop per spawn; no provider/config fabrication. */
export class ClaudeSdkLaneRunner {
  constructor(
    private readonly logger: Logger,
    private readonly messageTransformer: SdkMessageTransformer,
  ) {}

  run(context: ClaudeSdkLaneRunContext): {
    handle: SdkHandle;
    setAgentId: (id: string) => void;
  } {
    const {
      queryFn,
      options,
      mailbox,
      providerId,
      agentName,
      agentIdHolder,
      lanePlanLimits,
      outputCallbacks,
      onSegment,
      onStreamEvent,
      emitOutput,
      emitSegment,
      emitStreamEvent,
      disposeCallbacks,
      stopProxy,
    } = context;
    const abortController = options.abortController;
    let closed = false;
    // A holder, not a late const: closeMailbox can run (abort or the
    // queryFn catch below) before finish exists.
    const abortSettler: { settle?: () => void } = {};
    const closeMailbox = (): void => {
      if (closed) return;
      closed = true;
      mailbox.close();
      if (context.named) {
        void context.named.dispose();
        abortSettler.settle?.();
      }
    };
    abortController.signal.addEventListener('abort', closeMailbox, {
      once: true,
    });
    let sdkQuery: ReturnType<LaneQueryFunction>;
    try {
      sdkQuery =
        context.named?.query ?? queryFn({ prompt: mailbox.prompt, options });
    } catch (error: unknown) {
      abortController.signal.removeEventListener('abort', closeMailbox);
      closeMailbox();
      disposeCallbacks();
      lanePlanLimits.end();
      throw error;
    }
    let resolvedSessionId: string | null = null;
    const sessionResolvedCallbacks: Array<(sessionId: string) => void> = [];
    // Turn bookkeeping (B5, M4): a turn is in flight from its enqueue to its
    // result frame. A result frame with no turn in flight (a CLI-initiated
    // result, such as a background task notification) settles nothing.
    const inFlight: InFlightTurn[] = [];
    const enqueueTurn = (uuid?: string): { entry: InFlightTurn; done: Promise<number> } => {
      let entry!: InFlightTurn;
      const done = new Promise<number>((resolve) => {
        entry = uuid ? { uuid, resolve } : { resolve };
      });
      inFlight.push(entry);
      return { entry, done };
    };
    const dropTurn = (entry: InFlightTurn): void => {
      const index = inFlight.indexOf(entry);
      if (index >= 0) inFlight.splice(index, 1);
    };
    const turn1Done = enqueueTurn().done;
    /** The turns the current result frame settles, handed to `onTurnComplete`. */
    let settling: InFlightTurn[] | undefined;
    let interruptPending: { turn: InFlightTurn; timedOut: boolean } | undefined;
    // Steer fold-in (B6): main-thread tool calls without their result, and
    // the steers pushed since the last result frame, by uuid. Each keeps its
    // anchor: the last turn in flight when it was pushed, which the CLI runs
    // before the steer when it does not fold it in (M6 c).
    let toolInFlight = false;
    const pendingSteers = new Map<string, InFlightTurn | undefined>();
    /**
     * M3: set by the first result frame that carries `user_message_uuids`.
     * Until then the CLI has not shown that it reports them (an older CLI
     * never does), so a steer's fate could not be checked and steer is not
     * offered.
     */
    let reportsMessageUuids = false;
    let currentModel: string | undefined = options.model;
    let currentEffort: string | undefined =
      typeof options.effort === 'string' ? options.effort : undefined;
    const settingRefusal = (
      field: LaneTurnSettingRefusal['field'],
      fixed: string,
      error: unknown,
    ): LaneTurnSettingRefusal => {
      // The caller gets fixed text only (M7). Named lanes log no provider
      // text either: it can carry account paths.
      if (context.named)
        this.logger.warn('[ClaudeLane] Claude refused a turn setting.', { field });
      else
        this.logger.warn('[ClaudeLane] Claude refused a turn setting.', {
          field,
          detail: error instanceof Error ? error.message.slice(0, 200) : String(error),
        });
      return new LaneTurnSettingRefusal(field, fixed);
    };
    const attachAgentId = (agentId: string): void => {
      agentIdHolder.value = agentId;
      lanePlanLimits.attach(agentId);
    };
    const streamLoop = new PtahCliStreamLoop({
      logger: this.logger,
      messageTransformer: this.messageTransformer,
      emitOutput,
      emitSegment,
      emitStreamEvent,
      agentName: agentName,
      onSessionResolved: (sessionId: string) => {
        resolvedSessionId = sessionId;
        // The system init: the lane's own account can be read from here. A
        // named lane keys an unproved owner to its certified route.
        lanePlanLimits.onSystemInit(sdkQuery, context.named?.route);
        for (const cb of sessionResolvedCallbacks) {
          cb(sessionId);
        }
      },
      // A turn is released to the manager only once the lane's owner read
      // has settled (bounded at 3 s), so the exit it triggers is classified
      // and persisted with the owner (Batch 11 carry-forward).
      onTurnComplete: (exitCode: number) => {
        // Without a preceding `onTurnResult` the frame settles the oldest turn.
        const head = settling === undefined ? inFlight.shift() : undefined;
        const settled = settling ?? (head ? [head] : []);
        settling = undefined;
        if (settled.length > 0)
          void lanePlanLimits.settled.then(() => {
            for (const turn of settled) turn.resolve(exitCode);
          });
      },
      onToolInFlightChange: (toolRunning) => {
        toolInFlight = toolRunning;
      },
      onTurnResult: ({ subtype, userMessageUuids }) => {
        if (userMessageUuids !== undefined) reportsMessageUuids = true;
        reconcileSteers(userMessageUuids);
        const head = inFlight.shift();
        if (!head) {
          // Unsolicited (M4): no queued turn ends here.
          settling = [];
          return { interrupted: false };
        }
        // Queued prompts the CLI folded into this turn are proved by their
        // uuids; they settle with it instead of waiting for a later frame.
        const listed = new Set(userMessageUuids ?? []);
        const folded = inFlight.filter((turn) => turn.uuid !== undefined && listed.has(turn.uuid));
        for (const turn of folded) dropTurn(turn);
        settling = [head, ...folded];
        // The flag clears on this turn's result frame, whatever its outcome.
        const flag = interruptPending;
        interruptPending = undefined;
        const interrupted =
          flag !== undefined &&
          flag.turn === head &&
          subtype === 'error_during_execution' &&
          !closed;
        if (interrupted && flag.timedOut)
          emitSegment({ type: 'info', content: CLAUDE_LATE_INTERRUPT_TEXT });
        return { interrupted };
      },
      onPlanLimitSignal: (signal) => lanePlanLimits.onSignal(signal),
      planBilledSuccess: isPlanBilledLaneProvider(providerId),
    });
    let finished = false;
    const turnRunning = (): boolean =>
      !closed && !finished && inFlight.length > 0;
    /**
     * Steer rule (M3, consistent with the parent task's M6): a steer is
     * offered only after this lane's CLI has carried `user_message_uuids` on
     * a result frame. An older CLI that never reports them gets no steer at
     * all, so nothing is guessed: no steer is assumed folded (which would let
     * a missed steer's own frame settle a real turn early) and none is
     * counted missed. The lane's first turn has no proof yet, so steer starts
     * from its second turn.
     */
    const supportsSteer = (): boolean =>
      reportsMessageUuids && toolInFlight && turnRunning();
    /**
     * A steer the result frame does not list was not folded in: the CLI runs
     * it as its own turn, in push order, right after the turn that was last
     * when it was pushed. Each missed steer gets a placeholder turn of its
     * own, carrying its uuid, placed after its anchor and after the missed
     * steers pushed before it, so no real turn's `done` is settled by a
     * steer's frame. When the CLI runs several missed steers as one turn, that
     * frame lists their uuids and the other placeholders are dropped as
     * folded, like queued prompts. A frame without `user_message_uuids`
     * (unexpected once the CLI has reported them) proves nothing: the steers
     * stay pending for the next frame that lists uuids, neither folded nor
     * missed. This runs before the head is shifted off, so an anchor that is
     * the head puts the placeholder next; an anchor already gone puts it
     * right after the head.
     */
    const reconcileSteers = (consumed?: readonly string[]): void => {
      if (pendingSteers.size === 0 || consumed === undefined) return;
      const steers = [...pendingSteers];
      pendingSteers.clear();
      const listed = new Set(consumed);
      const missed = steers.filter(([uuid]) => !listed.has(uuid));
      if (missed.length === 0) return;
      emitSegment({ type: 'info', content: CLAUDE_STEER_MISSED_TEXT });
      let previous: InFlightTurn | undefined;
      for (const [uuid, anchorTurn] of missed) {
        const anchor = anchorTurn ? inFlight.indexOf(anchorTurn) : -1;
        const afterPrevious = previous ? inFlight.indexOf(previous) + 1 : 0;
        const index = Math.max(anchor >= 0 ? anchor + 1 : 1, afterPrevious);
        previous = { uuid, resolve: () => undefined };
        inFlight.splice(index, 0, previous);
      }
    };
    /** Refuses a turn carrying images when the lane's provider cannot take them (S1). */
    const assertImagesAccepted = (content?: LaneTurnContent): void => {
      if ((content?.images?.length ?? 0) > 0 && context.imageInput?.state === 'unsupported')
        throw new Error(context.imageInput.reason ?? CLAUDE_SDK_LANE_IMAGES_UNKNOWN_TEXT);
    };
    const steer = async (message: string, content?: LaneTurnContent): Promise<void> => {
      if (!supportsSteer()) throw new Error(CLAUDE_STEER_REFUSED_TEXT);
      if (context.named && abortController.signal.aborted) throw claudeLaneRefusal();
      assertImagesAccepted(content);
      // Tagged so the result frame's `user_message_uuids` proves the fold-in.
      const turn: PromptTurn = {
        content: claudeLaneTurnContent(message, content),
        uuid: randomUUID(),
      };
      const uuid = turn.uuid as string;
      pendingSteers.set(uuid, inFlight[inFlight.length - 1]);
      this.logger.info(`[ClaudeLane] steer pushed into the running turn for "${agentName}"`, {
        messageLength: message.length,
        imageCount: content?.images?.length ?? 0,
        fileCount: content?.files?.length ?? 0,
      });
      try {
        if (context.named)
          await context.named.enqueue(turn, resolvedSessionId ?? undefined);
        else mailbox.push(turn, resolvedSessionId ?? undefined);
      } catch (error: unknown) {
        // A steer that never reached the CLI cannot be missed (M6 b); the
        // caller gets the failure.
        pendingSteers.delete(uuid);
        throw error;
      }
    };
    const applyTurnSettings = async (
      settings: LaneTurnSettings,
    ): Promise<LaneTurnSettingsResult> => {
      const { model, reasoningEffort } = settings;
      if (closed || finished)
        throw new LaneTurnSettingRefusal(
          model !== undefined ? 'model' : 'reasoningEffort',
          'The Claude lane has ended.',
        );
      // Both fields are checked before anything is sent (M2).
      if (reasoningEffort !== undefined && !isEffortLevel(reasoningEffort))
        throw new LaneTurnSettingRefusal(
          'reasoningEffort',
          `Claude has no effort level "${reasoningEffort}".`,
        );
      // The flag layer has no `max` tier (E20), as in main chat: the result
      // names the level actually applied (m4).
      const effortLevel = reasoningEffort === 'max' ? 'xhigh' : reasoningEffort;
      const result: LaneTurnSettingsResult = {
        ...(model !== undefined ? { model } : {}),
        ...(effortLevel !== undefined ? { reasoningEffort: effortLevel } : {}),
        appliesAt: 'next-turn',
      };
      // Sent at once: the manager applies settings on an idle lane, or right
      // before it interrupts the running turn, so a refusal never costs it.
      await sendSettings(model, effortLevel);
      return result;
    };
    /**
     * Sends model then effort. An effort refusal rolls the model back, so a
     * refusal leaves the lane's settings as they were (M2).
     */
    const sendSettings = async (model?: string, effortLevel?: string): Promise<void> => {
      const previousModel = currentModel;
      if (model !== undefined) {
        try {
          await boundedCall(sdkQuery.setModel(model), CLAUDE_SETTINGS_TIMEOUT_MS,
            'Claude did not confirm the model in 10 s.');
        } catch (error: unknown) {
          throw settingRefusal('model', CLAUDE_MODEL_REFUSED_TEXT, error);
        }
      }
      if (effortLevel !== undefined && isEffortLevel(effortLevel)) {
        try {
          await boundedCall(
            sdkQuery.applyFlagSettings({ effortLevel: effortLevel === 'max' ? 'xhigh' : effortLevel }),
            CLAUDE_SETTINGS_TIMEOUT_MS,
            'Claude did not confirm the effort level in 10 s.',
          );
        } catch (error: unknown) {
          if (model === undefined)
            throw settingRefusal('reasoningEffort', CLAUDE_EFFORT_REFUSED_TEXT, error);
          try {
            await boundedCall(sdkQuery.setModel(previousModel), CLAUDE_SETTINGS_TIMEOUT_MS,
              'Claude did not confirm the model rollback in 10 s.');
          } catch {
            // The refusal below tells the user the model stayed changed.
            currentModel = model;
            throw settingRefusal('reasoningEffort', CLAUDE_EFFORT_REFUSED_MODEL_KEPT_TEXT, error);
          }
          throw settingRefusal('reasoningEffort', CLAUDE_EFFORT_REFUSED_TEXT, error);
        }
        currentEffort = effortLevel;
      }
      if (model !== undefined) currentModel = model;
    };
    const listTurnOptions = async (): Promise<LaneTurnOptionsCatalog> => {
      const [models, commands] = await Promise.allSettled([
        boundedCall(sdkQuery.supportedModels(), CLAUDE_CATALOG_TIMEOUT_MS, 'Claude models timed out.'),
        boundedCall(sdkQuery.supportedCommands(), CLAUDE_CATALOG_TIMEOUT_MS, 'Claude commands timed out.'),
      ]);
      const failed = models.status === 'rejected' || commands.status === 'rejected';
      if (failed)
        // Not silent: the catalog carries `error` for the composer and the failure is logged.
        this.logger.warn('[ClaudeLane] Lane turn options could not be read.', {
          models: models.status,
          commands: commands.status,
        });
      const catalog: LaneTurnOptionsCatalog & { readonly error?: string } = {
        models: models.status === 'fulfilled'
          ? models.value.map((model): CliModelInfo => ({ id: model.value, name: model.displayName }))
          : [],
        efforts: [...EFFORT_LEVELS],
        ...(currentModel ? { currentModel } : {}),
        ...(currentEffort ? { currentEffort } : {}),
        commands: commands.status === 'fulfilled'
          ? filterLaneCommands(commands.value.map(laneCommandOption), CLAUDE_HIDDEN_LANE_COMMANDS)
          : [],
        ...(failed ? { error: CLAUDE_TURN_OPTIONS_ERROR } : {}),
      };
      return catalog;
    };
    const finish = (exitCode: number): void => {
      if (finished) return;
      finished = true;
      interruptPending = undefined;
      pendingSteers.clear();
      toolInFlight = false;
      abortController.signal.removeEventListener('abort', closeMailbox);
      closeMailbox();
      disposeCallbacks();
      void stopProxy().catch(() =>
        this.logger.warn('[ClaudeLane] Proxy cleanup failed.'),
      );
      sessionResolvedCallbacks.length = 0;
      lanePlanLimits.end();
      const remaining = [...(settling ?? []), ...inFlight.splice(0)];
      settling = undefined;
      void lanePlanLimits.settled.then(() => {
        for (const turn of remaining) turn.resolve(exitCode);
      });
    };
    abortSettler.settle = () => finish(1);
    streamLoop.run(sdkQuery).then(finish, (error: unknown) => {
      // Named lanes log no raw error text: it can carry account paths.
      this.logger.error(
        context.named
          ? '[ClaudeLane] Stream loop failed.'
          : `[PtahCliRegistry] spawnAgent stream loop error: ${
              error instanceof Error ? error.message : String(error)
            }`,
      );
      finish(1);
    });
    if (context.named && abortController.signal.aborted) finish(1);

    // No `getPid`, deliberately, and it is not an oversight the way it looks.
    // Every other adapter here spawns its own `child_process` and can hand the
    // manager a PID to tree-kill. This path does not spawn anything: `query()`
    // owns the `claude` child, exposes no handle to it anywhere in the SDK's
    // public surface, and reaps it itself when `abortController` fires — which
    // is also what closes the prompt mailbox above and ends the stream loop. So
    // for this handle the abort IS the kill, and `AgentProcessManager.killProcess`
    // waits on `done` rather than tree-killing a PID it cannot be given.
    // Inventing one (e.g. from a process scan) would be guessing at which
    // `claude.exe` on the machine is ours.
    const handle: SdkHandle = {
      ...context.named?.reference,
      providerId: providerId,
      abort: abortController,
      done: turn1Done,
      onOutput: (callback) => {
        outputCallbacks.push(callback);
      },
      onSegment,
      onStreamEvent,
      // The stream loop emits one per-turn delta segment for each SDK result.
      outcomeUsageIsTurnTotal: true,
      usageScope: 'turn',
      getObservedNativeThreadId: () => resolvedSessionId ?? undefined,
      onSessionResolved: (callback) => {
        sessionResolvedCallbacks.push(callback);
        if (resolvedSessionId) {
          callback(resolvedSessionId);
        }
      },
      supportsContinuation: () => true,
      // Called by the manager as soon as it tracks the run, which is when
      // the lane's owner can be recorded on it.
      setAgentId: attachAgentId,
      continue: async (message: string, content?: LaneTurnContent) => {
        if (context.named && (closed || abortController.signal.aborted))
          throw claudeLaneRefusal();
        // Built before the turn is queued: an unresolvable or refused image
        // rejects the call and nothing is sent.
        assertImagesAccepted(content);
        const turn: PromptTurn = {
          content: claudeLaneTurnContent(message, content),
          uuid: randomUUID(),
        };
        // Queued before the named gate so its result frame always finds it;
        // a refusal by the gate drops it again (M5).
        const { entry, done } = enqueueTurn(turn.uuid);
        try {
          if (context.named)
            await context.named.enqueue(turn, resolvedSessionId ?? undefined);
          if (context.named && (closed || abortController.signal.aborted))
            throw claudeLaneRefusal();
        } catch (error: unknown) {
          dropTurn(entry);
          throw error;
        }
        // Counts only: no image data or file path reaches the log.
        this.logger.info(
          `[PtahCliRegistry] continue() pushing follow-up turn for "${agentName}"`,
          {
            sessionId: resolvedSessionId,
            messageLength: message.length,
            imageCount: content?.images?.length ?? 0,
            fileCount: content?.files?.length ?? 0,
          },
        );
        if (!context.named)
          mailbox.push(turn, resolvedSessionId ?? undefined);
        return Promise.resolve({ done });
      },
      supportsInterrupt: turnRunning,
      interrupt: async () => {
        const running = inFlight[0];
        if (!turnRunning() || !running) return;
        const pending = { turn: running, timedOut: false };
        interruptPending = pending;
        try {
          await boundedCall(
            Promise.resolve(sdkQuery.interrupt()).then(() => undefined),
            CLAUDE_INTERRUPT_TIMEOUT_MS,
            CLAUDE_INTERRUPT_TIMEOUT_TEXT,
          );
        } catch (error: unknown) {
          if (error instanceof Error && error.message === CLAUDE_INTERRUPT_TIMEOUT_TEXT) {
            // The flag stays set until this turn's result frame, so a late
            // interrupt still ends the turn with exit 0.
            pending.timedOut = true;
          } else if (interruptPending === pending) {
            interruptPending = undefined;
          }
          throw error;
        }
      },
      // Dormant until the manifest declares steer (Batch 30, after live L4).
      ...(context.manifestSteer?.state === 'supported' ? { steer, supportsSteer } : {}),
      applyTurnSettings,
      // The SDK accepts image blocks on every turn; whether the model can
      // read them is the provider's (S1), so the manifest's value is echoed.
      turnInputSupport: () => ({
        images: context.imageInput?.state === 'unsupported'
          ? context.imageInput
          : { state: 'supported' },
      }),
      listTurnOptions,
    };
    return { handle, setAgentId: attachAgentId };
  }
}

/** Host-owned adapter to the same registry/SDK-attachment/metadata ports as main chat.
 * A host binds it only together with route certification
 * (`ClaudeNamedAccountPersistence`); a host without it binds read-only
 * bindings whose writes refuse `unavailable-storage`. It never trusts caller
 * paths.
 */
export interface ClaudeLaneAccountPersistence extends LaneAccountBindingPort {
  readonly available: boolean;
  commitRunBinding(
    route: ClaudeAccountNamedRoute,
    reservation: ClaudeAccountRunReservation,
    identity: ProviderAccountIdentityEvidence,
  ): Promise<ProviderAccountBinding>;
  attachSdkSession(request: {
    provider: string;
    sdkSessionId: string;
    runId: string;
    attachedAt: number;
  }): Promise<{
    status:
      | 'attached'
      | 'binding-absent'
      | 'session-linked-elsewhere'
      | 'run-linked-elsewhere';
  }>;
  saveAccountBound(
    metadata: SessionMetadata,
    binding: ProviderAccountBinding,
  ): Promise<void>;
  assertRouteCurrent(route: ClaudeAccountNamedRoute): Promise<void>;
  /**
   * Revalidates the route and re-checks the certified launch's policy sources
   * right before one SDK child starts. `terminated` reports whether every
   * child the check started was proved closed.
   */
  checkLaunchBoundary(
    route: ClaudeAccountNamedRoute,
    launch: ClaudeCertifiedLaunchContext,
    boundary: ClaudeLaunchBoundary,
    signal: AbortSignal,
  ): Promise<ClaudeLaunchBoundaryOutcome>;
  onAuthEpochChanged(
    listener: (route: ClaudeAccountNamedRoute) => void,
  ): () => void;
}

export type ClaudeLaneRefusalCode = ProviderAccountPortRefusal['code'];

/** Fixed, path-free lane refusal: a result code and a fixed message. */
class ClaudeLaneRefusal extends Error {
  constructor(
    readonly code: ClaudeLaneRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClaudeLaneRefusal';
  }
}

/**
 * Fixed, path-free refusal text per code. Each names its code so the error an
 * agent sees states why the named run was refused.
 */
const CLAUDE_LANE_REFUSAL_MESSAGES: Readonly<
  Record<ClaudeLaneRefusalCode, string>
> = Object.freeze({
  'missing-profile':
    'Claude account refused (missing-profile): the named account does not exist',
  'wrong-provider':
    'Claude account refused (wrong-provider): the account belongs to another provider',
  'unsupported-store':
    'Claude account refused (unsupported-store): the account directory or the installed Claude CLI is not usable for named accounts',
  'unsupported-source':
    'Claude account refused (unsupported-source): the Claude CLI build, account plan or a Claude settings source could not be certified for named accounts (see the Ptah log for the step)',
  'identity-mismatch':
    'Claude account refused (identity-mismatch): the signed-in Claude login is not the stored account',
  'identity-unproved':
    'Claude account refused (identity-unproved): the account sign-in could not be proved',
  'route-changed':
    'Claude account refused (route-changed): the account configuration changed during admission',
  busy: 'Claude account refused (busy): the account is in use by another operation',
  'unavailable-storage':
    'Claude account refused (unavailable-storage): account storage is not available',
  conflict:
    'Claude account refused (conflict): the account selection conflicts with the request or session',
  cancelled: 'Claude account refused (cancelled): the admission was cancelled',
  timeout: 'Claude account refused (timeout): the admission timed out',
  'release-held':
    'Claude account refused (release-held): a previous run of this account is not released yet',
  'invalid-bound':
    'Claude account refused (invalid-bound): the stored session binding is not valid',
});

/**
 * `message` must be a fixed string: never a path, an account value or CLI text.
 * It defaults to the fixed text of `code`. A refusal with no stated code is an
 * unproved named run, `identity-unproved`.
 */
export function claudeLaneRefusal(
  code: ClaudeLaneRefusalCode = 'identity-unproved',
  message: string = CLAUDE_LANE_REFUSAL_MESSAGES[code],
): Error & { code: ClaudeLaneRefusalCode } {
  return new ClaudeLaneRefusal(code, message);
}

/**
 * The refusal code an error carries: a lane refusal's or a certified-launch
 * refusal's own code. Any other error (a store, SDK or callback failure) is an
 * unclassified named-run failure, `identity-unproved`, so no foreign error
 * field reaches a caller.
 */
export function claudeLaneRefusalCode(error: unknown): ClaudeLaneRefusalCode {
  if (
    error instanceof ClaudeLaneRefusal ||
    error instanceof ClaudeCertifiedLaunchRefusal
  )
    return error.code;
  return 'identity-unproved';
}

/** Init `apiKeySource` values a personal claude.ai login may report. */
const INIT_PERSONAL_KEY_SOURCES: ReadonlySet<string> = new Set([
  'none',
  'oauth',
]);

/** Fixed sub-stage words of one named lane run, logged with a refusal. */
export type ClaudeLaneLaunchStep =
  | 'boundary'
  | 'open'
  | 'route-current'
  | 'account-info'
  | 'personal-login'
  | 'identity-absent'
  | 'identity-compare'
  | 'stored-identity'
  | 'close'
  | 'released'
  | 'init-wait'
  | 'init-version'
  | 'init-key-source'
  | 'resume'
  | 'commit-binding'
  | 'binding-check'
  | 'attach'
  | 'save-metadata'
  | 'persist-reference'
  | 'on-binding'
  | 'gate';

/**
 * Where a named lane run stopped: the child phase, the last sub-stage reached
 * and, when a wait was cut short, why. Every field is a fixed word.
 */
export interface ClaudeLaneLaunchDiagnostic {
  readonly phase: 'admission' | 'bootstrap' | 'final' | 'turn';
  readonly step?: ClaudeLaneLaunchStep;
  readonly interrupt?: 'deadline' | 'abort' | 'epoch';
  readonly personalLogin?: ClaudePersonalLoginCheck;
}

/** Built-in error classes a refusal log line may name; `name` is mutable data. */
const FOREIGN_ERROR_CLASSES = [
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'AbortError',
  'TimeoutError',
] as const;

/**
 * The class of a foreign (non-refusal) error, for a refusal log line.
 * `undefined` for a lane or certified-launch refusal. Only a built-in class
 * name from a fixed list is returned, anything else is `other`; the message
 * is never read. `name` is read once and only the list's own constant is
 * returned, so an accessor cannot put other text in the log.
 */
export function claudeLaneForeignErrorClass(
  error: unknown,
): (typeof FOREIGN_ERROR_CLASSES)[number] | 'other' | 'non-error' | undefined {
  if (
    error instanceof ClaudeLaneRefusal ||
    error instanceof ClaudeCertifiedLaunchRefusal
  )
    return undefined;
  if (!(error instanceof Error)) return 'non-error';
  let name: unknown;
  try {
    name = error.name;
  } catch {
    // degradation-audit: reported - a throwing `name` accessor logs the fixed word `other`; the refusal code is unchanged.
    return 'other';
  }
  return FOREIGN_ERROR_CLASSES.find((known) => known === name) ?? 'other';
}

/** Two independent empty gates; only the final query can receive conversation. */
export class ClaudeNamedLaneAdmission {
  readonly route: ClaudeAccountNamedRoute;
  reference?: LaneAccountReference;
  query?: ReturnType<LaneQueryFunction>;
  private readonly gates: ReturnType<typeof createNamedAccountPromptGate>[] =
    [];
  private child?: {
    query: ReturnType<LaneQueryFunction>;
    exited: boolean;
    close: () => void;
    terminated: Promise<void>;
  };
  private identity?: ProviderAccountIdentityEvidence;
  private settlement?: Promise<void>;
  private stopEpoch?: () => void;
  private released = false;
  /** The first turn `launch` released before init (D68), until consumed. */
  private releasedTurn?: SDKUserMessage;
  private disposed = false;
  /**
   * True while a boundary check is pending or after one refused without
   * proving its own children closed. Settlement then retains the reservation.
   */
  private boundaryUnproved = false;
  private phase: ClaudeLaneLaunchDiagnostic['phase'] = 'admission';
  private step?: ClaudeLaneLaunchStep;
  private interrupt?: ClaudeLaneLaunchDiagnostic['interrupt'];
  private personalLogin?: ClaudePersonalLoginCheck;
  private readonly onAbort = (): void => {
    void this.dispose();
  };

  constructor(
    route: ClaudeAccountNamedRoute,
    /** Certified launch from admission; absent refuses `identity-unproved`. */
    readonly certified: ClaudeCertifiedLaunchContext | undefined,
    private readonly reservation: ClaudeAccountRunReservation,
    private readonly admission: ProviderAccountAdmissionPort,
    private readonly persistence: ClaudeLaneAccountPersistence,
    private readonly abort: AbortController,
    private readonly logger: Pick<Logger, 'warn'>,
    private readonly stored?: ProviderAccountBinding,
    private readonly deadlineMs = 15_000,
  ) {
    this.route = Object.freeze({ ...route });
    abort.signal.addEventListener('abort', this.onAbort, { once: true });
  }

  /** Where this run stopped; fixed words only, safe for a refusal log line. */
  get launchDiagnostic(): ClaudeLaneLaunchDiagnostic {
    return Object.freeze({
      phase: this.phase,
      ...(this.step ? { step: this.step } : {}),
      ...(this.interrupt ? { interrupt: this.interrupt } : {}),
      ...(this.step === 'personal-login' && this.personalLogin
        ? { personalLogin: this.personalLogin }
        : {}),
    });
  }

  private async wait<T>(pending: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    try {
      this.assertOpen();
      const value = await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          cancel = () => {
            this.interrupt ??= 'abort';
            reject(claudeLaneRefusal());
          };
          this.abort.signal.addEventListener('abort', cancel, { once: true });
          timer = setTimeout(() => {
            this.interrupt ??= 'deadline';
            this.abort.abort();
            reject(claudeLaneRefusal());
          }, this.deadlineMs);
        }),
      ]);
      this.assertOpen();
      return value;
    } finally {
      clearTimeout(timer);
      if (cancel) this.abort.signal.removeEventListener('abort', cancel);
    }
  }

  private assertOpen(): void {
    if (this.disposed || this.abort.signal.aborted) throw claudeLaneRefusal();
  }

  private open(
    queryFn: LaneQueryFunction,
    prompt: AsyncIterable<SDKUserMessage>,
    options: Options,
  ): NonNullable<ClaudeNamedLaneAdmission['child']> {
    this.assertOpen();
    const spawn = options.spawnClaudeCodeProcess;
    if (!spawn) throw claudeLaneRefusal();
    let exited = false;
    let resolve!: () => void;
    const terminated = new Promise<void>((done) => {
      resolve = done;
    });
    // Install the exit proof before query() can spawn or throw.
    // A holder, not a late const: the getter and close() may run before
    // queryFn() returns, where a const would be in its temporal dead zone.
    const opened: { query?: ReturnType<LaneQueryFunction> } = {};
    let closed = false;
    const child = {
      get query() {
        if (!opened.query) throw claudeLaneRefusal();
        return opened.query;
      },
      get exited() {
        return exited;
      },
      terminated,
      close: () => {
        if (closed) return;
        closed = true;
        try {
          opened.query?.close();
        } catch {
          this.logger.warn('[ClaudeLane] Child close was not confirmed.');
        }
      },
    };
    this.child = child;
    opened.query = queryFn({
      prompt,
      options: {
        ...options,
        spawnClaudeCodeProcess: (input) => {
          const process = spawn(input);
          process.once('exit', (code) => {
            // A signal death after close/abort is proof only when the spawner
            // observed the child's own exit (see isChildExitProved).
            if (isChildExitProved(process, code)) {
              exited = true;
              resolve();
            }
          });
          this.recordChild(process);
          return process;
        },
      },
    });
    return child;
  }

  /**
   * Records the child's pid on the reservation, so a later process reclaims a
   * lease this host leaves behind only once the child is gone too. A failed
   * record is logged and never changes the lane's own admission.
   */
  private recordChild(child: object): void {
    if (!this.admission.recordRunChild) return;
    const message = '[ClaudeLane] Account child was not recorded on its reservation.';
    void spawnedChildPid(child).then(async (pid) => {
      if (pid === null) return;
      const result = await this.admission.recordRunChild?.({ reservationId: this.reservation.reservationId,
        operationId: this.reservation.operationId, authEpoch: this.reservation.authEpoch, pid });
      if (result && result.code !== 'ok') this.logger.warn(message);
    }).catch(() => this.logger.warn(message));
  }

  private certifiedLaunch(): ClaudeCertifiedLaunchContext {
    if (!this.certified) throw claudeLaneRefusal('identity-unproved');
    return this.certified;
  }

  /**
   * Both checks that must pass right before one SDK child starts: the actual
   * options against the certified launch (no I/O), then the host boundary
   * check (route revalidation and policy re-scan). Throws a lane refusal
   * with the real code; `queryFn` is never reached on a refusal.
   */
  private async checkBoundary(
    options: Options,
    boundary: ClaudeLaunchBoundary,
  ): Promise<void> {
    this.phase = boundary;
    this.step = 'boundary';
    this.assertOpen();
    const launch = this.certifiedLaunch();
    try {
      assertCertifiedLaunch(launch, claudeActualLaunch(options), boundary);
    } catch (error: unknown) {
      throw claudeLaneRefusal(claudeLaneRefusalCode(error));
    }
    // Pending until an outcome proves the check's children closed: an abort
    // or deadline during the check settles by retaining the reservation.
    this.boundaryUnproved = true;
    const outcome = await this.wait(
      this.persistence.checkLaunchBoundary(
        this.route,
        launch,
        boundary,
        this.abort.signal,
      ),
    );
    if (outcome.ok) {
      this.boundaryUnproved = false;
      return;
    }
    this.boundaryUnproved = !outcome.terminated;
    throw claudeLaneRefusal(outcome.code);
  }

  private async readIdentity(): Promise<ProviderAccountIdentityEvidence> {
    this.assertOpen();
    if (!this.child) throw claudeLaneRefusal();
    const launch = this.certifiedLaunch();
    this.step = 'route-current';
    await this.wait(this.persistence.assertRouteCurrent(this.route));
    this.step = 'account-info';
    const info = await this.wait(this.child.query.accountInfo());
    this.step = 'personal-login';
    this.personalLogin = claudePersonalLoginCheck(info);
    if (!claudePersonalLoginPassed(this.personalLogin))
      throw claudeLaneRefusal('identity-unproved');
    this.step = 'identity-absent';
    const reference = claudeIdentityReference(info.email, info.organization);
    if (!reference) return { kind: 'unknown' };
    // The running child must be the account the launch was certified for.
    this.step = 'identity-compare';
    if (reference !== launch.identityReference)
      throw claudeLaneRefusal('identity-unproved');
    return { kind: 'known', ownerKey: reference };
  }

  private sameIdentity(identity: ProviderAccountIdentityEvidence): boolean {
    // `unknown` is absent proof, never an identity: it equals nothing, not
    // even itself. A known identity matches only the same owner key.
    const baseline = this.identity;
    return (
      !!baseline &&
      baseline.kind === 'known' &&
      identity.kind === 'known' &&
      baseline.ownerKey === identity.ownerKey
    );
  }

  async bootstrap(queryFn: LaneQueryFunction, options: Options): Promise<void> {
    this.stopEpoch = this.persistence.onAuthEpochChanged((changed) => {
      if (
        changed.routeFingerprint === this.route.routeFingerprint &&
        changed.authEpoch !== this.route.authEpoch
      ) {
        this.interrupt ??= 'epoch';
        this.abort.abort();
      }
    });
    if (this.disposed) {
      this.stopEpoch();
      this.stopEpoch = undefined;
      throw claudeLaneRefusal();
    }
    await this.checkBoundary(options, 'bootstrap');
    const gate = createNamedAccountPromptGate(this.abort.signal);
    this.gates.push(gate);
    this.step = 'open';
    const child = this.open(queryFn, gate.prompt, options);
    this.identity = await this.readIdentity();
    // Refuse an unproved identity before any binding is committed or any
    // prompt is sent, including on a fresh lane with no stored binding.
    if (this.identity.kind !== 'known')
      throw claudeLaneRefusal('identity-unproved');
    this.step = 'stored-identity';
    if (
      this.stored &&
      (this.stored.identity.kind !== 'known' ||
        !this.sameIdentity(this.stored.identity))
    )
      throw claudeLaneRefusal('identity-unproved');
    this.step = 'close';
    gate.close();
    child.close();
    await this.wait(child.terminated);
    this.child = undefined;
  }

  /** Yields each gated turn only after its account admission re-validates. */
  private async *admittedTurns(
    turns: ReturnType<typeof createNamedAccountPromptGate>['prompt'],
  ): AsyncGenerator<SDKUserMessage> {
    for await (const message of turns) {
      try {
        // Only the exact turn `launch` released right after the same child
        // proved the account skips re-validation (no binding exists yet).
        // Keyed on the message, not on the iterator, so a fresh iterator
        // cannot skip validation for a later queued turn.
        if (message === this.releasedTurn) this.releasedTurn = undefined;
        else await this.validateTurn();
        this.assertOpen();
        yield message;
      } catch (error: unknown) {
        await this.dispose();
        throw claudeLaneRefusal(claudeLaneRefusalCode(error));
      }
    }
  }

  async launch(
    queryFn: LaneQueryFunction,
    options: Options,
    metadata: Omit<SessionMetadata, 'sessionId'>,
    firstTurn: { readonly message: string; readonly sessionId?: string },
    onBinding?: (
      reference: LaneAccountReference,
      sdkSessionId: string,
    ) => Promise<void>,
  ): Promise<void> {
    await this.checkBoundary(options, 'final');
    const gate = createNamedAccountPromptGate(this.abort.signal);
    this.gates.push(gate);
    const prompt: AsyncIterable<SDKUserMessage> = {
      [Symbol.asyncIterator]: () => this.admittedTurns(gate.prompt),
    };
    // Settles when the run is released or stopped (dispose aborts).
    let settleLaunch!: () => void;
    const launched = new Promise<void>((resolve) => {
      settleLaunch = resolve;
      this.abort.signal.addEventListener('abort', () => resolve(), {
        once: true,
      });
    });
    let initVerified = false;
    this.step = 'open';
    // One admission check for `canUseTool` and the `PreToolUse` hook: denied
    // before a verified init; after it, held until the binding; denied on
    // refusal, abort or dispose (each settles `launched` via the abort).
    const toolAdmitted = async (): Promise<boolean> => {
      if (initVerified && !this.released) await launched;
      return this.released && !this.disposed && !this.abort.signal.aborted;
    };
    const child = this.open(
      queryFn,
      prompt,
      withNamedAccountToolGate(options, toolAdmitted),
    );
    if (!this.sameIdentity(await this.readIdentity()))
      throw claudeLaneRefusal('identity-unproved');
    // CLI 2.1.278 builds `system/init` in its turn loop, after it picks up a
    // user message (D68): release the first turn now; nothing is forwarded
    // and no tool runs until init is verified below.
    this.step = 'released';
    this.releasedTurn = this.userTurn({ content: firstTurn.message }, firstTurn.sessionId);
    if (
      !gate.push(this.releasedTurn) ||
      !gate.commit()
    )
      throw claudeLaneRefusal();
    const version = this.certifiedLaunch().executable.version;
    const buffered: Awaited<ReturnType<typeof child.query.next>>[] = [];
    let sessionId: string | undefined;
    while (!sessionId) {
      this.step = 'init-wait';
      const next = await this.wait(child.query.next());
      if (next.done || buffered.length >= 64) throw claudeLaneRefusal();
      buffered.push(next);
      if (next.value.type === 'system' && next.value.subtype === 'init') {
        // The running CLI must be the certified version and must report a
        // personal key source (independent of account info), before any output
        // is forwarded, any tool runs or the binding is committed.
        this.step = 'init-version';
        const initVersion = claudeVersionIdentity(next.value.claude_code_version);
        const certifiedVersion = claudeVersionIdentity(version);
        if (initVersion === null || certifiedVersion === null || initVersion !== certifiedVersion)
          throw claudeLaneRefusal('identity-unproved');
        this.step = 'init-key-source';
        if (!INIT_PERSONAL_KEY_SOURCES.has(String(next.value.apiKeySource)))
          throw claudeLaneRefusal('identity-unproved');
        sessionId = next.value.session_id;
      }
    }
    this.step = 'resume';
    if (options.resume && options.resume !== sessionId)
      throw claudeLaneRefusal('conflict');
    initVerified = true;
    if (!this.identity) throw claudeLaneRefusal();
    this.step = 'commit-binding';
    const binding =
      this.stored ??
      (await this.wait(
        this.persistence.commitRunBinding(
          this.route,
          this.reservation,
          this.identity,
        ),
      ));
    this.step = 'binding-check';
    if (
      binding.provider !== 'claude' ||
      binding.profileId !== this.route.profileId ||
      binding.runId !== this.route.runId ||
      binding.routeRevision !== this.route.routeRevision ||
      binding.routeFingerprint !== this.route.routeFingerprint ||
      (this.stored
        ? binding.authEpoch > this.route.authEpoch
        : binding.authEpoch !== this.route.authEpoch) ||
      !this.sameIdentity(binding.identity)
    )
      throw claudeLaneRefusal();
    this.reference = Object.freeze({
      accountBindingId: binding.runId,
      accountBinding: Object.freeze({
        ...binding,
        identity: Object.freeze({ ...binding.identity }),
      }),
    });
    this.step = 'attach';
    const attached = await this.wait(
      this.persistence.attachSdkSession({
        provider: 'claude',
        sdkSessionId: sessionId,
        runId: binding.runId,
        attachedAt: Date.now(),
      }),
    );
    if (attached.status !== 'attached') throw claudeLaneRefusal('conflict');
    this.step = 'save-metadata';
    await this.wait(
      this.persistence.saveAccountBound(
        { ...metadata, sessionId },
        this.reference.accountBinding,
      ),
    );
    this.step = 'persist-reference';
    await this.wait(
      this.persistence.persistReference(this.reference, sessionId),
    );
    this.step = 'on-binding';
    if (onBinding) await this.wait(onBinding(this.reference, sessionId));
    if (!this.sameIdentity(await this.readIdentity()))
      throw claudeLaneRefusal();
    this.assertOpen();
    this.released = true;
    settleLaunch();
    this.phase = 'turn';
    const next = () =>
      buffered.length ? Promise.resolve(buffered.shift()!) : child.query.next();
    this.query = new Proxy(child.query, {
      get(target, key) {
        if (key === 'next') return next;
        if (key === Symbol.asyncIterator) return () => ({ next });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  private async validateTurn(checkMetadata = true): Promise<void> {
    this.assertOpen();
    if (!this.reference || !this.sameIdentity(await this.readIdentity()))
      throw claudeLaneRefusal();
    if (checkMetadata) {
      const result = await this.wait(
        this.persistence.validateResume(this.reference),
      );
      if (result.code !== 'ok') throw claudeLaneRefusal();
    }
    this.assertOpen();
  }

  private userTurn(turn: PromptTurn, sessionId?: string): SDKUserMessage {
    return toUserMessage(turn, sessionId);
  }

  /** A later turn; the first turn is released by `launch`. */
  async enqueue(turn: PromptTurn, sessionId?: string): Promise<void> {
    try {
      await this.validateTurn();
      this.step = 'gate';
      const gate = this.gates[this.gates.length - 1];
      if (
        !this.released ||
        !gate.push(this.userTurn(turn, sessionId)) ||
        !gate.commit()
      )
        throw claudeLaneRefusal();
    } catch (error: unknown) {
      await this.dispose();
      throw claudeLaneRefusal(claudeLaneRefusalCode(error));
    }
  }

  dispose(): Promise<void> {
    if (this.settlement) return this.settlement;
    const command = {
      reservationId: this.reservation.reservationId,
      operationId: this.reservation.operationId,
      authEpoch: this.reservation.authEpoch,
    };
    this.settlement = Promise.resolve()
      .then(async () => {
        const result =
          !this.boundaryUnproved && (!this.child || this.child.exited)
            ? await this.admission.releaseReservation({
                ...command,
                reason: 'child-closed',
              })
            : await this.admission.retainUnresolvedReservation(command);
        if (result.code !== 'ok')
          this.logger.warn('[ClaudeLane] Account reservation remains held.');
      })
      .catch(() => {
        this.logger.warn('[ClaudeLane] Account reservation settlement failed.');
      });
    this.disposed = true;
    for (const gate of this.gates) gate.close();
    this.abort.signal.removeEventListener('abort', this.onAbort);
    this.abort.abort();
    this.child?.close();
    this.stopEpoch?.();
    this.stopEpoch = undefined;
    return this.settlement;
  }
}
