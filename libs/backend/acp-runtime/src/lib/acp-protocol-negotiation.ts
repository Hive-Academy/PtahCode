/**
 * ACP protocol negotiation (D8). Ptah speaks the v1 client of
 * `@agentclientprotocol/sdk` and requests protocol version 1. The measured
 * agents answer 1 even to a version-2 request (preflight PF-4), and a later
 * agent may answer 2 while still sending the v1 message shapes. A reply of 1
 * or 2 is therefore accepted when its shape is the v1 one; any other version,
 * or a reply that is not v1-shaped, is refused as `protocol-unsupported`.
 * There is no v2 codec.
 */
import { isRecord } from './acp-session-helpers';

/** The version Ptah requests on `initialize`. */
export const ACP_REQUESTED_PROTOCOL_VERSION = 1;

/** The versions accepted in the reply, when the reply has the v1 shape. */
export const ACP_ACCEPTED_PROTOCOL_VERSIONS: readonly number[] = [1, 2];

export type AcpProtocolCheck =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly reason: string };

/** The first field of an `initialize` reply that breaks the v1 shape, if any. */
function v1ShapeViolation(reply: Record<string, unknown>): string | undefined {
  const capabilities = reply['agentCapabilities'];
  if (capabilities !== undefined && capabilities !== null) {
    if (!isRecord(capabilities)) return 'agentCapabilities';
    const load = capabilities['loadSession'];
    if (load !== undefined && typeof load !== 'boolean') {
      return 'agentCapabilities.loadSession';
    }
    for (const key of [
      'promptCapabilities',
      'mcpCapabilities',
      'sessionCapabilities',
    ]) {
      const value = capabilities[key];
      if (value !== undefined && value !== null && !isRecord(value)) {
        return `agentCapabilities.${key}`;
      }
    }
  }
  const methods = reply['authMethods'];
  if (methods !== undefined && methods !== null) {
    if (!Array.isArray(methods)) return 'authMethods';
    if (
      methods.some(
        (method: unknown) =>
          !isRecord(method) || typeof method['id'] !== 'string',
      )
    ) {
      return 'authMethods[].id';
    }
  }
  return undefined;
}

/** Check an `initialize` reply against D8. Never throws. */
export function checkInitializeReply(reply: unknown): AcpProtocolCheck {
  if (!isRecord(reply)) {
    return { ok: false, reason: 'an initialize reply that is not an object' };
  }
  const version = reply['protocolVersion'];
  if (
    typeof version !== 'number' ||
    !ACP_ACCEPTED_PROTOCOL_VERSIONS.includes(version)
  ) {
    return {
      ok: false,
      reason: `unsupported ACP protocol version ${String(version)}`,
    };
  }
  const violation = v1ShapeViolation(reply);
  if (violation) {
    return {
      ok: false,
      reason: `ACP protocol version ${version} with a reply that is not v1-shaped (${violation})`,
    };
  }
  return { ok: true, version };
}

/** The auth method ids an `initialize` reply advertised. */
export function advertisedAuthMethods(reply: unknown): readonly string[] {
  if (!isRecord(reply) || !Array.isArray(reply['authMethods'])) return [];
  return reply['authMethods'].flatMap((method: unknown) =>
    isRecord(method) && typeof method['id'] === 'string' ? [method['id']] : [],
  );
}
