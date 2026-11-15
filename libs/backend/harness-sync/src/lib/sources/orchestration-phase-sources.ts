import { existsSync, lstatSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isOptOutPluginId } from '@ptah-extension/shared';
import { hashDir } from '../hash/content-hash';
import { readUserLayerOrigin } from '../manifest/plugin-origin-gate';
import type { ManagedManifestStore } from '../manifest-store/managed-manifest';
import type { SkillSyncGate } from '../state/skill-sync-gate';
import { isMigratableLink } from '../targets/link-ownership';
import type { IHarnessSourceResolver } from './harness-source.port';

export interface OrchestrationPhaseSourceOptions {
  resolveWorkspaceRoot: () => string;
  userSkillsRoot: string;
  pluginsRoot: string;
  sourceResolver: Pick<IHarnessSourceResolver, 'resolve'>;
  skillSyncGate: Pick<SkillSyncGate, 'resolve'>;
  manifestStore: Pick<ManagedManifestStore, 'load'>;
}

/** Resolve the phase reader's clone and workspace ownership policy for one host. */
export function createOrchestrationPhaseSources(options: OrchestrationPhaseSourceOptions) {
  const { resolveWorkspaceRoot, userSkillsRoot, pluginsRoot, sourceResolver, skillSyncGate, manifestStore } = options;
  return {
    isCloneActive: async (): Promise<boolean> => {
      const root = resolveWorkspaceRoot();
      const sources = await sourceResolver.resolve(root);
      if (sources.policyUnknown) throw new Error('Skill policy unavailable');
      if (sources.disabledSkillIds.includes('orchestration')) return false;
      const selection = skillSyncGate.resolve(root);
      if (selection.mode === 'selected' && !selection.slugs.includes('orchestration')) return false;
      const origin = readUserLayerOrigin(join(userSkillsRoot, 'orchestration'));
      if (origin.kind !== 'plugin') return true;
      if (sources.disabledPluginIds.includes(origin.pluginId)) return false;
      if (isOptOutPluginId(origin.pluginId)) return true;
      return sources.overlayPluginPathsKnown !== true || sources.overlayPluginPaths.some((entry) => basename(entry) === origin.pluginId);
    },
    workspaceSkillsRoot: (): string => join(resolveWorkspaceRoot(), '.claude', 'skills'),
    isWorkspaceOwned: async (skillRoot: string): Promise<boolean> => {
      if (!existsSync(skillRoot)) return false;
      const root = resolveWorkspaceRoot();
      const owned = manifestStore.load(root, 'claude').entries['.claude/skills/orchestration'];
      if (lstatSync(skillRoot).isSymbolicLink()) {
        return owned?.kind !== 'skill' && !isMigratableLink(skillRoot, [userSkillsRoot, pluginsRoot]);
      }
      if (owned?.kind !== 'skill') return true;
      const actual = await hashDir(skillRoot);
      if (actual === null) throw new Error(`Unable to hash workspace skill: ${skillRoot}`);
      return actual !== owned.hash;
    },
  };
}
