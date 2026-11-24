/**
 * Which upstream MCP servers the gateway serves for a workspace (Hub 2).
 *
 * ## Sources, in precedence order
 *
 * 1. Connectors: OAuth connections, then Smithery (the session-time overrides
 *    `ChatSessionService` used to merge itself).
 * 2. Ptah's install intents, `McpIntentStore.listFor(root)`.
 * 3. `~/.claude.json` (user and project scope).
 * 4. Enabled Claude Code plugins' MCP declarations (D-U4), named
 *    `plugin:<plugin>:<server>` as the Claude CLI names them.
 * 5. `{root}/.mcp.json`.
 * 6. `{root}/.vscode/mcp.json`.
 *
 * `http`, `sse` and (P2) `stdio` entries are served. A stdio entry becomes a
 * Ptah-run process per workspace root (`stdio-server-host.ts`), keyed by the
 * root, the resolved command, the args and a hash of the expanded env.
 *
 * ## Plugins
 *
 * A plugin is enabled by `enabledPlugins` in `<claudeConfigDir>/settings.json`
 * or `{root}/.claude/settings.local.json` (local wins). The repository's own
 * `{root}/.claude/settings.json` can only turn a plugin OFF: a repository file
 * grants nothing, as for project MCP entries. Its install root comes from
 * `<claudeConfigDir>/plugins/installed_plugins.json` (an install scoped to
 * another project is skipped). Its servers come from the root's `.mcp.json`
 * and the `mcpServers` of `.claude-plugin/plugin.json` (a map, or paths
 * inside the plugin root). `${CLAUDE_PLUGIN_ROOT}` expands to the install
 * root. The user installed and enabled the plugin, so its entries are
 * approved like `~/.claude.json` entries.
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
 * Remote entries with the same {@link normalizeMcpUrl} key are one server, and
 * stdio entries with the same root, command, args and env are one server. The
 * authenticated entry wins (a connector, or an entry with an `Authorization`
 * header), then source order.
 *
 * ## Project approval
 *
 * A `.mcp.json` / `.vscode/mcp.json` entry is a repository file, so it is
 * served only when `approvedProjectMcpServers` names it. A repository picks
 * its own entry names, so a name equal to a connector's or an intent's grants
 * nothing. An unapproved entry whose key matches a connector or an intent is
 * kept only as a merge-only member of that server's dedup group: it never
 * wins the key, so the user's own copy (and its URL and headers) is the one
 * served, and the entry's name is still reported for CLI suppression. Every
 * other unapproved entry is dropped before dedup, so no upstream connect is
 * ever made for it, and an unapproved stdio entry is never spawned.
 *
 * ## Env expansion
 *
 * `${VAR}` and `${VAR:-default}` in the URL and header values (stdio: the
 * command, args and env values) of intents, `~/.claude.json` entries, plugin
 * entries and APPROVED project entries expand from the
 * process env, as the Claude CLI does: approval is the user's consent. An
 * unapproved project entry is never expanded. One that references a variable
 * is dropped as unapproved, so a repository cannot pull a secret such as
 * `${GITHUB_TOKEN}` out of the Ptah process even to compute a dedup key. An
 * entry that names an unset variable with no default is skipped.
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
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join, relative, resolve as resolvePath } from 'path';
import { worktreeMainRoot } from '../../cli-agents/git-main-checkout-root';
import { readClaudeUserMcpServers } from '../claude-user-mcp.reader';
import type { McpOAuthInstalledManifestStore } from '../oauth/mcp-oauth-installed-manifest';
import type { McpOAuthService } from '../oauth/mcp-oauth.service';
import { configAliasBase, connectorAliasBase } from './gateway-tool-naming';
import { normalizeMcpUrl } from './mcp-url-normalize';
import type { StdioServerSpec } from './stdio-server-host';
import type { UpstreamEndpoint } from './upstream-client';

/** How long a resolved server set is reused. */
export const GATEWAY_SOURCES_CACHE_MS = 30_000;

/** Where a served entry was declared. */
export type GatewayServerOrigin =
  | 'oauth'
  | 'smithery'
  | 'intent'
  | 'claude-user'
  | 'claude-plugin'
  | 'project-mcp-json'
  | 'project-vscode-mcp-json';

/** What every served server carries, whatever its transport. */
export interface GatewayEndpointIdentity {
  /**
   * Dedup key: {@link normalizeMcpUrl} for a remote server, `stdio:` and a
   * hash for a stdio one. Internal only: a URL key keeps the query, which can
   * carry a secret. Show {@link serverName} instead.
   */
  readonly key: string;
  /** The declaring source's own key for the server. */
  readonly serverName: string;
  readonly origin: GatewayServerOrigin;
  /** Base alias for `assignGatewayAliases`. */
  readonly baseAlias: string;
  readonly authenticated: boolean;
}

/** A remote (`http`/`sse`) server. */
export interface GatewayRemoteEndpoint
  extends GatewayEndpointIdentity, UpstreamEndpoint {}

/** A Ptah-run stdio server; `cwd` is the workspace root it serves. */
export interface GatewayStdioEndpoint
  extends GatewayEndpointIdentity, StdioServerSpec {
  readonly transport: 'stdio';
}

/** One upstream server the gateway serves. */
export type GatewayEndpoint = GatewayRemoteEndpoint | GatewayStdioEndpoint;

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
  /** The Claude account config dir; `~/.claude` by default. */
  readonly claudeConfigDir?: string;
  readonly now?: () => number;
}

/**
 * One declaration before dedup. `mergeOnly` marks an unapproved project entry
 * kept only because its key matches a user-created server: it joins that
 * dedup group but never wins it.
 */
type Candidate = GatewayEndpoint & { mergeOnly?: true };

type Env = Readonly<Record<string, string | undefined>>;

const FILE_ORIGINS: ReadonlySet<GatewayServerOrigin> = new Set([
  'claude-user',
  'claude-plugin',
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
    const intents = roots.flatMap((root) =>
      this.intentCandidates(root, workspaceRoot),
    );
    const claudeUser = roots.flatMap((root) =>
      this.claudeUserCandidates(root, workspaceRoot),
    );
    const plugins = this.pluginCandidates(workspaceRoot);

    const userKeys = new Set<string>(
      [...connectors, ...intents].map((candidate) => candidate.key),
    );

    const approvedByRoot = new Map<string, ReadonlySet<string>>();
    for (const root of roots) {
      const set = await this.deps.capabilities.resolve(root);
      approvedByRoot.set(root, new Set(set.approvedProjectMcpServers));
    }

    const projectFiles: Candidate[] = [];
    for (const file of PROJECT_FILES) {
      for (const root of roots) {
        const approved = approvedByRoot.get(root) ?? new Set<string>();
        for (const candidate of this.projectFileCandidates(
          root,
          file,
          approved,
          workspaceRoot,
        )) {
          if (approved.has(candidate.serverName)) {
            projectFiles.push(candidate);
          } else if (userKeys.has(candidate.key)) {
            projectFiles.push({ ...candidate, mergeOnly: true });
          } else {
            this.skippedUnapproved(candidate.serverName, candidate.origin);
          }
        }
      }
    }

    return dedupe([
      ...connectors,
      ...intents,
      ...claudeUser,
      ...plugins,
      ...projectFiles,
    ]);
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

  private intentCandidates(root: string, cwd: string): Candidate[] {
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
      this.configCandidate(intent.serverKey, intent.config, 'intent', cwd),
    );
  }

  private claudeUserCandidates(root: string, cwd: string): Candidate[] {
    const options =
      this.deps.homeDir === undefined ? {} : { homeDir: this.deps.homeDir };
    return readClaudeUserMcpServers(root, options).flatMap((entry) =>
      this.configCandidate(entry.serverKey, entry.config, 'claude-user', cwd),
    );
  }

  // ---- Claude Code plugins (D-U4) --------------------------------------------

  private pluginCandidates(workspaceRoot: string): Candidate[] {
    if (workspaceRoot.trim() === '') return [];
    const read = this.deps.readFile ?? readTextFile;
    const configDir =
      this.deps.claudeConfigDir ??
      join(this.deps.homeDir ?? homedir(), '.claude');
    const enabled = this.enabledPlugins(read, configDir, workspaceRoot);
    if (enabled.size === 0) return [];
    const registry = read(join(configDir, 'plugins', 'installed_plugins.json'));
    if (registry === null) return [];
    const installs = installedPluginRoots(registry, enabled, workspaceRoot);
    if (installs === null) {
      this.malformed('claude-plugin');
      return [];
    }
    const env = this.deps.env ?? process.env;
    return installs.flatMap(({ pluginId, root }) => {
      const pluginName = pluginId.split('@')[0] || pluginId;
      const pluginEnv: Env = { ...env, CLAUDE_PLUGIN_ROOT: root };
      return Object.entries(pluginServerMaps(read, root)).flatMap(
        ([name, raw]) =>
          this.configCandidate(
            `plugin:${pluginName}:${name}`,
            jsonToConfig(raw),
            'claude-plugin',
            workspaceRoot,
            pluginEnv,
            configAliasBase(name),
          ),
      );
    });
  }

  /**
   * Plugin ids enabled for `root`: user settings, then the repository's
   * settings (which can only turn a plugin off), then local settings.
   */
  private enabledPlugins(
    read: (path: string) => string | null,
    configDir: string,
    root: string,
  ): ReadonlySet<string> {
    const enabled = new Map<string, boolean>();
    const tiers: ReadonlyArray<{ path: string; canEnable: boolean }> = [
      { path: join(configDir, 'settings.json'), canEnable: true },
      { path: join(root, '.claude', 'settings.json'), canEnable: false },
      { path: join(root, '.claude', 'settings.local.json'), canEnable: true },
    ];
    for (const tier of tiers) {
      const text = read(tier.path);
      if (text === null) continue;
      const map = parseEnabledPlugins(text);
      if (map === null) {
        this.malformed('claude-plugin');
        continue;
      }
      for (const [id, value] of Object.entries(map)) {
        if (value && !tier.canEnable) continue;
        enabled.set(id, value);
      }
    }
    return new Set([...enabled].filter(([, value]) => value).map(([id]) => id));
  }

  /**
   * Candidates of one project file. Approved entries expand from the env. An
   * unapproved entry is never expanded: one that references a variable is
   * dropped here as unapproved, and the rest are built with no env.
   */
  private projectFileCandidates(
    root: string,
    file: (typeof PROJECT_FILES)[number],
    approved: ReadonlySet<string>,
    cwd: string,
  ): Candidate[] {
    if (root.trim() === '') return [];
    const text = (this.deps.readFile ?? readTextFile)(
      join(root, ...file.segments),
    );
    if (text === null) return [];
    const map = parseServerMap(text, file.rootKey);
    if (map === null) {
      this.malformed(file.origin);
      return [];
    }
    return Object.entries(map).flatMap(([name, raw]) => {
      const config = jsonToConfig(raw);
      if (approved.has(name)) {
        return this.configCandidate(name, config, file.origin, cwd);
      }
      if (referencesEnv(config)) {
        this.skippedUnapproved(name, file.origin);
        return [];
      }
      // No variable to expand: the empty env changes nothing. The caller
      // drops it or keeps it merge-only; either way it is never spawned.
      return this.configCandidate(name, config, file.origin, cwd, {});
    });
  }

  private configCandidate(
    serverName: string,
    config: McpServerConfig,
    origin: GatewayServerOrigin,
    cwd: string,
    env: Env = this.deps.env ?? process.env,
    baseAlias: string = configAliasBase(serverName),
  ): Candidate[] {
    if (config.type === 'stdio') {
      return this.stdioCandidate(
        serverName,
        config,
        origin,
        cwd,
        env,
        baseAlias,
      );
    }
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
        baseAlias,
        authenticated: Object.entries(headers).some(
          ([name, value]) =>
            name.toLowerCase() === 'authorization' && value.trim() !== '',
        ),
        resolveHeaders: () => Promise.resolve(headers),
      },
    ];
  }

  private stdioCandidate(
    serverName: string,
    config: Extract<McpServerConfig, { type: 'stdio' }>,
    origin: GatewayServerOrigin,
    cwd: string,
    env: Env,
    baseAlias: string,
  ): Candidate[] {
    if (cwd.trim() === '') return [];
    const missing = new Set<string>();
    const expand = (text: string): string => {
      const expanded = expandEnv(text, env);
      expanded.missing.forEach((variable) => missing.add(variable));
      return expanded.value;
    };
    const command = expand(config.command).trim();
    const args = (config.args ?? []).map(expand);
    const childEnv: Record<string, string> = {};
    for (const [name, value] of Object.entries(config.env ?? {})) {
      childEnv[name] = expand(value);
    }
    if (missing.size > 0) {
      this.skipped(serverName, origin, 'unset environment variable', [
        ...missing,
      ]);
      return [];
    }
    if (command === '') {
      this.skipped(serverName, origin, 'no command');
      return [];
    }
    const resolved = resolveCommand(command, cwd);
    return [
      {
        key: stdioKey(cwd, resolved, args, childEnv),
        serverName,
        origin,
        transport: 'stdio',
        command: resolved,
        args,
        env: childEnv,
        cwd,
        baseAlias,
        authenticated: false,
      },
    ];
  }

  private malformed(origin: GatewayServerOrigin): void {
    this.deps.logger?.warn('MCP gateway ignored a malformed MCP config file', {
      origin,
    });
  }

  private skippedUnapproved(
    serverName: string,
    origin: GatewayServerOrigin,
  ): void {
    this.deps.logger?.debug(
      'MCP gateway skipped an unapproved project server',
      {
        serverName,
        origin,
      },
    );
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

/**
 * One endpoint per key: the first authenticated candidate, else the first.
 * A merge-only candidate never wins; a group of merge-only candidates alone
 * serves nothing.
 */
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
    const eligible = group.filter((c) => c.mergeOnly !== true);
    const winner = eligible.find((c) => c.authenticated) ?? eligible[0];
    if (winner === undefined) continue;
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
  const endpoint: Candidate = { ...candidate };
  delete endpoint.mergeOnly;
  return endpoint;
}

/** `stdio:` and a hash of the root, the command, the args and the env. */
function stdioKey(
  cwd: string,
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): string {
  const envEntries = Object.entries(env).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const envHash = sha256Hex(JSON.stringify(envEntries));
  return `stdio:${sha256Hex(JSON.stringify([cwd, command, args, envHash]))}`;
}

/** A relative path (`./bin/server`) resolves against the root; a bare name stays. */
function resolveCommand(command: string, cwd: string): string {
  if (isAbsolute(command) || !/[\\/]/.test(command)) return command;
  return resolvePath(cwd, command);
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/** Whether an entry's URL, headers, command, args or env name a variable. */
function referencesEnv(config: McpServerConfig): boolean {
  const texts =
    config.type === 'stdio'
      ? [
          config.command,
          ...(config.args ?? []),
          ...Object.values(config.env ?? {}),
        ]
      : [config.url, ...Object.values(config.headers ?? {})];
  return texts.some((text) => new RegExp(ENV_REFERENCE.source).test(text));
}

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

/** `enabledPlugins` of one settings file; `{}` when absent, null if malformed. */
function parseEnabledPlugins(text: string): Record<string, boolean> | null {
  const parsed = parseJsonObject(text);
  if (parsed === null) return null;
  const map = parsed['enabledPlugins'];
  if (map === undefined) return {};
  if (!isPlainObject(map)) return null;
  const out: Record<string, boolean> = {};
  for (const [id, value] of Object.entries(map)) {
    if (typeof value === 'boolean') out[id] = value;
  }
  return out;
}

/**
 * Install roots of the enabled plugins in an `installed_plugins.json` (v2:
 * `plugins: { id: [{ installPath }] }`, v1: `plugins: { id: { installPath } }`).
 * An install scoped to another project (`projectPath`) is skipped. Null when
 * the file is malformed.
 */
function installedPluginRoots(
  text: string,
  enabled: ReadonlySet<string>,
  workspaceRoot: string,
): Array<{ pluginId: string; root: string }> | null {
  const parsed = parseJsonObject(text);
  const plugins = parsed?.['plugins'];
  if (!isPlainObject(plugins)) return null;
  const installs: Array<{ pluginId: string; root: string }> = [];
  for (const [pluginId, entry] of Object.entries(plugins)) {
    if (!enabled.has(pluginId)) continue;
    const seen = new Set<string>();
    for (const install of Array.isArray(entry) ? entry : [entry]) {
      if (!isPlainObject(install)) continue;
      const root = install['installPath'];
      if (typeof root !== 'string' || root === '' || seen.has(root)) continue;
      const projectPath = install['projectPath'];
      if (
        typeof projectPath === 'string' &&
        !samePath(projectPath, workspaceRoot)
      ) {
        continue;
      }
      seen.add(root);
      installs.push({ pluginId, root });
    }
  }
  return installs;
}

/**
 * A plugin's MCP declarations: `{root}/.mcp.json` (an `mcpServers` map or a
 * bare map), then `mcpServers` of `.claude-plugin/plugin.json` (a map, or one
 * or more JSON files inside the plugin root). The first name wins.
 */
function pluginServerMaps(
  read: (path: string) => string | null,
  root: string,
): Record<string, Record<string, unknown>> {
  const servers: Record<string, Record<string, unknown>> = {};
  const addMap = (map: Record<string, unknown>): void => {
    for (const [name, value] of Object.entries(map)) {
      if (name === '' || name in servers || !isPlainObject(value)) continue;
      if (!('command' in value) && !('url' in value)) continue;
      servers[name] = value;
    }
  };
  const addFile = (path: string): void => {
    const text = read(path);
    const parsed = text === null ? null : parseJsonObject(text);
    if (parsed === null) return;
    const nested = parsed['mcpServers'];
    addMap(isPlainObject(nested) ? nested : parsed);
  };
  addFile(join(root, '.mcp.json'));
  const manifestText = read(join(root, '.claude-plugin', 'plugin.json'));
  const manifest = manifestText === null ? null : parseJsonObject(manifestText);
  const declared = manifest?.['mcpServers'];
  if (isPlainObject(declared)) addMap(declared);
  const paths =
    typeof declared === 'string'
      ? [declared]
      : Array.isArray(declared)
        ? declared.filter((p): p is string => typeof p === 'string')
        : [];
  for (const rel of paths) {
    const path = resolvePath(root, rel);
    const inside = relative(root, path);
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
      continue;
    }
    addFile(path);
  }
  return servers;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    // degradation-audit: optional-capability - a malformed plugin or settings
    // file drops that one source; the caller logs it and every other serves.
    return null;
  }
}

function samePath(a: string, b: string): boolean {
  const left = resolvePath(a);
  const right = resolvePath(b);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
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
