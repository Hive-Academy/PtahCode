import 'reflect-metadata';
import { HttpConnectionOwners } from './http-connection-owners';

const owner = { transport: 'http' as const, principal: 'a'.repeat(32), exclusive: false };

describe('HTTP connection owners', () => {
  it('accepts only a server-issued header for its credential', () => {
    const owners = new HttpConnectionOwners();
    const id = owners.issue(owner);
    const exclusive = owners.resolve(owner, id);
    expect(exclusive).toMatchObject({ exclusive: true });
    if (!exclusive) throw new Error('Expected an exclusive owner');
    expect(owners.isActive(exclusive)).toBe(true);
    expect(owners.resolve(owner, undefined)).toEqual(owner);
    expect(owners.resolve(owner, 'f'.repeat(64))).toEqual(owner);
    expect(owners.resolve({ ...owner, principal: 'b'.repeat(32) }, id)).toEqual({ ...owner, principal: 'b'.repeat(32) });
    expect(owners.resolve(undefined, id)).toBeUndefined();
  });

  it('bounds records by count and age', () => {
    let now = 0;
    const owners = new HttpConnectionOwners(() => now);
    const first = owners.issue(owner);
    const exclusive = owners.resolve(owner, first);
    if (!exclusive) throw new Error('Expected an exclusive owner');
    for (let i = 0; i < 256; i++) owners.issue(owner);
    expect(owners.size).toBe(256);
    expect(owners.resolve(owner, first)).toEqual(owner);
    expect(owners.isActive(exclusive)).toBe(false);
    now = 24 * 60 * 60 * 1000;
    expect(owners.size).toBe(0);
  });

  it('refreshes active records and retires unreachable owners', () => {
    let now = 0;
    const retired: string[] = [];
    const owners = new HttpConnectionOwners(() => now, owner => retired.push(owner.principal));
    const active = owners.issue(owner);
    const stale = owners.issue(owner);
    const stalePrincipal = owners.resolve(owner, stale)?.principal;
    now = 10;
    const resolved = owners.resolve(owner, active);
    for (let i = 0; i < 255; i++) owners.issue(owner);
    expect(owners.resolve(owner, active)).toMatchObject({ principal: resolved?.principal, exclusive: true });
    expect(owners.resolve(owner, stale)).toEqual(owner);
    expect(retired).toContain(stalePrincipal);
  });
});
