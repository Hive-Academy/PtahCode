## libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:819 (thread PRRT_kwDOPngTds62AiWu)

**PtahCode**:
### 🟡 Minor · Workspace\-only plugin and skill resolution in registerStartNewProject ignores global capability layer disables

**Impact:** New project initialization \(harness:start\-new\-project\) skill availability resolution and seed prompt generation when global capability disables exist\.

When a required plugin \(such as ptah\-core or ptah\-nx\-saas\) or one of the profile's Stage A/domain skills is disabled in the global capability layer without a workspace\-level override, registerStartNewProject and resolveAvailableSkillIds read only the workspace layer via getWorkspacePluginConfig\(\) and discoverAvailableSkills\(\) \(which calls resolveCurrentPluginPaths\(\) and getDisabledSkillIds\(\)\)\. Meanwhile, reconcileHarness resolves desired state via PluginConfigSourceResolver\.resolveEffective, which calls getEffectivePluginConfig\(workspaceRoot\) and excludes globally disabled plugins and skills from being synced to the workspace harness directories\. As a result, resolveAvailableSkillIds reports the globally disabled skill as available and buildNewProjectSeedPrompt instructs the agent to invoke a skill that was never materialized in the workspace\.

**Evidence**

- [libs/backend/rpc\-handlers/src/lib/handlers/harness\-rpc\.handlers\.ts:819](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts#L819) — private resolveAvailableSkillIds\(workspaceRoot?: string\): string\[\] \{     try \{       const discovered = this\.workspaceContext         \.discoverAvailableSkills\(\)         \.filter\(\(skill\) =&gt; skill\.isActive\)         \.map\(\(skill\) =&gt; skill\.id\);

- [libs/backend/rpc\-handlers/src/lib/harness/workspace/harness\-workspace\-context\.service\.ts:351](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/rpc-handlers/src/lib/harness/workspace/harness-workspace-context.service.ts#L351) — const pluginPaths = this\.pluginLoader\.resolveCurrentPluginPaths\(\);       const pluginSkills =         this\.pluginLoader\.discoverSkillsForPlugins\(pluginPaths\);       const disabledSkillIds = new Set\(this\.pluginLoader\.getDisabledSkillIds\(\)\);

- [libs/backend/agent\-sdk/src/lib/helpers/plugin\-loader\.service\.ts:1978](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts#L1978) — \* WORKSPACE LAYER ONLY\. This method is synchronous and never reads the    \* global capability layer, so a plugin switched off globally \(with no    \* workspace entry\) is still in this overlay, and "restrictive on unknown"    \* covers a workspace\-config read failure only\. A caller whose answer affects    \* a session must use \{@link getEffectivePluginConfig\}

- [libs/backend/harness\-sync/src/lib/sources/plugin\-config\-source\-resolver\.ts:270](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/harness-sync/src/lib/sources/plugin-config-source-resolver.ts#L270) — const effective = await reader\.getEffectivePluginConfig?\.\(workspaceRoot\);       if \(effective === undefined\) return empty;       return \{         layout: empty\.layout,         mcpIntents: empty\.mcpIntents,         retired: empty\.retired,         overlayPluginPaths: effective\.overlayPluginPaths,         overlayPluginPathsKnown: true,         disabledSkillIds: effective\.config\.disabledSkillIds,

<details><summary>Prompt for AI agents</summary>

Update HarnessRpcHandlers\.resolveAvailableSkillIds \(or HarnessWorkspaceContextService\.discoverAvailableSkills\) to consult pluginLoader\.getEffectivePluginConfig\(workspaceRoot\) when available so that plugins and skills disabled in the global capability layer are excluded from availableSkillIds just as they are excluded during harness reconciliation\.

</details>

<!-- ptah-review:finding:01M7498XJ61N7AD2YRZNHVERYD -->

## libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:828 (thread PRRT_kwDOPngTds62AiWv)

**PtahCode**:
### 🟡 Minor · Unnormalized workspaceRoot passed to SkillSyncGate\.resolve in resolveAvailableSkillIds

**Impact:** Skill allowlist resolution in HarnessRpcHandlers\.resolveAvailableSkillIds after allowlistProfileSkills\.

SkillSyncGate\.keepSelected\(cwd, slugs\) normalizes its path argument via resolveHarnessWorkspaceRoot\(cwd\) before writing \.ptah/harness/state\.json, whereas SkillSyncGate\.resolve\(workspaceRoot\) explicitly requires an already\-normalized workspaceRoot and directly loads stateStore\.load\(workspaceRoot\)\. In HarnessRpcHandlers\.resolveAvailableSkillIds\(workspaceRoot\), the raw workspaceRoot from workspaceProvider\.getWorkspaceRoot\(\) is passed directly to this\.skillSyncGate\.resolve\(workspaceRoot\) without calling resolveHarnessWorkspaceRoot\(workspaceRoot\) \(unlike HarnessSkillSelectionRpcService\.resolveWorkspaceRoot which normalizes it first\)\. If workspaceProvider\.getWorkspaceRoot\(\) returns a subdirectory of a workspace that has an ancestor \.ptah or \.git marker, keepSelected writes state\.json to the ancestor root while resolve reads state\.json from the subdirectory, reading an empty derived allowlist and filtering out all Stage A skills\.

**Evidence**

- [libs/backend/rpc\-handlers/src/lib/handlers/harness\-rpc\.handlers\.ts:828](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts#L828) — const decision = this\.skillSyncGate\.resolve\(workspaceRoot\);       if \(decision\.mode === 'all'\) \{         return discovered;       \}

- [libs/backend/harness\-sync/src/lib/state/skill\-sync\-gate\.ts:100](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/harness-sync/src/lib/state/skill-sync-gate.ts#L100) — /\*\*    \* Read\-only\. \`workspaceRoot\` must already be normalized — the reconciler    \* resolves once at its entry point \(E14\) and every collaborator below it    \* assumes the real root\.    \*/   resolve\(workspaceRoot: string\): SkillSyncDecision \{

- [libs/backend/harness\-sync/src/lib/state/skill\-sync\-gate\.ts:193](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/harness-sync/src/lib/state/skill-sync-gate.ts#L193) — keepSelected\(cwd: string, slugs: readonly string\[\]\): boolean \{     const workspaceRoot = resolveHarnessWorkspaceRoot\(cwd\);     const decision = this\.resolve\(workspaceRoot\);

- [libs/backend/rpc\-handlers/src/lib/harness/selection/harness\-skill\-selection\-rpc\.service\.ts:189](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/rpc-handlers/src/lib/harness/selection/harness-skill-selection-rpc.service.ts#L189) — private resolveWorkspaceRoot\(\): string \| null \{     const root = this\.workspaceProvider\.getWorkspaceRoot\(\);     if \(root === undefined \|\| root === null \|\| root === ''\) return null;     return resolveHarnessWorkspaceRoot\(root\);   \}

**Proposed fix**

```diff
--- a/libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts
+++ b/libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts
@@ -36,6 +36,7 @@ import { SDK_TOKENS, PluginLoaderService } from '@ptah-extension/agent-sdk';
 import {
   HARNESS_SYNC_TOKENS,
+  resolveHarnessWorkspaceRoot,
   type HarnessPropagationService,
   type SkillSyncGate,
 } from '@ptah-extension/harness-sync';
@@ -825,7 +826,9 @@ export class HarnessRpcHandlers {
       if (!workspaceRoot) {
         return discovered;
       }
-      const decision = this.skillSyncGate.resolve(workspaceRoot);
+      const decision = this.skillSyncGate.resolve(
+        resolveHarnessWorkspaceRoot(workspaceRoot),
+      );
       if (decision.mode === 'all') {
         return discovered;
       }
```

<details><summary>Prompt for AI agents</summary>

Normalize workspaceRoot with resolveHarnessWorkspaceRoot\(workspaceRoot\) before passing it to this\.skillSyncGate\.resolve\(\.\.\.\) in HarnessRpcHandlers\.resolveAvailableSkillIds, matching the contract documented on SkillSyncGate\.resolve and used in HarnessSkillSelectionRpcService\.

</details>

<!-- ptah-review:finding:01M7498XJ9GDHKPB0A3MK9JM61 -->

## libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:821 (thread PRRT_kwDOPngTds62AiWy)

**PtahCode**:
### 🟡 Minor · HarnessRpcHandlers reads workspace\-only plugin/skill config instead of layered effective capability policy

**Impact:** harness:start\-new\-project plugin enablement and availableSkillIds resolution when global capability overrides exist

When a plugin \(such as ptah\-core\) or skill \(such as ddd\-architecture\) is disabled in the global capability layer without a workspace\-level override, HarnessReconcilerService \(via PluginConfigSourceResolver\.resolveEffective \-&gt; PluginLoaderService\.getEffectivePluginConfig\) omits that plugin or skill when reconciling \{ws\}/\.claude/skills, while HarnessRpcHandlers\.registerStartNewProject and resolveAvailableSkillIds read only the workspace layer via getWorkspacePluginConfig\(\) and discoverAvailableSkills\(\) \(which calls resolveCurrentPluginPaths\(\) and getDisabledSkillIds\(\)\)\. As a result, availableSkillIds and the generated seedPrompt include globally disabled skills that were never materialized to disk\.

**Evidence**

- [libs/backend/rpc\-handlers/src/lib/handlers/harness\-rpc\.handlers\.ts:821](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts#L821) — const discovered = this\.workspaceContext         \.discoverAvailableSkills\(\)         \.filter\(\(skill\) =&gt; skill\.isActive\)         \.map\(\(skill\) =&gt; skill\.id\);

- [libs/backend/rpc\-handlers/src/lib/harness/workspace/harness\-workspace\-context\.service\.ts:351](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/rpc-handlers/src/lib/harness/workspace/harness-workspace-context.service.ts#L351) — const pluginPaths = this\.pluginLoader\.resolveCurrentPluginPaths\(\);       const pluginSkills =         this\.pluginLoader\.discoverSkillsForPlugins\(pluginPaths\);       const disabledSkillIds = new Set\(this\.pluginLoader\.getDisabledSkillIds\(\)\);

- [libs/backend/agent\-sdk/src/lib/helpers/plugin\-loader\.service\.ts:1572](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts#L1572) — WORKSPACE LAYER ONLY\. This method is synchronous and never reads the    \* global capability layer, so a skill switched off globally \(with no    \* workspace entry\) is NOT in this list, and "restrictive on unknown" covers    \* a workspace\-config read failure only\. A caller whose answer affects a    \* session must use \{@link getEffectivePluginConfig\} instead\.

- [libs/backend/harness\-sync/src/lib/sources/plugin\-config\-source\-resolver\.ts:270](https://github.com/Hive-Academy/PtahCode/blob/61d3e1165728d1e6b52e50626d3f3f9dc620383c/libs/backend/harness-sync/src/lib/sources/plugin-config-source-resolver.ts#L270) — const effective = await reader\.getEffectivePluginConfig?\.\(workspaceRoot\);       if \(effective === undefined\) return empty;       return \{         layout: empty\.layout,         mcpIntents: empty\.mcpIntents,         retired: empty\.retired,         overlayPluginPaths: effective\.overlayPluginPaths,         overlayPluginPathsKnown: true,         disabledSkillIds: effective\.config\.disabledSkillIds,

<details><summary>Prompt for AI agents</summary>

Update HarnessRpcHandlers\.resolveAvailableSkillIds \(or HarnessWorkspaceContextService\.discoverAvailableSkills\) to consult this\.pluginLoader\.getEffectivePluginConfig\(workspaceRoot\) when available, filtering discovered skills against effective\.overlayPluginPaths and effective\.config\.disabledSkillIds so globally disabled plugins and skills are excluded from availableSkillIds just as they are excluded by PluginConfigSourceResolver during harness reconciliation\.

</details>

<!-- ptah-review:finding:01M7498XJCX9B3XVGAM8EQR79V -->

