import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { TabManagerService, laneKey as buildLaneKey, parseLaneKey } from '@ptah-extension/chat';
import { AgentDeliveryStore, AgentMonitorStore, BackgroundAgentStore } from '@ptah-extension/chat-streaming';
import { CanvasStore } from '../canvas.store';
import { CanvasAttentionLaneOpener } from './canvas-attention-lane-opener.service';

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
   * Resuming a stopped CLI lane spawns a new agent id. A selection that names
   * the old id follows it to the new card, so the user stays on the lane they
   * sent from (D3). Two links lead there:
   * - the monitor's replaced-card link (a spawn naming `resumedFromAgentId`
   *   or the same CLI session), for a lane stopped in this app run;
   * - a delivery receipt the user sent to the old id that the host resolved
   *   to another lane (`actualAgentId`, a cold resume). That also covers a
   *   lane restored after a host restart, whose old card stays (F2).
   * A receipt link is followed only to a card the monitor holds.
   */
  private currentLaneKey(key: string): string {
    const parsed = parseLaneKey(key);
    if (parsed?.kind !== 'cli') return key;
    let id = parsed.id;
    for (let hops = 0; hops < 10; hops++) {
      const next = this.resumedLaneOf(this.monitor.currentAgentId(id));
      if (next === id) break;
      id = next;
    }
    return id === parsed.id ? key : buildLaneKey('cli', id);
  }

  /** The lane a user message to `agentId` was resolved to, when the monitor shows it; else `agentId`. */
  private resumedLaneOf(agentId: string): string {
    const cards = this.monitor.agentsById();
    let latest: { id: string; at: number } | null = null;
    for (const receipt of this.delivery.receipts().get(agentId) ?? []) {
      const actual = receipt.actualAgentId;
      if (receipt.agentId !== agentId || receipt.sender !== 'user' || !actual || actual === agentId) continue;
      if (!cards.has(actual)) continue;
      if (!latest || receipt.createdAt >= latest.at) latest = { id: actual, at: receipt.createdAt };
    }
    return latest?.id ?? agentId;
  }

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
