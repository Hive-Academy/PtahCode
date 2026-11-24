/**
 * MCP Install Service — the public install surface. It records intent only.
 *
 * The RPC surface is unchanged: `install`, `makeGlobal`, `uninstall`,
 * `listInstalled` and `getConfigPath` keep their signatures for the
 * marketplace, `ptah mcp`, the harness apply path and the
 * `ptah_harness_install_mcp_server` tool.
 *
 * ## Install records intent, and the gateway serves it
 *
 * An install, a make-global and an uninstall change the intent store
 * (`~/.ptah/mcp-installed.json`) and nothing else. Ptah no longer writes,
 * updates or deletes a native provider MCP config file (decision row 10,
 * TASK_2026_979): the MCP gateway reads the same store through
 * `GatewayServerSources` (`McpIntentStore.listFor(root)`, source 2 in
 * `gateway/server-sources.ts`) and serves every recorded server to every
 * session and CLI lane through Ptah's own `ptah` MCP server. A server
 * recorded here is therefore served on the gateway's next resolve of the
 * workspace, and a forgotten one stops being served.
 *
 * Consequences worth stating:
 *
 * - A successful result names no config file: `configPath` is empty, because
 *   no file was written. The targets are still recorded on the intent.
 * - A global install with no folder open is a success, not a deferral: the
 *   gateway serves a global intent in every workspace. A workspace install
 *   with no root still throws `McpIntentScopeError` before anything is saved.
 * - A linked git worktree needs no special case for writes: nothing is
 *   written there either way. The gateway serves a worktree's intents with
 *   its main checkout's (#1469), so `listInstalled` lists the main checkout's
 *   workspace intents too, resolved by the same `worktreeMainRoot`. Those
 *   rows are removed from the main checkout, not from the worktree.
 * - A key Ptah never recorded is the user's own entry in a file Ptah does not
 *   edit. Uninstalling it reports that, and the Installed tab gives the
 *   removal instruction instead of a delete button (decision D2).
 *
 * ## `listInstalled` reads FIVE sources, not one
 *
 * The intent store (servers installed through Ptah, which no file carries
 * since decision row 10), the harness MCP config files (read-only, through the
 * facets' `inspect`), `~/.claude.json`, the Smithery manifest and the OAuth
 * manifest. Every row carries its {@link McpServerOrigin}, a display label,
 * and the {@link McpRemovalKind} that says how — or whether — it can be
 * removed. Rows are deduplicated by (`serverKey`, `origin`, `configPath`,
 * `scope`, `target`) and NOT by key alone: the same key legitimately lives in
 * several config files, and each of those is its own row.
 *
 * claude.ai ACCOUNT connectors (Gmail, Calendar, Drive, Canva) are deliberately
 * absent. They exist nowhere on disk; the frontend derives those rows from live
 * session status, and this service stops at disk and manifest stores.
 */

import {
  createAllMcpFacets,
  McpIntentPersistError,
  McpIntentStore,
  type HarnessReconcilerService,
  type IHarnessMcpFacet,
  type McpSourceStatus,
} from '@ptah-extension/harness-sync';
import {
  classifyMcpScope,
  MCP_INSTALL_RESULT_COPY,
  type CapabilityScope,
  type InstalledMcpServer,
  type McpInstallResult,
  type McpInstallResultCode,
  type McpInstallTarget,
  type McpOAuthConnectedRecord,
  type McpServerConfig,
  type McpServerOrigin,
  type SmitheryInstalledRecord,
} from '@ptah-extension/shared';
import { worktreeMainRoot } from '../cli-agents/git-main-checkout-root';
import {
  readClaudeUserMcpServers,
  type ClaudeUserMcpScope,
} from './claude-user-mcp.reader';
import {
  buildSmitheryNamespaceUrl,
  SMITHERY_DEFAULT_CONNECTION_HOST,
} from './smithery-wire.constants';

/** Every target the install surface offers, for a bare `uninstall` sweep. */
const ALL_TARGETS: McpInstallTarget[] = [
  'vscode',
  'claude',
  'cursor',
  'copilot',
  'codex',
  'antigravity',
];

/** Display label per origin. One place, so the four readers cannot disagree. */
const ORIGIN_LABELS: Record<McpServerOrigin, string> = {
  'harness-config': 'Config file',
  'ptah-intent': 'Ptah',
  'claude-user': 'Claude CLI',
  smithery: 'Smithery',
  oauth: 'OAuth',
  'claude-connector': 'Claude account',
};

/**
 * The Smithery half of `listInstalled`, narrowed to the one method it needs.
 *
 * Structural rather than a class import so the RPC handler passes the store it
 * ALREADY owns — `SmitheryInstalledManifestStore` re-reads its file per call,
 * and a second instance built here would be a parallel reader of the same
 * manifest with its own staleness.
 */
export interface SmitheryInstalledReader {
  /** Absolute path of the manifest, reported as the row's `configPath`. */
  readonly filePath: string;
  list(): SmitheryInstalledRecord[];
}

/** The OAuth half of `listInstalled`. See {@link SmitheryInstalledReader}. */
export interface McpOAuthInstalledReader {
  readonly filePath: string;
  list(): McpOAuthConnectedRecord[];
}

export interface McpInstallServiceOptions {
  /** Overridable so a spec never reaches the developer's real home. */
  homeDir?: string;
  /** The handler's own Smithery manifest store. Omitted = no Smithery rows. */
  smithery?: SmitheryInstalledReader;
  /** The handler's own OAuth manifest store. Omitted = no OAuth rows. */
  oauth?: McpOAuthInstalledReader;
  /**
   * Where the raw cause of a failed target goes (the host logger). Results
   * carry only fixed copy per {@link McpInstallResultCode}; omitted = the
   * cause is dropped.
   */
  warn?: (message: string, detail?: unknown) => void;
  /**
   * Called after an install, a make-global or an uninstall saved its intent
   * change. The host passes `refreshBoundMcpGateway`, so a running session
   * hears the change at once instead of at the gateway's next poll.
   */
  onIntentsChanged?: () => void;
  /**
   * The main checkout of a linked git worktree, or `null`. Defaults to the
   * resolver `GatewayServerSources` uses, so the Installed tab lists the same
   * workspace intents the gateway serves. Overridable for specs.
   */
  mainCheckoutRoot?: (root: string) => string | null;
}

/** The detail logged for a caught cause: never sent to the UI. */
function causeDetail(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : String(error) };
}

/** How reading one harness MCP config file went. */
export interface McpDeclarationSourceStatus {
  target: McpInstallTarget;
  /** Absolute path of the config file. */
  path: string;
  status: McpSourceStatus;
  /** Why the read failed. Present only when `status` is `error`. */
  error?: string;
}

/** The result of {@link McpInstallService.listDeclarations}. */
export interface McpDeclarationInventory {
  /** Every declaration from every source, each with its `scope` set. */
  declarations: InstalledMcpServer[];
  /** One entry per resolvable harness config file. */
  sourceStatus: McpDeclarationSourceStatus[];
}

/** Options for {@link McpInstallService.uninstall}. */
export interface McpUninstallOptions {
  /**
   * Which record to drop targets from. Omitted = every record this workspace
   * sees: the global one and this workspace's own.
   */
  scope?: CapabilityScope;
}

export class McpInstallService {
  private readonly facets: Map<McpInstallTarget, IHarnessMcpFacet>;
  private readonly options: McpInstallServiceOptions;

  constructor(
    /**
     * Unused since TASK_2026_979 B18: an install no longer reconciles, so the
     * reconciler is not called. The parameter keeps its position only so the
     * callers outside this batch (`mcp-directory-rpc.handlers.ts`,
     * `plugin-rpc.handlers.ts`, `harness-mcp-install.service.ts`,
     * `ptah-api-builder.service.ts`, `cli-agent-runtime` `di/register.ts`)
     * compile unchanged; the P2 fix reserve (B23) drops it with them.
     */
    _reconciler: HarnessReconcilerService | null = null,
    private readonly intents: McpIntentStore = new McpIntentStore(),
    options: McpInstallServiceOptions = {},
  ) {
    this.options = options;
    this.facets = createAllMcpFacets(
      options.homeDir === undefined ? {} : { homeDir: options.homeDir },
    );
  }

  /**
   * Record an MCP server for one or more targets, in one scope.
   *
   * `workspace` (the default) records the install against this workspace only,
   * so the gateway serves it in this workspace alone; it needs a workspace
   * root and throws `McpIntentScopeError` before saving anything without one.
   * `global` is the explicit opt-in that applies in every workspace. Which
   * targets a scope may name is the caller's policy (the RPC rejects home
   * targets for a workspace install); the store records what it is given.
   *
   * No config file is written. Every target succeeds once the intent is saved,
   * and every target fails with `intent-not-saved` when it is not.
   *
   * @param serverName - Registry name for tracking (e.g. `io.github.user/server`)
   * @param serverKey - Config key (e.g. `github`, `filesystem`)
   * @param config - Transport configuration
   * @param targets - Which targets to record
   * @param workspaceRoot - The workspace the install belongs to
   * @param scope - Where the intent is recorded
   */
  async install(
    serverName: string,
    serverKey: string,
    config: McpServerConfig,
    targets: McpInstallTarget[],
    workspaceRoot?: string,
    scope: CapabilityScope = 'workspace',
  ): Promise<McpInstallResult[]> {
    try {
      this.intents.record({
        serverKey,
        registryName: serverName,
        config,
        targets,
        scope,
        workspaceRoot,
      });
    } catch (error: unknown) {
      if (!(error instanceof McpIntentPersistError)) throw error;
      return this.intentNotSaved(targets, serverKey, error);
    }
    this.options.onIntentsChanged?.();
    return targets.map((target) => recorded(target));
  }

  /**
   * Promote this workspace's install of `serverKey` to global, adding the
   * opt-in home targets. Throws `McpIntentScopeError` when there is no
   * workspace root or this workspace never recorded the server, and
   * `McpIntentPersistError` when the change could not be saved. No config
   * file is written in any case.
   */
  async makeGlobal(
    serverKey: string,
    workspaceRoot: string,
    homeTargets: readonly McpInstallTarget[],
  ): Promise<McpInstallResult[]> {
    const targets = this.intents.makeGlobal(
      serverKey,
      workspaceRoot,
      homeTargets,
    );
    this.options.onIntentsChanged?.();
    return targets.map((target) => recorded(target));
  }

  /**
   * The scope this workspace sees `serverKey` in: `global`, `workspace`, or
   * `undefined` when Ptah never recorded it for this workspace.
   */
  intentScopeOf(
    serverKey: string,
    workspaceRoot: string,
  ): CapabilityScope | undefined {
    return this.intents.scopeOf(serverKey, workspaceRoot);
  }

  /**
   * Forget an MCP server for one or more targets. With no targets given, every
   * target the server was recorded against in that scope is visited.
   *
   * The scope is `options.scope` when given. Otherwise every record this
   * workspace sees is dropped — the global one and this workspace's own — so a
   * bare uninstall leaves nothing that would make the gateway serve the server
   * here. An explicit workspace scope with no root throws
   * `McpIntentScopeError` before anything is saved.
   *
   * No config file is edited. A target this workspace never recorded the key
   * for fails with copy that says so: the entry, if any, is the user's own,
   * in a file Ptah does not edit (decision D2).
   */
  async uninstall(
    serverKey: string,
    targets?: McpInstallTarget[],
    workspaceRoot?: string,
    options: McpUninstallOptions = {},
  ): Promise<McpInstallResult[]> {
    const scopes = this.uninstallScopes(serverKey, workspaceRoot, options);
    const recordedTargets = new Set(
      scopes.flatMap((scope) =>
        this.intents.targetsIn(serverKey, scope, workspaceRoot),
      ),
    );
    const requested =
      targets !== undefined && targets.length > 0
        ? targets
        : [...recordedTargets];
    const visited = requested.length > 0 ? requested : ALL_TARGETS;

    try {
      for (const scope of scopes) {
        this.intents.forget(serverKey, { scope, workspaceRoot, targets });
      }
    } catch (error: unknown) {
      if (!(error instanceof McpIntentPersistError)) throw error;
      return this.intentNotSaved(visited, serverKey, error);
    }
    this.options.onIntentsChanged?.();
    return visited.map((target) =>
      recordedTargets.has(target)
        ? recorded(target)
        : notRecorded(target, serverKey),
    );
  }

  /** The records an uninstall drops; see {@link uninstall}. */
  private uninstallScopes(
    serverKey: string,
    workspaceRoot: string | undefined,
    options: McpUninstallOptions,
  ): CapabilityScope[] {
    if (options.scope !== undefined) return [options.scope];
    const scopes: CapabilityScope[] = [];
    if (this.intents.targetsIn(serverKey, 'global').length > 0) {
      scopes.push('global');
    }
    if (
      this.intents.targetsIn(serverKey, 'workspace', workspaceRoot).length > 0
    ) {
      scopes.push('workspace');
    }
    return scopes;
  }

  /**
   * Every MCP server this machine has, from all four disk/manifest sources,
   * each row flagged with where it came from, which scope declared it and how
   * it can be removed.
   *
   * A display list: a config file that cannot be read contributes no rows
   * here. The capability resolver reads the same inventory through
   * {@link listDeclarations}, where that failure is reported instead.
   */
  async listInstalled(workspaceRoot?: string): Promise<InstalledMcpServer[]> {
    const { declarations } = await this.listDeclarations(workspaceRoot);

    // Identity is (origin, configPath, serverKey, scope, target). NOT the key
    // alone: one server installed to five targets is five real rows in five
    // real files, and that is exactly how the Installed tab groups them
    // today. The target matters for intent rows, which share one store file.
    const seen = new Set<string>();
    const deduped: InstalledMcpServer[] = [];
    for (const row of declarations) {
      const identity = JSON.stringify([
        row.origin,
        row.configPath,
        row.serverKey,
        row.scope,
        row.target ?? null,
      ]);
      if (seen.has(identity)) continue;
      seen.add(identity);
      deduped.push(row);
    }
    return deduped;
  }

  /**
   * The ONE declaration inventory (TASK_2026_560, C4): every row from the four
   * sources with its `scope`, plus the read status of every harness config
   * file.
   *
   * Both `listInstalled` and the capability resolver read it, so the
   * Installed tab and the session policy can never disagree about what is
   * declared. The harness files are read through the facets' status-bearing
   * `inspect`, so a file that exists but cannot be read is `error` in
   * `sourceStatus` rather than silently "declares nothing"; the resolver turns
   * that into an unverified policy. Never rejects.
   */
  async listDeclarations(
    workspaceRoot?: string,
  ): Promise<McpDeclarationInventory> {
    const harness = await this.harnessConfigRows(workspaceRoot);
    const declarations = [
      ...this.intentRows(workspaceRoot),
      ...harness.rows,
      ...this.claudeUserRows(workspaceRoot),
      ...this.smitheryRows(),
      ...this.oauthRows(),
    ].map((row) => ({
      ...row,
      // An intent row carries the scope it was recorded in; every other
      // source is classified by where it was read from.
      scope:
        row.scope ??
        classifyMcpScope({
          origin: row.origin,
          ...(row.target === undefined ? {} : { target: row.target }),
        }),
    }));
    return { declarations, sourceStatus: harness.sourceStatus };
  }

  /** Absolute config path for a target, or `null` when it cannot be resolved. */
  getConfigPath(
    target: McpInstallTarget,
    workspaceRoot?: string,
  ): string | null {
    const facet = this.facets.get(target);
    if (facet === undefined) return null;
    try {
      return facet.configPath(workspaceRoot ?? '');
      // degradation-audit: optional-capability - per the doc comment on this
      // method, an unresolvable config path is the documented null return, not
      // a hidden failure.
    } catch {
      return null;
    }
  }

  /**
   * The harness MCP config files, read (never written) in parallel through
   * `inspect`, with each file's read status.
   */
  private async harnessConfigRows(workspaceRoot?: string): Promise<{
    rows: InstalledMcpServer[];
    sourceStatus: McpDeclarationSourceStatus[];
  }> {
    const root = workspaceRoot ?? '';
    const reads = await Promise.all(
      [...this.facets].map(async ([target, facet]) => ({
        target,
        configPath: facet.configPath(root),
        inspection: await facet.inspect(root),
      })),
    );

    const rows: InstalledMcpServer[] = [];
    const sourceStatus: McpDeclarationSourceStatus[] = [];
    for (const { target, configPath, inspection } of reads) {
      // No resolvable file (a workspace-scoped target with no workspace)
      // declares nothing, and that is a fact, not a failure.
      if (configPath === null) continue;
      sourceStatus.push({
        target,
        path: configPath,
        status: inspection.status,
        ...(inspection.error === undefined ? {} : { error: inspection.error }),
      });

      for (const [serverKey, config] of inspection.servers) {
        const managedByPtah = this.intents.has(serverKey);
        rows.push({
          serverKey,
          target,
          configPath,
          config,
          managedByPtah,
          origin: 'harness-config',
          originLabel: ORIGIN_LABELS['harness-config'],
          // A key Ptah recorded is removed by forgetting its intent. Any
          // other key is the user's own entry in a file Ptah does not edit
          // (decision D2), so the row says how to remove it by hand.
          ...(managedByPtah
            ? { removal: 'ptah-managed' as const }
            : {
                removal: 'none' as const,
                removalBlockedReason: unownedConfigRemovalReason(
                  serverKey,
                  configPath,
                ),
              }),
        });
      }
    }
    return { rows, sourceStatus };
  }

  /**
   * The servers installed through Ptah (`~/.ptah/mcp-installed.json`) that
   * apply here: the global record, this workspace's own and, in a linked git
   * worktree, the main checkout's workspace record, one row per recorded
   * target. No config file carries them; the gateway serves them all, so
   * without these rows an install would never show on the Installed tab.
   * A global or own-workspace row is removed by forgetting its intent
   * (`ptah-managed`); a main-checkout row is removed from the main checkout.
   */
  private intentRows(workspaceRoot?: string): InstalledMcpServer[] {
    try {
      return this.readIntentRows(workspaceRoot ?? '');
    } catch (error: unknown) {
      // degradation-audit: optional-capability - an unreadable intent file
      // costs the Ptah rows (logged); every other source still renders, and
      // the gateway reports the same file as unreadable on its own path.
      this.options.warn?.(
        '[mcp-install] The MCP intent store could not be read',
        causeDetail(error),
      );
      return [];
    }
  }

  /** {@link intentRows} without the read guard. Throws what the store throws. */
  private readIntentRows(root: string): InstalledMcpServer[] {
    // `listFor('')` is the global record alone.
    const rows = this.intents
      .listFor('')
      .flatMap((intent) =>
        this.intentRowsFor(intent.serverKey, intent.config, intent.targets, {
          scope: 'global',
        }),
      );
    if (root.trim() === '') return rows;
    rows.push(...this.workspaceIntentRows(root));

    // A linked worktree also gets its main checkout's workspace intents, as
    // in `GatewayServerSources.resolve`. They are not this workspace's own
    // record, so an uninstall here cannot drop them.
    const main = this.mainCheckoutOf(root);
    if (main !== null) rows.push(...this.workspaceIntentRows(root, main));
    return rows;
  }

  /**
   * One row per target of each server `recordRoot`'s workspace record lists.
   * `recordRoot` differs from `root` only for a worktree's main checkout.
   */
  private workspaceIntentRows(
    root: string,
    recordRoot: string = root,
  ): InstalledMcpServer[] {
    // `listFor(recordRoot)` merges in that workspace's record, whose config
    // is the one that lists the workspace record's targets.
    const applying = this.intents.listFor(recordRoot);
    const rows: InstalledMcpServer[] = [];
    for (const serverKey of new Set(applying.map((i) => i.serverKey))) {
      const local = this.intents.targetsIn(serverKey, 'workspace', recordRoot);
      if (local.length === 0) continue;
      const intent = applying.find(
        (candidate) =>
          candidate.serverKey === serverKey &&
          candidate.targets.some((target) => local.includes(target)),
      );
      if (intent === undefined) continue;
      rows.push(
        ...this.intentRowsFor(serverKey, intent.config, local, {
          scope: 'workspace',
          ...(recordRoot === root ? {} : { mainCheckout: recordRoot }),
        }),
      );
    }
    return rows;
  }

  private intentRowsFor(
    serverKey: string,
    config: McpServerConfig,
    targets: readonly McpInstallTarget[],
    where: { scope: CapabilityScope; mainCheckout?: string },
  ): InstalledMcpServer[] {
    const removal =
      where.mainCheckout === undefined
        ? { removal: 'ptah-managed' as const }
        : {
            removal: 'none' as const,
            removalBlockedReason: mainCheckoutRemovalReason(
              serverKey,
              where.mainCheckout,
            ),
          };
    return targets.map((target) => ({
      serverKey,
      target,
      configPath: this.intents.filePath,
      config,
      managedByPtah: true,
      origin: 'ptah-intent' as const,
      originLabel: ORIGIN_LABELS['ptah-intent'],
      ...removal,
      scope: where.scope,
    }));
  }

  /** The main checkout of a linked worktree `root`, or `null`. */
  private mainCheckoutOf(root: string): string | null {
    const main = (this.options.mainCheckoutRoot ?? worktreeMainRoot)(root);
    return main === null || main === root ? null : main;
  }

  /** `~/.claude.json`, user scope and this workspace's project scope. */
  private claudeUserRows(workspaceRoot?: string): InstalledMcpServer[] {
    return readClaudeUserMcpServers(
      workspaceRoot,
      this.options.homeDir === undefined
        ? {}
        : { homeDir: this.options.homeDir },
    ).map((entry) => {
      const fixCommand = claudeUserRemovalCommand(entry.serverKey, entry.scope);
      return {
        serverKey: entry.serverKey,
        configPath: entry.configPath,
        config: entry.config,
        managedByPtah: false,
        origin: 'claude-user' as const,
        originLabel: ORIGIN_LABELS['claude-user'],
        // Read-only by design: this file belongs to the `claude` CLI and
        // carries far more than MCP servers, so Ptah never writes it.
        removal: 'none' as const,
        removalBlockedReason: claudeUserRemovalReason(
          entry.serverKey,
          entry.scope,
          entry.configPath,
        ),
        // Absent, not empty, when the key cannot be written safely: the UI
        // then shows the reason with no copy button.
        ...(fixCommand === null ? {} : { removalFixCommand: fixCommand }),
      };
    });
  }

  /** `~/.ptah/smithery-installed.json`, when the caller supplied its store. */
  private smitheryRows(): InstalledMcpServer[] {
    const reader = this.options.smithery;
    if (reader === undefined) return [];

    let records: SmitheryInstalledRecord[];
    try {
      records = reader.list();
    } catch {
      // degradation-audit: optional-capability - the Smithery rows are one of
      // several sources the Installed tab concatenates, so an unreadable
      // store costs that section and leaves every other source rendered.
      // One unreadable store must not empty the whole Installed tab.
      return [];
    }

    return records.map((record) => ({
      serverKey: record.serverKey,
      configPath: reader.filePath,
      // SECURITY: the endpoint only, never the secret-bearing session URL —
      // the API key and per-server config live in the encrypted store and are
      // rebuilt at query time.
      config: smitheryDisplayConfig(record),
      managedByPtah: true,
      origin: 'smithery' as const,
      originLabel: ORIGIN_LABELS.smithery,
      removal: 'smithery' as const,
    }));
  }

  /** `~/.ptah/mcp-oauth-installed.json`, when the caller supplied its store. */
  private oauthRows(): InstalledMcpServer[] {
    const reader = this.options.oauth;
    if (reader === undefined) return [];

    let records: McpOAuthConnectedRecord[];
    try {
      records = reader.list();
    } catch {
      // degradation-audit: optional-capability - same contract as the
      // Smithery rows above: the OAuth section drops out of the Installed
      // tab, the sections backed by readable stores still render.
      return [];
    }

    return records.map((record) => ({
      serverKey: record.serverKey,
      configPath: reader.filePath,
      // SECURITY: the server URL is non-secret; the tokens are in the
      // encrypted store and never cross this boundary.
      config: { type: 'http' as const, url: record.serverUrl },
      managedByPtah: true,
      origin: 'oauth' as const,
      originLabel: ORIGIN_LABELS.oauth,
      removal: 'oauth' as const,
    }));
  }

  /** Every target fails: the intent change was not saved. */
  private intentNotSaved(
    targets: readonly McpInstallTarget[],
    serverKey: string,
    error: McpIntentPersistError,
  ): McpInstallResult[] {
    this.options.warn?.('[mcp-install] The MCP intent change was not saved', {
      serverKey,
      ...causeDetail(error),
      cause: causeDetail(error.cause).error,
    });
    return targets.map((target) => failed(target, 'intent-not-saved'));
  }
}

/**
 * A target whose intent change was saved. `configPath` is empty: no config
 * file was written, the gateway serves the intent.
 */
function recorded(target: McpInstallTarget): McpInstallResult {
  return { target, configPath: '', success: true };
}

/** A failed target with the fixed copy for `code`. */
function failed(
  target: McpInstallTarget,
  code: McpInstallResultCode,
): McpInstallResult {
  return {
    target,
    configPath: '',
    success: false,
    code,
    error: MCP_INSTALL_RESULT_COPY[code],
  };
}

/**
 * A target this workspace never recorded `serverKey` for. Whatever entry
 * carries the key is the user's own, and Ptah does not edit config files.
 */
function notRecorded(
  target: McpInstallTarget,
  serverKey: string,
): McpInstallResult {
  return {
    target,
    configPath: '',
    success: false,
    error: notRecordedCopy(serverKey),
  };
}

/** Why an unrecorded key cannot be uninstalled here, and what removes it. */
function notRecordedCopy(serverKey: string): string {
  return (
    `"${serverKey}" was not installed by Ptah for this workspace, so there ` +
    'is nothing to uninstall. Ptah does not edit MCP config files: remove ' +
    'an entry you added yourself from the file that declares it.'
  );
}

/**
 * Why a harness config row Ptah never recorded has no removal path here
 * (decision D2): the file is the user's, and Ptah no longer edits it.
 */
function unownedConfigRemovalReason(
  serverKey: string,
  configPath: string,
): string {
  return (
    `"${serverKey}" is declared in ${configPath}, which Ptah did not write. ` +
    'Ptah does not edit MCP config files: remove the entry from that file ' +
    'by hand.'
  );
}

/** Why a main-checkout intent row has no removal path in a linked worktree. */
function mainCheckoutRemovalReason(
  serverKey: string,
  mainCheckout: string,
): string {
  return (
    `"${serverKey}" was installed through Ptah for the main checkout ` +
    `${mainCheckout}, and this worktree uses it from there. Open that folder ` +
    'in Ptah to remove it.'
  );
}

/**
 * The `claude mcp remove` scope flag for a `~/.claude.json` entry. One place,
 * so the prose reason and the copyable command cannot disagree about scope.
 */
function claudeUserScopeFlag(scope: ClaudeUserMcpScope): string {
  return scope === 'user' ? ' --scope user' : '';
}

/** Why a `~/.claude.json` row has no removal path here, and what does. */
function claudeUserRemovalReason(
  serverKey: string,
  scope: ClaudeUserMcpScope,
  configPath: string,
): string {
  return (
    `"${serverKey}" is declared in ${configPath}, which belongs to the Claude ` +
    `CLI — Ptah reads it and never writes it. Remove it with ` +
    `\`claude mcp remove ${serverKey}${claudeUserScopeFlag(scope)}\`.`
  );
}

/**
 * The copyable command that removes a `~/.claude.json` entry, or `null` when
 * the key cannot be put on a command line safely.
 */
function claudeUserRemovalCommand(
  serverKey: string,
  scope: ClaudeUserMcpScope,
): string | null {
  const arg = shellSafeArgument(serverKey);
  return arg === null
    ? null
    : `claude mcp remove ${arg}${claudeUserScopeFlag(scope)}`;
}

/** Characters that need no quoting in bash, zsh, PowerShell or cmd. */
const SHELL_BARE_ARGUMENT = /^[A-Za-z0-9_][A-Za-z0-9_./:+=-]*$/;

/**
 * Characters double quotes do NOT neutralise in at least one shell the user
 * may paste into: `"` ends the quote everywhere; `$` and `` ` `` expand inside
 * double quotes in bash, zsh and PowerShell; `\` escapes in bash and zsh; `!`
 * is history expansion in interactive bash; `%` expands `%VAR%` in cmd.
 */
const SHELL_UNQUOTABLE_PRINTABLE = new Set(['"', '$', '`', '\\', '!', '%']);

/**
 * Whether double quotes cannot make `value` safe. Besides the printable set
 * above, C0 and C1 control characters (newline, tab, escape…) and the Unicode
 * line and paragraph separators would split the pasted line, trigger shell
 * completion or hide what is actually being run.
 */
function hasUnquotableCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
    if (code === 0x2028 || code === 0x2029) return true;
    if (SHELL_UNQUOTABLE_PRINTABLE.has(char)) return true;
  }
  return false;
}

/**
 * A server key as one shell argument that means the same thing in every shell
 * the user is likely to paste it into, or `null` when no such spelling exists.
 *
 * Keys come from JSON object keys in a file another tool writes, so they can
 * hold anything. A plain key is passed bare; whitespace or any other shell
 * metacharacter (`;`, `&`, `|`, `<`, `(`, `*`, `#`, `~`, `,`, `@`…) is wrapped
 * in double quotes, inside which all of those are literal. A key double quotes
 * cannot protect gets no command at all, because a copy button that pastes
 * something other than what it shows is worse than no button. So does a key
 * starting with `-`: quoting does not stop `claude` reading it as an option.
 */
function shellSafeArgument(value: string): string | null {
  if (value === '' || value.startsWith('-')) return null;
  if (SHELL_BARE_ARGUMENT.test(value)) return value;
  if (hasUnquotableCharacter(value)) return null;
  return `"${value}"`;
}

/**
 * The non-secret endpoint to SHOW for a Smithery record.
 *
 * A Connections-API record is reached through the one namespace endpoint; a
 * legacy record keeps its per-server URL, and the base of it is the part with
 * no credentials in it. Neither spelling carries the API key or the per-server
 * config — both of those live in the encrypted store.
 */
function smitheryDisplayConfig(
  record: SmitheryInstalledRecord,
): McpServerConfig {
  const url =
    record.namespace === undefined
      ? `${SMITHERY_DEFAULT_CONNECTION_HOST}/${record.qualifiedName}/mcp`
      : buildSmitheryNamespaceUrl(record.namespace);
  return { type: 'http', url };
}
