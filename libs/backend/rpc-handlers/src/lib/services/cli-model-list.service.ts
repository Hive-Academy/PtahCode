import { inject, injectable } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import type {
  CliDetectionService,
  CliModelInfo,
} from '@ptah-extension/cli-agent-runtime';
import type { IModelDiscovery } from '@ptah-extension/platform-core';
import {
  AUTH_PROVIDERS_TOKENS,
  type CodexAuthService,
  type CopilotAuthService,
} from '@ptah-extension/auth-providers';
import type {
  AgentModelEntry,
  AgentModelProvider,
  EffortSupport,
  SystemCliType,
} from '@ptah-extension/shared';

type CliModels = Record<SystemCliType, CliModelInfo[]>;

interface LoadedCliModels {
  models: CliModels;
  codexReported: boolean;
  copilotReported: boolean;
}

/** The CLI model picker list shared by RPC consumers on every host. */
@injectable()
export class CliModelListService {
  private modelsInFlight: Promise<LoadedCliModels> | undefined;

  constructor(
    @inject(TOKENS.CLI_DETECTION_SERVICE)
    private readonly cliDetection: CliDetectionService,
    @inject(TOKENS.MODEL_DISCOVERY)
    private readonly modelDiscovery: IModelDiscovery,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_CODEX_AUTH)
    private readonly codexAuthService: CodexAuthService,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_COPILOT_AUTH)
    private readonly copilotAuthService: CopilotAuthService,
  ) {}

  async listAll(): Promise<CliModels> {
    return (await this.sharedModels()).models;
  }

  /** Only live auth/host queries establish provider-reported model ids. */
  async listForClassification(): Promise<
    Record<AgentModelProvider, AgentModelEntry[]>
  > {
    const { models, codexReported, copilotReported } = await this.sharedModels();
    const fallback = (entries: CliModelInfo[]): AgentModelEntry[] =>
      entries.map((entry) => ({ ...entry, isFallback: true }));

    return {
      claude: [],
      codex: codexReported ? models.codex : fallback(models.codex),
      copilot: copilotReported ? models.copilot : fallback(models.copilot),
      cursor: models.cursor,
      opencode: models.opencode.map((entry) =>
        /^[^\s/]+\/\S+$/.test(entry.id) ? entry : { ...entry, isFallback: true }),
    };
  }

  effortSupport(cli: SystemCliType, modelId: string): EffortSupport {
    const native = this.cliDetection.nativeEfforts(cli, modelId);
    if (native.provenance === 'native') return native;
    const supported = this.cliDetection.getAdapter(cli)?.laneEfforts?.(modelId);
    return supported === undefined
      ? { provenance: 'unknown' }
      : { provenance: 'ptah-fallback', supported, default: null };
  }

  private sharedModels(): Promise<LoadedCliModels> {
    return (this.modelsInFlight ??= this.loadModels().finally(() => {
      this.modelsInFlight = undefined;
    }));
  }

  private async loadModels(): Promise<LoadedCliModels> {
    const modelMap = await this.cliDetection.listModelsForAll();

    // The lane runs the installed `codex`, so its own catalog (already
    // filtered for that binary's version) comes first. The account's live
    // menu in `~/.codex/auth.json` is next; the adapter's own `listModels()`
    // answer (from detection) last. No source is a repository list.
    let codex = await this.getCodexModelsFromCliCatalog();
    if (codex.length > 0) {
      this.cliDetection.recordNativeCatalog('codex', codex);
    } else {
      codex = await this.getCodexModelsFromAuth();
    }
    const codexReported = codex.length > 0;
    if (!codexReported) {
      codex = modelMap['codex'] ?? [];
    }
    // Hosts with a Language Model API (VS Code) report the models the user
    // actually has. Elsewhere the signed-in Copilot account's /models list
    // does; the adapter's own `listModels()` answer (empty for Copilot) is
    // used only when neither answers.
    let copilot = await this.getCopilotModelsFromHost();
    if (copilot.length === 0) copilot = await this.getCopilotModelsFromAuth();
    const copilotReported = copilot.length > 0;
    if (!copilotReported) {
      copilot = modelMap['copilot'] ?? [];
    }
    const cursor = modelMap['cursor'] ?? [];
    const antigravity = modelMap['antigravity'] ?? [];
    const opencode = modelMap['opencode'] ?? [];
    const pi = modelMap['pi'] ?? [];
    const grok = modelMap['grok'] ?? [];
    // The system Claude lane's list comes from `ClaudeCliAdapter.listModels()`
    // (the ambient native Claude model service) via detection; empty when the
    // Claude Agent SDK is not installed.
    const claude = modelMap['claude'] ?? [];

    const result: CliModels = {
      codex,
      copilot,
      cursor,
      antigravity,
      opencode,
      pi,
      grok,
      claude,
    };

    return { models: result, codexReported, copilotReported };
  }

  /**
   * Copilot models as reported by the host's Language Model API, with
   * human-readable display names. Empty when the host has no such API.
   */
  private async getCopilotModelsFromHost(): Promise<CliModelInfo[]> {
    try {
      const models = await this.modelDiscovery.getCopilotModels();
      return models.map((model) => ({
        id: model.id,
        name: this.formatModelDisplayName(model.id),
      }));
    } catch {
      // degradation-audit: optional-capability - the host Language Model API
      // is optional; an empty list lets the next live source answer.
      return [];
    }
  }

  /** The installed Codex CLI's own catalog; empty when it cannot be read. */
  private async getCodexModelsFromCliCatalog(): Promise<CliModelInfo[]> {
    const adapter = this.cliDetection.getAdapter('codex') as
      | { listCatalogModels?: () => Promise<readonly CliModelInfo[]> }
      | undefined;
    try {
      return [...((await adapter?.listCatalogModels?.()) ?? [])];
    } catch {
      // degradation-audit: optional-capability - no readable CLI catalog
      // means the account list or the adapter's own list answers.
      return [];
    }
  }

  /**
   * Copilot models for the signed-in Copilot account, from its /models
   * endpoint. Empty when not signed in or offline.
   */
  private async getCopilotModelsFromAuth(): Promise<CliModelInfo[]> {
    try {
      const models = await this.copilotAuthService.listModels();
      return models.map((model) => ({
        id: model.id,
        name: model.name || this.formatModelDisplayName(model.id),
      }));
    } catch {
      // degradation-audit: optional-capability - the Copilot /models endpoint
      // needs a signed-in, online account; an empty list leaves the adapter's
      // own list (empty for Copilot) as the answer.
      return [];
    }
  }

  /**
   * Codex models for the account in `~/.codex/auth.json`, as reported by the
   * provider `/models` endpoint. Empty when unauthenticated or offline, in
   * which case the adapter's own `listModels()` answer is used.
   */
  private async getCodexModelsFromAuth(): Promise<CliModelInfo[]> {
    try {
      const models = await this.codexAuthService.listModels();
      return models.map((model) => ({
        id: model.id,
        name: model.name || this.formatModelDisplayName(model.id),
      }));
    } catch {
      // degradation-audit: optional-capability - the provider /models endpoint
      // needs an authenticated, online account; an empty list leaves the
      // adapter's own model list as the answer.
      return [];
    }
  }

  /**
   * Convert a model family slug to a human-readable name.
   * e.g. "claude-opus-4.6" -> "Claude Opus 4.6"
   *      "gpt-5.3-codex"   -> "GPT 5.3 Codex"
   */
  private formatModelDisplayName(family: string): string {
    return family
      .split('-')
      .map((part) => {
        if (/^\d/.test(part)) return part;
        const upper = part.toUpperCase();
        if (['GPT', 'AI'].includes(upper)) return upper;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  }
}
