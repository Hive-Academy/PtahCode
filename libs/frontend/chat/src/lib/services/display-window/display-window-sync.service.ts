import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  Injector,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import {
  ClaudeRpcService,
  ThemeService,
  VSCodeService,
  type MessageHandler,
} from '@ptah-extension/core';
import {
  DISPLAY_WINDOW_PUSH_TYPES,
  DISPLAY_WINDOW_STATE_MAX_BYTES,
  type DisplayWindowJsonObject,
  type DisplayWindowUnavailableReason,
} from '@ptah-extension/shared';
import { z } from 'zod';
import { ActionBannerService } from '../action-banner.service';
import { ArtifactStore } from '../artifact.store';
import type { DisplayDockState } from '../display-dock/display-dock.state';
import {
  parseActionPush,
  selectionForKey,
  selectionKey,
  toWire,
  utf8ByteLength,
  type DisplayWindowParsedAction,
  type DisplayWindowView,
} from './display-window-wire';

/** The tab and dock the main ChatView shows; the detached window mirrors it. */
export interface DisplayWindowSource {
  /** The main view's active tab; `null` when no tab is open. */
  readonly tabId: Signal<string | null>;
  readonly dock: DisplayDockState;
  /** Increments when a main view receives user interaction. */
  readonly focusVersion: Signal<number>;
  /**
   * An embed (canvas tile or host dock): it never takes the binding on
   * registration or as a fallback, only through a display open request.
   */
  readonly passive?: boolean;
}

const UNAVAILABLE_TEXT: Readonly<
  Record<DisplayWindowUnavailableReason, string>
> = {
  'desktop-only':
    'A separate Display window is available in the desktop app only.',
  'not-ready': 'The Display window is not ready yet. Try again in a moment.',
};
const OPEN_FAILED_TEXT = 'Could not open the Display window.';
const CLOSE_FAILED_TEXT = 'Could not close the Display window.';
const TOO_LARGE_TEXT = 'The display is too large to show in a separate window.';
const NO_TAB_TEXT = 'The main window has no chat tab to show right now.';
const statusSchema = z.object({
  supported: z.boolean(),
  open: z.boolean(),
  tabId: z.string().nullable().optional(),
});

/**
 * Publish coalescing delay (about one frame). A timer, not
 * `requestAnimationFrame`: rAF stops while the main window is minimized or
 * hidden, and the detached window must keep updating then.
 */
const PUBLISH_DELAY_MS = 16;
/** A failed publish is retried this many times, with a growing delay. */
const PUBLISH_MAX_RETRIES = 3;
const PUBLISH_RETRY_BASE_MS = 500;

/**
 * The main renderer's side of the detached Display window
 * (TASK_2026_853_3401, D4). The main renderer stays authoritative.
 *
 * - Display requests open the window; `focus()` explicitly raises it
 *   (`displayWindow:open`), `attach()` closes it (`displayWindow:close`).
 * - `bindSource` registers each ChatView as a display source. While detached, one
 *   effect builds the bound tab's display view; it is published with
 *   `displayWindow:publishState` at most once per ~16 ms timer tick (not
 *   rAF, which stops while the main window is minimized), and only when its
 *   JSON changed. A failed publish is retried a bounded number of times.
 *   With no bound tab, or a snapshot over the size limit, a `notice` view
 *   is published so the window never keeps showing stale content.
 * - Message handler for `displayWindow:closed` (the user closed the window)
 *   and `displayWindow:action` (a user action in the window). An action is
 *   applied to the dock only when its `tabId` is the bound tab; `attach`
 *   always applies. A dropped action republishes so the window resyncs.
 * - On Electron it asks `displayWindow:status` once, so a reload of the main
 *   renderer finds an open window again.
 *
 * The detached window itself never injects this service.
 */
@Injectable({ providedIn: 'root' })
export class DisplayWindowSync implements MessageHandler {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly vscode = inject(VSCodeService);
  private readonly theme = inject(ThemeService);
  private readonly artifacts = inject(ArtifactStore);
  private readonly injector = inject(Injector);

  readonly handledMessageTypes = [
    DISPLAY_WINDOW_PUSH_TYPES.closed,
    DISPLAY_WINDOW_PUSH_TYPES.action,
  ] as const;

  private readonly _detached = signal(false);
  private readonly _error = signal<string | null>(null);
  /** The Display panel is shown in the separate window. */
  readonly detached = this._detached.asReadonly();
  /** The last open, close or publish failure, for the main view to show. */
  readonly error = this._error.asReadonly();

  private readonly source = signal<DisplayWindowSource | null>(null);
  private readonly sources: DisplayWindowSource[] = [];
  private hasFocused = false;
  private readonly requestedTabId = signal<string | null>(null);
  private opening: Promise<void> | null = null;
  private closeEpoch = 0;
  private openingEpoch = 0;
  private lastOpenFailure: string | null = null;
  private readonly banners = inject(ActionBannerService);

  /** The bound tab's display view, or `null` with no source or no tab. */
  private readonly view = computed(
    (): { tabId: string; view: DisplayWindowView } | null => {
      const source = this.source();
      const tabId = this.requestedTabId() ?? source?.tabId() ?? null;
      if (source === null || tabId === null) return null;
      return { tabId, view: this.buildView(source.dock, tabId) };
    },
  );

  /** Number of strip items of the bound tab, for the main view's detached rail. */
  readonly count = computed(() => this.view()?.view.count ?? 0);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublished: string | null = null;
  /** The tab of the last published snapshot; a notice is sent for it. */
  private lastTabId: string | null = null;
  private revision = 0;
  private retries = 0;

  constructor() {
    effect(() => this.clearStaleRequestedTab());
    effect(() => {
      if (!this._detached()) return;
      // Read inside the effect so any change schedules one publish.
      this.view();
      untracked(() => this.schedulePublish());
    });
    inject(DestroyRef).onDestroy(() => this.cancelTimer());
    if (this.vscode.isElectron) void this.restoreStatus();
  }

  /**
   * Registers a view's tab and dock. Returns the unbind function; it
   * clears the binding only if it is still this source.
   */
  bindSource(source: DisplayWindowSource): () => void {
    this.sources.push(source);
    if (!source.passive && (this.source() === null || !this.hasFocused))
      this.source.set(source);
    let lastRequest = untracked(source.dock.windowRequest)?.sequence ?? 0;
    const requestEffect = effect(() => {
      const request = source.dock.windowRequest();
      if (!request || request.sequence <= lastRequest) return;
      lastRequest = request.sequence;
      untracked(() => {
        source.dock.consumeWindowRequest(request.sequence);
        if (!this.vscode.isElectron || !source.dock.tab(request.tabId).open) return;
        this.clearStaleRequestedTab();
        const boundTabId = this.requestedTabId() ?? this.source()?.tabId() ?? null;
        if (this._detached() && !request.focus && request.tabId !== boundTabId) return;
        if (request.focus) this.hasFocused = true;
        this.source.set(source);
        this.requestedTabId.set(request.tabId);
        if (request.focus || !this._detached()) void this.ensureOpen(request.focus);
      });
    }, { injector: this.injector });
    let lastFocusVersion = source.focusVersion();
    let previousTabId = source.tabId();
    const focusEffect = effect(
      () => {
        const focusVersion = source.focusVersion();
        const tabId = source.tabId();
        if (tabId !== previousTabId) {
          if (untracked(this.source) === source) this.requestedTabId.set(null);
          previousTabId = tabId;
        }
        if (focusVersion !== lastFocusVersion && tabId !== null) {
          this.hasFocused = true;
          const index = this.sources.indexOf(source);
          if (index >= 0) {
            this.sources.splice(index, 1);
            this.sources.push(source);
            if (untracked(this.source)?.passive !== true) {
              if (untracked(this.source) !== source) this.requestedTabId.set(null);
              this.source.set(source);
            }
          }
        }
        lastFocusVersion = focusVersion;
        if (this.source() === source && tabId === null)
          this.source.set(this.lastBoundSource(source));
      },
      { injector: this.injector },
    );
    return () => {
      focusEffect.destroy();
      requestEffect.destroy();
      const index = this.sources.lastIndexOf(source);
      if (index < 0) return;
      this.sources.splice(index, 1);
      // Fall back to another main view; `lastBoundSource` never promotes an embed.
      if (untracked(this.source) === source) {
        this.requestedTabId.set(null);
        this.source.set(this.lastBoundSource(null));
      }
    };
  }

  /**
   * The most recently added source, other than `exclude`, that has a bound
   * tab. A reverse loop, because the project `lib` predates `findLast`.
   */
  private lastBoundSource(
    exclude: DisplayWindowSource | null,
  ): DisplayWindowSource | null {
    for (let index = this.sources.length - 1; index >= 0; index -= 1) {
      const candidate = this.sources[index];
      if (
        candidate !== exclude &&
        !candidate.passive &&
        candidate.tabId() !== null
      )
        return candidate;
    }
    return null;
  }

  /** Raises the open window. */
  async focus(): Promise<void> {
    await this.ensureOpen(true);
  }

  /** Closes the detached display window. */
  async attach(): Promise<void> {
    try {
      const result = await this.rpc.call('displayWindow:close', {});
      if (!result.success) {
        this.reportFailure(CLOSE_FAILED_TEXT);
        return;
      }
      this._error.set(null);
      this.markAttached();
    } catch {
      // degradation-audit: reported — the window stays as it was; `error` tells the user.
      this.reportFailure(CLOSE_FAILED_TEXT);
    }
  }

  handleMessage(message: { type: string; payload?: unknown }): void {
    if (message.type === DISPLAY_WINDOW_PUSH_TYPES.closed) {
      this.markAttached();
      return;
    }
    if (message.type !== DISPLAY_WINDOW_PUSH_TYPES.action) return;
    const push = parseActionPush(message.payload);
    if (push === null) {
      console.warn('[DisplayWindowSync] invalid displayWindow:action payload');
      return;
    }
    if (push.action.type === 'attach') {
      // Closing never depends on which tab the window last saw.
      void this.attach();
      return;
    }
    const source = untracked(this.source);
    if (source === null || (untracked(this.requestedTabId) ?? untracked(source.tabId)) !== push.tabId) {
      // Stale: the window acted on an older tab. Send it the current view.
      this.lastPublished = null;
      this.schedulePublish();
      return;
    }
    this.applyAction(source.dock, push.tabId, push.action);
  }

  private clearStaleRequestedTab(): void {
    const source = this.source();
    const tabId = this.requestedTabId();
    // A forgotten tab reads the closed default from the dock.
    if (source && tabId !== null && !source.dock.tab(tabId).open) {
      untracked(() => this.requestedTabId.set(null));
    }
  }

  private async ensureOpen(explicit = false): Promise<void> {
    if (explicit) this.lastOpenFailure = null;
    const pending = this.opening;
    const epoch = this.closeEpoch;
    if (pending !== null && this.openingEpoch === epoch) return pending;
    this.openingEpoch = epoch;
    const opening = pending === null
      ? this.open()
      : pending.then(() => epoch === this.closeEpoch ? this.open() : undefined);
    this.opening = opening;
    try { await opening; } finally {
      if (this.opening === opening) this.opening = null;
    }
  }

  private async open(): Promise<void> {
    const closeEpoch = this.closeEpoch;
    try {
      const result = await this.rpc.call('displayWindow:open', {});
      if (closeEpoch !== this.closeEpoch) return;
      if (!result.success || result.data === undefined) {
        this.reportFailure(OPEN_FAILED_TEXT, true);
        return;
      }
      if (!result.data.ok) {
        this.reportFailure(UNAVAILABLE_TEXT[result.data.reason], true);
        return;
      }
      this.lastOpenFailure = null;
      this._error.set(null);
      this.markDetached();
    } catch {
      // degradation-audit: reported — the request remains available for retry; `error` tells the user.
      if (closeEpoch === this.closeEpoch) this.reportFailure(OPEN_FAILED_TEXT, true);
    }
  }

  private reportFailure(message: string, dedupeOpen = false): void {
    this._error.set(message);
    if (dedupeOpen) {
      if (this.lastOpenFailure === message) return;
      this.lastOpenFailure = message;
    }
    this.banners.showError(message);
  }

  private async restoreStatus(): Promise<void> {
    try {
      const result = await this.rpc.call('displayWindow:status', {});
      const status = result.success ? statusSchema.safeParse(result.data) : null;
      if (status?.success && status.data.supported && status.data.open) {
        this.lastTabId = status.data.tabId ?? null;
        this.markDetached();
      }
    } catch {
      // degradation-audit: optional-capability — an unknown status keeps the panel attached.
    }
  }

  private markDetached(): void {
    // A new window holds no state yet: publish the current view once.
    this.lastPublished = null;
    this.retries = 0;
    this._detached.set(true);
  }

  private markAttached(): void {
    this.closeEpoch += 1;
    const source = untracked(this.source);
    const tabId = untracked(this.requestedTabId) ?? (source ? untracked(source.tabId) : null);
    if (source && tabId) source.dock.close(tabId);
    this._detached.set(false);
    this.cancelTimer();
    this.lastPublished = null;
    this.lastTabId = null;
    this.retries = 0;
  }

  private applyAction(
    dock: DisplayDockState,
    tabId: string,
    action: DisplayWindowParsedAction,
  ): void {
    switch (action.type) {
      case 'pin':
        dock.setPinned(tabId, action.pinned);
        return;
      case 'select':
        dock.select(tabId, selectionForKey(action.key));
        return;
      case 'fullscreen-closed':
        dock.clearFullscreenArtifact(tabId);
        return;
      case 'view-state':
        dock.setViewState(tabId, action.surfaceKey, action.viewState);
        return;
      case 'attach':
        // Handled before the tab check in `handleMessage`.
        return;
    }
  }

  private buildView(dock: DisplayDockState, tabId: string): DisplayWindowView {
    const state = dock.tab(tabId);
    const selection = state.selection;
    const artifacts = this.artifacts.panelArtifacts(
      tabId,
      selection?.kind === 'artifact' ? selection.artifactId : null,
    );
    const themeName = this.theme.currentTheme();
    return {
      theme: {
        name: themeName,
        mode: this.theme.isDarkMode() ? 'dark' : 'light',
      },
      open: true,
      pinned: state.pinned,
      count: state.surfaces.length + artifacts.length + state.files.length,
      selectedKey: selectionKey(selection),
      scrollToSelectedOnMount: selection !== null,
      fullscreenArtifactId: dock.fullscreenArtifact(tabId),
      surfaces: state.surfaces,
      viewStates: state.viewStates,
      artifacts,
      files: state.files,
      notice: null,
    };
  }

  /** The panel replaced by a message, for a tab the window last showed. */
  private noticeView(notice: string): DisplayWindowView {
    return {
      theme: {
        name: this.theme.currentTheme(),
        mode: this.theme.isDarkMode() ? 'dark' : 'light',
      },
      open: true,
      pinned: false,
      count: 0,
      selectedKey: null,
      scrollToSelectedOnMount: false,
      fullscreenArtifactId: null,
      surfaces: [],
      viewStates: new Map(),
      artifacts: [],
      files: [],
      notice,
    };
  }

  private schedulePublish(delayMs = PUBLISH_DELAY_MS): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.publish();
    }, delayMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private publish(): void {
    if (!untracked(this._detached)) return;
    const current = untracked(this.view);
    if (current === null) {
      // Unbound (ChatView gone or no tab): replace what the window shows.
      if (this.lastTabId !== null)
        this.send(this.lastTabId, this.noticeView(NO_TAB_TEXT));
      return;
    }
    if (!this.send(current.tabId, current.view)) {
      this._error.set(TOO_LARGE_TEXT);
      this.send(current.tabId, this.noticeView(TOO_LARGE_TEXT));
    }
  }

  /**
   * Publishes one view unless its JSON equals the last one. Returns `false`
   * only when the snapshot is over `DISPLAY_WINDOW_STATE_MAX_BYTES`.
   */
  private send(tabId: string, view: DisplayWindowView): boolean {
    const state: DisplayWindowJsonObject = toWire(view);
    const text = JSON.stringify({ tabId, state });
    if (text === this.lastPublished) return true;
    if (utf8ByteLength(text) > DISPLAY_WINDOW_STATE_MAX_BYTES) return false;
    this.lastPublished = text;
    this.lastTabId = tabId;
    this.revision += 1;
    this.rpc
      .call('displayWindow:publishState', {
        tabId,
        revision: this.revision,
        state,
      })
      .then((result) => {
        if (!result.success) {
          this.publishFailed(text, 'displayWindow:publishState failed');
          return;
        }
        this.retries = 0;
        if (
          view.notice !== TOO_LARGE_TEXT &&
          untracked(this._error) === TOO_LARGE_TEXT
        ) {
          this._error.set(null);
        }
      })
      .catch(() => {
        // degradation-audit: reported — logged and retried (bounded); the window keeps its last state meanwhile.
        this.publishFailed(text, 'displayWindow:publishState request failed');
      });
    return true;
  }

  /** Forgets the failed text and retries it a bounded number of times. */
  private publishFailed(text: string, reason: string): void {
    if (this.lastPublished !== text) return; // A newer publish already went out.
    this.lastPublished = null;
    console.warn(`[DisplayWindowSync] ${reason}`);
    if (this.retries >= PUBLISH_MAX_RETRIES) return;
    this.retries += 1;
    this.schedulePublish(PUBLISH_RETRY_BASE_MS * this.retries);
  }
}
