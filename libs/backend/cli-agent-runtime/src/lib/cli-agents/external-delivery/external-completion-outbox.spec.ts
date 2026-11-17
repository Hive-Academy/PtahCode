import type { Logger } from '@ptah-extension/vscode-core';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import { ExternalCompletionOutbox } from './external-completion-outbox';
import { derivePrincipal } from './external-owner-key';

describe('ExternalCompletionOutbox', () => {
  const owner: ExternalOwnerKey = { transport: 'http', principal: derivePrincipal('slot:1'), exclusive: true };
  const other: ExternalOwnerKey = { ...owner, transport: 'stdio' };
  const logs: string[] = [];
  const logger = { info: (message: string) => { logs.push(message); } } as Logger;
  let now = 0;
  const entry = (id: string, ownerKey = owner) => ({ completionId: `${id}:time`, agentId: id, owner: ownerKey, body: `private-${id}`, completedAt: 'time', recordedAt: now });

  beforeEach(() => { now = 0; logs.length = 0; });

  it('markDelivered removes an unclaimed record and suppresses a late duplicate only for its owner', () => {
    const box = new ExternalCompletionOutbox(logger, { now: () => now });
    box.record(entry('a'));
    box.markDelivered(owner, entry('a').completionId);
    expect(box.pendingCount(owner)).toBe(0);
    box.record(entry('a'));
    expect(box.pendingCount(owner)).toBe(0);
    expect(logs.at(-1)).toContain('tombstone-suppressed');
    box.record(entry('a', other));
    expect(box.pendingCount(other)).toBe(1);
  });

  it('bounds tombstones by age and total size', () => {
    const aged = new ExternalCompletionOutbox(logger, { maxAgeMs: 10, now: () => now });
    aged.markDelivered(owner, entry('old').completionId);
    now = 11;
    aged.record(entry('old'));
    expect(aged.pendingCount(owner)).toBe(1);

    now = 0;
    const bounded = new ExternalCompletionOutbox(logger, { maxTotal: 1, now: () => now });
    bounded.markDelivered(owner, entry('first').completionId);
    bounded.markDelivered(owner, entry('second').completionId);
    bounded.record(entry('first'));
    bounded.record(entry('second'));
    expect(bounded.hasCompletion(owner, entry('first').completionId)).toBe(true);
    expect(bounded.hasCompletion(owner, entry('second').completionId)).toBe(false);
  });

  it('discardOwner clears its tombstone when the retired marker is later evicted', () => {
    const box = new ExternalCompletionOutbox(logger, { maxTotal: 1, now: () => now });
    box.markDelivered(owner, entry('a').completionId);
    box.discardOwner(owner);
    box.discardOwner(other);
    box.record(entry('a'));
    expect(box.pendingCount(owner)).toBe(1);
  });

  it('deduplicates, bounds and expires oldest entries without logging bodies', () => {
    const box = new ExternalCompletionOutbox(logger, { maxPerOwner: 2, maxTotal: 2, maxAgeMs: 10, now: () => now });
    box.record(entry('a')); box.record(entry('a')); now++; box.record(entry('b')); now++; box.record(entry('c'));
    expect(box.findForLane(owner, 'a')).toBeUndefined();
    expect(box.pendingCount(owner)).toBe(2);
    now = 20;
    expect(box.pendingCount(owner)).toBe(0);
    expect(logs.join(' ')).not.toContain('private-');
  });

  it('claims atomically, checks ownership, releases and expires leases', () => {
    const box = new ExternalCompletionOutbox(logger, { leaseMs: 10, now: () => now });
    box.record(entry('a'));
    const limits = { maxEntries: 2, maxBytes: 100 };
    const first = box.claim(owner, limits);
    expect(first.entries).toHaveLength(1);
    expect(box.claim(owner, limits).entries).toHaveLength(0);
    expect(box.acknowledge(other, first.claimId)).toBe(0);
    box.release(owner, first.claimId);
    const second = box.claim(owner, limits);
    expect(second.entries).toHaveLength(1);
    now = 11;
    expect(box.claim(owner, limits).entries).toHaveLength(1);
    expect(box.claim({ ...owner, exclusive: false }, limits).entries).toHaveLength(0);
  });

  it('discards only retired connection entries and logs a count without secrets', () => {
    const box = new ExternalCompletionOutbox(logger, { now: () => now });
    box.record(entry('a'));
    box.record(entry('b', other));
    expect(box.discardOwner(owner)).toBe(1);
    expect(box.pendingCount(owner)).toBe(0);
    expect(box.pendingCount(other)).toBe(1);
    expect(logs).toEqual(['[ExternalCompletionOutbox] Discarded 1 unreachable connection entries']);
    box.record(entry('late'));
    expect(box.pendingCount(owner)).toBe(0);
    expect(logs.at(-1)).toBe('[ExternalCompletionOutbox] Discarded 1 completion for a retired connection');
  });

  it('logs only the count when retired owner keys exceed the cap', () => {
    const box = new ExternalCompletionOutbox(logger, { maxTotal: 1, now: () => now });
    box.discardOwner(owner);
    box.discardOwner(other);
    expect(logs).toEqual(['[ExternalCompletionOutbox] Dropped 1 retired owner keys']);
  });

  it('keeps an active completion when retired markers overflow before a late completion', () => {
    const active = { ...owner, principal: derivePrincipal('active') };
    const box = new ExternalCompletionOutbox(logger, { maxTotal: 1, now: () => now });
    box.setHttpOwnerIsActive(candidate => candidate.principal === active.principal);
    box.discardOwner(owner);
    box.discardOwner({ ...owner, principal: derivePrincipal('another retired connection') });
    box.record(entry('active', active));
    now++;
    box.record(entry('late', owner));
    expect(box.claim(active, { maxEntries: 1, maxBytes: 100 }).entries.map(item => item.agentId)).toEqual(['active']);
    expect(box.pendingCount(owner)).toBe(0);
  });

  it('does not let a shared HTTP completion evict an exclusive completion', () => {
    const box = new ExternalCompletionOutbox(logger, { maxTotal: 1, now: () => now });
    box.record(entry('exclusive'));
    now++;
    box.record(entry('shared', { ...owner, exclusive: false }));
    expect(box.claim(owner, { maxEntries: 1, maxBytes: 100 }).entries.map(item => item.agentId)).toEqual(['exclusive']);
    expect(box.pendingCount({ ...owner, exclusive: false })).toBe(0);
    box.record(entry('stdio-shared', { ...other, exclusive: false }));
    expect(box.findForLane({ ...other, exclusive: false }, 'stdio-shared')).toBeDefined();
  });

  it('bounds total entries across owners and acknowledges only the matching claim', () => {
    const box = new ExternalCompletionOutbox(logger, { maxTotal: 2, now: () => now });
    box.record(entry('a')); now++;
    box.record(entry('b', other)); now++;
    box.record(entry('c'));
    expect(box.findForLane(owner, 'a')).toBeUndefined();
    const claim = box.claim(owner, { maxEntries: 2, maxBytes: 100 });
    expect(box.acknowledge(other, claim.claimId)).toBe(0);
    expect(box.acknowledge(owner, claim.claimId)).toBe(1);
    expect(box.pendingCount(other)).toBe(1);
  });

  it('does not acknowledge a replacement after evicting a held entry', () => {
    const box = new ExternalCompletionOutbox(logger, { maxTotal: 1, now: () => now });
    const limits = { maxEntries: 1, maxBytes: 100 };
    box.record(entry('a'));
    const oldClaim = box.claim(owner, limits);
    now++;
    box.record(entry('b'));
    now++;
    box.record(entry('a'));
    expect(box.acknowledge(owner, oldClaim.claimId)).toBe(0);
    expect(box.claim(owner, limits).entries.map(item => item.agentId)).toEqual(['a']);
  });

  it('does not release a replacement held by a newer claim', () => {
    const box = new ExternalCompletionOutbox(logger, { maxTotal: 1, now: () => now });
    const limits = { maxEntries: 1, maxBytes: 100 };
    box.record(entry('a'));
    const oldClaim = box.claim(owner, limits);
    now++;
    box.record(entry('b'));
    now++;
    box.record(entry('a'));
    const newClaim = box.claim(owner, limits);
    box.release(owner, oldClaim.claimId);
    expect(box.claim(owner, limits).entries).toHaveLength(0);
    expect(box.acknowledge(owner, newClaim.claimId)).toBe(1);
  });

  it('does not acknowledge a replacement after a held entry ages out', () => {
    const box = new ExternalCompletionOutbox(logger, { maxAgeMs: 2, now: () => now });
    const limits = { maxEntries: 1, maxBytes: 100 };
    box.record(entry('a'));
    const oldClaim = box.claim(owner, limits);
    now = 3;
    box.record(entry('a'));
    expect(box.acknowledge(owner, oldClaim.claimId)).toBe(0);
    expect(box.claim(owner, limits).entries).toHaveLength(1);
  });

  it('rejects a late acknowledgement after a lease is claimed again', () => {
    const box = new ExternalCompletionOutbox(logger, { leaseMs: 10, now: () => now });
    const limits = { maxEntries: 1, maxBytes: 100 };
    box.record(entry('a'));
    const oldClaim = box.claim(owner, limits);
    now = 11;
    const newClaim = box.claim(owner, limits);
    expect(newClaim.entries).toHaveLength(1);
    expect(box.acknowledge(owner, oldClaim.claimId)).toBe(0);
    expect(box.claim(owner, limits).entries).toHaveLength(0);
    expect(box.acknowledge(owner, newClaim.claimId)).toBe(1);
  });

  it('keeps explicit lane reads private, including forged transport', () => {
    const box = new ExternalCompletionOutbox(logger, { now: () => now });
    box.record(entry('a', { ...other, exclusive: false }));
    expect(box.findForLane(other, 'a')).toBeUndefined();
    expect(box.findForLane(owner, 'missing')).toBeUndefined();
    expect(box.findForLane({ ...other, exclusive: false }, 'a')?.agentId).toBe('a');
    expect(box.acknowledgeCompletion(other, 'a:time')).toBe(false);
    expect(box.acknowledgeCompletion({ ...other, exclusive: false }, 'a:time')).toBe(true);
  });

  it('truncates oversized bodies with a read instruction', () => {
    const box = new ExternalCompletionOutbox(logger, { maxBodyBytes: 90, now: () => now });
    box.record({ ...entry('a'), body: 'x'.repeat(200) });
    const body = box.findForLane(owner, 'a')?.body;
    expect(body).toContain('ptah_agent_read');
    expect(Buffer.byteLength(body ?? '')).toBeLessThanOrEqual(90);
  });

  it('preserves order and permits the first bounded entry over the response budget', () => {
    const box = new ExternalCompletionOutbox(logger, { now: () => now });
    box.record(entry('a'));
    box.record(entry('b'));
    box.record(entry('c'));
    const first = box.claim(owner, { maxEntries: 3, maxBytes: 1 });
    expect(first.entries.map(item => item.agentId)).toEqual(['a']);
    const second = box.claim(owner, { maxEntries: 3, maxBytes: 17 });
    expect(second.entries.map(item => item.agentId)).toEqual(['b']);
    expect(box.acknowledgeCompletion(owner, 'a:time')).toBe(false);
    expect(box.findForLane(owner, 'a')).toBeDefined();
    box.release(owner, first.claimId);
    expect(box.acknowledgeCompletion(owner, 'a:time')).toBe(true);
  });

  it('cuts before a four-byte character and respects even a tiny body budget', () => {
    const box = new ExternalCompletionOutbox(logger, { maxBodyBytes: 75, now: () => now });
    box.record({ ...entry('a'), body: 'ab😀'.repeat(50) });
    const body = box.findForLane(owner, 'a')?.body ?? '';
    expect(body.startsWith('ab')).toBe(true);
    expect(body).not.toContain('😀');
    expect(body).not.toContain('�');
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(75);
    const tiny = new ExternalCompletionOutbox(logger, { maxBodyBytes: 4, now: () => now });
    tiny.record({ ...entry('a'), body: 'a'.repeat(100) });
    expect(Buffer.byteLength(tiny.findForLane(owner, 'a')?.body ?? '')).toBeLessThanOrEqual(4);
  });
});
