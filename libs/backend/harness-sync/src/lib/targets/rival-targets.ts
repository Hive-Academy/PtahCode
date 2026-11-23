/**
 * The five non-Claude harness targets, as configurations of one engine.
 *
 * Each entry below is the complete answer to "where does this tool look for its
 * harness, and what can it accept". They are deliberately data, not classes:
 * the behaviour lives in `WorkspaceHarnessTarget`, and a new CLI is a new entry
 * here plus (if its agent format is novel) one transformer.
 *
 * ## Target × facet matrix
 *
 * | Target      | skills                  | commands                | agents                           |
 * |-------------|-------------------------|-------------------------|----------------------------------|
 * | codex       | `{ws}/.agents/skills`   | **unsupported**         | `{ws}/.codex/agents/*.toml`      |
 * | copilot     | `{ws}/.github/skills`   | **unsupported**         | `{ws}/.github/agents/*.agent.md` |
 * | cursor      | `{ws}/.cursor/skills`   | `{ws}/.cursor/commands` | `{ws}/.cursor/agents/*.md`       |
 * | antigravity | `{ws}/.agents/skills`   | **unsupported**         | **unsupported**                  |
 * | opencode    | **unsupported**         | **unsupported**         | `{ws}/.opencode/agent/*.md`      |
 *
 * ## No target writes MCP config
 *
 * The `mcp` facet is `unsupported` on every target (TASK_2026_979, decision
 * row 10). Ptah no longer writes `~/.codex/config.toml`,
 * `~/.copilot/mcp-config.json`, `{ws}/.cursor/mcp.json`,
 * `~/.gemini/config/mcp_config.json`, `{ws}/opencode.json` or
 * `{ws}/.vscode/mcp.json`. A Ptah-spawned lane gets its servers through the
 * Ptah gateway, which the spawn adapter passes inline; a CLI started outside
 * Ptah sees only the servers the user configured in it. The VS Code target
 * existed only to write `.vscode/mcp.json` and is gone.
 *
 * ### Why the `unsupported` cells are unsupported
 *
 * - **Codex commands.** Codex rejects project-scoped prompts; the prompt
 *   directory is home-only upstream (openai/codex#9848). Writing them into the
 *   workspace produced files Codex never read.
 * - **Copilot commands.** Copilot documents no project prompt directory
 *   (github/copilot-cli#2829).
 * - **Antigravity commands.** `agy`'s customization surface is Rules, Skills,
 *   Plugins, Hooks and MCP. There is no slash-command concept to target.
 * - **Antigravity agents.** `agy` documents no subagent format. A transformer
 *   would have to invent a file layout the CLI does not read, so the facet
 *   reports `unsupported` and the health surface says so out loud rather than
 *   showing agents permanently missing.
 * - **OpenCode skills.** Not a gap and not a missing capability: OpenCode
 *   discovers skills from `{ws}/.claude/skills` and `{ws}/.agents/skills` on
 *   its own, and both are directories Ptah already fills for OTHER targets. A
 *   third co-owner of `.agents/skills` would duplicate every skill for no
 *   behavioural change, so this target writes none and health reports no gap
 *   where none exists. Verified by probe: the 2026-09-22 OpenCode session saw
 *   every Ptah skill and none of its subagents.
 * - **OpenCode commands.** OpenCode does have a command concept
 *   (`Config.command`, `GET /api/command`), but its project-level discovery
 *   rules were not established by the probe that motivated this target. Left
 *   `unsupported` rather than guessed at — declaring a directory OpenCode may
 *   not read is exactly the failure the Codex `commands` row records.
 *
 * ## Codex and Antigravity share `{ws}/.agents/skills`
 *
 * That is `agy`'s native workspace root and also where Codex discovers skills.
 * Both targets are declared co-owners of the other, so each accepts the other's
 * manifest as proof of Ptah ownership. Without it, whichever CLI was installed
 * second would find the directory full of files it could not prove it wrote,
 * classify every one of them foreign, and never update a skill again.
 */

import type { HarnessFacetMatrix } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { ManagedManifestStore } from '../manifest-store/managed-manifest';
import type { IHarnessCliDetector } from '../sources/harness-source.port';
import type { IHarnessTarget } from './harness-target.port';
import { CodexAgentTransformer } from './transformers/codex-agent-transformer';
import { CopilotAgentTransformer } from './transformers/copilot-agent-transformer';
import { CursorAgentTransformer } from './transformers/cursor-agent-transformer';
import { OpencodeAgentTransformer } from './transformers/opencode-agent-transformer';
import { WorkspaceHarnessTarget } from './workspace-target';

function facets(supported: Partial<HarnessFacetMatrix>): HarnessFacetMatrix {
  return {
    skills: 'unsupported',
    commands: 'unsupported',
    agents: 'unsupported',
    mcp: 'unsupported',
    ...supported,
  };
}

/** The optional logger, spread into the target options. */
function logOptions(deps: RivalTargetDeps): { logger?: Pick<Logger, 'warn'> } {
  return deps.logger === undefined ? {} : { logger: deps.logger };
}

/** What every target factory needs from the host container. */
export interface RivalTargetDeps {
  manifestStore: ManagedManifestStore;
  detector: IHarnessCliDetector;
  /**
   * Read by no target since the MCP facets left (TASK_2026_979); still accepted
   * so existing fixtures that redirect the home directory keep compiling.
   */
  homeDir?: string;
  /**
   * Receives warnings about unreadable agent sources.
   * Optional, so specs and callers without a logger keep working.
   */
  logger?: Pick<Logger, 'warn'>;
}

export function createCodexTarget(deps: RivalTargetDeps): IHarnessTarget {
  return new WorkspaceHarnessTarget({
    id: 'codex',
    facets: facets({ skills: 'supported', agents: 'supported' }),
    manifestStore: deps.manifestStore,
    detector: deps.detector,
    skillsDirRel: '.agents/skills',
    agentTransformer: new CodexAgentTransformer(),
    ...logOptions(deps),
    coOwners: ['antigravity'],
  });
}

export function createCopilotTarget(deps: RivalTargetDeps): IHarnessTarget {
  return new WorkspaceHarnessTarget({
    id: 'copilot',
    facets: facets({ skills: 'supported', agents: 'supported' }),
    manifestStore: deps.manifestStore,
    detector: deps.detector,
    skillsDirRel: '.github/skills',
    agentTransformer: new CopilotAgentTransformer(),
    ...logOptions(deps),
  });
}

export function createCursorTarget(deps: RivalTargetDeps): IHarnessTarget {
  return new WorkspaceHarnessTarget({
    id: 'cursor',
    facets: facets({
      skills: 'supported',
      commands: 'supported',
      agents: 'supported',
    }),
    manifestStore: deps.manifestStore,
    detector: deps.detector,
    skillsDirRel: '.cursor/skills',
    commandsDirRel: '.cursor/commands',
    agentTransformer: new CursorAgentTransformer(),
    ...logOptions(deps),
  });
}

export function createAntigravityTarget(deps: RivalTargetDeps): IHarnessTarget {
  return new WorkspaceHarnessTarget({
    id: 'antigravity',
    facets: facets({ skills: 'supported' }),
    manifestStore: deps.manifestStore,
    detector: deps.detector,
    skillsDirRel: '.agents/skills',
    ...logOptions(deps),
    coOwners: ['codex'],
  });
}

/**
 * OpenCode (`opencode` v2), added because a live probe found Ptah's 15
 * subagents reaching every rival CLI except this one.
 *
 * Skills and MCP already arrive by other routes — OpenCode discovers
 * `.claude/skills` and `.agents/skills` itself, and the spawn adapter hands it
 * Ptah's own server through `OPENCODE_CONFIG_CONTENT` — so agents are the
 * whole gap.
 */
export function createOpencodeTarget(deps: RivalTargetDeps): IHarnessTarget {
  return new WorkspaceHarnessTarget({
    id: 'opencode',
    facets: facets({ agents: 'supported' }),
    manifestStore: deps.manifestStore,
    detector: deps.detector,
    agentTransformer: new OpencodeAgentTransformer(),
    ...logOptions(deps),
  });
}

/** Every rival target, in a stable order. */
export function createRivalTargets(deps: RivalTargetDeps): IHarnessTarget[] {
  return [
    createCodexTarget(deps),
    createCopilotTarget(deps),
    createCursorTarget(deps),
    createAntigravityTarget(deps),
    createOpencodeTarget(deps),
  ];
}
