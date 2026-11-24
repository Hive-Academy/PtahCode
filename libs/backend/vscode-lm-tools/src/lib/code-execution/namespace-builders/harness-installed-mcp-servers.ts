/**
 * `ptah.harness.listInstalledMcpServers()` — the MCP servers this workspace
 * already has.
 *
 * Two kinds of source, each row naming where it came from in `source`:
 *
 * - The project files `.vscode/mcp.json` and `.mcp.json` in the workspace
 *   root (`source` is the file's relative path).
 * - The servers installed through Ptah, recorded as intents in
 *   `~/.ptah/mcp-installed.json` and served by the MCP gateway (TASK_2026_979).
 *   No config file carries them, so a server installed through
 *   `ptah_harness_install_mcp_server` would otherwise be missing here. They
 *   come from the installer's `listInstalled` (the same rows as the Installed
 *   tab), one row per server and scope with its recorded `targets`:
 *   `ptah-intent (global)`, `ptah-intent (workspace)`, or, in a linked git
 *   worktree, `ptah-intent (main checkout)`.
 */

import * as path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import type {
  InstalledMcpServer,
  McpInstallTarget,
} from '@ptah-extension/shared';

/** One listed server. `targets` is present for Ptah-installed rows only. */
export interface HarnessInstalledMcpServer {
  name: string;
  config: Record<string, unknown>;
  source: string;
  targets?: McpInstallTarget[];
}

/** The slice of the MCP installer this list reads. */
export interface HarnessInstalledMcpSource {
  listInstalled(workspaceRoot?: string): Promise<InstalledMcpServer[]>;
}

export interface HarnessInstalledMcpDeps {
  readonly workspaceRoot: string;
  /** Absent on a host with no installer: only the project files are read. */
  readonly installer?: HarnessInstalledMcpSource;
  readonly logger: { warn(message: string): void };
}

const PROJECT_FILES: ReadonlyArray<{
  readonly source: string;
  readonly segments: readonly string[];
}> = [
  { source: '.vscode/mcp.json', segments: ['.vscode', 'mcp.json'] },
  { source: '.mcp.json', segments: ['.mcp.json'] },
];

export async function listHarnessInstalledMcpServers(
  deps: HarnessInstalledMcpDeps,
): Promise<HarnessInstalledMcpServer[]> {
  const servers: HarnessInstalledMcpServer[] = [];
  for (const file of PROJECT_FILES) {
    servers.push(...(await readProjectFile(deps, file)));
  }
  servers.push(...(await readIntentRows(deps)));
  return servers;
}

async function readProjectFile(
  deps: HarnessInstalledMcpDeps,
  file: (typeof PROJECT_FILES)[number],
): Promise<HarnessInstalledMcpServer[]> {
  const filePath = path.join(deps.workspaceRoot, ...file.segments);
  try {
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as Record<
      string,
      unknown
    >;
    const mcpServers =
      (parsed['servers'] as Record<string, unknown>) ??
      (parsed['mcpServers'] as Record<string, unknown>) ??
      {};
    return Object.entries(mcpServers).map(([name, config]) => ({
      name,
      config:
        typeof config === 'object' && config !== null
          ? (config as Record<string, unknown>)
          : {},
      source: file.source,
    }));
  } catch (err: unknown) {
    // degradation-audit: reported - an unreadable or malformed project file
    // is logged and contributes no rows; the other sources still list.
    deps.logger.warn(
      `[Harness] Failed to read ${file.source}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

async function readIntentRows(
  deps: HarnessInstalledMcpDeps,
): Promise<HarnessInstalledMcpServer[]> {
  if (deps.installer === undefined) return [];
  let rows: InstalledMcpServer[];
  try {
    rows = await deps.installer.listInstalled(deps.workspaceRoot);
  } catch (err: unknown) {
    // degradation-audit: reported - the Ptah install records could not be
    // listed (logged); the project-file rows are still returned.
    deps.logger.warn(
      `[Harness] Failed to list Ptah-installed MCP servers: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }

  // One row per recorded target arrives; group them per server and source.
  const grouped = new Map<string, HarnessInstalledMcpServer>();
  for (const row of rows) {
    if (row.origin !== 'ptah-intent') continue;
    const source = intentSource(row);
    const id = JSON.stringify([row.serverKey, source]);
    const existing = grouped.get(id);
    if (existing === undefined) {
      grouped.set(id, {
        name: row.serverKey,
        config: { ...row.config },
        source,
        targets: row.target === undefined ? [] : [row.target],
      });
    } else if (
      row.target !== undefined &&
      !existing.targets?.includes(row.target)
    ) {
      existing.targets?.push(row.target);
    }
  }
  return [...grouped.values()];
}

/**
 * Where an intent row was recorded. A workspace row this workspace cannot
 * remove is the main checkout's, listed in a linked worktree
 * (`McpInstallService.listInstalled`).
 */
function intentSource(row: InstalledMcpServer): string {
  if (row.scope === 'global') return 'ptah-intent (global)';
  return row.removal === 'ptah-managed'
    ? 'ptah-intent (workspace)'
    : 'ptah-intent (main checkout)';
}
