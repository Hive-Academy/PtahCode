import { derivePrincipal, ownerKeyId, ownerKeysEqual, parseExternalOwnerKey } from './external-owner-key';

describe('external owner key', () => {
  const owner = { transport: 'http' as const, principal: derivePrincipal('slot:1'), exclusive: true };

  it.each(['x'.repeat(129), 'home/<user>', 'a b', '/home/<user>', 'slot:1'])('rejects unsafe principal %s', principal => {
    expect(() => parseExternalOwnerKey({ ...owner, principal })).toThrow();
  });

  it('derives a stable hexadecimal principal', () => {
    expect(derivePrincipal('slot:1')).toMatch(/^[a-f0-9]{32}$/);
    expect(derivePrincipal('slot:1')).toBe(derivePrincipal('slot:1'));
  });

  it('compares all fields and gives stable IDs', () => {
    expect(ownerKeysEqual(owner, parseExternalOwnerKey(owner))).toBe(true);
    expect(ownerKeysEqual(owner, { ...owner, transport: 'stdio' })).toBe(false);
    expect(ownerKeysEqual(owner, { ...owner, exclusive: false })).toBe(false);
    expect(ownerKeyId(owner)).toBe(ownerKeyId(parseExternalOwnerKey(owner)));
  });
});
