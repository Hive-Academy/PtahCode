import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import type { PlanRingData } from '@ptah-extension/chat-ui';
import { PlanLimitsStore } from '@ptah-extension/core';
import type { ChatSessionSummary } from '@ptah-extension/shared';
import { RecentSessionsStore } from '../session-list/recent-sessions.store';
import {
  injectMainProviderId,
  injectVitalsTick,
  injectWorkspaceUsage,
  toPlanRingLoad,
  toSpendVitals,
  usageDayWindows,
  type SpendVitals,
} from './usage-vitals.view';
import type { VitalsLoad } from './vitals-load';

/** What the empty chat hands the store; every getter is read reactively. */
export interface ChatVitalsHost {
  /** The view's session id; `null` before the first message. */
  readonly sessionId: () => string | null;
  /** The workspace the chat belongs to. */
  readonly workspacePath: () => string | null;
}

/**
 * View model of the empty chat (`ptah-chat-empty-state`). Provide it on the
 * component and call {@link bind}.
 *
 * Sources: `PlanLimitsStore` (the session's plan window, else the main
 * provider's; the chat view registers the session's plan-limits scope), the
 * usage cache (the workspace's 7 days) and
 * `RecentSessionsStore` (the Resume row; read for each workspace shown unless
 * that workspace's list is already held). Usage is re-read on the shared clock
 * tick, so a failed read is retried while the chat is open.
 */
@Injectable()
export class ChatVitalsStore {
  private readonly planLimits = inject(PlanLimitsStore);
  private readonly recentSessions = inject(RecentSessionsStore);
  private readonly tick = injectVitalsTick();
  private readonly windows = usageDayWindows(this.tick);
  private readonly host = signal<ChatVitalsHost | null>(null);
  private readonly mainProviderId = injectMainProviderId();

  /** The view's session; `null` until {@link bind} or before the first message. */
  readonly sessionId = computed(() => this.host()?.sessionId() ?? null);
  /** The chat's workspace; `null` until {@link bind}. */
  readonly workspacePath = computed(() => this.host()?.workspacePath() ?? null);

  private readonly usage7 = injectWorkspaceUsage(
    this.workspacePath,
    7,
    this.tick,
  );

  /**
   * The session's account when the snapshot names one, else the main
   * provider's account; never another provider's.
   */
  readonly planRing: Signal<VitalsLoad<PlanRingData>> = computed(() =>
    toPlanRingLoad(
      this.planLimits.snapshot(),
      this.sessionId(),
      this.mainProviderId(),
      this.planLimits.now(),
    ),
  );

  /** The workspace's 7-day spend bars and their totals. */
  readonly spend7: Signal<VitalsLoad<SpendVitals>> = computed(() =>
    toSpendVitals(this.usage7(), this.windows.spend()),
  );

  /**
   * The newest recent session of this workspace that is not the one shown;
   * `null` while the list is unconfirmed or belongs to another workspace.
   */
  readonly resume: Signal<ChatSessionSummary | null> = computed(() => {
    const path = this.workspacePath();
    if (
      path === null ||
      !this.recentSessions.confirmed() ||
      this.recentSessions.workspacePath() !== path
    ) {
      return null;
    }
    const current = this.sessionId();
    return (
      this.recentSessions
        .sessions()
        .find((session) => session.id !== current) ?? null
    );
  });

  constructor() {
    effect(() => {
      const path = this.workspacePath();
      if (path === null) return;
      untracked(() => {
        // The store is shared: when another surface (the canvas board) has
        // already read or is reading this workspace, reuse that read.
        const recent = this.recentSessions;
        const current =
          recent.workspacePath() === path &&
          (recent.confirmed() || recent.loading());
        if (!current) void recent.load(path);
      });
    });
  }

  /**
   * Points the store at the chat view. Call exactly once, in the host's
   * constructor; a second call is a wiring error and throws.
   */
  bind(host: ChatVitalsHost): void {
    if (untracked(this.host) !== null) {
      throw new Error('ChatVitalsStore.bind() was called twice.');
    }
    this.host.set(host);
  }
}
