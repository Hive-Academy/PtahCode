/**
 * HarnessMcpInstallService.
 *
 * Installs the MCP servers recorded on a harness config when the harness is
 * applied, reusing the same `McpInstallService` that backs the marketplace's
 * MCP directory surface. Before this existed, `config.mcp.servers` was written
 * into the preset and narrated in the generated CLAUDE.md but never installed.
 *
 * An entry is only installable when the designing agent recorded a transport
 * `config` for it. Descriptive-only entries — those discovered from an existing
 * workspace mcp.json, or written by a preset from before install support — are
 * reported back as warnings, so the caller tells the user to install them by
 * hand rather than silently implying they were wired up.
 *
 * Applying a harness configures the workspace it was applied to, so every
 * server is recorded as a WORKSPACE intent (TASK_2026_853, D-4): the gateway
 * serves it in that workspace only.
 *
 * Recording is all an install does (TASK_2026_979 B18): no config file is
 * written. Ptah serves every enabled server to each session and CLI lane
 * through its own `ptah` MCP server, so the outcome names the servers that
 * were recorded, not config paths. A home-folder target (Codex, Copilot,
 * Antigravity) would leak the server into every workspace, so it is left out
 * with a warning; the user can make the server global from the MCP directory.
 */

import { inject, injectable } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe';
import {
  McpInstallService,
  refreshBoundMcpGateway,
} from '@ptah-extension/cli-agent-runtime';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import {
  HARNESS_SYNC_TOKENS,
  type HarnessReconcilerService,
} from '@ptah-extension/harness-sync';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import {
  HARNESS_DEFAULT_MCP_TARGETS,
  classifyMcpScope,
  type McpInstallTarget,
  type McpServerConfig,
  type McpServerEntry,
} from '@ptah-extension/shared';

/** Servers recorded and problems encountered while installing harness MCP servers. */
export interface HarnessMcpInstallOutcome {
  /** Server keys whose intent was recorded for this workspace. No paths: nothing is written. */
  recordedServers: string[];
  warnings: string[];
}

type InstallableEntry = McpServerEntry & { config: McpServerConfig };

@injectable()
export class HarnessMcpInstallService {
  private readonly installService: McpInstallService;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(PLATFORM_TOKENS.DI_CONTAINER) container: DependencyContainer,
  ) {
    // Same service the marketplace uses: it records the install intent, which
    // the MCP gateway serves (TASK_2026_979 B18). The reconciler argument is
    // the constructor's retained positional slot; the service never calls it.
    this.installService = new McpInstallService(
      container.isRegistered(HARNESS_SYNC_TOKENS.RECONCILER)
        ? container.resolve<HarnessReconcilerService>(
            HARNESS_SYNC_TOKENS.RECONCILER,
          )
        : null,
      undefined,
      { onIntentsChanged: () => refreshBoundMcpGateway(container) },
    );
  }

  async installServers(
    servers: McpServerEntry[],
    workspaceRoot: string | undefined,
  ): Promise<HarnessMcpInstallOutcome> {
    const outcome: HarnessMcpInstallOutcome = {
      recordedServers: [],
      warnings: [],
    };

    const enabled = servers.filter((server) => server.enabled);
    if (enabled.length === 0) return outcome;

    const installable = enabled.filter(
      (server): server is InstallableEntry => server.config !== undefined,
    );
    for (const server of enabled) {
      if (!server.config) {
        outcome.warnings.push(
          `MCP server "${server.name}" has no transport config and was not installed. Add it to the workspace manually.`,
        );
      }
    }
    if (installable.length === 0) return outcome;

    if (!workspaceRoot) {
      outcome.warnings.push(
        'No workspace folder open. MCP servers were not installed.',
      );
      return outcome;
    }

    for (const entry of installable) {
      const serverKey = entry.serverKey ?? entry.name;
      const requested =
        entry.installTargets && entry.installTargets.length > 0
          ? entry.installTargets
          : HARNESS_DEFAULT_MCP_TARGETS;
      const homeTargets = requested.filter(isHomeTarget);
      const targets = requested.filter((target) => !isHomeTarget(target));
      if (homeTargets.length > 0) {
        outcome.warnings.push(
          `MCP server "${entry.name}" was not added to ${homeTargets.join(', ')}: those tools keep settings in your home folder. Make it global from the MCP directory to add it there.`,
        );
      }
      if (targets.length === 0) continue;

      try {
        const results = await this.installService.install(
          entry.name,
          serverKey,
          entry.config,
          targets,
          workspaceRoot,
          'workspace',
        );
        let recorded = false;
        for (const result of results) {
          if (result.success) {
            recorded = true;
          } else {
            outcome.warnings.push(
              `Failed to install MCP server "${entry.name}" to ${result.target}: ${
                result.error ?? 'unknown error'
              }`,
            );
          }
        }
        if (recorded) outcome.recordedServers.push(serverKey);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        outcome.warnings.push(
          `Failed to install MCP server "${entry.name}": ${msg}`,
        );
        this.logger.error(
          `RPC: harness:apply MCP install failed for "${entry.name}"`,
          error instanceof Error ? error : new Error(msg),
        );
      }
    }

    // Two entries may share a server key; report each recorded key once.
    return {
      recordedServers: Array.from(new Set(outcome.recordedServers)),
      warnings: outcome.warnings,
    };
  }
}

/** A target whose config file lives in the user's home folder. */
function isHomeTarget(target: McpInstallTarget): boolean {
  return classifyMcpScope({ origin: 'harness-config', target }) === 'global';
}
