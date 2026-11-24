import {
  computed,
  inject,
  Injectable,
  Injector,
  linkedSignal,
  signal,
  type Signal,
} from '@angular/core';
import {
  AgentMonitorStore,
  PermissionHandlerService,
  type MonitoredAgent,
} from '@ptah-extension/chat-streaming';
import type {
  AgentPermissionRequest,
  AskUserQuestionRequest,
  AskUserQuestionResponse,
  PermissionRequest,
  PermissionResponse,
} from '@ptah-extension/shared';
import { AgentPermissionResponder } from './agent-permission-responder';
import { ChatStore } from './chat.store';

/** Status badge a lane surface shows while one of its prompts waits on the user. */
export const LANE_WAITING_LABEL = 'Waiting for you';

/** Shown once when a lane prompt answer was refused because it was already answered. */
export const LANE_ANSWER_REFUSED_TEXT =
  'Already answered. Your second answer was not sent.';

/** Reason main chat's permission card sends when its countdown runs out. */
const CARD_TIMEOUT_REASON = 'Request timeout';

/**
 * Converts a lane's `AgentPermissionRequest` into the `PermissionRequest`
 * main chat's permission card renders. `toolArgs` is a JSON string from the
 * lane; a value that does not parse into an object is kept as `{ raw }` so the
 * card still shows what the lane sent.
 */
export function toLanePermissionRequest(
  request: AgentPermissionRequest,
): PermissionRequest {
  return {
    id: request.requestId,
    toolName: request.toolName,
    toolInput: parseToolArgs(request.toolArgs),
    timestamp: request.timestamp,
    description: request.description,
    timeoutAt: request.timeoutAt,
    ...(request.parentSessionId ? { sessionId: request.parentSessionId } : {}),
  };
}

function parseToolArgs(toolArgs: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(toolArgs);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON: the lane sent a plain string. Fall through and keep it raw.
  }
  return { raw: toolArgs };
}

/** Wiring a lane surface hands to `LanePermissionView.connect`. */
export interface LanePermissionViewSources {
  readonly agent: Signal<MonitoredAgent | undefined>;
}

type PromptOutcome = 'allowed' | 'denied' | 'answered' | 'expired';

interface PromptEntry {
  readonly id: string;
  readonly title: string;
}

/**
 * One lane's approval and question prompts, ready for main chat's
 * `ptah-permission-request-card` and `ptah-question-card` (Req 5).
 *
 * Provide it on the lane surface component and call `connect` once. Answers
 * go through `AgentPermissionResponder.respondLane` and
 * `ChatStore.handleQuestionResponse`, so a prompt is answered once across
 * every surface. A refused answer sets `notice`; a prompt that leaves the
 * queue sets the one-line `resolvedStatus` in place of its card.
 */
@Injectable()
export class LanePermissionView {
  private readonly agentStore = inject(AgentMonitorStore);
  /**
   * The question source, the responder and ChatStore are resolved on first
   * use, not when the host component is created: they pull in tab and
   * delivery services that a lane card showing only output never needs.
   */
  private readonly injector = inject(Injector);

  private readonly sources = signal<LanePermissionViewSources | null>(null);
  private readonly converted = new WeakMap<AgentPermissionRequest, PermissionRequest>();
  /** Outcomes this view sent; read when the prompt leaves the queue. Pruned there. */
  private readonly sentOutcomes = new Map<string, PromptOutcome>();
  private readonly _notice = signal<string | null>(null);

  private readonly agent = computed(() => this.sources()?.agent() ?? undefined);

  /** Display name the cards show in their lane badge. */
  readonly laneLabel = computed(() => {
    const agent = this.agent();
    return agent ? agent.displayName || agent.cli : null;
  });

  /** Pending approvals this lane can answer, as main chat card requests. */
  readonly permissions = computed((): PermissionRequest[] => {
    const agent = this.agent();
    if (!agent || agent.permissionQueue.length === 0) return [];
    return agent.permissionQueue
      .filter((request) => this.agentStore.permissionBelongsToAgent(request, agent))
      .map((request) => {
        let card = this.converted.get(request);
        if (!card) {
          card = toLanePermissionRequest(request);
          this.converted.set(request, card);
        }
        return card;
      });
  });

  /** Questions asked by this lane only, never another lane's. */
  readonly questions = computed((): AskUserQuestionRequest[] => {
    const agentId = this.agent()?.agentId;
    if (!agentId) return [];
    return this.injector
      .get(PermissionHandlerService)
      .questionRequests()
      .filter((request) => request.agentId === agentId);
  });

  /** True while a prompt of this lane waits on the user. */
  readonly waiting = computed(
    () => this.permissions().length > 0 || this.questions().length > 0,
  );

  /** Refusal text for a second answer; null when there is none. */
  readonly notice = this._notice.asReadonly();

  /**
   * One line for the most recent prompt that stopped being answerable here:
   * answered in this view, answered in another surface, or expired.
   */
  readonly resolvedStatus = linkedSignal<
    { agentId: string | undefined; prompts: PromptEntry[] },
    string | null
  >({
    source: () => ({ agentId: this.agent()?.agentId, prompts: this.promptEntries() }),
    computation: (current, previous) => {
      if (!previous || previous.source.agentId !== current.agentId) return null;
      const open = new Set(current.prompts.map((prompt) => prompt.id));
      const gone = previous.source.prompts.filter((prompt) => !open.has(prompt.id));
      if (gone.length === 0) return previous.value;
      let status: string | null = previous.value;
      for (const prompt of gone) {
        status = `${prompt.title} - ${this.outcomeText(this.sentOutcomes.get(prompt.id))}`;
      }
      for (const id of this.sentOutcomes.keys()) if (!open.has(id)) this.sentOutcomes.delete(id);
      return status;
    },
  });

  private readonly promptEntries = computed((): PromptEntry[] => [
    ...this.permissions().map((request) => ({
      id: request.id,
      title: `Permission · ${request.toolName}${summarize(request)}`,
    })),
    ...this.questions().map((request) => ({
      id: request.id,
      title: `Input needed${request.questions[0]?.header ? ` · ${request.questions[0].header}` : ''}`,
    })),
  ]);

  connect(sources: LanePermissionViewSources): void {
    if (this.sources()) throw new Error('LanePermissionView is already connected');
    this.sources.set(sources);
  }

  /** Answer a permission card. Returns false when the answer was not sent. */
  respond(response: PermissionResponse): boolean {
    const agentId = this.agent()?.agentId;
    if (!agentId) return false;
    const timedOut =
      response.decision === 'deny' && response.reason === CARD_TIMEOUT_REASON;
    const sent = this.injector.get(AgentPermissionResponder).respondLane(
      agentId,
      response.id,
      response.decision,
      response.reason,
      response.modifiedInput,
    );
    if (!sent) {
      // The card's own countdown deny is automatic; the user did not answer twice.
      if (!timedOut) this._notice.set(LANE_ANSWER_REFUSED_TEXT);
      return false;
    }
    this._notice.set(null);
    this.sentOutcomes.set(
      response.id,
      timedOut
        ? 'expired'
        : response.decision === 'allow' || response.decision === 'always_allow'
          ? 'allowed'
          : 'denied',
    );
    return true;
  }

  /** Answer a question card. Returns false when the question is no longer pending. */
  answer(response: AskUserQuestionResponse): boolean {
    const pending = this.questions().some((request) => request.id === response.id);
    if (!pending) {
      this._notice.set(LANE_ANSWER_REFUSED_TEXT);
      return false;
    }
    this._notice.set(null);
    this.sentOutcomes.set(response.id, 'answered');
    this.injector.get(ChatStore).handleQuestionResponse(response);
    return true;
  }

  private outcomeText(outcome: PromptOutcome | undefined): string {
    switch (outcome) {
      case 'allowed':
        return 'Allowed by you. No longer answerable here.';
      case 'denied':
        return 'Denied by you. No longer answerable here.';
      case 'answered':
        return 'Answered by you. No longer answerable here.';
      case 'expired':
        return 'Expired. No longer answerable here.';
      default:
        return 'Answered, denied or expired in another view. No longer answerable here.';
    }
  }
}

function summarize(request: PermissionRequest): string {
  const input = request.toolInput;
  const detail = ['command', 'file_path', 'pattern', 'url']
    .map((key) => input[key])
    .find((value): value is string => typeof value === 'string' && value.trim() !== '');
  if (!detail) return '';
  const text = detail.trim();
  return ` · ${text.length > 60 ? `${text.slice(0, 57)}...` : text}`;
}
