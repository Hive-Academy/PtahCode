import { isDeepStrictEqual } from 'node:util';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import {
  CLI_LANE_DEFAULTS_SCHEMA, DEFAULT_CODEX_SANDBOX_MODE,
  PTAH_CLI_PERMISSION_CAPABILITIES, codexSandboxModeSchema,
  resolveCliLaneDefaultPair,
} from '@ptah-extension/shared';
import type {
  CliAdapterManifest, CliLaneDefaults, CliLaneDefaultsPatch, CliType,
  CodexSandboxMode,
} from '@ptah-extension/shared';

const section = 'ptah';
const defaultsKey = 'agentOrchestration.cliLaneDefaults';
const legacyKey = 'agentOrchestration.codexSandboxMode';

function readRaw(workspace: IWorkspaceProvider, key: string): unknown {
  return workspace.getConfiguration<unknown>(section, key, undefined);
}

function codexChoice(mode: CodexSandboxMode): CliLaneDefaults['codex'] {
  switch (mode) {
    case 'read-only': return { permission: 'plan', network: 'deny' };
    case 'workspace-write-no-network': return { permission: 'auto-edit', network: 'deny' };
    case 'workspace-write-network': return { permission: 'auto-edit', network: 'allow' };
    case 'danger-full-access': return { permission: 'yolo', network: 'allow' };
  }
}

function codexMode(choice: NonNullable<CliLaneDefaults['codex']>): CodexSandboxMode {
  return choice.permission === 'plan' ? 'read-only'
    : choice.permission === 'yolo' ? 'danger-full-access'
    : choice.network === 'deny' ? 'workspace-write-no-network' : 'workspace-write-network';
}

export function readCliLaneDefaults(workspace: IWorkspaceProvider): CliLaneDefaults {
  const parsed = CLI_LANE_DEFAULTS_SCHEMA.safeParse(readRaw(workspace, defaultsKey) ?? {});
  if (!parsed.success) throw new Error('Invalid agentOrchestration.cliLaneDefaults setting');
  if (parsed.data.codex) return parsed.data;
  const legacy = readRaw(workspace, legacyKey);
  if (legacy === undefined) return parsed.data;
  const mode = codexSandboxModeSchema.safeParse(legacy);
  if (!mode.success) throw new Error('Invalid agentOrchestration.codexSandboxMode setting');
  return { ...parsed.data, codex: codexChoice(mode.data) };
}

export function readCodexSandboxMode(workspace: IWorkspaceProvider): CodexSandboxMode {
  const saved = CLI_LANE_DEFAULTS_SCHEMA.parse(readRaw(workspace, defaultsKey) ?? {}).codex;
  if (saved) return codexMode(saved);
  const legacy = readRaw(workspace, legacyKey);
  if (legacy === undefined) return DEFAULT_CODEX_SANDBOX_MODE;
  const parsed = codexSandboxModeSchema.safeParse(legacy);
  if (!parsed.success) throw new Error('Invalid agentOrchestration.codexSandboxMode setting');
  return parsed.data;
}

function mergeDefaults(current: CliLaneDefaults, patch: CliLaneDefaultsPatch): CliLaneDefaults {
  const merged = { ...current };
  for (const [name, choice] of Object.entries(patch)) {
    const cli = name as CliType;
    if (choice === null) {
      delete merged[cli];
      continue;
    }
    const row = { ...merged[cli] };
    if (choice.permission === null) delete row.permission;
    else if (choice.permission !== undefined) row.permission = choice.permission;
    if (choice.network === null) delete row.network;
    else if (choice.network !== undefined) row.network = choice.network;
    if (cli === 'codex' && Object.keys(row).length === 0) delete merged.codex;
    else merged[cli] = row;
  }
  return merged;
}

export class UnsupportedCliLaneDefaultError extends Error {
  constructor(readonly cli: CliType) {
    super(`Unsupported cliLaneDefaults choice for ${cli}`);
  }
}

export function validateCliLaneDefaultsPatch(
  workspace: IWorkspaceProvider,
  patch: CliLaneDefaultsPatch | undefined,
  legacyMode: CodexSandboxMode | undefined,
  capabilities: (cli: CliType) => Pick<CliAdapterManifest, 'permissionModes' | 'networkModes'> | undefined,
): CliLaneDefaults {
  const codexTouched = legacyMode !== undefined || (patch !== undefined && Object.prototype.hasOwnProperty.call(patch, 'codex'));
  const current = codexTouched
    ? readCliLaneDefaults(workspace)
    : CLI_LANE_DEFAULTS_SCHEMA.parse(readRaw(workspace, defaultsKey) ?? {});
  const base = legacyMode === undefined ? current : { ...current, codex: codexChoice(legacyMode) };
  const merged = patch === undefined ? base : mergeDefaults(base, patch);
  for (const [name, choice] of Object.entries(merged)) {
    const cli = name as CliType;
    const manifest = cli === 'ptah-cli' ? PTAH_CLI_PERMISSION_CAPABILITIES : capabilities(cli);
    if (!manifest || 'unsupported' in resolveCliLaneDefaultPair(manifest, choice)) {
      throw new UnsupportedCliLaneDefaultError(cli);
    }
  }
  return merged;
}

/** Called inside the handler's serialized setConfig queue. */
export async function saveCliLaneDefaults(
  workspace: IWorkspaceProvider,
  patch: CliLaneDefaultsPatch | undefined,
  legacyMode: CodexSandboxMode | undefined,
  capabilities: (cli: CliType) => Pick<CliAdapterManifest, 'permissionModes' | 'networkModes'> | undefined,
): Promise<{ defaults: CliLaneDefaults; codexSandboxMode: CodexSandboxMode }> {
  const previousDefaults = readRaw(workspace, defaultsKey);
  const previousLegacy = readRaw(workspace, legacyKey);
  const merged = validateCliLaneDefaultsPatch(workspace, patch, legacyMode, capabilities);
  const codexTouched = legacyMode !== undefined || (patch !== undefined && Object.prototype.hasOwnProperty.call(patch, 'codex'));
  const nextLegacy = codexTouched ? (merged.codex ? codexMode(merged.codex) : undefined) : previousLegacy;
  const writes: ReadonlyArray<readonly [string, unknown]> = codexTouched
    ? [[defaultsKey, merged], [legacyKey, nextLegacy]]
    : [[defaultsKey, merged]];
  try {
    for (const [key, value] of writes) await workspace.setConfiguration(section, key, value);
  } catch (error: unknown) {
    const recoveryErrors: unknown[] = [];
    for (const [key, previous] of writes.map(([key]) => [key, key === defaultsKey ? previousDefaults : previousLegacy] as const)) {
      try {
        await workspace.setConfiguration(section, key, previous);
      } catch (rollbackError: unknown) {
        recoveryErrors.push(rollbackError);
      }
    }
    for (const [key, previous] of writes.map(([key]) => [key, key === defaultsKey ? previousDefaults : previousLegacy] as const)) {
      try {
        if (!isDeepStrictEqual(readRaw(workspace, key), previous)) {
          recoveryErrors.push(new Error(`CLI defaults recovery verification failed for ${key}`));
        }
      } catch (readError: unknown) {
        recoveryErrors.push(readError);
      }
    }
    if (recoveryErrors.length) throw new AggregateError([error, ...recoveryErrors], 'CLI defaults write and recovery failed');
    throw error;
  }
  return { defaults: readCliLaneDefaults(workspace), codexSandboxMode: readCodexSandboxMode(workspace) };
}
