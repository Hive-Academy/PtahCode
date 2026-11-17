import { httpSpawnOwnerScope } from './http-spawn-owner-scope';

describe('HTTP spawn dedupe scope', () => {
  it('separates owners even when workspace and arguments match', () => {
    const a = { transport: 'http' as const, principal: 'a'.repeat(32), exclusive: true };
    const b = { ...a, principal: 'b'.repeat(32) };
    expect(httpSpawnOwnerScope('/ws', undefined, undefined, undefined, a))
      .not.toBe(httpSpawnOwnerScope('/ws', undefined, undefined, undefined, b));
    expect(httpSpawnOwnerScope('/ws', undefined, undefined, undefined, a))
      .toBe(httpSpawnOwnerScope('/ws', undefined, undefined, undefined, a));
  });
});
