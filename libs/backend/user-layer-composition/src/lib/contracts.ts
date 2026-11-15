/** Host-independent inputs for a user-layer mirror pass. */
export interface UserLayerMirrorSources {
  pluginPaths: string[];
  harnessPluginRoots?: string[];
  synthesizedSkillsRoot?: string;
  agentSourceDir?: string;
  workspaceRoot?: string;
  pluginsBasePath?: string;
  libraryScopeRoot?: string;
  pluginDescriptors?: Record<string, { sourceRef: string; sourceLabel: string }>;
}

/** The preparation step creates the writable user layer before composition. */
export interface UserLayerBootstrap {
  prepare(workspaceRoot: string): Promise<void>;
}

/** Mirror and reconciliation remain separate so callers can account for failures. */
export interface UserLayerMirror {
  mirrorAll(sources: UserLayerMirrorSources): Promise<{ errors: number; retiredSkills: { errors: number } }>;
  reconcileAll(sources: UserLayerMirrorSources): Promise<{ errors: number; retiredSkills: { errors: number } }>;
}

export function userLayerPassFailures(
  result: { errors: number; retiredSkills: { errors: number } },
): number {
  return result.errors + result.retiredSkills.errors;
}
