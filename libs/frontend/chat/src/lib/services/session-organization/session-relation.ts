import { Injectable, computed, signal } from '@angular/core';

interface RelationTarget {
  readonly id: string;
  readonly parentId: string | null;
}

/** Shown when the parent session is not in the list or has no label. */
export const UNKNOWN_PARENT_LABEL = 'agent session';
/** Longest parent label the card shows before it truncates. */
export const PARENT_LABEL_MAX = 32;

export interface SessionRelationRow {
  readonly sessionId: string;
  readonly label: string | null;
  readonly parentSessionId: string | null;
  readonly running: boolean;
}

export interface SessionRelationView {
  /** Parent label when this session is a child; null otherwise. */
  readonly childOf: string | null;
  readonly childCount: number;
  readonly childRunning: number;
}

export function shortenParentLabel(label: string | null | undefined): string {
  const text = (label ?? '').trim();
  if (!text) return UNKNOWN_PARENT_LABEL;
  return text.length > PARENT_LABEL_MAX
    ? `${text.slice(0, PARENT_LABEL_MAX - 1)}…`
    : text;
}

/**
 * The child/parent view of one session over the known rows. A handoff
 * successor has no `parentSessionId`, so it is never a child here.
 */
export function describeSessionRelation(
  sessionId: string,
  ownParentId: string | null,
  rows: readonly SessionRelationRow[],
): SessionRelationView {
  let childOf: string | null = null;
  if (ownParentId) {
    const parent = rows.find((row) => row.sessionId === ownParentId);
    childOf = shortenParentLabel(parent?.label);
  }
  const children = rows.filter((row) => row.parentSessionId === sessionId);
  return {
    childOf,
    childCount: children.length,
    childRunning: children.filter((row) => row.running).length,
  };
}

/** True when `otherId` is the parent or a child of the session with `focusedId`. */
export function isRelatedSession(
  focusedId: string | null,
  focusedParentId: string | null,
  otherId: string,
  otherParentId: string | null,
): boolean {
  if (!focusedId || !otherId || focusedId === otherId) return false;
  return focusedParentId === otherId || otherParentId === focusedId;
}

/** The session under pointer or keyboard focus, for the parent/child highlight. */
@Injectable({ providedIn: 'root' })
export class SessionRelationFocus {
  private readonly pointer = signal<RelationTarget | null>(null);
  private readonly keyboard = signal<RelationTarget | null>(null);
  /** Pointer wins; keyboard focus holds when the pointer leaves. */
  readonly focused = computed(() => this.pointer() ?? this.keyboard());

  setPointer(id: string, parentId: string | null): void {
    this.pointer.set(id ? { id, parentId } : null);
  }

  clearPointer(id: string): void {
    if (this.pointer()?.id === id) this.pointer.set(null);
  }

  setKeyboard(id: string, parentId: string | null): void {
    this.keyboard.set(id ? { id, parentId } : null);
  }

  clearKeyboard(id: string): void {
    if (this.keyboard()?.id === id) this.keyboard.set(null);
  }
}
