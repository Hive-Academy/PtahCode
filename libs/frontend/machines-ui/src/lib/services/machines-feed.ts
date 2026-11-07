import { Injectable } from '@angular/core';
import type { MessageHandler } from '@ptah-extension/core';
import {
  MACHINE_CONNECTION_STATES,
  MACHINE_STATE_REASONS,
  MESSAGE_TYPES,
  type MachineConnectionState,
  type MachineStateReason,
  type MachineVersionInfo,
  type MachineVersions,
  type MachinesEventPayload,
  type MachinesStatePayload,
} from '@ptah-extension/shared';

export type MachinesEventListener = (event: MachinesEventPayload) => void;
export type MachinesStateListener = (state: MachinesStatePayload) => void;

const CONNECTION_STATES: ReadonlySet<string> = new Set(
  MACHINE_CONNECTION_STATES,
);
const STATE_REASONS: ReadonlySet<string> = new Set(MACHINE_STATE_REASONS);

/**
 * Receives the two remote-machine pushes Electron main sends
 * (`machines:event`, `machines:state`), validates them and relays each one to
 * its listeners in delivery order.
 *
 * Listeners rather than a signal: a burst of `machines:event` pushes in one
 * tick must reach the per-session reducer one by one, and two signal writes
 * in one tick would coalesce. A malformed push is dropped. The feed fetches
 * nothing and owns no timer.
 *
 * Register it in `MESSAGE_HANDLERS` with `useExisting` so the router and
 * `MachinesStore` share the root instance.
 */
@Injectable({ providedIn: 'root' })
export class MachinesFeed implements MessageHandler {
  public readonly handledMessageTypes = [
    MESSAGE_TYPES.MACHINES_EVENT,
    MESSAGE_TYPES.MACHINES_STATE,
  ] as const;

  private readonly eventListeners = new Set<MachinesEventListener>();
  private readonly stateListeners = new Set<MachinesStateListener>();

  /** Receive every valid `machines:event`. Returns the unsubscribe. */
  public onEvent(listener: MachinesEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** Receive every valid `machines:state`. Returns the unsubscribe. */
  public onState(listener: MachinesStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public handleMessage(message: { type: string; payload?: unknown }): void {
    if (message.type === MESSAGE_TYPES.MACHINES_EVENT) {
      const event = parseMachinesEvent(message.payload);
      if (event === null) return;
      for (const listener of [...this.eventListeners]) listener(event);
      return;
    }
    if (message.type === MESSAGE_TYPES.MACHINES_STATE) {
      const state = parseMachinesState(message.payload);
      if (state === null) return;
      for (const listener of [...this.stateListeners]) listener(state);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Narrow an untrusted payload to {@link MachinesEventPayload}, or `null`.
 * `payload` is passed through; the session reducer validates it per `type`.
 */
export function parseMachinesEvent(
  payload: unknown,
): MachinesEventPayload | null {
  const raw = asRecord(payload);
  if (raw === null) return null;
  const { machineId, sessionId, epoch, seq, type } = raw;
  if (
    !isNonEmptyString(machineId) ||
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(epoch) ||
    !isNonEmptyString(type) ||
    typeof seq !== 'number' ||
    !Number.isSafeInteger(seq) ||
    seq < 1
  ) {
    return null;
  }
  return { machineId, sessionId, epoch, seq, type, payload: raw['payload'] };
}

function parseVersionInfo(value: unknown): MachineVersionInfo | null {
  const raw = asRecord(value);
  if (raw === null || typeof raw['ptahVersion'] !== 'string') return null;
  const protocol = asRecord(raw['protocol']);
  if (
    protocol === null ||
    typeof protocol['min'] !== 'number' ||
    typeof protocol['max'] !== 'number'
  ) {
    return null;
  }
  return {
    ptahVersion: raw['ptahVersion'],
    protocol: { min: protocol['min'], max: protocol['max'] },
  };
}

function parseVersions(value: unknown): MachineVersions | null {
  const raw = asRecord(value);
  if (raw === null) return null;
  const local = parseVersionInfo(raw['local']);
  if (local === null) return null;
  if (raw['remote'] === undefined) return { local };
  const remote = parseVersionInfo(raw['remote']);
  return remote === null ? null : { local, remote };
}

/**
 * Narrow an untrusted payload to {@link MachinesStatePayload}, or `null`.
 * `machineId` and `state` are required. A malformed optional field is left
 * out rather than failing the push, so a state change is never lost to it; an
 * unknown `reason` is left out the same way (the closed set is the contract).
 */
export function parseMachinesState(
  payload: unknown,
): MachinesStatePayload | null {
  const raw = asRecord(payload);
  if (raw === null) return null;
  const { machineId, state, nextRetryAt, lastSeenAt, versions, reason } = raw;
  if (
    !isNonEmptyString(machineId) ||
    typeof state !== 'string' ||
    !CONNECTION_STATES.has(state)
  ) {
    return null;
  }
  const parsedVersions = parseVersions(versions);
  return {
    machineId,
    state: state as MachineConnectionState,
    ...(isTimestamp(nextRetryAt) ? { nextRetryAt } : {}),
    ...(isTimestamp(lastSeenAt) ? { lastSeenAt } : {}),
    ...(parsedVersions !== null ? { versions: parsedVersions } : {}),
    ...(typeof reason === 'string' && STATE_REASONS.has(reason)
      ? { reason: reason as MachineStateReason }
      : {}),
  };
}
