import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { AgentDeliveryReceipt } from '@ptah-extension/shared';
import { TabManagerService, laneKey as buildLaneKey, parseLaneKey } from '@ptah-extension/chat';
import { AgentDeliveryStore, AgentMonitorStore, BackgroundAgentStore } from '@ptah-extension/chat-streaming';
import { CanvasStore } from '../canvas.store';
import { CanvasAttentionLaneOpener } from './canvas-attention-lane-opener.service';

/** A send from a lane view that may resume into a new lane id. */
interface PendingFollow {
  readonly agentId: string;
  /** Receipts created before this (minus clock skew) belong to earlier sends. */
  readonly since: number;
}

/** A follow waits this long for its resumed lane; after that it is dropped. */
const FOLLOW_WINDOW_MS = 120_000;
/** Host and renderer clocks are one machine; this absorbs scheduling skew. */
const FOLLOW_CLOCK_SKEW_MS = 5_000;

/**
 * The lane a pending send resumed into, once its card is on screen: the
 * monitor's replaced-card link, else the newest receipt of the user's own
 * send (created after the send) that the host resolved to another lane.
 */
export function followTarget(
  follow: PendingFollow,
  cards: ReadonlyMap<string, unknown>,
  receipts: readonly AgentDeliveryReceipt[],
  replacedBy: string,
): string | null {
  if (replacedBy !== follow.agentId && cards.has(replacedBy)) return replacedBy;
  let latest: AgentDeliveryReceipt | null = null;
  for (const receipt of receipts) {
    const actual = receipt.actualAgentId;
    if (receipt.agentId !== follow.agentId || receipt.sender !== 'user' || !actual || actual === follow.agentId) continue;
    if (receipt.createdAt < follow.since || !cards.has(actual)) continue;
    if (!latest || receipt.createdAt >= latest.createdAt) latest = receipt;
  }
  return latest?.actualAgentId ?? null;
}

/** State shared by the board, its cards and the single detail overlay. */
@Injectable()
export class CanvasDetailService {
  private readonly canvasStore = inject(CanvasStore);
  private readonly tabManager = inject(TabManagerService);
  private readonly monitor = inject(AgentMonitorStore);
  private readonly delivery = inject(AgentDeliveryStore);
  private readonly background = inject(BackgroundAgentStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly attentionLaneOpener = inject(CanvasAttentionLaneOpener);
  private readonly _detailTabId = signal<string | null>(null);
  private readonly _laneKeys = signal<ReadonlyMap<string, string>>(new Map());
  private listeningForClose = false;

  constructor() {
    this.destroyRef.onDestroy(this.attentionLaneOpener.register(this));
  }

  readonly detailTabId = this._detailTabId.asReadonly();
  readonly laneKey = computed(() => this.laneKeyFor(this.detailTabId() ?? ''));

  laneKeyFor(tabId: string): string {
    return this.currentLaneKey(this._laneKeys().get(tabId) ?? 'orchestrator');
  }

  /**
   * A selected CLI lane whose card is gone was replaced by a resume (a spawn
   * naming `resumedFromAgentId` or the same CLI session took its card): the
   * selection follows the monitor's link to the card shown now (D3). A card
   * that still exists is never redirected, so an explicit click on an old
   * lane always shows that lane (round 6).
   */
  private currentLaneKey(key: string): string {
    const parsed = parseLaneKey(key);
    if (parsed?.kind !== 'cli' || this.monitor.agentsById().has(parsed.id)) return key;
    const current = this.monitor.currentAgentId(parsed.id);
    return current === parsed.id ? key : buildLaneKey('cli', current);
  }

  /** Sends made from a lane view that may resume into a new lane, by tab. */
  private readonly _pendingFollows = signal<ReadonlyMap<string, PendingFollow>>(new Map());

  /**
   * The user sent a message from the lane view of `tabId` to `agentId`. When
   * that send resumes the lane under a new id (a restored or stopped lane),
   * the view moves to the new lane once, as soon as it is on screen (F2). The
   * link is the user's own receipt for this send (`actualAgentId`, set by the
   * host on a cold resume) or the monitor's replaced-card link. Nothing else
   * ever moves the view, and a user who picked another lane meanwhile stays.
   */
  followAfterSend(tabId: string, agentId: string): void {
    this._pendingFollows.update((current) =>
      new Map(current).set(tabId, { agentId, since: Date.now() - FOLLOW_CLOCK_SKEW_MS }),
    );
  }

  private readonly followEffect = effect(() => {
    const pending = this._pendingFollows();
    if (pending.size === 0) return;
    const cards = this.monitor.agentsById();
    const receipts = this.delivery.receipts();
    untracked(() => {
      const now = Date.now();
      const done: string[] = [];
      for (const [tabId, follow] of pending) {
        if (now - follow.since > FOLLOW_WINDOW_MS) { done.push(tabId); continue; }
        // The user moved on: this follow no longer applies.
        if (this._laneKeys().get(tabId) !== buildLaneKey('cli', follow.agentId)) { done.push(tabId); continue; }
        const target = followTarget(follow, cards, receipts.get(follow.agentId) ?? [], this.monitor.currentAgentId(follow.agentId));
        if (!target) continue;
        done.push(tabId);
        this.selectLaneFor(tabId, buildLaneKey('cli', target));
      }
      if (done.length > 0) {
        this._pendingFollows.update((current) => {
          const next = new Map(current);
          for (const tabId of done) next.delete(tabId);
          return next;
        });
      }
    });
  });

  selectLaneFor(tabId: string, key: string): void {
    if (!this.canvasStore.tiles().some((tile) => tile.tabId === tabId)) return;
    if (key !== 'orchestrator' && !parseLaneKey(key)) return;
    if (this.laneKeyFor(tabId) === key) return;
    if (!this.listeningForClose) {
      this.listeningForClose = true;
      const unsubscribe = this.tabManager.onTabClosed((closed) => {
        if (!closed || closed.kind === 'reset') return;
        this._laneKeys.update((current) => {
          if (!current.has(closed.tabId)) return current;
          const next = new Map(current);
          next.delete(closed.tabId);
          return next;
        });
      });
      this.destroyRef.onDestroy(unsubscribe);
    }
    this._laneKeys.update((current) => new Map(current).set(tabId, key));
  }

  open(tabId: string, laneKey = 'orchestrator'): boolean {
    if (!this.canvasStore.tiles().some((tile) => tile.tabId === tabId)) return false;
    if (laneKey !== 'orchestrator') {
      const parsed = parseLaneKey(laneKey);
      const sessionId = this.tabManager.findTabByIdAcrossWorkspaces(tabId)?.tab.claudeSessionId;
      if (!parsed || !sessionId) return false;
      const subagent = [...this.monitor.subagents().values()].some((agent) =>
        agent.parentSessionId === sessionId && agent.parentToolUseId === parsed.id &&
        (parsed.kind === 'background' ? agent.status === 'background' : parsed.kind === 'subagent'),
      );
      const exists = parsed.kind === 'cli'
        ? this.monitor.agents().some((agent) => agent.parentSessionId === sessionId && agent.agentId === parsed.id)
        : subagent || (parsed.kind === 'background' && this.background.agents().some((agent) =>
            agent.sessionId === sessionId && agent.toolCallId === parsed.id));
      if (!exists) return false;
    }
    this.canvasStore.focusTile(tabId);
    this.selectLaneFor(tabId, laneKey);
    this._detailTabId.set(null);
    return true;
  }

  selectLane(laneKey: string): void {
    const tabId = this._detailTabId();
    if (tabId) this.open(tabId, laneKey);
  }

  close(): void {
    this._detailTabId.set(null);
  }

}
