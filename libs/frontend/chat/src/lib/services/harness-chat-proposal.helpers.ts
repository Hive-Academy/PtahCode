import type {
  AgentOverride,
  HarnessConfig,
  HarnessSkillRef,
  HarnessSubagentDefinition,
  McpServerEntry,
  NewSkillDefinition,
} from '@ptah-extension/shared';

/** Stored harness proposal scoped to a single chat session. */
export interface HarnessProposalRecord {
  readonly sessionId: string;
  readonly workspaceRoot?: string;
  readonly configUpdates: Partial<HarnessConfig>;
  readonly isConfigComplete: boolean;
  readonly updatedAt: string;
}

/** Apply lifecycle state for a session's harness proposal. */
export interface HarnessProposalApplyState {
  readonly status: 'idle' | 'applying' | 'applied' | 'error';
  readonly appliedCount?: number;
  readonly warnings?: readonly string[];
  readonly errorMessage?: string;
  readonly appliedConfigFingerprint?: string;
}

/** Default idle apply state returned when a session has not started applying. */
export const IDLE_HARNESS_APPLY_STATE: HarnessProposalApplyState = {
  status: 'idle',
};

/** Derived item counts rendered by `HarnessProposalBannerComponent`. */
export interface HarnessProposalSummary {
  readonly name: string | null;
  readonly enabledAgentCount: number;
  readonly subagentCount: number;
  readonly skillCount: number;
  readonly mcpServerCount: number;
  readonly hasClaudeMd: boolean;
  readonly hasSystemPrompt: boolean;
}

/**
 * Validated output shape of `HarnessConfigUpdatesSchema`, where nested sections
 * are themselves partial so incremental `proposeConfig` calls can omit keys.
 */
export interface ParsedHarnessConfigUpdates {
  readonly name?: string;
  readonly persona?: {
    readonly label?: string;
    readonly description?: string;
    readonly goals?: string[];
    readonly templateId?: string;
  };
  readonly agents?: {
    readonly enabledAgents?: Record<string, AgentOverride>;
    readonly harnessSubagents?: HarnessSubagentDefinition[];
  };
  readonly skills?: {
    readonly selectedSkills?: string[];
    readonly selectedSkillRefs?: HarnessSkillRef[];
    readonly createdSkills?: NewSkillDefinition[];
  };
  readonly prompt?: {
    readonly systemPrompt?: string;
    readonly enhancedSections?: Record<string, string>;
  };
  readonly mcp?: {
    readonly servers?: McpServerEntry[];
    readonly enabledTools?: Record<string, string[]>;
  };
  readonly claudeMd?: {
    readonly generateProjectClaudeMd?: boolean;
    readonly customSections?: Record<string, string>;
    readonly previewContent?: string;
  };
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** True when `configUpdates` proposes at least one harness section or name. */
export function hasMeaningfulHarnessProposal(
  configUpdates: Partial<HarnessConfig>,
): boolean {
  return (
    Boolean(configUpdates.name?.trim()) ||
    configUpdates.persona !== undefined ||
    configUpdates.agents !== undefined ||
    configUpdates.skills !== undefined ||
    configUpdates.prompt !== undefined ||
    configUpdates.mcp !== undefined ||
    configUpdates.claudeMd !== undefined
  );
}

/** Summarize proposed counts and display name for the in-chat apply banner. */
export function summarizeHarnessProposal(
  configUpdates: Partial<HarnessConfig>,
): HarnessProposalSummary {
  const name =
    configUpdates.name?.trim() || configUpdates.persona?.label?.trim() || null;

  const enabledAgentCount = Object.values(
    configUpdates.agents?.enabledAgents ?? {},
  ).filter((override) => override.enabled).length;

  const subagentCount = (configUpdates.agents?.harnessSubagents ?? []).length;

  const uniqueSkills = new Set<string>();
  for (const id of configUpdates.skills?.selectedSkills ?? []) {
    const trimmed = id.trim();
    if (trimmed.length > 0) uniqueSkills.add(trimmed);
  }
  for (const created of configUpdates.skills?.createdSkills ?? []) {
    const trimmed = created.name.trim();
    if (trimmed.length > 0) uniqueSkills.add(trimmed);
  }

  const mcpServerCount = (configUpdates.mcp?.servers ?? []).filter(
    (server) => server.enabled !== false,
  ).length;

  const hasClaudeMd =
    configUpdates.claudeMd !== undefined &&
    configUpdates.claudeMd.generateProjectClaudeMd !== false;

  const hasSystemPrompt = Boolean(
    configUpdates.prompt?.systemPrompt?.trim() ||
      Object.keys(configUpdates.prompt?.enhancedSections ?? {}).length > 0,
  );

  return {
    name,
    enabledAgentCount,
    subagentCount,
    skillCount: uniqueSkills.size,
    mcpServerCount,
    hasClaudeMd,
    hasSystemPrompt,
  };
}

/**
 * Merge a schema-validated incremental update onto an existing `Partial<HarnessConfig>`
 * without losing previously proposed nested fields.
 */
export function mergeParsedHarnessUpdates(
  base: Partial<HarnessConfig>,
  update: ParsedHarnessConfigUpdates,
): Partial<HarnessConfig> {
  const merged: Partial<HarnessConfig> = { ...base };

  if (update.name !== undefined && update.name.trim().length > 0) {
    merged.name = update.name;
  }
  if (update.persona !== undefined) {
    const templateId = update.persona.templateId ?? base.persona?.templateId;
    merged.persona = {
      label: update.persona.label ?? base.persona?.label ?? '',
      description:
        update.persona.description ?? base.persona?.description ?? '',
      goals: update.persona.goals ?? base.persona?.goals ?? [],
      ...(templateId !== undefined ? { templateId } : {}),
    };
  }
  if (update.agents !== undefined) {
    const subagents =
      update.agents.harnessSubagents ?? base.agents?.harnessSubagents;
    merged.agents = {
      enabledAgents: {
        ...(base.agents?.enabledAgents ?? {}),
        ...(update.agents.enabledAgents ?? {}),
      },
      ...(subagents !== undefined ? { harnessSubagents: subagents } : {}),
    };
  }
  if (update.skills !== undefined) {
    const selectedSkills =
      update.skills.selectedSkills ?? base.skills?.selectedSkills ?? [];
    const retainedRefs = (base.skills?.selectedSkillRefs ?? []).filter(
      (ref) =>
        update.skills?.selectedSkills === undefined ||
        selectedSkills.includes(ref.skillId),
    );
    const refsById = new Map(retainedRefs.map((ref) => [ref.skillId, ref]));
    for (const ref of update.skills.selectedSkillRefs ?? []) {
      refsById.set(ref.skillId, ref);
    }
    merged.skills = {
      selectedSkills,
      ...(refsById.size > 0
        ? { selectedSkillRefs: [...refsById.values()] }
        : {}),
      createdSkills:
        update.skills.createdSkills ?? base.skills?.createdSkills ?? [],
    };
  }
  if (update.prompt !== undefined) {
    merged.prompt = {
      systemPrompt:
        update.prompt.systemPrompt ?? base.prompt?.systemPrompt ?? '',
      enhancedSections: {
        ...(base.prompt?.enhancedSections ?? {}),
        ...(update.prompt.enhancedSections ?? {}),
      },
    };
  }
  if (update.mcp !== undefined) {
    merged.mcp = {
      servers: update.mcp.servers ?? base.mcp?.servers ?? [],
      enabledTools: {
        ...(base.mcp?.enabledTools ?? {}),
        ...(update.mcp.enabledTools ?? {}),
      },
    };
  }
  if (update.claudeMd !== undefined) {
    merged.claudeMd = {
      generateProjectClaudeMd:
        update.claudeMd.generateProjectClaudeMd ??
        base.claudeMd?.generateProjectClaudeMd ??
        true,
      customSections: {
        ...(base.claudeMd?.customSections ?? {}),
        ...(update.claudeMd?.customSections ?? {}),
      },
      previewContent:
        update.claudeMd.previewContent ?? base.claudeMd?.previewContent ?? '',
    };
  }
  if (update.createdAt !== undefined) {
    merged.createdAt = update.createdAt;
  }
  if (update.updatedAt !== undefined) {
    merged.updatedAt = update.updatedAt;
  }

  return merged;
}

/** Fill omitted sections with safe defaults so `harness:apply` receives a full `HarnessConfig`. */
export function buildFullHarnessConfig(
  partial: Partial<HarnessConfig>,
  workspaceRoot?: string,
): HarnessConfig {
  const now = new Date().toISOString();
  const folderName = workspaceRoot
    ?.split(/[\\/]/)
    .filter((segment) => segment.length > 0)
    .at(-1);
  const fallbackName =
    folderName && folderName.length > 0 ? folderName : 'workspace';

  return {
    name:
      partial.name?.trim() || partial.persona?.label?.trim() || fallbackName,
    persona: partial.persona ?? { label: '', description: '', goals: [] },
    agents: {
      enabledAgents: partial.agents?.enabledAgents ?? {},
      ...(partial.agents?.harnessSubagents !== undefined
        ? { harnessSubagents: partial.agents.harnessSubagents }
        : {}),
    },
    skills: {
      selectedSkills: partial.skills?.selectedSkills ?? [],
      ...(partial.skills?.selectedSkillRefs !== undefined
        ? { selectedSkillRefs: partial.skills.selectedSkillRefs }
        : {}),
      createdSkills: partial.skills?.createdSkills ?? [],
    },
    prompt: {
      systemPrompt: partial.prompt?.systemPrompt ?? '',
      enhancedSections: partial.prompt?.enhancedSections ?? {},
    },
    mcp: {
      servers: partial.mcp?.servers ?? [],
      enabledTools: partial.mcp?.enabledTools ?? {},
    },
    claudeMd: {
      generateProjectClaudeMd:
        partial.claudeMd?.generateProjectClaudeMd ?? true,
      customSections: partial.claudeMd?.customSections ?? {},
      previewContent: partial.claudeMd?.previewContent ?? '',
    },
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
  };
}

/** Deterministic string fingerprint used to detect config revisions after an apply. */
export function fingerprintHarnessConfig(
  configUpdates: Partial<HarnessConfig>,
): string {
  return JSON.stringify(configUpdates);
}

/** Convert an unknown failure or RPC error message into safe user-facing copy. */
export function extractReadableErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length > 0 && trimmed !== '[object Object]') {
      return trimmed;
    }
    return fallback;
  }
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed.length > 0 && trimmed !== '[object Object]'
      ? trimmed
      : fallback;
  }
  return fallback;
}
