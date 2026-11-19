import {
  resolveCliPath,
  PTAH_CLI_AGENTS_CONFIG_KEY,
} from '@ptah-extension/cli-agent-runtime';
import { z } from 'zod';
import type { ProviderModelsService } from '@ptah-extension/auth-providers';
import type { IHarnessSourceResolver } from '@ptah-extension/harness-sync';
import { CLAUDE_BUILTIN_TOOL_IDS } from '@ptah-extension/agent-sdk';
import {
  getAllAnthropicProviders,
  SYSTEM_CLI_TYPES,
  type BotScope,
  type BotEditable,
  type BotDiagnostic,
} from '@ptah-extension/shared';
import type {
  ConfigManager,
  IAuthSecretsService,
  Logger,
} from '@ptah-extension/vscode-core';
import type {
  BotCatalogPort,
  BotCatalogSnapshot,
  BotMainProviderChoice,
  BotLaneChoice,
} from '@ptah-extension/bots';
import { readSkillCandidates } from '../harness/selection/skill-catalog';

export interface BotCatalogDependencies {
  models: Pick<ProviderModelsService, 'fetchModels'>;
  secrets: Pick<IAuthSecretsService, 'getProviderKey'>;
  sources: Pick<IHarnessSourceResolver, 'resolve'>;
  config: Pick<ConfigManager, 'getWithDefault'>;
  logger: Pick<Logger, 'debug'>;
  executable?: (command: string) => boolean | Promise<boolean>;
}
// Keep save-time discovery well below ClaudeRpcService's 30_000 ms default.
export const BOT_CATALOG_DEADLINE_MS = 8_000;
const RegistryEntrySchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
});

/** Enumerates identities only. Never runs CLI detection, migration or a command. */
export class BotCatalogAdapter implements BotCatalogPort {
  constructor(private readonly deps: BotCatalogDependencies) {}

  async read(
    scope: BotScope,
    selection?: Pick<BotEditable, 'runtime' | 'skills' | 'toolRequirements'>,
  ): Promise<BotCatalogSnapshot> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new Error('Catalog lookup timed out.'));
      }, BOT_CATALOG_DEADLINE_MS);
    });
    const bounded = async <T>(operation: () => T | Promise<T>): Promise<T> => {
      if (expired) throw new Error('Catalog lookup timed out.');
      return Promise.race([operation(), deadline]);
    };
    const diagnostics: BotDiagnostic[] = [];
    let succeeded = 0;
    let failed = 0;
    const failure = (code: string, message: string): void => {
      failed++;
      diagnostics.push({ code, message, severity: 'warning' });
      this.deps.logger.debug('Bot catalog dependency unavailable', { code });
    };
    const mainProviders: BotMainProviderChoice[] = [];
    const providersTask = async (): Promise<void> => {
      try {
        // Save-time diagnostics concern only the selected provider. Enumerating every
        // provider here starts unrelated network/SDK discovery before persistence.
        const runtime = selection?.runtime;
        const providers = getAllAnthropicProviders().filter(
          (provider) =>
            !runtime ||
            (runtime.kind === 'main' && runtime.providerId === provider.id),
        );
        let nextProvider = 0;
        const choices = new Map<number, BotMainProviderChoice>();
        const worker = async (): Promise<void> => {
          while (nextProvider < providers.length) {
            const index = nextProvider++;
            const provider = providers[index];
            if (!provider) continue;
            const choice: BotMainProviderChoice = {
              providerId: provider.id,
              label: provider.name,
              capabilities: {},
            };
            try {
              const key = await bounded(() =>
                this.deps.secrets.getProviderKey(provider.id),
              );
              const result = await bounded(() =>
                this.deps.models.fetchModels(provider.id, key ?? null, false),
              );
              choices.set(index, {
                ...choice,
                capabilities: {
                  models: result.models.map((model) => model.id),
                },
              });
              succeeded++;
            } catch (error: unknown) {
              choices.set(index, choice);
              failure(
                'MODELS_UNAVAILABLE',
                error instanceof Error
                  ? `Models unavailable for provider ${provider.id}.`
                  : `Model lookup failed for provider ${provider.id}.`,
              );
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(4, providers.length) }, worker),
        );
        mainProviders.push(
          ...[...choices]
            .sort(([left], [right]) => left - right)
            .map(([, choice]) => choice),
        );
      } catch (error: unknown) {
        failure(
          'PROVIDERS_UNAVAILABLE',
          error instanceof Error
            ? 'Provider catalog unavailable.'
            : 'Provider lookup failed.',
        );
      }
    };
    const lanes: BotLaneChoice[] = [];
    const runtime = selection?.runtime;
    const cliTypes = SYSTEM_CLI_TYPES.filter(
      (cli) =>
        !runtime ||
        (runtime.kind === 'lane' &&
          runtime.target.kind === 'system' &&
          runtime.target.cli === cli),
    );
    const cliTasks = cliTypes.map(async (cli): Promise<BotLaneChoice> => {
      try {
        // Cursor uses the bundled SDK; installation says nothing about credentials.
        const command = cli === 'antigravity' ? 'agy' : cli;
        const available = this.deps.executable
          ? await bounded(() => this.deps.executable?.(command) ?? false)
          : cli === 'cursor' ||
            (await bounded(() => resolveCliPath(command))) !== null;
        succeeded++;
        return {
          target: { kind: 'system', cli },
          label: cli,
          available,
          capabilities: {},
        };
      } catch (error: unknown) {
        failure(
          'CLI_CATALOG_UNAVAILABLE',
          error instanceof Error
            ? 'CLI installation lookup unavailable.'
            : 'CLI lookup failed.',
        );
        return {
          target: { kind: 'system', cli },
          label: cli,
          available: false,
          capabilities: {},
        };
      }
    });
    const registryTask = (): void => {
      if (
        runtime &&
        (runtime.kind !== 'lane' || runtime.target.kind !== 'ptah-cli')
      )
        return;
      try {
        // Same key read by PtahCliConfigPersistence.loadConfigs, without ensureMigrated.
        const registry = z
          .array(z.unknown())
          .parse(
            this.deps.config.getWithDefault<unknown>(
              PTAH_CLI_AGENTS_CONFIG_KEY,
              [],
            ),
          );
        const seenLaneIds = new Set<string>();
        for (const [index, raw] of registry.entries()) {
          const parsed = RegistryEntrySchema.safeParse(raw);
          if (!parsed.success) {
            failure(
              'LANE_ENTRY_INVALID',
              `Ptah CLI registry entry ${index} is malformed.`,
            );
            continue;
          }
          const entry = parsed.data;
          if (
            runtime?.kind === 'lane' &&
            runtime.target.kind === 'ptah-cli' &&
            entry.id !== runtime.target.ptahCliId
          )
            continue;
          if (seenLaneIds.has(entry.id)) {
            failure(
              'LANE_ENTRY_DUPLICATE',
              `Duplicate Ptah CLI registry entry ${index}.`,
            );
            continue;
          }
          seenLaneIds.add(entry.id);
          lanes.push({
            target: { kind: 'ptah-cli', ptahCliId: entry.id },
            label: entry.name,
            available: entry.enabled,
            capabilities: {},
          });
        }
        succeeded++;
      } catch (error: unknown) {
        failure(
          'LANE_CATALOG_UNAVAILABLE',
          error instanceof Error
            ? 'Ptah CLI registry unavailable.'
            : 'Registry lookup failed.',
        );
      }
    };
    let skills: BotEditable['skills'] = [];
    const skillsTask = async (): Promise<void> => {
      try {
        const sources = await bounded(() =>
          this.deps.sources.resolve(
            scope.kind === 'workspace' ? scope.workspaceRoot : undefined,
          ),
        );
        if (sources.policyUnknown || sources.overlayPluginPathsKnown === false)
          failure(
            'SKILLS_PARTIAL',
            'Skill source policy or plugin overlay could not be read.',
          );
        skills = readSkillCandidates(sources).map((candidate) => ({
          id: candidate.slug,
        }));
        succeeded++;
      } catch (error: unknown) {
        failure(
          'SKILLS_UNAVAILABLE',
          error instanceof Error
            ? 'Skill catalog unavailable.'
            : 'Skill lookup failed.',
        );
      }
    };
    try {
      await Promise.all([
        providersTask(),
        Promise.all(cliTasks).then((choices) => lanes.unshift(...choices)),
        registryTask(),
        skillsTask(),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const toolIds = [...CLAUDE_BUILTIN_TOOL_IDS];
    const unresolved = (code: string, field: string, message: string): void => {
      diagnostics.push({ code, field, message, severity: 'warning' });
    };
    if (selection) {
      for (const skill of selection.skills)
        if (!skills.some((known) => known.id === skill.id))
          unresolved(
            'SKILL_UNRESOLVED',
            'skills',
            'Selected skill is unavailable.',
          );
      for (const tool of [
        ...selection.toolRequirements.allow,
        ...selection.toolRequirements.deny,
      ])
        if (!toolIds.includes(tool))
          unresolved(
            'TOOL_UNRESOLVED',
            'toolRequirements',
            'Selected tool is unavailable.',
          );
      const runtime = selection.runtime;
      if (runtime.kind !== 'default') {
        const capabilities =
          runtime.kind === 'main'
            ? mainProviders.find(
                (provider) => provider.providerId === runtime.providerId,
              )?.capabilities
            : lanes.find(
                (lane) =>
                  lane.available &&
                  JSON.stringify(lane.target) ===
                    JSON.stringify(runtime.target),
              )?.capabilities;
        if (!capabilities)
          unresolved(
            'RUNTIME_UNRESOLVED',
            'runtime',
            'Selected runtime is unavailable.',
          );
        else {
          if (
            (runtime.model && !capabilities.models) ||
            (runtime.effort && !capabilities.efforts) ||
            (runtime.kind === 'lane' &&
              runtime.modelTier &&
              !capabilities.modelTiers)
          )
            unresolved(
              'CAPABILITIES_UNKNOWN',
              'runtime',
              'Selected runtime capabilities could not be verified.',
            );
          if (
            runtime.model &&
            capabilities.models &&
            !capabilities.models.includes(runtime.model)
          )
            unresolved(
              'MODEL_UNRESOLVED',
              'runtime.model',
              'Selected model is unavailable.',
            );
          if (
            runtime.effort &&
            capabilities.efforts &&
            !capabilities.efforts.includes(runtime.effort)
          )
            unresolved(
              'EFFORT_UNSUPPORTED',
              'runtime.effort',
              'Selected effort is unsupported.',
            );
          if (
            runtime.kind === 'lane' &&
            runtime.modelTier &&
            capabilities.modelTiers &&
            !capabilities.modelTiers.includes(runtime.modelTier)
          )
            unresolved(
              'MODEL_TIER_UNSUPPORTED',
              'runtime.modelTier',
              'Selected model tier is unsupported.',
            );
        }
      }
    }
    return {
      status:
        failed === 0 ? 'available' : succeeded ? 'partial' : 'unavailable',
      mainProviders,
      lanes,
      skills,
      toolIds,
      diagnostics,
    };
  }
}
