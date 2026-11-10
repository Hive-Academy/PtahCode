import type { Rectangle } from 'electron';
import * as path from 'path';

export type ChildViewKind = 'display' | 'git';
export interface ChildContext {
  readonly viewKind: ChildViewKind;
  readonly instanceId: string;
  readonly context?: unknown;
}
export interface ChildWindowHandle {
  readonly webContents: {
    readonly id: number;
    once?(event: 'destroyed', listener: () => void): unknown;
    send?(channel: string, message: unknown): void;
    isDestroyed?(): boolean;
  };
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  close(): void;
  once(event: 'closed', listener: () => void): unknown;
  loadFile(filePath: string, options: { query: Record<string, string> }): Promise<void>;
}
export interface ChildViewPolicy {
  readonly singleton: boolean;
  readonly allowedMethods: ReadonlySet<string>;
  /**
   * The scope check of an allowed method. `false` refuses the call before
   * dispatch: the method name alone does not authorize the params.
   */
  readonly authorize?: (method: string, params: unknown) => boolean;
  /** Reads the result of a call that was dispatched for the child. */
  readonly observeResult?: (method: string, params: unknown, data: unknown) => void;
  /** Host push types that the child gets together with the main window. */
  readonly pushTypes?: ReadonlySet<string>;
  /** Reduce a listed push to what the view may see. `null` drops it. Without it the push is sent as it is. */
  readonly filterPush?: (message: { readonly type: string }) => unknown;
}
/** Why a child call is refused: the method is not allowed, or its params are out of scope. */
export type ChildRefusal = 'method' | 'scope';
export interface ChildWindowOptions {
  readonly appDir: string;
  readonly placement: Partial<Rectangle> & { width: number; height: number };
  readonly minWidth: number;
  readonly minHeight: number;
  readonly title: string;
}

/** The registry owns trusted sender identity and each view's RPC policy. */
export class ChildWindowRegistry {
  private closingAll = false;
  private readonly policies = new Map<ChildViewKind, ChildViewPolicy>();
  private readonly children = new Map<ChildViewKind, Map<string, ChildWindowHandle>>();
  private readonly senders = new Map<number, ChildContext>();
  private readonly senderIdsByWindow = new Map<ChildWindowHandle, number>();

  registerView(viewKind: ChildViewKind, policy: ChildViewPolicy): void {
    if (this.policies.has(viewKind)) throw new Error(`View already registered: ${viewKind}`);
    this.policies.set(viewKind, policy);
  }

  register(viewKind: ChildViewKind, instanceId: string, window: ChildWindowHandle, context?: unknown): void {
    const policy = this.policies.get(viewKind);
    if (!policy) throw new Error(`Unregistered view: ${viewKind}`);
    const instances = this.children.get(viewKind) ?? new Map<string, ChildWindowHandle>();
    if (instances.has(instanceId) || (policy.singleton && instances.size > 0)) {
      throw new Error(`Child window already open: ${viewKind}`);
    }
    const webContents = window.webContents;
    const senderId = webContents.id;
    if (this.senders.has(senderId)) throw new Error('Sender already registered');
    instances.set(instanceId, window);
    this.children.set(viewKind, instances);
    this.senders.set(senderId, { viewKind, instanceId, context });
    this.senderIdsByWindow.set(window, senderId);
    window.once('closed', () => this.unregister(viewKind, instanceId, window));
    webContents.once?.('destroyed', () => this.unregister(viewKind, instanceId, window));
  }

  loadRenderer(viewKind: ChildViewKind, window: ChildWindowHandle, appDir: string): Promise<void> {
    return window.loadFile(path.join(appDir, 'renderer', 'index.html'), {
      query: { ptahWindow: viewKind },
    });
  }

  unregister(viewKind: ChildViewKind, instanceId: string, window: ChildWindowHandle): void {
    const instances = this.children.get(viewKind);
    if (instances?.get(instanceId) !== window) return;
    instances.delete(instanceId);
    if (instances.size === 0) this.children.delete(viewKind);
    const senderId = this.senderIdsByWindow.get(window);
    if (senderId !== undefined) this.senders.delete(senderId);
    this.senderIdsByWindow.delete(window);
  }

  get(viewKind: ChildViewKind, instanceId: string): ChildWindowHandle | null {
    const window = this.children.get(viewKind)?.get(instanceId) ?? null;
    if (window?.isDestroyed()) {
      this.unregister(viewKind, instanceId, window);
      return null;
    }
    return window;
  }

  focus(viewKind: ChildViewKind, instanceId: string): boolean {
    const window = this.get(viewKind, instanceId);
    if (!window) return false;
    if (window.isMinimized()) window.restore();
    window.focus();
    return true;
  }

  sender(webContentsId: number): ChildContext | null {
    const context = this.senders.get(webContentsId);
    return context && this.get(context.viewKind, context.instanceId) ? context : null;
  }

  senderIds(): number[] { return [...this.senders.keys()]; }

  get isClosingAll(): boolean { return this.closingAll; }

  allows(webContentsId: number, method: string): boolean {
    const context = this.sender(webContentsId);
    return context !== null && (this.policies.get(context.viewKind)?.allowedMethods.has(method) ?? false);
  }

  /** The refusal of one child call, or `null` when it may be dispatched. */
  refusal(webContentsId: number, method: string, params: unknown): ChildRefusal | null {
    const context = this.sender(webContentsId);
    const policy = context === null ? undefined : this.policies.get(context.viewKind);
    if (!policy?.allowedMethods.has(method)) return 'method';
    return policy.authorize?.(method, params) === false ? 'scope' : null;
  }

  observeResult(webContentsId: number, method: string, params: unknown, data: unknown): void {
    const context = this.sender(webContentsId);
    if (context !== null) this.policies.get(context.viewKind)?.observeResult?.(method, params, data);
  }

  /** Send one host push to each live child whose view lists its type. */
  mirrorPush(message: unknown): void {
    if (typeof message !== 'object' || message === null || !('type' in message)) return;
    const type = message.type;
    if (typeof type !== 'string') return;
    for (const [viewKind, instances] of this.children) {
      const policy = this.policies.get(viewKind);
      if (!policy?.pushTypes?.has(type)) continue;
      const visible = policy.filterPush === undefined ? message : policy.filterPush({ ...message, type });
      if (visible === null || visible === undefined) continue;
      for (const window of instances.values()) {
        if (window.isDestroyed() || window.webContents.isDestroyed?.() === true) continue;
        try {
          window.webContents.send?.('to-renderer', visible);
        } catch {
          // degradation-audit: optional-capability - the child closed between the
          // check and the send; the main window still gets the push, and the
          // child reads the state again when it opens.
        }
      }
    }
  }

  allowsSender(webContentsId: number, mainWindowId: number | undefined, method: string): boolean {
    return mainWindowId !== undefined && webContentsId === mainWindowId || this.allows(webContentsId, method);
  }

  closeAll(): void {
    this.closingAll = true;
    for (const [viewKind, instances] of [...this.children]) {
      for (const [instanceId, window] of [...instances]) {
        this.unregister(viewKind, instanceId, window);
        if (!window.isDestroyed()) window.close();
      }
    }
  }
}
