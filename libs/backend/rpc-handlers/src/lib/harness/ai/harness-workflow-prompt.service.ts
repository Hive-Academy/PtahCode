import { inject, injectable } from 'tsyringe';
import type {
  HarnessWorkflowPromptParams,
  HarnessWorkflowPromptResponse,
} from '@ptah-extension/shared';

import { HARNESS_TOKENS } from '../tokens';
import { HarnessWorkspaceContextService } from '../workspace/harness-workspace-context.service';

@injectable()
export class HarnessWorkflowPromptService {
  constructor(
    @inject(HARNESS_TOKENS.WORKSPACE_CONTEXT)
    private readonly workspaceContext: HarnessWorkspaceContextService,
  ) {}

  async composePrompt(
    params:
      | HarnessWorkflowPromptParams
      | { mode: 'configure-harness'; contextOnly: true; intent?: undefined },
  ): Promise<HarnessWorkflowPromptResponse> {
    const workspaceContext =
      await this.workspaceContext.resolveWorkspaceContext();
    const availableAgents = this.workspaceContext.getAvailableAgents();
    const availableSkills = this.workspaceContext.discoverAvailableSkills();

    const agentList = availableAgents
      .map(
        (a) =>
          `- ${a.id}: ${a.name} (${a.type}, ${a.available ? 'available' : 'unavailable'})`,
      )
      .join('\n');

    const skillList =
      availableSkills.length > 0
        ? availableSkills
            .map((s) => `- ${s.id}: ${s.name} — ${s.description}`)
            .join('\n')
        : '(none discovered)';

    const isEmptyWorkspace =
      await this.workspaceContext.isWorkspaceEffectivelyEmpty();

    const contextBlock = `Project: ${workspaceContext.projectName} (${workspaceContext.projectType})
Frameworks: ${workspaceContext.frameworks.join(', ') || '(none detected)'}
Languages: ${workspaceContext.languages.join(', ') || '(none detected)'}`;

    const toolsBlock = `## Tools
Use the ptah.harness MCP tools to ground your recommendations:
- searchSkills(query?, limit?) — find existing skills relevant to the user's needs across local plugin skills (incl. harness-authored) and the skills.sh marketplace; results are tagged source: 'local' | 'skills.sh'. Do NOT shell out to install a skills.sh skill — record it on the config instead (see What Apply Writes) and Apply installs it for you.
- searchMcpRegistry(query, limit?) — search the official MCP Registry and Smithery (when a Smithery key is configured) for relevant servers; results are tagged source: 'official' | 'smithery'. \`limit\` bounds the merged list, drawn round-robin so no source starves the others.

READ THE STATUS FIELD. Both searches return \`status\` ('ok' | 'degraded') and a per-source \`sources\` array. An empty result is a real "nothing exists" answer ONLY when status is 'ok'; 'degraded' means a source failed and the answer is incomplete. Never tell the user a skill or server does not exist, and never author a replacement for one, on the strength of a degraded search — retry it or say the catalogue was unreachable.
- listInstalledMcpServers() — check what MCP servers are already installed in the workspace.
- createSkill(name, description, content, allowedTools?, scope?) — author custom skills. \`scope\` is 'user' (default, loads in every workspace on this machine) or 'workspace' (loads in THIS project only, written under \`{ws}/.ptah/plugins\` beside \`.ptah/specs\` so it can be committed and travels with the repo). Prefer 'workspace' for any skill that names this codebase, its conventions or its domain; keep 'user' for genuinely reusable ones.
- proposeConfig(configUpdates, isConfigComplete?) — push partial HarnessConfig updates to the configuration surface. Call proposeConfig whenever configuration decisions firm up (persona, agents, skills, system prompt, MCP servers); configUpdates is a partial HarnessConfig — only include fields you are changing. Four of its fields are objects keyed by name, NOT lists: \`agents.enabledAgents\` is {"<agent-id>": {"enabled": true}}, \`mcp.enabledTools\` is {"<server-name>": ["<tool-name>"]}, and \`prompt.enhancedSections\` and \`claudeMd.customSections\` are {"<section-title>": "<markdown body>"}. Call it again with isConfigComplete=true once the configuration is ready to apply.`;

    const applyExpectations = `## What Apply Writes
When the user clicks Apply, Ptah materializes the configuration:
- \`.claude/CLAUDE.md\` — the team's system prompt / guidance.
- \`.claude/agents/*.md\` — one file per designed subagent.
- \`~/.ptah/plugins/ptah-harness-*/skills/*/SKILL.md\` — one per entry in skills.createdSkills, written at apply time if you did not already author it with createSkill.
- \`.claude/skills/\` — junctions for skills that exist on disk under an enabled plugin or a ptah-harness-* plugin, PLUS every skills.sh skill installed from \`skills.selectedSkillRefs\`.
- \`.mcp.json\` and \`.vscode/mcp.json\` — every enabled mcp.servers entry you recorded WITH a transport config.
- \`~/.ptah/harnesses/<name>.json\` — the reusable preset.

A skills.sh skill is only installed if you record its origin alongside the id. Put the id in \`skills.selectedSkills\` and the origin in \`skills.selectedSkillRefs\`:
\`{ skills: { selectedSkills: ['frontend-design'], selectedSkillRefs: [{ skillId: 'frontend-design', source: 'skills.sh', installSource: 'anthropics/skills' }] } }\`
\`installSource\` is the \`owner/repo\` slug that searchSkills returns on the result — copy it verbatim. There is no \`scope\` key: it was removed when installs moved to the source-root reconciler, and a ref that still carries one has it stripped.
Locally discovered skills need no ref — just the id in \`selectedSkills\`. A skills.sh skill recorded without an \`installSource\` is NOT installed, and the user is warned to add it by hand.

An MCP entry is only installed if you give it a \`config\`. Record servers like this:
\`{ name: 'github', url: '', enabled: true, config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } }\`
for a local server, or \`config: { type: 'http', url: 'https://…/mcp' }\` for a remote one. Optional: \`serverKey\` (config key, defaults to name) and \`installTargets\` (defaults to ['claude','vscode']).
An entry without a \`config\` is still described in CLAUDE.md but is NOT installed, and the user is warned to add it by hand — so only omit the config when you genuinely cannot determine the transport.
Set the user's expectations accordingly as the design firms up.`;

    const scopeBlock = `## What You Are Building
The user wants a team that Ptah itself runs for them: its own agents, skills, plugins and MCP servers, working inside this workspace. The team can do any kind of work the user names, for example social media management, research, customer support, operations, content, or software work on an existing codebase.
- The deliverable is the team configuration, not an application. Do not plan, architect or scaffold a software product here.
- Design around the work: who does what, which recurring tasks each agent owns, what each agent hands to the next, which skills hold the team's own methods, and which MCP servers reach the outside tools the work needs (for example publishing, calendars, analytics, ticketing).
- Write the system prompt and the agent descriptions in the language of the team's domain. Do not assume the work is coding unless the user says so or the workspace clearly is a codebase.
- If the user actually wants to build a product to ship to their own users (a SaaS, an app, an API), tell them once that Setup > New project is the guided path for that, then continue only with a team they want Ptah to run.`;

    const emptyWorkspaceBlock = `## Empty Workspace
This workspace has no files yet. That is normal for a team that does not work on code: the folder becomes the team's working directory.
1. Read any seed documents the user dropped in or attached (briefs, brand guides, process notes).
2. Interview the user about the work: the goal, the recurring tasks, the tools and accounts involved, what needs their approval, and what a good result looks like.
3. Then design the team and call proposeConfig as decisions firm up.`;

    const intentBlock =
      'contextOnly' in params && params.contextOnly
        ? ''
        : `\n\n## User's Intent\n${params.intent}`;

    const opening =
      'You are a team architect collaborating with a user to design a team that Ptah runs for them. Work conversationally and drive the configuration to completion.';

    const prompt = `${opening}

## Workspace
${contextBlock}

${scopeBlock}
${
  isEmptyWorkspace
    ? `
${emptyWorkspaceBlock}
`
    : ''
}
## Available Agents
${agentList}

## Available Skills
${skillList}

${toolsBlock}

Actively search for and recommend relevant skills and MCP servers beyond what the user explicitly asks for. Ask clarifying questions when intent is unclear, and call proposeConfig early and often so the surface reflects the evolving configuration.

${applyExpectations}${intentBlock}`;

    return { prompt };
  }
}
