/**
 * Session tool disposition (TASK_2026_2297_920a, phase P1).
 *
 * A synchronous, host-neutral view of whether new tool calls of one session may run.
 * The permission handler and the query options builder consult it on every tool call, so
 * `lookup` must not block. A host that owns the cap state (the CLI agent runtime) supplies
 * its own lookup; direct SDK hosts use {@link SessionToolDispositionRegistry}, whose
 * default answer is "running". The SDK never imports the runtime.
 *
 * The disposition only ever narrows what a session may do. It never grants a tool and
 * never stops or aborts a session.
 */
import { injectable } from 'tsyringe';
import type { AgentActionNotice } from '@ptah-extension/shared';

/** Trusted identifiers of one session. Either may be absent before the SDK assigns an ID. */
export interface SessionToolDispositionIds {
  readonly tabId?: string;
  readonly sdkSessionId?: string;
}

export interface SessionToolDisposition {
  /** `paused`: new non-handoff tool calls are denied. `asked-handoff` changes no tool call. */
  readonly phase: 'running' | 'asked-handoff' | 'paused';
  /** Trusted notice that explains the disposition; its copy is rendered by shared builders. */
  readonly notice?: AgentActionNotice;
}

export interface SessionToolDispositionPort {
  lookup(ids: SessionToolDispositionIds): SessionToolDisposition | undefined;
}

/** In-memory default: hosts that own cap state call `set` and `clear`. */
@injectable()
export class SessionToolDispositionRegistry implements SessionToolDispositionPort {
  private readonly byId = new Map<string, SessionToolDisposition>();

  set(ids: SessionToolDispositionIds, disposition: SessionToolDisposition): void {
    for (const id of this.keys(ids)) this.byId.set(id, disposition);
  }

  clear(ids: SessionToolDispositionIds): void {
    for (const id of this.keys(ids)) this.byId.delete(id);
  }

  lookup(ids: SessionToolDispositionIds): SessionToolDisposition | undefined {
    for (const id of this.keys(ids)) {
      const found = this.byId.get(id);
      if (found) return found;
    }
    return undefined;
  }

  private keys(ids: SessionToolDispositionIds): string[] {
    const keys: string[] = [];
    if (ids.tabId) keys.push(`tab:${ids.tabId}`);
    if (ids.sdkSessionId) keys.push(`sdk:${ids.sdkSessionId}`);
    return keys;
  }
}
