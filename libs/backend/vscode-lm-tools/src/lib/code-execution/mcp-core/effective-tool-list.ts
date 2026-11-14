import type { McpCallerBinding, McpCallerCapability } from '@ptah-extension/platform-core';
import type { McpToolProfile } from '@ptah-extension/shared';
import type { MCPToolDefinition } from '../types';
import type { McpCaller } from './mcp-caller';
import { isToolPermitted } from './mcp-caller-policy';
import { applyPhaseToolFilter } from './mcp-caller-phase-filter';
import { APPS_ONLY_TOOL_NAMES } from './mcp-tool-profile';

import { buildAgentWaitTool } from './agent-wait.tool';
import { buildRunCheckTool } from './run-check.tool';
import { buildRunCheckWaitTool } from './run-check-wait.tool';
import { buildExecuteCodeTool, buildApprovalPromptTool, buildWorkspaceAnalyzeTool, buildSearchFilesTool, buildGetDiagnosticsTool, buildLspReferencesTool, buildLspDefinitionsTool, buildGetDirtyFilesTool, buildCountTokensTool, buildAgentSpawnTool, buildAgentStatusTool, buildAgentReadTool, buildAgentMessageTool, buildAgentMessageStatusTool, buildAgentMessageControlTool, buildAgentMessageAckTool, buildAgentReportTool, buildAgentListTool, buildAgentStopTool, buildWebSearchTool, buildWorktreeListTool, buildWorktreeAddTool, buildWorktreeRemoveTool, buildJsonValidateTool, buildBrowserNavigateTool, buildBrowserScreenshotTool, buildBrowserEvaluateTool, buildBrowserClickTool, buildBrowserTypeTool, buildBrowserContentTool, buildBrowserNetworkTool, buildBrowserCloseTool, buildBrowserStatusTool, buildBrowserRecordStartTool, buildBrowserRecordStopTool, buildHarnessSearchSkillsTool, buildHarnessCreateSkillTool, buildHarnessSearchMcpRegistryTool, buildHarnessListInstalledMcpTool, buildHarnessInstallMcpTool, buildHarnessProposeConfigTool, buildAstAnalyzeTool, buildContextEnrichFileTool, buildGetDependentsTool, buildGetDependenciesTool, buildCodeSearchSymbolsTool, buildCodeReindexTool, buildMemorySearchTool, buildRelevanceRankFilesTool, buildProjectDetectMonorepoTool, buildGetSymbolIndexTool, buildTaskCreateTool, buildTaskUpdateTool, buildTaskGetTool, buildTaskListTool, buildTaskCheckTool } from './tool-description.builder';
import { buildDashboardProposeSpecTool } from './dashboard-propose-spec.tool';
import { buildSurfaceGetStateTool, buildSurfaceUpdateTool } from './surface-tools';
import { buildArtifactPublishTool } from './artifact-tools';
import { buildSessionLinkTaskTool } from './session-organization-tools';
import { buildSessionClearFinishedTool, buildSessionHandoffTool, buildSessionReadTool, buildSessionSendTool, buildSessionStartTool, buildSessionStatusTool, buildSessionStopTool } from './session-tools';
import { lifecycleTools } from './lifecycle-tools';
import { buildRouteDecideTool } from './route-tools';
import { buildOutcomeReportTool } from './tools/outcome-report.tool';

export interface EffectiveToolListDependencies {
  readonly hasIDECapabilities?: boolean;
  readonly disabledMcpNamespaces?: readonly string[];
}

/** Ordered definitions visible to the exact caller and phase credential. */
export function composeEffectiveToolList(
  caller: McpCaller,
  profile: McpToolProfile,
  capability: McpCallerCapability,
  binding: McpCallerBinding | undefined,
  deps: EffectiveToolListDependencies,
): MCPToolDefinition[] {
  return applyPhaseToolFilter(
    buildToolSet(caller, profile, deps).filter((tool) =>
      isToolPermitted(tool.name, capability),
    ),
    binding,
  );
}

/**
 * The ordered tool list for one caller — the single composition point for
 * per-caller tool sets.
 *
 * The profile keys the per-caller set: coding drops the Apps-only tools.
 * Every caller kind receives a byte-stable list within its profile, keeping
 * the order produced by buildToolDefinitions for prompt-cache stability.
 */
function buildToolSet(
  caller: McpCaller,
  profile: McpToolProfile,
  deps: EffectiveToolListDependencies,
): MCPToolDefinition[] {
  const all = buildToolDefinitions(deps);
  return profile === 'apps'
    ? all
    : all.filter((tool) => !APPS_ONLY_TOOL_NAMES.has(tool.name));
}

/** The tool definitions this host lists, after namespace and capability gating. */
export function buildToolDefinitions(
  deps: EffectiveToolListDependencies,
): MCPToolDefinition[] {
  const disabled = new Set(deps.disabledMcpNamespaces ?? []);

  return [
    buildWorkspaceAnalyzeTool(),
    buildSearchFilesTool(),
    buildGetDiagnosticsTool(),
    buildCountTokensTool(),
    buildWebSearchTool(),
    buildExecuteCodeTool(),
    buildApprovalPromptTool(),
    // Always-on: deliberately NOT wrapped in a `disabled.has(...)` guard.
    buildTaskCreateTool(),
    buildTaskUpdateTool(),
    buildTaskGetTool(),
    buildTaskListTool(),
    buildTaskCheckTool(),
    // Always-on beside the task tools (TASK_2026_580, D12): an agent that
    // cannot rely on it would leave its session unlinked from the task.
    buildSessionLinkTaskTool(),
    // Always-on (TASK_2026_655): the budget banner's handoff action relies on
    // it, so the `agent` toggle must not remove it.
    buildSessionHandoffTool(),
    ...lifecycleTools.map((tool) => tool.definition),
    // Always-on (TASK_2026_646): staffing one request stays listed when the
    // `agent` toggle is off. Not eager — see ALWAYS_EAGER_TOOLS.
    buildRouteDecideTool(),
    // Listed on every tools/list, not eager (TASK_2026_646): markEagerTools
    // leaves it deferred, the same way as execute_code.
    buildOutcomeReportTool(),
    // Listed only under the apps profile (TASK_2026_595), filtered in buildToolSet.
    buildDashboardProposeSpecTool(),
    buildSurfaceUpdateTool(),
    buildSurfaceGetStateTool(),
    buildArtifactPublishTool(),
    ...(deps.hasIDECapabilities === true && !disabled.has('ide')
      ? [
          buildLspReferencesTool(),
          buildLspDefinitionsTool(),
          buildGetDirtyFilesTool(),
        ]
      : []),
    ...(!disabled.has('agent')
      ? [
          buildAgentSpawnTool(),
          buildAgentStatusTool(),
          buildAgentReadTool(),
          buildAgentMessageTool(),
          buildAgentMessageStatusTool(),
          buildAgentMessageControlTool(),
          buildAgentMessageAckTool(),
          buildAgentReportTool(),
          buildAgentStopTool(),
          buildAgentListTool(),
          // Child chat sessions (TASK_2026_584): the same group, so the one
          // `agent` toggle governs every way to start delegated work.
          buildSessionStartTool(),
          buildSessionSendTool(),
          buildSessionStatusTool(),
          buildSessionReadTool(),
          buildSessionStopTool(),
          buildSessionClearFinishedTool(),
          // Blocking waits (TASK_2026_597, D13): one call instead of a
          // ptah_agent_status loop, and an Nx check that blocks until it ends.
          // Both are orchestration steps, so the `agent` toggle governs them.
          buildAgentWaitTool(),
          buildRunCheckTool({ transport: 'http' }),
          buildRunCheckWaitTool(),
        ]
      : []),
    ...(!disabled.has('git')
      ? [
          buildWorktreeListTool(),
          buildWorktreeAddTool(),
          buildWorktreeRemoveTool(),
        ]
      : []),
    ...(!disabled.has('json') ? [buildJsonValidateTool()] : []),
    ...(!disabled.has('browser')
      ? [
          buildBrowserNavigateTool(),
          buildBrowserScreenshotTool(),
          buildBrowserEvaluateTool(),
          buildBrowserClickTool(),
          buildBrowserTypeTool(),
          buildBrowserContentTool(),
          buildBrowserNetworkTool(),
          buildBrowserCloseTool(),
          buildBrowserStatusTool(),
          buildBrowserRecordStartTool(),
          buildBrowserRecordStopTool(),
        ]
      : []),
    ...(!disabled.has('harness')
      ? [
          buildHarnessSearchSkillsTool(),
          buildHarnessCreateSkillTool(),
          buildHarnessSearchMcpRegistryTool(),
          buildHarnessListInstalledMcpTool(),
          buildHarnessInstallMcpTool(),
          buildHarnessProposeConfigTool(),
        ]
      : []),
    ...(!disabled.has('code')
      ? [
          buildAstAnalyzeTool(),
          buildContextEnrichFileTool(),
          buildGetDependentsTool(),
          buildGetDependenciesTool(),
          buildGetSymbolIndexTool(),
          buildCodeSearchSymbolsTool(),
          buildCodeReindexTool(),
          buildMemorySearchTool(),
          buildRelevanceRankFilesTool(),
          buildProjectDetectMonorepoTool(),
        ]
      : []),
  ];
}

