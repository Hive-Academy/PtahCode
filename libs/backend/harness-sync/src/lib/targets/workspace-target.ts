/**
 * One engine for every rival-CLI harness target.
 *
 * Codex, Copilot, Cursor, Antigravity and VS Code differ in four values —
 * which directory holds skills, which holds commands, how an agent is
 * transformed, and which MCP config file they read — and in nothing else. The
 * three services this replaces (`CliPluginSyncService`,
 * `MultiCliAgentWriterService`, the `mcp-directory` installers) each
 * rediscovered ownership, drift and reaping for their own artifact family, with
 * three different manifests and three different ideas of what "already synced"
 * meant. Here it is decided once and configured five times.
 *
 * Three behaviours are worth knowing before changing anything:
 *
 * **Copies are transformed, so a copy never hashes equal to its source.** Rival
 * CLIs reject frontmatter Claude accepts (`skill-transform.ts`), so a manifest
 * entry records the OUTPUT hash in `hash` and the SOURCE hash in `sourceHash`.
 * A changed source and a hand-edited copy are then distinguishable, which is
 * what keeps E10 working for targets that rewrite.
 *
 * **Two targets can own one directory.** Codex and Antigravity both read
 * `{ws}/.agents/skills`. Each keeps its own manifest, and each treats a path
 * owned by a declared co-owner as owned rather than foreign — without that,
 * whichever CLI was installed second would find every skill "not ours" and
 * refuse to touch it forever.
 *
 * **The workspace root is already resolved.** Targets never walk up from a cwd;
 * the reconciler normalizes once (`workspace/workspace-root.ts`, E14) so two
 * targets cannot disagree about which tree they are writing into.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'fs';
import type { Stats } from 'fs';
import { mkdir, readFile, rm, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type {
  HarnessFacetMatrix,
  HarnessTargetHealth,
  HarnessTargetId,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { isRetiredPtahAgent } from './retired-agent-origin';
import { throwIfPassAborted } from '../abort/pass-abort';
import {
  hashContent,
  hashDir,
  hashFile,
  type ContentHashOptions,
} from '../hash/content-hash';
import { plannedTargetHealth } from '../health/harness-health';
import type {
  HarnessDesiredMcpServer,
  HarnessDesiredState,
} from '../manifest/desired-state.types';
import {
  desiredAgentModel,
  desiredAgentSourceHash,
} from '../manifest/harness-manifest.builder';
import {
  entrySourceHash,
  managedEntry,
  ManagedManifestStore,
  type ManagedEntries,
  type ManagedManifest,
} from '../manifest-store/managed-manifest';
import { isQuarantineEntry } from '../quarantine/quarantine';
import type { IHarnessCliDetector } from '../sources/harness-source.port';
import {
  copyDirectoryTransformed,
  copySingleFile,
  describeError,
  hashTransformedDir,
  withWindowsRetry,
} from './copy-engine';
import {
  prepareOwnedOverwrite,
  publishFailureReason,
  retireOwnedArtifact,
} from './artifact-retirement';
import type {
  HarnessApplyResult,
  HarnessMigration,
  HarnessPlan,
  HarnessPlanRemove,
  HarnessPlanWrite,
  HarnessRetiredSources,
  IHarnessTarget,
} from './harness-target.port';
import type { IHarnessMcpFacet } from './mcp/mcp-facet.port';
import {
  applyMcpFacet,
  emptyMcpFacetPlan,
  planMcpFacet,
  type McpFacetPlan,
} from './mcp/mcp-facet-planner';
import {
  createGitTrackingProbe,
  removeRetiredCopy,
  retiredSourceItemId,
  type GitTrackingProbe,
} from './retirement-proof';
import type { IHarnessAgentTransformer } from './transformers/agent-transformer.port';

/**
 * The manifest the deleted rival-CLI installers wrote INSIDE each target
 * directory: `{ "skills": [...], "commands": [...] }`. Adopted on first run so
 * copies Ptah already made stay Ptah's; without adoption every one of them
 * would read as a user file that must never be updated again (defect 9).
 */
const LEGACY_RIVAL_MANIFEST = '.ptah-managed.json';

function hasGitMarker(workspaceRoot: string): boolean {
  let current = workspaceRoot;
  while (true) {
    if (existsSync(join(current, '.git'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

export interface WorkspaceHarnessTargetOptions {
  id: HarnessTargetId;
  facets: HarnessFacetMatrix;
  manifestStore: ManagedManifestStore;
  detector: IHarnessCliDetector;
  /** Workspace-relative POSIX directory holding skill folders. */
  skillsDirRel?: string;
  /** Workspace-relative POSIX directory holding `<slug>.md` command files. */
  commandsDirRel?: string;
  agentTransformer?: IHarnessAgentTransformer;
  mcpFacet?: IHarnessMcpFacet;
  /**
   * Targets that write into the same directories as this one. Their manifests
   * count as proof of Ptah ownership here.
   */
  coOwners?: HarnessTargetId[];
  /**
   * Answers whether git tracks a path, for the retired-copy proof (D-D7).
   * Defaults to `git ls-files --error-unmatch` ({@link createGitTrackingProbe});
   * specs substitute a runner to reach git-missing and timeout outcomes.
   */
  gitTrackingProbe?: GitTrackingProbe;
  /**
   * Receives a warning when an agent source cannot be read or transformed.
   * Optional, so specs and callers without a logger keep working.
   */
  logger?: Pick<Logger, 'warn'>;
}

export class WorkspaceHarnessTarget implements IHarnessTarget {
  readonly id: HarnessTargetId;
  readonly facets: HarnessFacetMatrix;
  private readonly probeGitTracking: GitTrackingProbe;

  constructor(private readonly options: WorkspaceHarnessTargetOptions) {
    this.id = options.id;
    this.facets = options.facets;
    this.probeGitTracking =
      options.gitTrackingProbe ?? createGitTrackingProbe();
  }

  /**
   * Installed-or-not, answered by the host's CLI detector.
   *
   * An absent CLI yields `detected: false` and the reconciler skips the target
   * entirely — no directories created, no health noise. Installing it later and
   * reconciling populates everything from scratch, because nothing about the
   * desired state was conditional on detection (E17).
   */
  detect(): Promise<boolean> {
    return this.options.detector.isInstalled(this.id);
  }

  preflightKeys(desired: HarnessDesiredState): ReadonlyMap<string, string> {
    const keys = new Map<string, string>();
    for (const [relPath, entry] of this.desiredEntries(desired)) {
      keys.set(relPath, entry.sourceHash);
    }
    return keys;
  }

  /**
   * @param retired the pass's retired sources (D-2). A removal whose manifest
   *   source lies under a retired skill root, or whose MCP key is retired, is
   *   marked with `retiredItemId` so apply runs the proof policy on it. Absent
   *   means nothing is retired.
   */
  async plan(
    desired: HarnessDesiredState,
    workspaceRoot: string,
    manifest: ManagedManifest,
    signal?: AbortSignal,
    retired?: HarnessRetiredSources,
  ): Promise<HarnessPlan> {
    const hashOptions: ContentHashOptions = { signal };
    const migrations: HarnessMigration[] = [];
    const baseEntries: ManagedEntries = { ...manifest.entries };
    const adopted: string[] = [];
    await this.adoptLegacyManifests(
      workspaceRoot,
      baseEntries,
      migrations,
      adopted,
      hashOptions,
    );

    const ownership = this.ownershipOracle(workspaceRoot, baseEntries);
    const desiredEntries = this.desiredEntries(desired, workspaceRoot);

    const writes: HarnessPlanWrite[] = [];
    const foreign: string[] = [];
    const blocked: string[] = [];
    const keptLocalEdit: string[] = [];
    const unchangedAgents: string[] = [];
    let unchanged = 0;

    for (const [relPath, entry] of desiredEntries) {
      const outcome = await this.planEntry(
        workspaceRoot,
        relPath,
        entry,
        ownership,
        hashOptions,
      );
      if (outcome.kind === 'foreign') {
        // Both lists, always. `foreign` says why this pass wrote nothing here;
        // `blocked` is what makes health call it a gap, so a reconcile cannot
        // report "in sync" over a path the next verify calls missing.
        foreign.push(relPath);
        blocked.push(relPath);
        continue;
      }
      if (outcome.kind === 'unchanged') {
        // Claim it in THIS target's manifest even though nothing was written.
        // On a shared directory the artifact may be correct only because a
        // co-owner wrote it, and borrowed ownership is not ownership: drop the
        // sibling from a partial reconcile, or reset its manifest, and this
        // target would find a perfectly good copy it can no longer prove it
        // wrote — and freeze, treating it as foreign forever.
        baseEntries[relPath] = managedEntry(
          outcome.recordHash,
          entry.source,
          entry.kind,
          entry.sourceHash,
        );
        unchanged++;
        if (entry.kind === 'agent') unchangedAgents.push(relPath);
        continue;
      }
      if (outcome.kind === 'kept') {
        // Kept with the hash Ptah recorded, never the edited one, so the next
        // pass finds the same edit and keeps it again (D8). Claimed in THIS
        // target's manifest for the same reason an unchanged copy is: borrowed
        // ownership from a co-owner is not proof this target can keep.
        baseEntries[relPath] ??= outcome.owned;
        keptLocalEdit.push(relPath);
        continue;
      }
      if (outcome.adopted) adopted.push(relPath);
      writes.push({
        relPath,
        kind: entry.kind,
        source: entry.source,
        hash: entry.outputHash,
        sourceHash: entry.sourceHash,
        isDirectory: entry.isDirectory,
        reason: outcome.reason,
        ...(entry.model === undefined ? {} : { model: entry.model }),
      });
    }

    const mcpPlan = this.planMcp(
      desired,
      workspaceRoot,
      baseEntries,
      retired?.mcpServerKeys ?? [],
    );
    const removals = await this.planRemovals(
      workspaceRoot,
      baseEntries,
      desiredEntries,
      mcpPlan,
      retired?.skillSourceRoots ?? [],
      keptLocalEdit,
    );
    this.scanForeignDirs(workspaceRoot, desiredEntries, ownership, foreign);

    return {
      target: this.id,
      writes: [...writes, ...mcpPlan.writes],
      removals: [...removals, ...mcpPlan.removals],
      foreign: [...foreign, ...mcpPlan.foreign],
      blocked: [...blocked, ...mcpPlan.blocked],
      collisions: desired.collisions,
      migrations,
      adopted,
      keptLocalEdit: [...keptLocalEdit, ...mcpPlan.keptLocalEdit],
      baseEntries,
      unchanged: unchanged + mcpPlan.unchanged,
      unchangedAgents,
      expected: desiredEntries.size + mcpPlan.expected,
    };
  }

  async apply(
    plan: HarnessPlan,
    workspaceRoot: string,
  ): Promise<HarnessApplyResult> {
    const removedLocalEdit: string[] = [];
    const result: HarnessApplyResult = {
      written: {},
      removed: [],
      writeFailed: [],
      keptLocalEdit: [],
      removedLocalEdit,
    };

    await this.applyMigrations(plan.migrations, result);

    for (const removal of plan.removals) {
      if (removal.kind === 'mcp') continue;
      if (removal.retiredItemId !== undefined) {
        await removeRetiredCopy({
          workspaceRoot,
          removal,
          itemId: removal.retiredItemId,
          baseEntries: plan.baseEntries,
          probeGitTracking: this.probeGitTracking,
          result,
        });
        continue;
      }
      if (removal.kind === 'command') {
        const tracking = await this.probeGitTracking(
          workspaceRoot,
          removal.relPath,
        );
        if (
          tracking === 'tracked' ||
          (tracking === 'unverifiable' && hasGitMarker(workspaceRoot))
        ) {
          (result.releasedTracked ??= []).push(removal.relPath);
          continue;
        }
      }
      await this.retireOwned(
        removal,
        workspaceRoot,
        plan.baseEntries,
        result,
        removedLocalEdit,
      );
    }

    for (const write of plan.writes) {
      if (write.kind === 'mcp') continue;
      await this.applyWrite(write, workspaceRoot, plan.baseEntries, result);
    }

    const facet = this.options.mcpFacet;
    if (facet !== undefined) {
      await applyMcpFacet(
        facet,
        plan.writes.filter((write) => write.kind === 'mcp'),
        plan.removals.filter((removal) => removal.kind === 'mcp'),
        workspaceRoot,
        result,
        {
          baseEntries: plan.baseEntries,
          probeGitTracking: this.probeGitTracking,
        },
      );
    }

    return result;
  }

  /**
   * The directories this target fills, for the `.gitignore` block (E23).
   *
   * Derived from the same three option fields the plan is built from, so a
   * target that gains a facet cannot forget to declare it. The MCP facet is
   * absent by design — it writes into a config FILE the user commits.
   */
  managedDirs(): readonly string[] {
    const dirs: string[] = [];
    if (this.options.skillsDirRel !== undefined)
      dirs.push(this.options.skillsDirRel);
    if (this.options.commandsDirRel !== undefined)
      dirs.push(this.options.commandsDirRel);
    if (this.options.agentTransformer !== undefined) {
      dirs.push(this.options.agentTransformer.dirRel);
    }
    return dirs;
  }

  /**
   * Read-only health, derived from a PLAN rather than from a second disk walk.
   *
   * The second walk is what this method used to be, and it is what made
   * `reconcile` and `verify` contradict each other: it asked "does the manifest
   * own this path and do the hashes match", which classified every unowned
   * desired path `missing`, while `plan` classified the identical path
   * `foreign` and counted no gap. Fifteen `.codex/agents/*.toml` were reported
   * as 15 missing by one and 15 foreign by the other, forever.
   *
   * `plan` never writes — that is this port's contract — so running it here is
   * free of side effects, costs the same directory hashing the old walk did,
   * and makes the two answers the same answer by construction.
   */
  async verify(
    desired: HarnessDesiredState,
    workspaceRoot: string,
    signal?: AbortSignal,
  ): Promise<HarnessTargetHealth> {
    const startedAt = Date.now();
    const detected = await this.detect();
    const manifest = this.options.manifestStore.load(workspaceRoot, this.id);
    return plannedTargetHealth(
      await this.plan(desired, workspaceRoot, manifest, signal),
      this.facets,
      detected,
      Date.now() - startedAt,
    );
  }

  // ------------------------------------------------------------ desired state

  /**
   * Every non-MCP artifact this target is responsible for, keyed by its
   * workspace-relative path.
   *
   * Facets the target does not support contribute nothing — that is the whole
   * mechanism behind `commands: 'unsupported'` for Codex and Copilot, and
   * `agents: 'unsupported'` for Antigravity. Nothing is planned, nothing is
   * reported missing, and the capability is stated in health instead.
   */
  private desiredEntries(
    desired: HarnessDesiredState,
    workspaceRoot?: string,
  ): Map<string, DesiredEntry> {
    const entries = new Map<string, DesiredEntry>();

    const skillsDir = this.options.skillsDirRel;
    if (skillsDir !== undefined) {
      for (const skill of desired.skills) {
        entries.set(`${skillsDir}/${skill.slug}`, {
          kind: 'skill',
          source: skill.sourceDir,
          sourceHash: skill.contentHash,
          // Provisional: the copy is transformed, so `apply` re-hashes the
          // written tree and records THAT as the entry's output hash.
          outputHash: skill.contentHash,
          isDirectory: true,
          transformed: true,
        });
      }
    }

    const commandsDir = this.options.commandsDirRel;
    if (commandsDir !== undefined) {
      for (const command of desired.commands) {
        entries.set(`${commandsDir}/${command.slug}.md`, {
          kind: 'command',
          source: command.sourceFile,
          sourceHash: command.contentHash,
          outputHash: command.contentHash,
          isDirectory: false,
          transformed: false,
        });
      }
    }

    const transformer = this.options.agentTransformer;
    if (transformer !== undefined) {
      for (const agent of desired.agents) {
        // The wizard store suppresses only unchanged generated workspace agents.
        if (
          workspaceRoot !== undefined &&
          isRetiredPtahAgent(workspaceRoot, agent.slug, agent.sourceFile)
        )
          continue;
        const model = desiredAgentModel(agent, this.id);
        const rendered = this.renderAgent(
          transformer,
          agent.slug,
          agent.sourceFile,
          model,
        );
        if (rendered === null) continue;
        entries.set(transformer.relPathFor(agent.slug), {
          kind: 'agent',
          source: agent.sourceFile,
          sourceHash: desiredAgentSourceHash(agent, this.id),
          outputHash: hashContent(rendered),
          isDirectory: false,
          transformed: true,
          ...(model === undefined ? {} : { model }),
        });
      }
    }

    return entries;
  }

  /** Read + transform one agent. `null` when the source cannot be read. */
  private renderAgent(
    transformer: IHarnessAgentTransformer,
    agentId: string,
    sourceFile: string,
    model: string | undefined,
  ): string | null {
    try {
      return transformer.transform({
        agentId,
        content: readFileSync(sourceFile, 'utf-8'),
        ...(model === undefined ? {} : { model }),
      });
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn when a logger is passed;
      // the caller leaves this agent out of the plan, so its copy is not
      // written or updated on this pass.
      this.options.logger?.warn('[harness-sync] agent could not be rendered', {
        target: this.id,
        agentId,
        code: (error as NodeJS.ErrnoException | null)?.code,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return null;
    }
  }

  private planMcp(
    desired: HarnessDesiredState,
    workspaceRoot: string,
    baseEntries: ManagedEntries,
    retiredServerKeys: readonly string[],
  ): McpFacetPlan {
    const facet = this.options.mcpFacet;
    if (facet === undefined) return emptyMcpFacetPlan();
    return planMcpFacet(
      facet,
      desired.mcp.filter((server: HarnessDesiredMcpServer) =>
        server.targets.includes(this.id),
      ),
      workspaceRoot,
      baseEntries,
      retiredServerKeys,
    );
  }

  // -------------------------------------------------------------------- plan

  /**
   * Ownership + drift decision for one artifact.
   *
   * Order matters. A path that does not exist is a `create` regardless of the
   * manifest — that is what heals a workspace whose target directory the user
   * deleted. A path that exists but nobody can prove Ptah wrote is FOREIGN and
   * is never touched (E9). Only then do the two hashes get compared: the output
   * hash decides whether someone edited the copy, which is then kept (D8), and
   * the source hash decides whether the upstream changed.
   *
   * The one exception to "unproven means foreign" is an unowned path whose
   * content is BYTE-IDENTICAL to what this pass would write. That is the
   * signature of a manifest write that failed after a successful apply: the
   * copies landed, the ownership record did not. Freezing on them would leave
   * the harness permanently stuck on files Ptah itself produced, so they are
   * adopted instead — and adopting is safe precisely because writing would have
   * produced these exact bytes.
   *
   * `'unchanged'` carries the hash to RECORD rather than letting the caller
   * guess it. For a rival skill the on-disk bytes are the TRANSFORMED copy,
   * whose hash equals neither the source hash nor `entry.outputHash` (which is
   * provisional for transformed directories) — recording the wrong one would
   * make the very next pass report a hand-edited copy that nobody edited.
   */
  private async planEntry(
    workspaceRoot: string,
    relPath: string,
    entry: DesiredEntry,
    ownership: OwnershipOracle,
    hashOptions: ContentHashOptions,
  ): Promise<PlanEntryOutcome> {
    throwIfPassAborted(hashOptions.signal);
    const absolute = toAbsolute(workspaceRoot, relPath);
    const stat = lstatSyncOrNull(absolute);

    if (stat === null) {
      return { kind: 'write', reason: 'create', adopted: false };
    }

    if (stat.isSymbolicLink()) {
      // A rival dir should never hold a link, but a hand-made one would make
      // `rm -r` follow it out of the workspace. Treated as not-ours.
      return { kind: 'foreign' };
    }

    const actual = entry.isDirectory
      ? await hashDir(absolute, hashOptions)
      : await hashFile(absolute);

    const owned = ownership.entryFor(relPath);
    if (owned === undefined) {
      if (
        actual !== null &&
        actual === (await this.expectedOutputHash(relPath, entry, hashOptions))
      ) {
        return { kind: 'unchanged', recordHash: actual };
      }
      // Content differs and no manifest claims it — so the byte-identity
      // recovery above cannot help. An agent file can still PROVE it came out
      // of a Ptah writer, and one that does is a copy whose ownership record
      // was lost, not the user's work. Adopt it and rewrite with current
      // output; anything that cannot prove it stays foreign (E9).
      return (await this.carriesWriterSignature(absolute, entry))
        ? { kind: 'write', reason: 'update', adopted: true }
        : { kind: 'foreign' };
    }

    // Drift is judged on the copy alone: an edited copy is an edit whether or
    // not its source (or model) also changed, so a source change must not hide
    // it from the report (Part B review finding 3). It is kept (D8). A copy
    // that cannot be hashed is not proof of an edit; it is planned as an
    // update, and the detach in `applyWrite` decides on what is really there.
    if (actual !== null && actual !== owned.hash) {
      return { kind: 'kept', owned };
    }
    if (actual !== null && entrySourceHash(owned) === entry.sourceHash) {
      return { kind: 'unchanged', recordHash: owned.hash };
    }
    return { kind: 'write', reason: 'update', adopted: false };
  }

  /**
   * Can this target prove the file at `absolute` came out of a Ptah writer?
   *
   * Agents only, and the transformer answers — it is the one thing that knows
   * what its own format's signature looks like, and what its deleted
   * predecessor's looked like. Skills and commands have no signature to carry:
   * they are copies of user-layer markdown, so a stale copy is
   * indistinguishable from a file the user authored, and staying foreign is the
   * safe answer there. Legacy skill and command copies are adopted instead
   * through their `.ptah-managed.json`, which IS a record of ownership.
   */
  private async carriesWriterSignature(
    absolute: string,
    entry: DesiredEntry,
  ): Promise<boolean> {
    const transformer = this.options.agentTransformer;
    if (entry.kind !== 'agent' || transformer === undefined) return false;
    try {
      return transformer.isPtahOutput(await readFile(absolute, 'utf-8'));
    } catch {
      // degradation-audit: optional-capability - writer-signature detection is
      // an ownership probe, and false preserves the unproven file as foreign.
      return false;
    }
  }

  /**
   * The hash the copy on disk WOULD have if this target had just written it.
   *
   * A transformed skill directory is the only case that needs work:
   * `entry.outputHash` is provisionally the SOURCE hash there (the real one is
   * only known after `copyDirectoryTransformed` runs), so the transform has to
   * be replayed in memory — `hashTransformedDir`, which lives next to the
   * copy it mirrors. Agents already carry a real output hash and byte-copied
   * commands hash equal to their source.
   */
  private async expectedOutputHash(
    relPath: string,
    entry: DesiredEntry,
    hashOptions: ContentHashOptions,
  ): Promise<string | null> {
    if (!entry.isDirectory || !entry.transformed) return entry.outputHash;
    const slug = relPath.slice(relPath.lastIndexOf('/') + 1);
    return hashTransformedDir(entry.source, slug, hashOptions);
  }

  /**
   * Manifest-owned paths that are no longer desired. MCP is handled separately.
   * A copy whose manifest source lies under a retired skills.sh root carries
   * that root's item id (D-2).
   */
  private async planRemovals(
    workspaceRoot: string,
    baseEntries: ManagedEntries,
    desiredEntries: Map<string, DesiredEntry>,
    mcpPlan: McpFacetPlan,
    retiredSkillRoots: readonly string[],
    keptLocalEdit: string[],
  ): Promise<HarnessPlanRemove[]> {
    const removals: HarnessPlanRemove[] = [];
    for (const relPath of Object.keys(baseEntries)) {
      if (desiredEntries.has(relPath)) continue;
      const entry = baseEntries[relPath];
      if (entry.kind === 'mcp') continue; // owned by the facet planner
      if (entry.kind === 'agent') {
        // Routine passes retain managed agent copies pending explicit removal.
        // A copy already absent on disk only needs its stale claim removed.
        try {
          lstatSync(toAbsolute(workspaceRoot, relPath));
          const actual = await hashFile(toAbsolute(workspaceRoot, relPath));
          if (actual !== entry.hash) keptLocalEdit.push(relPath);
          continue;
        } catch (error) {
          if (!isMissingFile(error)) {
            keptLocalEdit.push(relPath);
            continue;
          }
        }
      }
      if (mcpPlan.ownedKeys.has(relPath)) continue;
      const retiredItemId = retiredSourceItemId(
        entry.source,
        retiredSkillRoots,
      );
      removals.push({
        relPath,
        kind: entry.kind,
        isDirectory: entry.kind === 'skill',
        ...(retiredItemId === undefined ? {} : { retiredItemId }),
      });
    }
    return removals;
  }

  /**
   * Report entries in this target's directories that are neither desired nor
   * manifest-owned. The user's own `.cursor/skills/my-thing` (E9).
   */
  private scanForeignDirs(
    workspaceRoot: string,
    desiredEntries: Map<string, DesiredEntry>,
    ownership: OwnershipOracle,
    foreign: string[],
  ): void {
    const dirs: Array<{ dirRel: string; onlyMarkdown: boolean }> = [];
    if (this.options.skillsDirRel !== undefined) {
      dirs.push({ dirRel: this.options.skillsDirRel, onlyMarkdown: false });
    }
    if (this.options.commandsDirRel !== undefined) {
      dirs.push({ dirRel: this.options.commandsDirRel, onlyMarkdown: true });
    }
    const transformer = this.options.agentTransformer;
    if (transformer !== undefined) {
      dirs.push({
        dirRel: dirOf(transformer.relPathFor('probe')),
        onlyMarkdown: false,
      });
    }

    const seen = new Set(foreign);
    for (const { dirRel, onlyMarkdown } of dirs) {
      let names: string[];
      try {
        names = readdirSync(join(workspaceRoot, ...dirRel.split('/')));
      } catch {
        continue;
      }
      for (const name of names) {
        if (name === LEGACY_RIVAL_MANIFEST) continue;
        // Same rule as `ClaudeTarget.scanTargetDirs`: a quarantined original is
        // neither a source nor a target and must never be reported `foreign`
        // (`quarantine/quarantine.ts`).
        if (isQuarantineEntry(name)) continue;
        if (onlyMarkdown && !name.toLowerCase().endsWith('.md')) continue;
        const relPath = `${dirRel}/${name}`;
        if (desiredEntries.has(relPath)) continue;
        if (ownership.entryFor(relPath) !== undefined) continue;
        if (seen.has(relPath)) continue;
        seen.add(relPath);
        foreign.push(relPath);
      }
    }
  }

  /**
   * Ownership lookup that also consults co-owning targets' manifests.
   *
   * Codex and Antigravity share `{ws}/.agents/skills`. Whichever reconciles
   * first records the copies in its own manifest; the second must recognise
   * them as Ptah's rather than as a stranger's files, or it would classify the
   * whole directory foreign and never write again.
   */
  private ownershipOracle(
    workspaceRoot: string,
    baseEntries: ManagedEntries,
  ): OwnershipOracle {
    const coOwners = this.options.coOwners ?? [];
    const sibling: ManagedEntries[] = coOwners.map(
      (target) =>
        this.options.manifestStore.load(workspaceRoot, target).entries,
    );

    return {
      entryFor: (relPath) => {
        const own = baseEntries[relPath];
        if (own !== undefined) return own;
        for (const entries of sibling) {
          const found = entries[relPath];
          if (found !== undefined) return found;
        }
        return undefined;
      },
    };
  }

  // -------------------------------------------------------------- migrations

  /**
   * Adopt every `.ptah-managed.json` the deleted rival installers left inside
   * this target's directories, then queue the files for deletion.
   *
   * Adoption hashes what is on disk NOW rather than trusting the legacy list:
   * the point is only to establish ownership. The very next plan step compares
   * that hash against the desired one and rewrites when they differ, so an
   * adopted copy written by the old pipeline is refreshed on the first pass.
   */
  private async adoptLegacyManifests(
    workspaceRoot: string,
    baseEntries: ManagedEntries,
    migrations: HarnessMigration[],
    adopted: string[],
    hashOptions: ContentHashOptions,
  ): Promise<void> {
    const dirs: Array<{ dirRel: string; key: 'skills' | 'commands' }> = [];
    if (this.options.skillsDirRel !== undefined) {
      dirs.push({ dirRel: this.options.skillsDirRel, key: 'skills' });
    }
    if (this.options.commandsDirRel !== undefined) {
      dirs.push({ dirRel: this.options.commandsDirRel, key: 'commands' });
    }

    for (const { dirRel, key } of dirs) {
      const legacyPath = join(
        workspaceRoot,
        ...dirRel.split('/'),
        LEGACY_RIVAL_MANIFEST,
      );
      if (!existsSync(legacyPath)) continue;

      for (const name of readLegacyNames(legacyPath, key)) {
        const relPath = `${dirRel}/${name}`;
        if (baseEntries[relPath] !== undefined) continue;
        const absolute = toAbsolute(workspaceRoot, relPath);
        throwIfPassAborted(hashOptions.signal);
        const hash =
          key === 'skills'
            ? await hashDir(absolute, hashOptions)
            : await hashFile(absolute);
        if (hash === null) continue;
        // No `sourceHash`: the legacy pipeline recorded none, so the first plan
        // sees a source mismatch and rewrites — which is the correct outcome,
        // because the old transform pipeline differed from this one.
        baseEntries[relPath] = managedEntry(
          hash,
          '',
          key === 'skills' ? 'skill' : 'command',
        );
        adopted.push(relPath);
      }
      migrations.push({ kind: 'drop-legacy-manifest', path: legacyPath });
    }
  }

  // ------------------------------------------------------------------- apply

  /**
   * Retire one manifest-owned copy without losing a byte the user put there
   * (TASK_2026_609). Every retirement funnels through here — a deleted source,
   * an agent that left the desired set or was disabled, and the explicit
   * uninstall pass (`HarnessReconcilerService.remove`, E22).
   *
   * The rule (detach first, decide on the detached object) lives in
   * `artifact-retirement.ts`. This maps its outcome: a kept local edit is in
   * BOTH `removed` and `removedLocalEdit`; a failure lands in `writeFailed` and
   * stays out of `removed`, which keeps its manifest entry alive for the next
   * pass — the reconciler prunes only `result.removed`.
   */
  private async retireOwned(
    removal: HarnessPlanRemove,
    workspaceRoot: string,
    baseEntries: ManagedEntries,
    result: HarnessApplyResult,
    removedLocalEdit: string[],
  ): Promise<void> {
    const { relPath, isDirectory } = removal;
    const outcome = await retireOwnedArtifact({
      workspaceRoot,
      relPath,
      isDirectory,
      ownedHash: baseEntries[relPath]?.hash,
    });
    if (outcome.kind === 'failed') {
      result.writeFailed.push({ relPath, reason: outcome.reason });
      return;
    }
    result.removed.push(relPath);
    if (outcome.kind === 'removed-local-edit') removedLocalEdit.push(relPath);
  }

  private async applyMigrations(
    migrations: HarnessMigration[],
    result: HarnessApplyResult,
  ): Promise<void> {
    for (const migration of migrations) {
      try {
        if (migration.kind === 'unlink-junction') {
          await withWindowsRetry(() => unlink(migration.path));
        } else {
          await withWindowsRetry(() => rm(migration.path, { force: true }));
        }
      } catch (error: unknown) {
        // Non-fatal by design: a legacy file that survives is adopted again on
        // the next pass and changes nothing, and a home leftover that resists
        // deletion shadows one agent rather than breaking the whole target.
        result.writeFailed.push({
          relPath: migration.path,
          reason: `migration ${migration.kind} failed: ${describeError(error)}`,
        });
      }
    }
  }

  /**
   * Write one artifact (TASK_2026_609, Part B review finding 1; D8).
   *
   * The plan schedules an owned copy for an update only when it still held what
   * Ptah wrote; an edited one is kept and never reaches this method. The plan
   * is not trusted for that, though: the copy is first detached into the
   * history store (`detachForOverwrite`) and decided on there. Ptah's own bytes
   * are discarded and the replacement is published with an exclusive create,
   * so a save landing after the detach survives as a conflict instead of being
   * overwritten. Anything else is an edit saved between plan and apply, and it
   * is put back where it was and reported kept, exactly as the plan would have
   * kept it. Every failure lands in `writeFailed` and keeps the manifest entry
   * for the next pass. Only an adopted copy (unowned, carrying a Ptah writer
   * signature) is still replaced in place: its path is occupied by design.
   */
  private async applyWrite(
    write: HarnessPlanWrite,
    workspaceRoot: string,
    baseEntries: ManagedEntries,
    result: HarnessApplyResult,
  ): Promise<void> {
    const owned = baseEntries[write.relPath];
    const adopted = write.reason === 'update' && owned === undefined;
    const absolute = toAbsolute(workspaceRoot, write.relPath);
    if (write.reason === 'update' && owned !== undefined) {
      const gate = await prepareOwnedOverwrite({
        workspaceRoot,
        relPath: write.relPath,
        isDirectory: write.isDirectory,
        ownedHash: owned.hash,
      });
      if (gate.kind === 'failed') {
        result.writeFailed.push({
          relPath: write.relPath,
          reason: gate.reason,
        });
        return;
      }
      if (gate.kind === 'kept-local-edit') {
        result.keptLocalEdit.push(write.relPath);
        return;
      }
    }
    try {
      const outputHash = await this.writeArtifact(write, absolute, !adopted);
      // Recorded ONLY after the write succeeded: a manifest entry for a file
      // that is not on disk is exactly the record corruption E21 forbids.
      result.written[write.relPath] = managedEntry(
        outputHash,
        write.source,
        write.kind,
        write.sourceHash,
      );
    } catch (error: unknown) {
      result.writeFailed.push({
        relPath: write.relPath,
        reason: publishFailureReason(write.relPath, error),
      });
    }
  }

  /**
   * Perform one write and answer the hash of what actually landed on disk.
   * `exclusive` creates rather than replaces, failing with EEXIST when
   * something already occupies the path.
   */
  private async writeArtifact(
    write: HarnessPlanWrite,
    absolute: string,
    exclusive: boolean,
  ): Promise<string> {
    if (write.kind === 'skill') {
      const slug = write.relPath.slice(write.relPath.lastIndexOf('/') + 1);
      await copyDirectoryTransformed(write.source, absolute, slug, exclusive);
      // Re-hashed rather than trusted: the copy was rewritten on the way out,
      // so only the result knows its own hash.
      // No signal: this is the APPLY phase, past the pass's commit point. A
      // write that landed must be hashed and recorded or the manifest loses
      // ownership of a file that is on disk (`abort/pass-abort.ts`).
      return (await hashDir(absolute)) ?? write.hash;
    }

    if (write.kind === 'agent') {
      const transformer = this.options.agentTransformer;
      if (transformer === undefined) {
        throw new Error(`Target "${this.id}" has no agent transformer`);
      }
      const model = write.model;
      const content = transformer.transform({
        agentId: basenameWithoutSuffix(write.relPath, transformer),
        content: readFileSync(write.source, 'utf-8'),
        ...(model === undefined ? {} : { model }),
      });
      await withWindowsRetry(() =>
        mkdir(dirname(absolute), { recursive: true }),
      );
      await withWindowsRetry(() =>
        writeFile(absolute, content, {
          encoding: 'utf-8',
          flag: exclusive ? 'wx' : 'w',
        }),
      );
      return hashContent(content);
    }

    await copySingleFile(write.source, absolute, dirname(absolute), exclusive);
    return write.hash;
  }
}

// ------------------------------------------------------------------- helpers

/**
 * What `planEntry` decided for one artifact.
 *
 * A union rather than three string literals because `unchanged` has to carry
 * the hash to record: the caller cannot re-derive it without repeating the
 * directory walk `planEntry` just did.
 */
type PlanEntryOutcome =
  | { kind: 'foreign' }
  | { kind: 'unchanged'; recordHash: string }
  /** A hand-edited owned copy, with the ownership record it is kept under. */
  | { kind: 'kept'; owned: ManagedEntries[string] }
  | {
      kind: 'write';
      reason: 'create' | 'update';
      /** The write is taking over an unowned file that proved it was ours. */
      adopted: boolean;
    };

/** One desired non-MCP artifact, already resolved to paths and hashes. */
interface DesiredEntry {
  kind: 'skill' | 'command' | 'agent';
  source: string;
  /** Hash of the user-layer source. */
  sourceHash: string;
  /** Hash of what should land on disk. Provisional for transformed directories. */
  outputHash: string;
  isDirectory: boolean;
  transformed: boolean;
  /** Agents only: the model the copy carries. Absent writes no model field. */
  model?: string;
}

interface OwnershipOracle {
  entryFor(relPath: string): ManagedEntries[string] | undefined;
}

function toAbsolute(workspaceRoot: string, relPath: string): string {
  return join(workspaceRoot, ...relPath.split('/'));
}

function dirOf(relPath: string): string {
  return relPath.slice(0, relPath.lastIndexOf('/'));
}

/**
 * Recover an agent id from its target path.
 *
 * Derived from the transformer's own `relPathFor` rather than assumed, so a
 * suffix like Copilot's `.agent.md` is stripped correctly without this engine
 * knowing any target's naming rule.
 */
function basenameWithoutSuffix(
  relPath: string,
  transformer: IHarnessAgentTransformer,
): string {
  const probe = transformer.relPathFor('\u0000');
  const marker = probe.indexOf('\u0000');
  const prefix = probe.slice(0, marker);
  const suffix = probe.slice(marker + 1);
  return relPath.slice(prefix.length, relPath.length - suffix.length);
}

function lstatSyncOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch {
    // degradation-audit: optional-capability - target stat is a presence probe,
    // and null routes the path through the normal create-or-repair plan.
    return null;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

/** Names recorded under `key` in a legacy `.ptah-managed.json`. */
function readLegacyNames(path: string, key: 'skills' | 'commands'): string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null) return [];
    const list = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(list)) return [];
    return list.filter((name): name is string => typeof name === 'string');
  } catch {
    // degradation-audit: optional-capability - the legacy manifest is only
    // migration evidence, and an unreadable list adopts nothing rather than
    // guessing ownership.
    return [];
  }
}
