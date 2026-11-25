import { RouteDecideArgsSchema } from './route-decide-args.schema';

const gateArgs = {
  stage: 'gate-0.1' as const,
  request: 'Implement the feature',
  taskType: 'FEATURE' as const,
  depth: 'Full' as const,
  phases: [{ id: 'implement', kind: 'implement' as const }],
};

type GateData = Extract<
  Awaited<ReturnType<typeof RouteDecideArgsSchema.parse>>,
  { stage: 'gate-0.1' }
>;

/** Parses gate-0.1 args with the given preferenceSource. */
function parseGate(preferenceSource: unknown):
  | { ok: true; data: GateData }
  | { ok: false; issues: string } {
  const result = RouteDecideArgsSchema.safeParse({
    ...gateArgs,
    preferenceSource,
  });
  if (!result.success) {
    return { ok: false, issues: JSON.stringify(result.error.issues) };
  }
  if (result.data.stage === 'gate-0.1') {
    return { ok: true, data: result.data };
  }
  throw new Error('expected the gate-0.1 branch');
}

describe('route-decide preferenceSource', () => {
  it('accepts plain text', () => {
    const result = parseGate('user standing order');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.preferenceSource).toBe('user standing order');
    }
  });

  it('trims surrounding whitespace', () => {
    const result = parseGate('  user-note\t');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.preferenceSource).toBe('user-note');
    }
  });

  it('treats whitespace-only input as absent', () => {
    const result = parseGate('   ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.preferenceSource).toBeUndefined();
    }
  });

  it('rejects a semicolon at start, middle and end', () => {
    for (const preferenceSource of [
      ';user note',
      'user; note',
      'user note;',
    ]) {
      const result = parseGate(preferenceSource);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toContain('semicolon');
      }
    }
  });

  it('rejects CR and LF at start, middle and end', () => {
    for (const preferenceSource of [
      '\ruser note',
      'user\r note',
      'user note\r',
      '\nuser note',
      'user\n note',
      'user note\n',
    ]) {
      const result = parseGate(preferenceSource);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toContain('line break');
      }
    }
  });

  it('accepts 200 characters and rejects 201', () => {
    expect(parseGate('a'.repeat(200)).ok).toBe(true);
    const tooLong = parseGate('a'.repeat(201));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.issues).toContain('200');
    }
  });
});
