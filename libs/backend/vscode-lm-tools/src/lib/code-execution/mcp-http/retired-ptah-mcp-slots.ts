/**
 * Config files Ptah USED to declare its own server in and no longer does.
 *
 * Antigravity is the one retired target (TASK_2026_2297). `CodeExecutionMCP`
 * once kept a persistent `ptah` entry in `~/.gemini/config/mcp_config.json`
 * (read by the `agy` CLI) and in `{ws}/.agents/mcp_config.json` (read by the
 * Antigravity editor). An `agy` session Ptah spawns now receives the server
 * per session only: the ACP lane attaches `ptah_lane` in `session/new` and
 * writes no config file. An `agy` the user starts from a terminal gets no Ptah
 * tools. That is the accepted cost of keeping a long-lived credential out of a
 * home-global file.
 *
 * A slot that is no longer planned is removed by the reconcile only when it is
 * in the in-memory registration record, so an entry an EARLIER Ptah process
 * wrote would stay on disk forever. This module finds those files and takes
 * back the `ptah` key, and only when the entry has a shape an earlier Ptah
 * writer produced.
 *
 * ## Which `ptah` entries are Ptah's
 *
 * The key alone is not proof: a user may have authored a `ptah` server of
 * their own. An entry is removed only when it is a remote entry with no
 * `command` and no `headers`, and its URL is one of two families of shapes.
 *
 * The persistent writer's shapes (logged as `persistent`):
 *
 *  - `http://localhost:{port}`                               (bare, home slot)
 *  - `http://localhost:{port}/workspace/{enc}`               (workspace slot)
 *  - `http://localhost:{port}/auth/{43}`                     (home slot, M1)
 *  - `http://localhost:{port}/auth/{43}/workspace/{enc}`     (workspace, M1)
 *
 * The retired stream-json lane's shapes (logged as `lane`):
 *
 *  - `http://localhost:{port}/agent/{id}[/workspace/{enc}]`
 *  - `http://localhost:{port}/auth/{43}/agent/{id}[/workspace/{enc}]`
 *
 * No Ptah writer produces either family anymore. A lane entry is what a
 * stream-json lane left behind when it crashed before restoring the file; the
 * next stream-json spawn used to clean it up, and with that lane gone this
 * sweep is the only cleanup. The bare origin also covers what an older lane
 * restored after its run: that lane normalised the persistent entry it found
 * to its origin before putting it back.
 *
 * Accepted risk: an OLDER Ptah build running a stream-json lane at the moment
 * this sweep runs loses its live lane entry. That needs two Ptah builds on one
 * machine during the upgrade window, the lane loses only its Ptah MCP tools for
 * the rest of its run, and it restores its prior entry when it ends. The info
 * line names the removed shape (`lane` or `persistent`) so such a report can be
 * traced.
 *
 * ## Why the removal is not routed through the facet
 *
 * `IHarnessMcpFacet.remove` deletes the key unconditionally, and the check
 * would have to happen in a `readAll` outside the config-file lock. A lane
 * writing its entry between that read and the removal would then lose it. The
 * check and the delete run here inside one `withMcpConfigLock` section instead,
 * the same contract `CodeExecutionMCP.removeMcpJsonEntry` follows for
 * `.mcp.json`. Every other key in the file is written back untouched.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { HarnessTargetId } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  ANTIGRAVITY_URL_KEY,
  PTAH_SPAWN_MCP_KEY,
  createMcpFacet,
  isLinkedWorktreeRoot,
  withMcpConfigLock,
} from '@ptah-extension/harness-sync';

/** The target whose persistent slots are retired. */
export const RETIRED_PTAH_MCP_TARGET: HarnessTargetId = 'antigravity';

/** `{ws}/.agents/mcp_config.json`, the Antigravity editor's workspace file. */
const WORKSPACE_SEGMENTS = ['.agents', 'mcp_config.json'] as const;

/**
 * The URL shapes the persistent writer produced; see the file header. A path
 * segment holds no `?` or `#`: the writers percent-encoded every segment, so a
 * query or fragment marks a URL a user wrote.
 */
const PTAH_PERSISTENT_URL =
  /^http:\/\/localhost:\d+(?:\/auth\/[A-Za-z0-9_-]{43})?(?:\/workspace\/[^/?#]+)?\/?$/;

/**
 * The URL shapes the retired stream-json lane wrote; see the file header.
 *
 * Copied from the grammar of `ptahMcpServerUrl` (`cli-adapters/ptah-mcp-url.ts`)
 * and `laneMcpAuthUrl` (`cli-adapters/lane-mcp-credentials.ts`) in
 * `@ptah-extension/cli-agent-runtime`. Neither is on that library's barrel,
 * and this matcher must keep recognising the retired shape even if those
 * builders change, so the grammar is pinned here rather than imported. As in
 * {@link PTAH_PERSISTENT_URL}, no segment holds a `?` or `#`.
 */
const PTAH_LANE_URL =
  /^http:\/\/localhost:\d+(?:\/auth\/[A-Za-z0-9_-]{43})?\/agent\/[^/?#]+(?:\/workspace\/[^/?#]+)?\/?$/;

/** Which family of Ptah-written shapes a removed entry had. */
export type RetiredPtahEntryShape = 'lane' | 'persistent';

export interface RetiredPtahMcpDeps {
  /** Every open workspace folder, plus the active root; deduplicated here. */
  workspaceRoots: readonly string[];
  /** Answers whether the retired target's CLI is on this machine. */
  isInstalled: (target: HarnessTargetId) => Promise<boolean>;
  /** Overridable so specs never reach the developer's real home directory. */
  homeDir?: string;
}

/**
 * Every config file that may still hold a persistent Antigravity entry.
 *
 * Gated on detection, as the planning of the slots was: the slot was only ever
 * written where `agy` was detected, and an unconditional sweep would read the
 * home file on every machine. A detector that fails or says no plans nothing,
 * and the next reconcile asks again.
 */
export async function retiredPtahMcpConfigPaths(
  deps: RetiredPtahMcpDeps,
): Promise<string[]> {
  if (!(await deps.isInstalled(RETIRED_PTAH_MCP_TARGET))) return [];
  const home = createMcpFacet(
    RETIRED_PTAH_MCP_TARGET,
    deps.homeDir === undefined ? {} : { homeDir: deps.homeDir },
  ).configPath('');
  const roots = [...new Set(deps.workspaceRoots.filter((root) => root !== ''))];
  return [
    ...(home === null ? [] : [home]),
    ...roots.map((root) => path.join(root, ...WORKSPACE_SEGMENTS)),
  ];
}

/** True when `entry` is a `ptah` entry Ptah's persistent writer produced. */
export function isPtahPersistentEntry(entry: unknown): boolean {
  const url = remoteEntryUrl(entry);
  return url !== null && PTAH_PERSISTENT_URL.test(url);
}

/** True when `entry` is a `ptah` entry the retired stream-json lane wrote. */
export function isPtahLaneEntry(entry: unknown): boolean {
  const url = remoteEntryUrl(entry);
  return url !== null && PTAH_LANE_URL.test(url);
}

/**
 * The URL of a remote entry with no `command` and no `headers`, or null for
 * anything else. Both predicates share this guard, so a user's server with
 * headers is never taken for Ptah's, whichever URL it carries.
 */
function remoteEntryUrl(entry: unknown): string | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  if ('command' in record || 'headers' in record) return null;
  const url = record[ANTIGRAVITY_URL_KEY] ?? record['url'];
  return typeof url === 'string' ? url : null;
}

function retiredShapeOf(entry: unknown): RetiredPtahEntryShape | false {
  if (isPtahLaneEntry(entry)) return 'lane';
  if (isPtahPersistentEntry(entry)) return 'persistent';
  return false;
}

/**
 * Remove the `ptah` key from `configPath` when an earlier Ptah writer put it
 * there. Returns the shape that was removed, or `false` when the file did not
 * change.
 *
 * An absent file, a file with no `mcpServers` object and a `ptah` entry of any
 * other shape are left exactly as they are. A file that does not parse throws,
 * so the caller logs it and retries on the next reconcile; nothing is written
 * over a file this code could not read.
 */
export async function removeRetiredPtahEntry(
  configPath: string,
): Promise<RetiredPtahEntryShape | false> {
  // Checked before the lock as well as inside it: taking the lock creates a
  // lock file beside the config, which for an absent file would add a
  // directory to the user's workspace or home for nothing.
  if (!fs.existsSync(configPath)) return false;
  return withMcpConfigLock(configPath, async () => {
    if (!fs.existsSync(configPath)) return false;
    const content = fs.readFileSync(configPath, 'utf-8');
    if (content.trim() === '') return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Rethrown without the parser's message: it echoes the text it choked
      // on, and an MCP config holds secrets in `env` and `headers`.
      throw new Error(`${configPath} is not valid JSON; left unchanged`);
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return false;
    }
    const config = parsed as Record<string, unknown>;
    const servers = config['mcpServers'];
    if (
      typeof servers !== 'object' ||
      servers === null ||
      Array.isArray(servers)
    ) {
      return false;
    }
    const map = servers as Record<string, unknown>;
    const shape = retiredShapeOf(map[PTAH_SPAWN_MCP_KEY]);
    if (shape === false) return false;

    delete map[PTAH_SPAWN_MCP_KEY];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return shape;
  });
}

export interface RetiredPtahMcpSweepDeps extends RetiredPtahMcpDeps {
  /** Drops the persistent credential recorded for a config file. */
  revokeCredential: (configPath: string) => Promise<unknown>;
  logger: Pick<Logger, 'info' | 'warn'>;
}

/**
 * Remove every retired Ptah-owned entry and revoke its credential. Never
 * rejects: each failure is logged and the next reconcile retries it.
 *
 * The credential is revoked before the file is read, so the token stops
 * authorizing in memory even when the file cannot be changed this pass.
 *
 * The workspace file of a root that is a linked git worktree is never written
 * (#1469): it is usually a tracked file of the shared repository, and a rewrite
 * there would put unrelated config churn on the task branch. Its credential is
 * still revoked, which touches no file. The main checkout and the home file are
 * swept as before.
 */
export async function sweepRetiredPtahMcpEntries(
  deps: RetiredPtahMcpSweepDeps,
): Promise<void> {
  let configPaths: string[];
  try {
    configPaths = await retiredPtahMcpConfigPaths(deps);
  } catch (error: unknown) {
    // degradation-audit: reported - logged at warn; the next reconcile asks
    // the detector again and the planned slots are unaffected.
    deps.logger.warn(
      `[CodeExecutionMCP] Could not resolve retired MCP config files: ${messageOf(error)}`,
      'CodeExecutionMCP',
    );
    return;
  }
  // Nothing to sweep (agy not detected): touch no disk at all, as before.
  if (configPaths.length === 0) return;
  const linkedWorkspaceFiles = await linkedWorktreeWorkspaceFiles(
    deps.workspaceRoots,
  );
  for (const configPath of configPaths) {
    try {
      await deps.revokeCredential(configPath);
      if (linkedWorkspaceFiles.has(configPath)) continue;
      const removed = await removeRetiredPtahEntry(configPath);
      if (removed !== false) {
        deps.logger.info(
          `[CodeExecutionMCP] Removed retired ptah entry from ${configPath} (${removed})`,
          'CodeExecutionMCP',
        );
      }
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn; the entry stays on disk
      // and the next full reconcile retries the removal.
      deps.logger.warn(
        `[CodeExecutionMCP] Could not remove retired ptah entry from ${configPath}: ${messageOf(error)}`,
        'CodeExecutionMCP',
      );
    }
  }
}

/**
 * The workspace config path of every root that is a linked git worktree.
 * `isLinkedWorktreeRoot` never rejects; an error reads as "not linked", which
 * keeps the main-checkout behaviour.
 */
async function linkedWorktreeWorkspaceFiles(
  roots: readonly string[],
): Promise<Set<string>> {
  const unique = [...new Set(roots.filter((root) => root !== ''))];
  const linked = await Promise.all(
    unique.map(async (root) =>
      (await isLinkedWorktreeRoot(root)) ? root : null,
    ),
  );
  return new Set(
    linked
      .filter((root): root is string => root !== null)
      .map((root) => path.join(root, ...WORKSPACE_SEGMENTS)),
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
