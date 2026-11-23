/**
 * The Ptah context of one provider-session start or resume, resolved on the
 * host from the chat start config: the instructions body (identity, user
 * system prompt, output style, enhanced prompt, ptah-ui hint and the memory
 * blocks Claude chat gets), the capability policy (with the harness
 * preflight Claude chat runs), Ptah MCP with its tool profile, and the
 * user's MCP servers. The result rides `ProviderSessionChatPrepared.open`.
 */
import {
  PTAH_UI_HINT_CODEX,
  ProviderSessionChatAdapterError,
  resolveSessionCapabilityPolicy,
  type HarnessPolicySync,
  type MemoryPromptInjector,
  type ProviderSessionChatPrepared,
} from '@ptah-extension/agent-sdk';
import type { ProviderHttpMcpAttachment } from '@ptah-extension/provider-session-contracts';
import {
  isMcpServerEnabled,
  type AgentSessionResumeConfig,
  type AgentSessionStartConfig,
  type EffectiveCapabilitySet,
  type ICapabilityResolver,
  type McpHttpServerOverride,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { classifyProviderSessionChatOptions } from './provider-session-chat-options';

export type ProviderSessionOpenOptions = NonNullable<
  ProviderSessionChatPrepared['open']
>;

/**
 * Ptah's identity for a provider session, provider-neutral. Claude's
 * `PTAH_CORE_SYSTEM_PROMPT` is not used: it extends Claude's `claude_code`
 * preset and names Claude-only tools (Task subagents, AskUserQuestion,
 * ToolSearch) and a VS Code host. Codex chat skips it for the same reason;
 * Ptah's MCP handshake carries the tool substitution summary to any agent.
 */
export const PROVIDER_SESSION_PTAH_IDENTITY =
  "You are running inside Ptah, a desktop app for software engineering work. Your replies render as GitHub-flavored markdown in Ptah's chat panel, not in a terminal: keep them short, and use headings, language-tagged code fences and numbered steps where they help.";

export interface ProviderSessionStartOptionsDeps {
  readonly logger: Pick<Logger, 'debug' | 'info' | 'warn'>;
  /** Session-start roster and first-prompt recall; absent: no memory blocks. */
  readonly memory?: Pick<
    MemoryPromptInjector,
    'buildSessionStartBlock' | 'buildBlock'
  >;
  /** Absent: the policy is unverified (Ptah MCP only, no user servers), as for Claude chat. */
  readonly capabilityResolver?: ICapabilityResolver;
  /** Absent: the harness is not synced to the policy before the open. */
  readonly harnessPolicySync?: Pick<HarnessPolicySync, 'apply'>;
}

export interface ProviderSessionStartContext {
  /**
   * The session's workspace (the seed's), where memory and policy resolve.
   * Instructions are built for a stored session too: the runtime decides per
   * profile whether a restored session is sent them again.
   */
  readonly workspacePath: string;
}

export interface ProviderSessionStartOptions {
  /** Refuses an unsupported option; call before anything resolves. */
  check(config: AgentSessionStartConfig | AgentSessionResumeConfig): void;
  resolve(
    config: AgentSessionStartConfig | AgentSessionResumeConfig,
    context: ProviderSessionStartContext,
  ): Promise<ProviderSessionOpenOptions>;
}

export function createProviderSessionStartOptions(
  deps: ProviderSessionStartOptionsDeps,
): ProviderSessionStartOptions {
  const check: ProviderSessionStartOptions['check'] = (config) => {
    const { stripped, rejected } = classifyProviderSessionChatOptions(config);
    if (rejected.length > 0)
      throw new ProviderSessionChatAdapterError('unsupported-option', 'prepare', {
        option: rejected[0],
      });
    if (stripped.length > 0)
      deps.logger.info('Provider-session chat does not apply these options.', {
        code: 'provider-session-options-not-applied',
        keys: stripped,
      });
  };

  /** Bounded, never fatal: Claude chat continues on a missed sync too. */
  const syncHarness = async (policy: EffectiveCapabilitySet): Promise<void> => {
    if (!deps.harnessPolicySync) return;
    if (policy.status !== 'verified') {
      deps.logger.warn(
        'Provider-session chat: capability policy is unverified; harness sync skipped.',
        { code: 'provider-session-harness-sync-skipped' },
      );
      return;
    }
    try {
      const { acknowledged } = await deps.harnessPolicySync.apply(
        policy.physicalRoot,
        policy.harnessFingerprint,
      );
      if (!acknowledged)
        deps.logger.warn(
          'Provider-session chat: the harness did not acknowledge the capability policy; the session continues.',
          { code: 'provider-session-harness-unacknowledged' },
        );
    } catch (error: unknown) {
      // degradation-audit: reported - as Claude chat (syncHarnessToPolicy):
      // a harness hiccup must not fail the chat message; the warning names it.
      deps.logger.warn(
        'Provider-session chat: harness policy sync failed; the session continues.',
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  };

  const instructions = async (
    config: AgentSessionStartConfig | AgentSessionResumeConfig,
    workspacePath: string,
  ): Promise<string | undefined> => {
    // The injector never throws and honours
    // `memory.triggers.sessionStart.injectionEnabled` itself.
    const sessionStart =
      (await deps.memory?.buildSessionStartBlock(workspacePath)) ?? '';
    const prompt = config.prompt?.trim();
    const recall = prompt
      ? ((await deps.memory?.buildBlock(prompt, workspacePath)) ?? '')
      : '';
    const coding = (config.mcpToolProfile ?? 'coding') === 'coding';
    const body = [
      sessionStart,
      recall,
      PROVIDER_SESSION_PTAH_IDENTITY,
      // The Ptah MCP hint is added per open, only when the attachment is
      // there (`providerSessionPtahMcpHint`, provider-session-open-request).
      // As Codex chat: the hint without a skill-file lookup.
      config.ptahUiFence === true && coding ? PTAH_UI_HINT_CODEX : '',
      config.systemPrompt ?? '',
      config.outputStyleBody ?? '',
      config.enhancedPromptsContent ?? '',
    ]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join('\n\n');
    return body.length > 0 ? body : undefined;
  };

  return {
    check,
    async resolve(config, context) {
      const policy = await resolveSessionCapabilityPolicy(
        deps.capabilityResolver,
        context.workspacePath,
        deps.logger,
        config.pluginConfigAncestorRoots,
      );
      await syncHarness(policy);
      const ptahMcp =
        config.mcpServerRunning === true && isMcpServerEnabled(policy, 'ptah');
      const userMcp = userMcpServers(
        'mcpServersOverride' in config ? config.mcpServersOverride : undefined,
        policy,
        deps.logger,
      );
      const body = await instructions(config, context.workspacePath);
      return {
        ptahMcp,
        ...(config.mcpToolProfile
          ? { mcpToolProfile: config.mcpToolProfile }
          : {}),
        userMcp,
        ...(body ? { instructions: body } : {}),
      };
    },
  };
}

/**
 * The user's MCP servers (Smithery, OAuth, caller overrides) as ACP http
 * attachments, like Codex chat's `userMcpServers`: an http(s) URL only (any
 * other server is skipped with a warning, the chat still starts), empty
 * header values dropped, `ptah` never taken from the user, and every server
 * the capability policy turned off left out. Names only reach the log.
 */
function userMcpServers(
  overrides: Readonly<Record<string, McpHttpServerOverride>> | undefined,
  policy: EffectiveCapabilitySet,
  logger: ProviderSessionStartOptionsDeps['logger'],
): ProviderHttpMcpAttachment[] {
  const servers: ProviderHttpMcpAttachment[] = [];
  const denied: string[] = [];
  const unsupported: string[] = [];
  for (const [name, override] of Object.entries(overrides ?? {})) {
    if (name === 'ptah') {
      logger.debug('Ignoring a user MCP server named ptah for provider-session chat.');
      continue;
    }
    // The override carries a URL only (no command to run as stdio).
    if (!isHttpUrl(override.url)) {
      unsupported.push(name);
      continue;
    }
    if (!isMcpServerEnabled(policy, name)) {
      denied.push(name);
      continue;
    }
    servers.push({
      type: 'http',
      name,
      url: override.url,
      headers: Object.entries(override.headers ?? {})
        .filter(([, value]) => value !== '')
        .map(([header, value]) => ({ name: header, value })),
    });
  }
  if (unsupported.length > 0)
    // One server the agent cannot reach must not fail the whole chat start;
    // the warning names the skipped servers.
    logger.warn('User MCP servers without an http(s) URL are skipped for provider-session chat.', {
      code: 'provider-session-user-mcp-unsupported',
      serverNames: unsupported.sort(),
    });
  if (denied.length > 0)
    logger.info('User MCP servers are off by capability policy for provider-session chat.', {
      code: 'provider-session-user-mcp-denied',
      serverNames: denied.sort(),
      policy: policy.status,
    });
  if (servers.length > 0)
    logger.info('User MCP servers are configured for provider-session chat.', {
      code: 'provider-session-user-mcp-configured',
      serverNames: servers.map((server) => server.name).sort(),
    });
  return servers;
}

/** No parser error is raised: its message may echo the URL (a secret). */
function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === 'http:' || protocol === 'https:';
}
