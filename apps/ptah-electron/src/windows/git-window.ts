import type { Rectangle } from 'electron';
import type { GitWindowHost, IStateStorage } from '@ptah-extension/platform-core';
import {
  GIT_WINDOW_PUSH_TYPES,
  MESSAGE_TYPES,
  GitWindowScopeSchema,
  GitWindowSetModeParamsSchema,
  type GitWindowOpenResult,
  type GitWindowPublishScopeResult,
  type GitWindowScope,
  type GitWindowSetModeParams,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { PRODUCT_DISPLAY_NAME } from '../config/product-identity';
import type { DisplayChildWindow, DisplayMainWindow, DisplayWindowIpcBridge } from './display-window';
import { createChildWindow } from './create-child-window';
import { GitWindowScopeGuard } from './git-window-scope-guard';
import { isOnScreen } from './window-guards';

const INSTANCE = 'default';
const BOUNDS_KEY = 'gitWindow.bounds';
// The file tree and the diff are side by side. Below the minimum width the
// hunk header of the diff is cut, so the window cannot be made narrower.
export const GIT_WINDOW_MIN_WIDTH = 720;
const MIN_HEIGHT = 400;
export const GIT_WINDOW_DEFAULT_WIDTH = 920;
const DEFAULT_HEIGHT = 760;
const MIN_WIDTH = GIT_WINDOW_MIN_WIDTH;
const DEFAULT_WIDTH = GIT_WINDOW_DEFAULT_WIDTH;
const ERR_ABORTED = -3;

export const GIT_WINDOW_ALLOWED_METHODS: ReadonlySet<string> = new Set([
  'gitWindow:getScope', 'gitWindow:close', 'gitWindow:setMode',
  'git:info', 'git:watchRoots', 'git:reviewChanges', 'git:reviewFile',
  'git:worktrees', 'git:addWorktree', 'git:removeWorktree', 'git:stage',
  'git:unstage', 'git:discard', 'git:commit', 'git:cancelOperation',
  'git:generateCommitMessage', 'git:prStatus', 'git:operationAbort',
  'git:operationContinue', 'git:log', 'git:diffFile', 'git:applyHunks',
  'git:push', 'git:pull', 'git:fetch', 'git:branches', 'git:checkout',
  'git:stashList', 'git:stashApply', 'git:stashPop', 'git:stashDrop',
  'git:stashShow', 'git:remotes', 'git:lastCommit',
  'file:viewContent', 'file:saveContent',
  'editor:detectTargets', 'editor:openWorkspace', 'editor:openFile', 'editor:openMerge',
  'settings:get', 'settings:set',
]);

/** Host pushes that the Git services of the child handle; the main window gets them also. */
export const GIT_WINDOW_PUSH_FORWARD_TYPES: ReadonlySet<string> = new Set([
  MESSAGE_TYPES.GIT_STATUS_UPDATE, MESSAGE_TYPES.FILE_CONTENT_CHANGED,
  MESSAGE_TYPES.GIT_OPERATION_OUTPUT, 'git:worktreeChanged',
]);

export interface ElectronGitWindowHostOptions {
  readonly getMainWindow: () => DisplayMainWindow | null;
  readonly bridge: DisplayWindowIpcBridge;
  readonly resolveStateStorage: () => IStateStorage | undefined;
  readonly appDir: string;
  readonly logger: Pick<Logger, 'error'>;
  readonly createWindow?: (placement: Rectangle | { width: number; height: number }) => DisplayChildWindow;
}

/** A saved size is kept. A saved width below the minimum (an older build) is raised to it. */
export function gitWindowPlacement(main: Rectangle, saved: unknown): Rectangle | { width: number; height: number } {
  if (typeof saved === 'object' && saved !== null &&
    'x' in saved && 'y' in saved && 'width' in saved && 'height' in saved &&
    typeof saved.x === 'number' && typeof saved.y === 'number' &&
    typeof saved.width === 'number' && typeof saved.height === 'number' &&
    Number.isFinite(saved.x) && Number.isFinite(saved.y) &&
    Number.isFinite(saved.width) && Number.isFinite(saved.height) &&
    saved.width > 0 && saved.height >= MIN_HEIGHT &&
    isOnScreen({ x: saved.x, y: saved.y, width: Math.max(saved.width, MIN_WIDTH), height: saved.height })) {
    return { x: saved.x, y: saved.y, width: Math.max(saved.width, MIN_WIDTH), height: saved.height };
  }
  const right = { x: main.x + main.width + 8, y: main.y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const left = { ...right, x: main.x - DEFAULT_WIDTH - 8 };
  return isOnScreen(right) ? right : isOnScreen(left) ? left : { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

export class ElectronGitWindowHost implements GitWindowHost {
  private window: DisplayChildWindow | null = null;
  private scope: GitWindowScope | null = null;
  private sequence = 0;

  private readonly guard = new GitWindowScopeGuard(() => (this.isOpen() ? this.scope : null));

  constructor(private readonly options: ElectronGitWindowHostOptions) {
    options.bridge.childWindows.registerView('git', {
      singleton: true, allowedMethods: GIT_WINDOW_ALLOWED_METHODS,
      authorize: (method, params) => this.guard.authorize(method, params),
      observeResult: (method, params, data) => this.guard.observeResult(method, params, data),
      pushTypes: GIT_WINDOW_PUSH_FORWARD_TYPES,
      filterPush: (message) => this.guard.filterPush(message),
    });
  }

  async open(): Promise<GitWindowOpenResult> {
    if (this.liveWindow()) {
      this.options.bridge.childWindows.focus('git', INSTANCE);
      return { ok: true };
    }
    const main = this.options.getMainWindow();
    if (!main || main.isDestroyed()) return { ok: false, reason: 'not-ready' };

    let child: DisplayChildWindow;
    try {
      const saved = this.options.resolveStateStorage()?.get<unknown>(BOUNDS_KEY);
      const bounds = gitWindowPlacement(main.getBounds(), saved);
      child = this.options.createWindow?.(bounds) ?? createChildWindow({
        appDir: this.options.appDir, placement: bounds,
        minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT,
        title: `${PRODUCT_DISPLAY_NAME} - Git`,
      });
    } catch (error: unknown) {
      this.report('could not be created', error);
      this.notifyClosed();
      return { ok: false, reason: 'not-ready' };
    }

    this.window = child;
    try {
      this.options.bridge.childWindows.register('git', INSTANCE, child);
    } catch (error: unknown) {
      this.window = null;
      this.report('could not be registered', error);
      // degradation-audit: reported — BrowserWindow.close() is synchronous (not the host's async close); nothing to await.
      if (!child.isDestroyed()) child.close();
      this.notifyClosed();
      return { ok: false, reason: 'not-ready' };
    }

    const closeWithMain = (): void => {
      this.options.bridge.childWindows.unregister('git', INSTANCE, child);
      // degradation-audit: reported — BrowserWindow.close() is synchronous (not the host's async close); nothing to await.
      if (!child.isDestroyed()) child.close();
    };
    main.once('closed', closeWithMain);
    child.on('close', () => this.saveBounds(child));
    child.once('closed', () => {
      this.options.bridge.childWindows.unregister('git', INSTANCE, child);
      if (!main.isDestroyed()) main.removeListener('closed', closeWithMain);
      if (this.window !== null && this.window !== child) return;
      this.window = null;
      this.scope = null;
      this.guard.reset();
      if (!main.isDestroyed() && !this.options.bridge.childWindows.isClosingAll) this.notifyClosed();
    });
    const broken = (reason: string, error: unknown): void => {
      this.report(reason, error);
      this.options.bridge.childWindows.unregister('git', INSTANCE, child);
      // degradation-audit: reported — BrowserWindow.close() is synchronous (not the host's async close); nothing to await.
      if (!child.isDestroyed()) child.close();
    };
    child.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== ERR_ABORTED) broken('renderer did not load', `${code} ${description}`);
    });
    child.webContents.on('render-process-gone', (_event, details) => broken('renderer is gone', details.reason));
    this.options.bridge.childWindows.loadRenderer('git', child, this.options.appDir)
      .catch((error: unknown) => broken('renderer did not load', error));
    return { ok: true };
  }

  async close(): Promise<boolean> {
    const child = this.liveWindow();
    if (!child) return false;
    this.options.bridge.childWindows.unregister('git', INSTANCE, child);
    // degradation-audit: reported — BrowserWindow.close() is synchronous (not the host's async close); nothing to await.
    if (!child.isDestroyed()) child.close();
    return true;
  }

  isOpen(): boolean { return this.liveWindow() !== null; }

  publishScope(scope: GitWindowScope): GitWindowPublishScopeResult {
    const parsed = GitWindowScopeSchema.safeParse(scope);
    if (!parsed.success) return { accepted: false, scope: null };
    const child = this.liveWindow();
    if (!child || child.webContents.isDestroyed()) return { accepted: false, scope: null };
    const accepted: GitWindowScope = { ...parsed.data, sequence: ++this.sequence };
    try {
      child.webContents.send('to-renderer', { type: GIT_WINDOW_PUSH_TYPES.scope, payload: accepted });
    } catch (error: unknown) {
      this.report('scope could not be sent', error);
      this.options.bridge.childWindows.unregister('git', INSTANCE, child);
      // degradation-audit: reported — BrowserWindow.close() is synchronous (not the host's async close); nothing to await.
      if (!child.isDestroyed()) child.close();
      return { accepted: false, scope: null };
    }
    this.scope = accepted;
    return { accepted: true, scope: accepted };
  }

  getScope(): GitWindowScope | null { return this.scope; }

  setMode(params: GitWindowSetModeParams): boolean {
    if (!GitWindowSetModeParamsSchema.safeParse(params).success || !this.isOpen()) return false;
    return this.options.bridge.sendToRenderer({ type: GIT_WINDOW_PUSH_TYPES.setMode, payload: params });
  }

  private liveWindow(): DisplayChildWindow | null {
    const child = this.window;
    if (!child) return null;
    if (!this.options.bridge.childWindows.get('git', INSTANCE)) {
      this.window = null;
      return null;
    }
    return child;
  }

  private saveBounds(child: DisplayChildWindow): void {
    const storage = this.options.resolveStateStorage();
    if (!storage || child.isDestroyed()) return;
    storage.update(BOUNDS_KEY, child.getBounds()).catch((error: unknown) => this.report('bounds could not be saved', error));
  }

  private notifyClosed(): void {
    this.options.bridge.sendToRenderer({ type: GIT_WINDOW_PUSH_TYPES.closed });
  }

  private report(message: string, error: unknown): void {
    this.options.logger.error(`[Ptah Electron] Git window ${message}`, {
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
}
