/**
 * Which upstream MCP servers the gateway serves for a workspace (Hub 2).
 *
 * ## Sources, in precedence order
 *
 * 1. Connectors: OAuth connections, then Smithery (the session-time overrides
 *    `ChatSessionService` used to merge itself).
 * 2. Ptah's install intents, `McpIntentStore.listFor(root)`.
 * 3. `~/.claude.json` (user and project scope).
 * 4. `{root}/.mcp.json`.
 * 5. `{root}/.vscode/mcp.json`.
 *
 * P1 serves `http` and `sse` entries only; `stdio` entries are skipped.
 *
 * ## Linked worktrees (A6)
 *
 * `resolveHarnessWorkspaceRoot` stops at a linked worktree's own root (its
 * `.git` file is a marker) and `CapabilityResolverService.contextFor` uses that
 * root, so neither maps a worktree to its main checkout. The fallback is kept:
 * for sources 2-5 the main checkout's entries follow the worktree's own, and
 * main-checkout project files are approved against the main checkout.
 *
 * ## Dedup
 *
 * Entries with the same {@link normalizeMcpUrl} key are one server. The
 * authenticated entry wins (a connector, or an entry with an `Authorization`
 * header), then source order.
 *
 * ## Project approval
 *
 * A `.mcp.json` / `.vscode/mcp.json` entry is a repository file, so it is
 * served only when `approvedProjectMcpServers` names it, unless its name or
 * key matches a connector or an intent (the user created that server). An
 * unapproved entry is dropped before dedup, so it can never win a key and no
 * upstream connect is ever made for it.
 *
 * ## Env expansion
 *
 * `${VAR}` and `${VAR:-default}` in the URL and header values of intents and
 * file entries expand from the process env, as the Claude CLI does. An entry
 * that names an unset variable with no default is skipped.
 *
 * ## Cache
 *
 * The resolved set is cached 30 s per workspace root. {@link invalidate}
 * drops it; the gateway calls it on a 401, an intent or manifest change, and
 * a token-store change. Endpoints hold no bearer token: an OAuth endpoint asks
 * the OAuth service for a fresh token on every request.
 *
 * SECURITY: logs carry server names and origins only, never a URL or header.
 */

import type {
  ICapabilityResolver,
  McpHttpServerOverride,
  McpServerConfig,
} from '@ptah-extension/shared';
import { jsonToConfig } from '@ptah-extension/harness-sync';
import type { HarnessMcpIntent } from '@ptah-extension/harness-sync';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { worktreeMainRoot } from '../../cli-agents/git-main-checkout-root';
import { readClaudeUserMcpServers } from '../claude-user-mcp.reader';
import type { McpOAuthInstalledManifestStore } from '../oauth/mcp-oauth-installed-manifest';
import type { McpOAuthService } from '../oauth/mcp-oauth.service';
import { configAliasBase, connectorAliasBase } from './gateway-tool-naming';
import { normalizeMcpUrl } from './mcp-url-normalize';
import type { UpstreamEndpoint } from './upstream-client';

/** How long a resolved server set is reused. */
export const GATEWAY_SOURCES_CACHE_MS = 30_000;

/** Where a served entry was declared. */
export type GatewayServerOrigin =
  | 'oauth'
  | 'smithery'
  | 'intent'
  | 'claude-user'
  | 'project-mcp-json'
  | 'project-vscode-mcp-json';

/** One upstream server the gateway serves. */
export interface GatewayEndpoint extends UpstreamEndpoint {
  /**
   * Dedup key ({@link normalizeMcpUrl}). Internal only: it keeps the URL's
   * query, which can carry a secret. Show {@link serverName} instead.
   */
  readonly key: string;
  /** The declaring source's own key for the server. */
  readonly serverName: string;
  readonly origin: GatewayServerOrigin;
  /** Base alias for `assignGatewayAliases`. */
  readonly baseAlias: string;
  readonly authenticated: boolean;
}

/** The resolved set for one workspace root. */
export interface GatewayServerSet {
  /** Served servers, one per key, in source order. */
  readonly endpoints: readonly GatewayEndpoint[];
  /**
   * File-declared names (`~/.claude.json`, `.mcp.json`, `.vscode/mcp.json`)
   * the gateway serves or that lost dedup to a served server, sorted. The CLI
   * suppresses its own copy of each (Hub 9).
   */
  readonly servedFileServerNames: readonly string[];
}

export interface GatewaySourcesLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

/** The session-time override resolvers' common surface. */
export interface ConnectorOverrideSource {
  buildOverrides(): Promise<Record<string, McpHttpServerOverride>>;
}

export interface GatewayServerSourcesDeps {
  /** OAuth connectors. Absent when auth secrets are not registered. */
  readonly oauth?: {
    readonly manifest: Pick<McpOAuthInstalledManifestStore, 'list'>;
    readonly service: Pick<McpOAuthService, 'getFreshAccessToken' | 'refresh'>;
  };
  /** Smithery connectors (a `SmitheryOverrideResolver`). */
  readonly smithery?: ConnectorOverrideSource;
  /** Ptah's install intents (an `McpIntentStore`). */
  readonly intents?: { listFor(workspaceRoot: string): HarnessMcpIntent[] };
  /** Supplies `approvedProjectMcpServers` per root. */
  readonly capabilities: Pick<ICapabilityResolver, 'resolve'>;
  readonly logger?: GatewaySourcesLogger;
  /** Overridable for specs. */
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly readFile?: (path: string) => string | null;
  readonly mainCheckoutRoot?: (root: string) => string | null;
  readonly now?: () => number;
}

/** One declaration before dedup. */
interface Candidate {
  readonly key: string;
  readonly serverName: string;
  readonly origin: GatewayServerOrigin;
  readonly transport: 'http' | 'sse';
  readonly url: string;
  readonly baseAlias: string;
  readonly authenticated: boolean;
  readonly resolveHeaders: () => Promise<Readonly<Record<string, string>>>;
  readonly refreshAuth?: () => Promise<boolean>;
}

const FILE_ORIGINS: ReadonlySet<GatewayServerOrigin> = new Set([
  'claude-user',
  'project-mcp-json',
  'project-vscode-mcp-json',
]);

const PROJECT_FILES: ReadonlyArray<{
  readonly origin: GatewayServerOrigin;
  readonly segments: readonly string[];
  readonly rootKey: string;
}> = [
  {
    origin: 'project-mcp-json',
    segments: ['.mcp.json'],
    rootKey: 'mcpServers',
  },
  {
    origin: 'project-vscode-mcp-json',
    segments: ['.vscode', 'mcp.json'],
    rootKey: 'servers',
  },
];

export class GatewayServerSources {
  private readonly cache = new Map<
    string,
    { readonly at: number; readonly set: Promise<GatewayServerSet> }
  >();
  constructor(private readonly deps: GatewayServerSourcesDeps) {}

  /** The served set for `workspaceRoot`, from cache when fresh. */
  list(workspaceRoot: string): Promise<GatewayServerSet> {
    const now = this.now();
    const cached = this.cache.get(workspaceRoot);
    if (cached !== undefined && now - cached.at < GATEWAY_SOURCES_CACHE_MS) {
      return cached.set;
    }
    const set = this.resolve(workspaceRoot);
    this.cache.set(workspaceRoot, { at: now, set });
    // A failed resolve is not cached, so the next list tries again. The
    // rejection still reaches every caller of `set`.
    set.catch(() => {
      // degradation-audit: optional-capability - eviction only; the error is
      // propagated to the caller through the returned promise.
      if (this.cache.get(workspaceRoot)?.set === set) {
        this.cache.delete(workspaceRoot);
      }
    });
    return set;
  }

  /** Drop every cached set. */
  invalidate(): void {
    this.cache.clear();
  }

  private async resolve(workspaceRoot: string): Promise<GatewayServerSet> {
    const mainRoot = this.mainRootOf(workspaceRoot);
    const roots =
      mainRoot === null ? [workspaceRoot] : [workspaceRoot, mainRoot];

    const connectors = await this.connectorCandidates();
    const intents = roots.flatMap((root) => this.intentCandidates(root));
    const claudeUser = roots.flatMap((root) => this.claudeUserCandidates(root));

    const userKeys = new Set<string>();
    const userNames = new Set<string>();
    for (const candidate of [...connectors, ...intents]) {
      userKeys.add(candidate.key);
      userNames.add(candidate.serverName);
    }

    const approvedByRoot = new Map<string, ReadonlySet<string>>();
    for (const root of roots) {
      const set = await this.deps.capabilities.resolve(root);
      approvedByRoot.set(root, new Set(set.approvedProjectMcpServers));
    }

    const projectFiles: Candidate[] = [];
    for (const file of PROJECT_FILES) {
      for (const root of roots) {
        const approved = approvedByRoot.get(root) ?? new Set<string>();
        for (const candidate of this.projectFileCandidates(root, file)) {
          if (
            approved.has(candidate.serverName) ||
            userNames.has(candidate.serverName) ||
            userKeys.has(candidate.key)
          ) {
            projectFiles.push(candidate);
          } else {
            this.deps.logger?.debug(
              'MCP gateway skipped an unapproved project server',
              {
                serverName: candidate.serverName,
                origin: candidate.origin,
              },
            );
          }
        }
      }
    }

    return dedupe([...connectors, ...intents, ...claudeUser, ...projectFiles]);
  }

  private mainRootOf(workspaceRoot: string): string | null {
    if (workspaceRoot.trim() === '') return null;
    const main = (this.deps.mainCheckoutRoot ?? worktreeMainRoot)(
      workspaceRoot,
    );
    return main === null || main === workspaceRoot ? null : main;
  }

  // ---- connectors ----------------------------------------------------------

  private async connectorCandidates(): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const { oauth, smithery } = this.deps;
    if (oauth !== undefined) {
      for (const record of oauth.manifest.list()) {
        const key = normalizeMcpUrl(record.serverUrl);
        if (key === null) {
          this.skipped(record.serverKey, 'oauth', 'invalid URL');
          continue;
        }
        const { serverKey } = record;
        candidates.push({
          key,
          serverName: serverKey,
          origin: 'oauth',
          transport: 'http',
          url: record.serverUrl,
          baseAlias: connectorAliasBase(serverKey, record.serverUrl),
          authenticated: true,
          resolveHeaders: async (): Promise<Record<string, string>> => {
            const token = await oauth.service.getFreshAccessToken(serverKey);
            // No token: send none and let the upstream's 401 report the
            // connector as needing auth.
            return token === null ? {} : { Authorization: `Bearer ${token}` };
          },
          refreshAuth: async () =>
            (await oauth.service.refresh(serverKey)) !== null,
        });
      }
    }
    if (smithery !== undefined) {
      // The resolver never throws: a missing key or a failed record is
      // logged there and contributes nothing.
      const overrides = await smithery.buildOverrides();
      for (const [serverKey, override] of Object.entries(overrides)) {
        const key = normalizeMcpUrl(override.url);
        if (key === null) {
          this.skipped(serverKey, 'smithery', 'invalid URL');
          continue;
        }
        const headers = { ...(override.headers ?? {}) };
        candidates.push({
          key,
          serverName: serverKey,
          origin: 'smithery',
          transport: 'http',
          url: override.url,
          baseAlias: connectorAliasBase(serverKey, override.url),
          authenticated: true,
          resolveHeaders: () => Promise.resolve(headers),
        });
      }
    }
    return candidates;
  }

  // ---- config-declared -------------------------------------------------------

  private intentCandidates(root: string): Candidate[] {
    const { intents } = this.deps;
    if (intents === undefined) return [];
    let list: HarnessMcpIntent[];
    try {
      list = intents.listFor(root);
    } catch (error: unknown) {
      // degradation-audit: optional-capability - an unreadable intent file
      // drops that one source (logged); connectors and files still serve.
      this.deps.logger?.warn('MCP gateway could not read install intents', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
    return list.flatMap((intent) =>
      this.configCandidate(intent.serverKey, intent.config, 'intent'),
    );
  }

  private claudeUserCandidates(root: string): Candidate[] {
    const options =
      this.deps.homeDir === undefined ? {} : { homeDir: this.deps.homeDir };
    return readClaudeUserMcpServers(root, options).flatMap((entry) =>
      this.configCandidate(entry.serverKey, entry.config, 'claude-user'),
    );
  }

  private projectFileCandidates(
    root: string,
    file: (typeof PROJECT_FILES)[number],
  ): Candidate[] {
    if (root.trim() === '') return [];
    const text = (this.deps.readFile ?? readTextFile)(
      join(root, ...file.segments),
    );
    if (text === null) return [];
    const map = parseServerMap(text, file.rootKey);
    if (map === null) {
      this.deps.logger?.warn(
        'MCP gateway ignored a malformed MCP config file',
        {
          origin: file.origin,
        },
      );
      return [];
    }
    return Object.entries(map).flatMap(([name, raw]) =>
      this.configCandidate(name, jsonToConfig(raw), file.origin),
    );
  }

  private configCandidate(
    serverName: string,
    config: McpServerConfig,
    origin: GatewayServerOrigin,
  ): Candidate[] {
    if (config.type === 'stdio') return [];
    const env = this.deps.env ?? process.env;
    const url = expandEnv(config.url, env);
    const headers: Record<string, string> = {};
    const missing = new Set(url.missing);
    for (const [name, value] of Object.entries(config.headers ?? {})) {
      const expanded = expandEnv(value, env);
      expanded.missing.forEach((variable) => missing.add(variable));
      headers[name] = expanded.value;
    }
    if (missing.size > 0) {
      this.skipped(serverName, origin, 'unset environment variable', [
        ...missing,
      ]);
      return [];
    }
    const key = normalizeMcpUrl(url.value);
    if (key === null) {
      this.skipped(serverName, origin, 'invalid URL');
      return [];
    }
    return [
      {
        key,
        serverName,
        origin,
        transport: config.type,
        url: url.value,
        baseAlias: configAliasBase(serverName),
        authenticated: Object.entries(headers).some(
          ([name, value]) =>
            name.toLowerCase() === 'authorization' && value.trim() !== '',
        ),
        resolveHeaders: () => Promise.resolve(headers),
      },
    ];
  }

  private skipped(
    serverName: string,
    origin: GatewayServerOrigin,
    reason: string,
    variables?: readonly string[],
  ): void {
    this.deps.logger?.warn('MCP gateway skipped a server', {
      serverName,
      origin,
      reason,
      ...(variables === undefined ? {} : { variables }),
    });
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}

/** One endpoint per key: the first authenticated candidate, else the first. */
function dedupe(candidates: readonly Candidate[]): GatewayServerSet {
  const byKey = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const group = byKey.get(candidate.key) ?? [];
    group.push(candidate);
    byKey.set(candidate.key, group);
  }
  const endpoints: GatewayEndpoint[] = [];
  const fileNames = new Set<string>();
  for (const group of byKey.values()) {
    const winner = group.find((c) => c.authenticated) ?? group[0];
    endpoints.push(toEndpoint(winner));
    for (const candidate of group) {
      if (FILE_ORIGINS.has(candidate.origin))
        fileNames.add(candidate.serverName);
    }
  }
  return {
    endpoints,
    servedFileServerNames: [...fileNames].sort(),
  };
}

function toEndpoint(candidate: Candidate): GatewayEndpoint {
  return {
    key: candidate.key,
    serverName: candidate.serverName,
    origin: candidate.origin,
    baseAlias: candidate.baseAlias,
    authenticated: candidate.authenticated,
    transport: candidate.transport,
    url: candidate.url,
    resolveHeaders: candidate.resolveHeaders,
    ...(candidate.refreshAuth === undefined
      ? {}
      : { refreshAuth: candidate.refreshAuth }),
  };
}

const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * Expand `${VAR}` and `${VAR:-default}` from `env`. An unset (or empty, for
 * the `:-` form) variable takes its default; one with no default is reported
 * in `missing` and expands to the empty string.
 */
export function expandEnv(
  text: string,
  env: Readonly<Record<string, string | undefined>>,
): { value: string; missing: string[] } {
  const missing: string[] = [];
  const value = text.replace(
    ENV_REFERENCE,
    (_match, name: string, fallback: string | undefined) => {
      const set = env[name];
      if (fallback !== undefined) {
        return set === undefined || set === '' ? fallback : set;
      }
      if (set === undefined) {
        missing.push(name);
        return '';
      }
      return set;
    },
  );
  return { value, missing };
}

function parseServerMap(
  text: string,
  rootKey: string,
): Record<string, Record<string, unknown>> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // degradation-audit: optional-capability - a malformed repository file
    // drops that one source; the caller logs it and every other source serves.
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const map = parsed[rootKey];
  if (map === undefined) return {};
  if (!isPlainObject(map)) return null;
  const servers: Record<string, Record<string, unknown>> = {};
  for (const [name, value] of Object.entries(map)) {
    if (name !== '' && isPlainObject(value)) servers[name] = value;
  }
  return servers;
}

function readTextFile(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : null;
  } catch {
    // degradation-audit: optional-capability - an unreadable config file is
    // the same as an absent one for this source; other sources still serve.
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
