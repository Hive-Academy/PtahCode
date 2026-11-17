import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import { ownerKeyId, ownerKeysEqual } from './external-owner-key';

export interface ExternalCompletionEntry {
  readonly completionId: string;
  readonly agentId: string;
  readonly owner: ExternalOwnerKey;
  readonly body: string;
  readonly verdict?: string;
  readonly completedAt: string;
  readonly recordedAt: number;
}

export interface ExternalOutboxOptions {
  readonly maxPerOwner?: number;
  readonly maxTotal?: number;
  readonly maxAgeMs?: number;
  readonly maxBodyBytes?: number;
  readonly leaseMs?: number;
  readonly now?: () => number;
}

/** Limits for the outbox. The host registers an empty object, so the defaults apply. */
export const EXTERNAL_OUTBOX_OPTIONS = Symbol.for('ExternalCompletionOutboxOptions');

interface HeldClaim {
  readonly owner: ExternalOwnerKey;
  readonly entries: readonly ExternalCompletionEntry[];
  readonly expiresAt: number;
}

/** In-memory at-least-once delivery: lease expiry may deliver again; dedupe by completionId. */
@injectable()
export class ExternalCompletionOutbox {
  private readonly entries = new Map<string, ExternalCompletionEntry>();
  private readonly claims = new Map<string, HeldClaim>();
  private readonly held = new Map<string, ExternalCompletionEntry>();
  private readonly retiredOwners = new Map<string, number>();
  private isActiveHttpOwner?: (owner: ExternalOwnerKey) => boolean;
  private readonly maxPerOwner: number;
  private readonly maxTotal: number;
  private readonly maxAgeMs: number;
  private readonly maxBodyBytes: number;
  private readonly leaseMs: number;
  private readonly now: () => number;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    // Tests pass small limits. The container injects an empty object.
    @inject(EXTERNAL_OUTBOX_OPTIONS, { isOptional: true })
    options: ExternalOutboxOptions = {},
  ) {
    this.maxPerOwner = options.maxPerOwner ?? 32;
    this.maxTotal = options.maxTotal ?? 256;
    this.maxAgeMs = options.maxAgeMs ?? 86_400_000;
    this.maxBodyBytes = options.maxBodyBytes ?? 65_536;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, retiredAt] of this.retiredOwners) {
      if (now - retiredAt > this.maxAgeMs) this.retiredOwners.delete(id);
    }
    for (const [id, claim] of this.claims) {
      if (claim.expiresAt > now) continue;
      this.claims.delete(id);
      for (const entry of claim.entries) this.releaseEntry(entry);
    }
    let count = 0;
    for (const entry of this.entries.values()) {
      if (now - entry.recordedAt <= this.maxAgeMs) continue;
      this.removeEntry(entry);
      count++;
    }
    if (count) this.logger.info(`[ExternalCompletionOutbox] Evicted ${count} expired entries`);
  }

  private releaseEntry(entry: ExternalCompletionEntry): void {
    if (this.held.get(entry.completionId) === entry) this.held.delete(entry.completionId);
  }

  private removeEntry(entry: ExternalCompletionEntry): boolean {
    this.releaseEntry(entry);
    if (this.entries.get(entry.completionId) !== entry) return false;
    return this.entries.delete(entry.completionId);
  }

  private removeOldest(predicate: (entry: ExternalCompletionEntry) => boolean): boolean {
    let oldest: ExternalCompletionEntry | undefined;
    for (const entry of this.entries.values()) {
      if (predicate(entry) && (!oldest || entry.recordedAt < oldest.recordedAt)) oldest = entry;
    }
    if (!oldest) return false;
    this.removeEntry(oldest);
    return true;
  }

  /** The HTTP server owns the bounded connection registry used to validate late completions. */
  setHttpOwnerIsActive(isActive: (owner: ExternalOwnerKey) => boolean): void {
    this.isActiveHttpOwner = isActive;
  }

  record(entry: ExternalCompletionEntry): void {
    this.prune();
    if (entry.owner.transport === 'http' && !entry.owner.exclusive) return;
    if (entry.owner.transport === 'http' && this.isActiveHttpOwner && !this.isActiveHttpOwner(entry.owner)) {
      this.logger.info('[ExternalCompletionOutbox] Discarded 1 completion for a retired connection');
      return;
    }
    if (this.retiredOwners.has(ownerKeyId(entry.owner))) {
      this.logger.info('[ExternalCompletionOutbox] Discarded 1 completion for a retired connection');
      return;
    }
    if (this.entries.has(entry.completionId)) return;
    const note = '\n[Completion truncated; call ptah_agent_read for the full lane output.]';
    const bytes = Buffer.byteLength(entry.body);
    let body = entry.body;
    if (bytes > this.maxBodyBytes) {
      const suffix = Buffer.from(note).subarray(0, this.maxBodyBytes).toString('utf8');
      const budget = Math.max(0, this.maxBodyBytes - Buffer.byteLength(suffix));
      const source = Buffer.from(entry.body);
      let end = Math.min(source.length, budget);
      while (end > 0 && end < source.length && (source[end] & 0xc0) === 0x80) end--;
      body = source.subarray(0, end).toString('utf8') + suffix;
    }
    this.entries.set(entry.completionId, { ...entry, owner: Object.freeze({ ...entry.owner }), body });
    let evicted = 0;
    const ownerId = ownerKeyId(entry.owner);
    while (Array.from(this.entries.values()).filter(item => ownerKeyId(item.owner) === ownerId).length > this.maxPerOwner) {
      if (!this.removeOldest(item => ownerKeyId(item.owner) === ownerId)) break;
      evicted++;
    }
    while (this.entries.size > this.maxTotal) {
      if (!this.removeOldest(() => true)) break;
      evicted++;
    }
    if (evicted) this.logger.info(`[ExternalCompletionOutbox] Evicted ${evicted} bounded entries`);
  }

  claim(owner: ExternalOwnerKey, limits: { readonly maxEntries: number; readonly maxBytes: number }): { claimId: string; entries: ExternalCompletionEntry[] } {
    this.prune();
    const claimId = randomUUID();
    const entries: ExternalCompletionEntry[] = [];
    if (!owner.exclusive) return { claimId, entries };
    let bytes = 0;
    for (const entry of this.entries.values()) {
      if (!ownerKeysEqual(owner, entry.owner) || this.held.has(entry.completionId)) continue;
      const size = Buffer.byteLength(entry.body);
      if (entries.length >= limits.maxEntries) break;
      if (entries.length > 0 && bytes + size > limits.maxBytes) break;
      entries.push(entry);
      bytes += size;
      this.held.set(entry.completionId, entry);
    }
    if (entries.length) this.claims.set(claimId, { owner, entries, expiresAt: this.now() + this.leaseMs });
    return { claimId, entries };
  }

  /** Call only after the tool response has been written successfully. */
  acknowledge(owner: ExternalOwnerKey, claimId: string): number {
    this.prune();
    const claim = this.claims.get(claimId);
    if (!claim || !ownerKeysEqual(owner, claim.owner)) return 0;
    this.claims.delete(claimId);
    let count = 0;
    for (const entry of claim.entries) {
      if (this.removeEntry(entry)) count++;
    }
    return count;
  }

  release(owner: ExternalOwnerKey, claimId: string): void {
    this.prune();
    const claim = this.claims.get(claimId);
    if (!claim || !ownerKeysEqual(owner, claim.owner)) return;
    this.claims.delete(claimId);
    for (const entry of claim.entries) this.releaseEntry(entry);
  }

  /** Retire a connection whose bearer record is gone; its entries cannot be claimed. */
  discardOwner(owner: ExternalOwnerKey): number {
    this.prune();
    this.retiredOwners.set(ownerKeyId(owner), this.now());
    let dropped = 0;
    while (this.retiredOwners.size > this.maxTotal) {
      const oldest = this.retiredOwners.keys().next().value;
      if (oldest === undefined) break;
      this.retiredOwners.delete(oldest);
      dropped++;
    }
    if (dropped) this.logger.info(`[ExternalCompletionOutbox] Dropped ${dropped} retired owner keys`);
    let count = 0;
    for (const entry of this.entries.values()) {
      if (ownerKeysEqual(owner, entry.owner) && this.removeEntry(entry)) count++;
    }
    if (count) this.logger.info(`[ExternalCompletionOutbox] Discarded ${count} unreachable connection entries`);
    return count;
  }

  findForLane(owner: ExternalOwnerKey, agentId: string): ExternalCompletionEntry | undefined {
    this.prune();
    return Array.from(this.entries.values()).find(entry => entry.agentId === agentId && ownerKeysEqual(owner, entry.owner));
  }

  acknowledgeCompletion(owner: ExternalOwnerKey, completionId: string): boolean {
    this.prune();
    const entry = this.entries.get(completionId);
    if (!entry || !ownerKeysEqual(owner, entry.owner) || this.held.has(completionId)) return false;
    return this.entries.delete(completionId);
  }

  pendingCount(owner: ExternalOwnerKey): number {
    this.prune();
    return Array.from(this.entries.values()).filter(entry => ownerKeysEqual(owner, entry.owner)).length;
  }
}
