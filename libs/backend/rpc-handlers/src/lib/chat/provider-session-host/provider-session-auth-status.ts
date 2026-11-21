/**
 * Install and sign-in state of each provider-session profile this host
 * admits, for `auth:getAuthStatus` (`providerSessionStatus`). One row per
 * admitted profile, from that profile's lane adapter: `detect()` for the
 * install, `ensureTokensFresh()` for the sign-in. A host that binds no probe
 * (or admits no profile) sends no rows, so the renderer offers no
 * provider-session card.
 */
import type {
  CliDetectionResult,
  ProviderSessionAuthStatus,
  ProviderSessionProfileId,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

/** The lane-adapter surface the probe reads; never refreshes a credential. */
export interface ProviderSessionAuthLane {
  detect(): Promise<Pick<CliDetectionResult, 'installed' | 'version'>>;
  /**
   * Whether the CLI's own stored sign-in is usable. A lane without a
   * credential reader (Antigravity) omits it: an installed CLI then counts as
   * signed in, and a missing sign-in surfaces as `auth-required` on open.
   */
  ensureTokensFresh?(): Promise<boolean>;
}

/** One admitted profile, as the host composition supplies it. */
export interface ProviderSessionAuthProfile {
  readonly profile: ProviderSessionProfileId;
  readonly lane: ProviderSessionAuthLane;
  /** The runtime profile's sign-in instruction (for example `run \`grok login\``). */
  readonly signInHint: string;
}

export type ProviderSessionAuthStatusRows = Partial<
  Record<ProviderSessionProfileId, ProviderSessionAuthStatus>
>;

export interface ProviderSessionAuthStatusProbe {
  probe(): Promise<ProviderSessionAuthStatusRows>;
}

export function createProviderSessionAuthStatusProbe(deps: {
  readonly profiles: readonly ProviderSessionAuthProfile[];
  readonly logger: Pick<Logger, 'warn'>;
}): ProviderSessionAuthStatusProbe {
  const probeOne = async ({
    profile,
    lane,
    signInHint,
  }: ProviderSessionAuthProfile): Promise<ProviderSessionAuthStatus> => {
    try {
      const detection = await lane.detect();
      if (!detection.installed)
        return { installed: false, authenticated: false, signInHint };
      const authenticated = lane.ensureTokensFresh
        ? await lane.ensureTokensFresh()
        : true;
      return {
        installed: true,
        authenticated,
        ...(detection.version ? { version: detection.version } : {}),
        signInHint,
      };
    } catch (error: unknown) {
      // The row still answers (not installed, not signed in); the cause is logged.
      deps.logger.warn('Provider-session auth status check failed (non-fatal)', {
        profile,
        error: error instanceof Error ? error.message : String(error),
      });
      return { installed: false, authenticated: false, signInHint };
    }
  };
  return {
    async probe() {
      const rows = await Promise.all(
        deps.profiles.map(
          async (entry) => [entry.profile, await probeOne(entry)] as const,
        ),
      );
      return Object.fromEntries(rows);
    },
  };
}
