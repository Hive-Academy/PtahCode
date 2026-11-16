import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExternalOwnerKey } from '@ptah-extension/shared';

/** Ownership comes only from authenticated transport binding or connection, never tool arguments,
 * JSON body fields, a /session/{id} URL path, or a caller-supplied lane ID. Transports must pass a
 * derived principal, never a raw token or connection secret. */
export const externalOwnerKeySchema = z.object({
  transport: z.enum(['http', 'stdio']),
  principal: z.string().regex(/^[a-f0-9]{32,64}$/),
  exclusive: z.boolean(),
}).strict();

export function derivePrincipal(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 32);
}

export function parseExternalOwnerKey(value: unknown): ExternalOwnerKey {
  return Object.freeze(externalOwnerKeySchema.parse(value));
}

export function ownerKeysEqual(a: ExternalOwnerKey, b: ExternalOwnerKey): boolean {
  return a.transport === b.transport && a.principal === b.principal && a.exclusive === b.exclusive;
}

export function ownerKeyId(key: ExternalOwnerKey): string {
  return `${key.transport}:${key.exclusive ? '1' : '0'}:${key.principal}`;
}
