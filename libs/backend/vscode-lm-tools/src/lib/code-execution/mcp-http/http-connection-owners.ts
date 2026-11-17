import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import { derivePrincipal } from '@ptah-extension/cli-agent-runtime';

const sessionHeaderSchema = z.string().regex(/^[a-f0-9]{64}$/);
const MAX_SESSIONS = 256;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SessionRecord {
  readonly tokenPrincipal: string;
  lastSeenAt: number;
}

/** A returned MCP session header is a server-minted connection bearer, never a URL identity. */
export class HttpConnectionOwners {
  private readonly records = new Map<string, SessionRecord>();

  constructor(private readonly now: () => number = Date.now, private readonly onRetire?: (owner: ExternalOwnerKey) => void) {}

  private retire(id: string, record: SessionRecord): void {
    this.records.delete(id);
    this.onRetire?.({ transport: 'http', principal: derivePrincipal(`${record.tokenPrincipal}:${id}`), exclusive: true });
  }

  private prune(): void {
    for (const [id, record] of this.records) {
      if (this.now() - record.lastSeenAt >= MAX_AGE_MS) this.retire(id, record);
    }
    while (this.records.size > MAX_SESSIONS) {
      const oldest = this.records.keys().next().value;
      if (oldest === undefined) break;
      const record = this.records.get(oldest);
      if (record) this.retire(oldest, record);
    }
  }

  issue(owner: ExternalOwnerKey): string {
    this.prune();
    const id = randomBytes(32).toString('hex');
    this.records.set(id, { tokenPrincipal: owner.principal, lastSeenAt: this.now() });
    this.prune();
    return id;
  }

  resolve(owner: ExternalOwnerKey | undefined, header: unknown): ExternalOwnerKey | undefined {
    if (!owner || owner.exclusive) return owner;
    const parsed = sessionHeaderSchema.safeParse(header);
    if (!parsed.success) return owner;
    this.prune();
    const record = this.records.get(parsed.data);
    if (!record || record.tokenPrincipal !== owner.principal) return owner;
    record.lastSeenAt = this.now();
    this.records.delete(parsed.data);
    this.records.set(parsed.data, record);
    return { transport: 'http', principal: derivePrincipal(`${owner.principal}:${parsed.data}`), exclusive: true };
  }

  isActive(owner: ExternalOwnerKey): boolean {
    this.prune();
    if (owner.transport !== 'http' || !owner.exclusive) return false;
    for (const [id, record] of this.records) {
      if (derivePrincipal(`${record.tokenPrincipal}:${id}`) === owner.principal) return true;
    }
    return false;
  }

  get size(): number {
    this.prune();
    return this.records.size;
  }
}
