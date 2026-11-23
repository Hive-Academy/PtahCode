import type {
  McpCallerBinding,
  McpCallerBindingKind,
  McpCallerCapability,
} from './mcp-caller-credentials.interface';
import {
  gatewayScopeFromBinding,
  internalQueryGatewayScope,
  isGatewayCallerPermitted,
  sessionGatewayScope,
  type McpGatewayCaller,
} from './mcp-gateway-caller-policy';

const KINDS: readonly McpCallerBindingKind[] = [
  'agent',
  'session',
  'workspace',
  'home',
  'internal-query',
];
const CAPABILITIES: readonly McpCallerCapability[] = [
  'read-only',
  'lane-report',
  'privileged',
];
const FLAGS: readonly (boolean | undefined)[] = [undefined, false, true];

/** The expected matrix, written out independently of the implementation. */
function expected(caller: McpGatewayCaller): boolean {
  if (caller.capability !== 'privileged') return false;
  if (caller.kind === 'agent') return true;
  if (caller.kind === 'session') return caller.gatewayApproval === true;
  if (caller.kind === 'internal-query') {
    return caller.includeConnectors === true;
  }
  return false;
}

function caller(
  kind: McpCallerBindingKind,
  capability: McpCallerCapability,
  gatewayApproval: boolean | undefined,
  includeConnectors: boolean | undefined,
): McpGatewayCaller {
  return {
    kind,
    capability,
    ...(gatewayApproval !== undefined ? { gatewayApproval } : {}),
    ...(includeConnectors !== undefined ? { includeConnectors } : {}),
  };
}

const MATRIX = KINDS.flatMap((kind) =>
  CAPABILITIES.flatMap((capability) =>
    FLAGS.flatMap((gatewayApproval) =>
      FLAGS.map((includeConnectors) =>
        caller(kind, capability, gatewayApproval, includeConnectors),
      ),
    ),
  ),
);

describe('isGatewayCallerPermitted', () => {
  it('covers every kind x capability x flag combination', () => {
    expect(MATRIX).toHaveLength(
      KINDS.length * CAPABILITIES.length * FLAGS.length * FLAGS.length,
    );
  });

  it.each(MATRIX.map((c) => [JSON.stringify(c), c] as const))(
    '%s',
    (_label, c) => {
      expect(isGatewayCallerPermitted(c)).toBe(expected(c));
    },
  );

  it('permits exactly the three privileged rows', () => {
    const permitted = MATRIX.filter((c) => isGatewayCallerPermitted(c));
    expect(permitted.every((c) => c.capability === 'privileged')).toBe(true);
    expect(new Set(permitted.map((c) => c.kind))).toEqual(
      new Set(['agent', 'session', 'internal-query']),
    );
    // agent: 9 flag combos; session: gatewayApproval true x 3; internal-query:
    // includeConnectors true x 3.
    expect(permitted).toHaveLength(9 + 3 + 3);
  });

  it('denies no caller', () => {
    expect(isGatewayCallerPermitted(undefined)).toBe(false);
  });

  it('denies an unknown kind from an untyped caller', () => {
    const unknownKind = {
      kind: 'external',
      capability: 'privileged',
      gatewayApproval: true,
      includeConnectors: true,
    } as unknown as McpGatewayCaller;
    expect(isGatewayCallerPermitted(unknownKind)).toBe(false);
  });

  it('denies an unknown capability from an untyped caller', () => {
    const unknownCapability = {
      kind: 'agent',
      capability: 'admin',
    } as unknown as McpGatewayCaller;
    expect(isGatewayCallerPermitted(unknownCapability)).toBe(false);
  });

  it('accepts a full McpCallerBinding structurally', () => {
    const binding: McpCallerBinding = {
      kind: 'session',
      sessionId: 's-1',
      workspaceRoot: '/ws',
      capability: 'privileged',
      cronWriteApproval: true,
      gatewayApproval: true,
    };
    expect(isGatewayCallerPermitted(binding)).toBe(true);
  });
});

describe('sessionGatewayScope', () => {
  it('builds the privileged session scope with gateway approval', () => {
    expect(sessionGatewayScope('/ws')).toEqual({
      kind: 'session',
      capability: 'privileged',
      workspaceRoot: '/ws',
      gatewayApproval: true,
    });
    expect(isGatewayCallerPermitted(sessionGatewayScope('/ws'))).toBe(true);
  });
});

describe('internalQueryGatewayScope', () => {
  it('sets includeConnectors only when the run opted in', () => {
    expect(internalQueryGatewayScope('/ws', true)).toEqual({
      kind: 'internal-query',
      capability: 'privileged',
      workspaceRoot: '/ws',
      includeConnectors: true,
    });
    const optedOut = internalQueryGatewayScope('/ws', false);
    expect(optedOut).toEqual({
      kind: 'internal-query',
      capability: 'privileged',
      workspaceRoot: '/ws',
    });
    expect('includeConnectors' in optedOut).toBe(false);
  });

  it('is permitted only with the opt-in', () => {
    expect(isGatewayCallerPermitted(internalQueryGatewayScope('/ws', true))).toBe(
      true,
    );
    expect(
      isGatewayCallerPermitted(internalQueryGatewayScope('/ws', false)),
    ).toBe(false);
  });
});

describe('gatewayScopeFromBinding', () => {
  const binding: McpCallerBinding = {
    kind: 'agent',
    agentId: 'a-1',
    sessionId: 's-1',
    workspaceRoot: '/bound',
    toolProfile: 'coding',
    capability: 'privileged',
    phaseKind: 'implement',
    disallowedTools: ['ptah_agent_spawn'],
    cronWriteApproval: true,
    gatewayApproval: false,
    includeConnectors: true,
  };

  it('copies only the policy fields and the workspace root', () => {
    expect(gatewayScopeFromBinding(binding)).toEqual({
      kind: 'agent',
      capability: 'privileged',
      workspaceRoot: '/bound',
      gatewayApproval: false,
      includeConnectors: true,
    });
  });

  it('prefers an explicit workspace root', () => {
    expect(gatewayScopeFromBinding(binding, '/other').workspaceRoot).toBe(
      '/other',
    );
  });

  it('leaves absent fields absent', () => {
    const scope = gatewayScopeFromBinding({
      kind: 'home',
      capability: 'read-only',
    });
    expect(scope).toEqual({ kind: 'home', capability: 'read-only' });
    expect(Object.keys(scope).sort()).toEqual(['capability', 'kind']);
  });

  it('keeps the permission verdict of its binding', () => {
    for (const c of MATRIX) {
      expect(isGatewayCallerPermitted(gatewayScopeFromBinding(c))).toBe(
        isGatewayCallerPermitted(c),
      );
    }
  });
});
