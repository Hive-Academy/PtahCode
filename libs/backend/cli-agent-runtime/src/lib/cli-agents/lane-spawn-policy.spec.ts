import type { CliAdapterManifest } from '@ptah-extension/shared';
import {
  applyLaneArgvPolicy,
  LaneSpawnPolicyError,
  translateLaneSpawnPolicy,
  resolveLaneEffort,
  isReviewerOrTester,
} from './lane-spawn-policy';

const codex: CliAdapterManifest = {
  messaging: {
    steer: { state: 'supported' },
    interrupt: { state: 'unsupported', reason: 'No interrupt.' },
    continuation: { state: 'supported' },
    resume: { state: 'supported' },
  },
  roleChannel: 'developer-instructions',
  permissionModes: {
    plan: {
      state: 'supported',
      nativeMode: 'read-only',
      networkModes: ['allow', 'deny'],
    },
    ask: {
      state: 'unsupported',
      reason: 'No approval route.',
      networkModes: [],
    },
    'auto-edit': {
      state: 'supported',
      nativeMode: 'workspace-write',
      networkModes: ['allow', 'deny'],
    },
    yolo: {
      state: 'supported',
      nativeMode: 'danger-full-access',
      networkModes: ['allow'],
    },
  },
  networkModes: {
    allow: { state: 'supported' },
    deny: { state: 'supported' },
  },
  limitReader: { state: 'available', source: 'openai-codex' },
  mcp: { state: 'supported' },
};

describe('lane spawn policy', () => {
  it.each(['review', 'visual-review', 'tests'] as const)(
    'defaults %s phase effort to medium',
    (phaseKind) => {
      expect(
        resolveLaneEffort({ cli: 'codex', phaseKind, chatEffort: 'high' }),
      ).toMatchObject({ effort: 'medium', step: 4 });
      expect(isReviewerOrTester(undefined, phaseKind)).toBe(true);
    },
  );

  it('uses ordinary phase kind before a reviewer name', () => {
    expect(
      resolveLaneEffort({
        cli: 'codex',
        phaseKind: 'implement',
        roleName: 'custom-reviewer',
        chatEffort: 'high',
      }),
    ).toMatchObject({ effort: 'high', step: 5 });
  });

  it.each(['custom-reviewer', 'senior-tester'])(
    'keeps the no-phase user agent name fallback for %s',
    (roleName) => {
      expect(
        resolveLaneEffort({ cli: 'codex', roleName, chatEffort: 'high' }),
      ).toMatchObject({ effort: 'medium', step: 4 });
    },
  );

  describe('effort provenance', () => {
    it('sends a lane-reported value unchanged', () => {
      expect(resolveLaneEffort({
        cli: 'codex',
        spawnEffort: 'max',
        nativeEfforts: { provenance: 'native', supported: ['max'], default: null },
      })).toEqual({
        effort: 'max',
        step: 1,
        ignored: [],
        requested: 'max',
        provenance: 'native',
        disposition: 'native-match',
      });
    });

    it('skips a value absent from the native list and checks the next step', () => {
      expect(resolveLaneEffort({
        cli: 'codex',
        spawnEffort: 'max',
        setting: 'high',
        nativeEfforts: { provenance: 'native', supported: ['xhigh', 'high'], default: 'high' },
      })).toEqual({
        effort: 'high',
        step: 2,
        ignored: [{ step: 1, value: 'max', reason: 'not-in-native-list' }],
        requested: 'max',
        provenance: 'native',
        disposition: 'not-in-native-list',
      });
    });

    it.each([
      { phaseKind: 'review' },
      { roleName: 'code-logic-reviewer' },
    ] as const)('checks the reviewer default for %j before offering chat effort', (reviewer) => {
      expect(resolveLaneEffort({
        cli: 'codex',
        ...reviewer,
        chatEffort: 'high',
        nativeEfforts: { provenance: 'native', supported: ['high'], default: 'high' },
      })).toEqual({
        effort: 'high',
        step: 5,
        ignored: [{ step: 4, value: 'medium', reason: 'not-in-native-list' }],
        requested: 'medium',
        provenance: 'native',
        disposition: 'not-in-native-list',
      });
    });

    it('sends nothing when the lane reports it takes no effort', () => {
      expect(resolveLaneEffort({
        cli: 'claude',
        spawnEffort: 'max',
        setting: 'high',
        nativeEfforts: { provenance: 'native', supported: [], default: null },
      })).toEqual({
        effort: undefined,
        step: 6,
        ignored: [
          { step: 1, value: 'max', reason: 'lane-takes-no-effort' },
          { step: 2, value: 'high', reason: 'lane-takes-no-effort' },
        ],
        requested: 'max',
        provenance: 'native',
        disposition: 'lane-takes-no-effort',
      });
    });

    it.each(['cursor', 'opencode'] as const)('reports that %s has no effort transport', (cli) => {
      expect(resolveLaneEffort({ cli, spawnEffort: 'high' })).toMatchObject({
        effort: undefined,
        disposition: 'lane-takes-no-effort',
        ignored: [{ step: 1, value: 'high', reason: 'lane-takes-no-effort' }],
      });
    });

    it.each([
      ['max', 'xhigh', 'fallback-mapped'],
      ['minimal', 'low', 'fallback-mapped'],
      ['high', 'high', 'fallback-allowlist'],
      ['vendor-level', undefined, 'fallback-refused'],
    ] as const)('checks unknown-list effort %s with the fallback mapper', (
      spawnEffort,
      effort,
      disposition,
    ) => {
      expect(resolveLaneEffort({
        cli: 'codex',
        spawnEffort,
        nativeEfforts: { provenance: 'unknown' },
      })).toMatchObject({ effort, disposition, requested: spawnEffort, provenance: 'ptah-fallback' });
    });

    it('uses the mapper for a supplied Ptah fallback list', () => {
      expect(resolveLaneEffort({
        cli: 'codex',
        spawnEffort: 'max',
        nativeEfforts: { provenance: 'ptah-fallback', supported: [], default: null },
      })).toMatchObject({
        effort: 'xhigh',
        step: 1,
        requested: 'max',
        provenance: 'ptah-fallback',
        disposition: 'fallback-mapped',
      });
    });

    it('records no request when no step offers an effort', () => {
      expect(resolveLaneEffort({ cli: 'codex' })).toEqual({
        effort: undefined,
        step: 6,
        ignored: [],
        requested: undefined,
        provenance: 'unknown',
        disposition: 'none-requested',
      });
    });
  });

  it('maps Codex workspace writes with native network denial', () => {
    expect(
      translateLaneSpawnPolicy('codex', codex, {
        permission: 'auto-edit',
        network: 'deny',
      }),
    ).toMatchObject({
      cli: 'codex',
      sandboxMode: 'workspace-write',
      networkAccess: false,
    });
  });

  it('refuses Codex yolo with network denial before launch', () => {
    expect(() =>
      translateLaneSpawnPolicy('codex', codex, {
        permission: 'yolo',
        network: 'deny',
      }),
    ).toThrow(LaneSpawnPolicyError);
    try {
      translateLaneSpawnPolicy('codex', codex, {
        permission: 'yolo',
        network: 'deny',
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LaneSpawnPolicyError);
      if (error instanceof LaneSpawnPolicyError) {
        expect(error.refusal).toMatchObject({
          code: 'UNSUPPORTED_LANE_POLICY',
          field: 'combination',
        });
      }
    }
  });

  it('refuses unsupported network denial for Claude', () => {
    const claude = {
      ...codex,
      networkModes: {
        allow: { state: 'supported' as const },
        deny: { state: 'unsupported' as const, reason: 'No native sandbox.' },
      },
    };
    expect(() =>
      translateLaneSpawnPolicy('claude', claude, {
        permission: 'plan',
        network: 'deny',
      }),
    ).toThrow(LaneSpawnPolicyError);
  });

  it('leaves omitted argv options byte identical', () => {
    const args = ['run', '--auto', '--model', 'fixture'];
    expect(applyLaneArgvPolicy(args, { addArgs: [], removeArgs: [] })).toEqual(
      args,
    );
  });
});
