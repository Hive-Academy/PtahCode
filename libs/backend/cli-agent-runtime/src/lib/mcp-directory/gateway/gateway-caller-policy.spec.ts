import type {
  McpCallerBindingKind,
  McpCallerCapability,
  McpGatewayScope,
} from '@ptah-extension/platform-core';
import { isGatewayScopePermitted } from './gateway-caller-policy';

function scope(
  kind: McpCallerBindingKind,
  capability: McpCallerCapability,
  extra: Partial<McpGatewayScope> = {},
): McpGatewayScope {
  return { kind, capability, workspaceRoot: '/repo', ...extra };
}

describe('isGatewayScopePermitted (Hub 6 matrix)', () => {
  describe('Claude session (session)', () => {
    it('permits privileged with gatewayApproval: true', () => {
      expect(
        isGatewayScopePermitted(
          scope('session', 'privileged', { gatewayApproval: true }),
        ),
      ).toBe(true);
    });

    it('withholds without gatewayApproval, or with it false', () => {
      expect(isGatewayScopePermitted(scope('session', 'privileged'))).toBe(
        false,
      );
      expect(
        isGatewayScopePermitted(
          scope('session', 'privileged', { gatewayApproval: false }),
        ),
      ).toBe(false);
    });

    it('withholds includeConnectors alone (it is not the session switch)', () => {
      expect(
        isGatewayScopePermitted(
          scope('session', 'privileged', { includeConnectors: true }),
        ),
      ).toBe(false);
    });

    it('withholds a non-privileged session even with approval', () => {
      expect(
        isGatewayScopePermitted(
          scope('session', 'read-only', { gatewayApproval: true }),
        ),
      ).toBe(false);
    });
  });

  describe('cron one-shot and other one-shots (internal-query)', () => {
    it('permits privileged with includeConnectors: true (cron opt-in)', () => {
      expect(
        isGatewayScopePermitted(
          scope('internal-query', 'privileged', { includeConnectors: true }),
        ),
      ).toBe(true);
    });

    it('withholds when includeConnectors is absent (curator, synthesis, wizards)', () => {
      expect(
        isGatewayScopePermitted(scope('internal-query', 'privileged')),
      ).toBe(false);
    });

    it('withholds when includeConnectors is false', () => {
      expect(
        isGatewayScopePermitted(
          scope('internal-query', 'privileged', { includeConnectors: false }),
        ),
      ).toBe(false);
    });

    it('withholds gatewayApproval alone', () => {
      expect(
        isGatewayScopePermitted(
          scope('internal-query', 'privileged', { gatewayApproval: true }),
        ),
      ).toBe(false);
    });

    it('withholds a non-privileged one-shot even with the opt-in', () => {
      expect(
        isGatewayScopePermitted(
          scope('internal-query', 'read-only', { includeConnectors: true }),
        ),
      ).toBe(false);
    });
  });

  describe('CLI lanes (agent)', () => {
    it('permits a privileged lane (codex, cursor, copilot, opencode, grok)', () => {
      expect(isGatewayScopePermitted(scope('agent', 'privileged'))).toBe(true);
    });

    it('withholds antigravity (lane-report)', () => {
      expect(
        isGatewayScopePermitted(
          scope('agent', 'lane-report', {
            gatewayApproval: true,
            includeConnectors: true,
          }),
        ),
      ).toBe(false);
    });

    it('withholds a read-only lane', () => {
      expect(isGatewayScopePermitted(scope('agent', 'read-only'))).toBe(false);
    });
  });

  describe('home and workspace slot tokens', () => {
    it.each<McpCallerBindingKind>(['home', 'workspace'])(
      'withholds %s at every capability and flag',
      (kind) => {
        for (const capability of [
          'privileged',
          'lane-report',
          'read-only',
        ] as const) {
          expect(
            isGatewayScopePermitted(
              scope(kind, capability, {
                gatewayApproval: true,
                includeConnectors: true,
              }),
            ),
          ).toBe(false);
        }
      },
    );
  });

  describe('read-only or untokened callers', () => {
    it('withholds an untokened caller (no scope)', () => {
      expect(isGatewayScopePermitted(undefined)).toBe(false);
    });

    it.each<McpCallerBindingKind>([
      'agent',
      'session',
      'internal-query',
      'home',
      'workspace',
    ])('withholds read-only %s with both flags set', (kind) => {
      expect(
        isGatewayScopePermitted(
          scope(kind, 'read-only', {
            gatewayApproval: true,
            includeConnectors: true,
          }),
        ),
      ).toBe(false);
    });
  });

  it('withholds an unknown kind from an untyped caller', () => {
    const unknownKind = {
      kind: 'external',
      capability: 'privileged',
      gatewayApproval: true,
      includeConnectors: true,
    } as unknown as McpGatewayScope;
    expect(isGatewayScopePermitted(unknownKind)).toBe(false);
  });
});
