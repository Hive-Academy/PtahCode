/**
 * The pure disposal decision (plan Component 6.3, AC 4.1-4.3, 4.10, 6.6).
 *
 * No I/O: the same record always gives the same outcome. P1 only sets the
 * mode fields; P2 to P11 are evaluated in table order and the first failure
 * is the entry's `blocked/<code>`. When every precondition holds the result
 * is `skipped/eligible-report-only` — this task never removes anything.
 */
import * as path from 'node:path';
import type {
  TaskEndDisposeBlockReason,
  TaskEndDisposeModeFields,
  TaskEndDisposeModeReason,
  TaskEndDisposeOutcome,
  TaskEndDisposeRequestedMode,
} from '@ptah-extension/shared';
import type { DisposalActivity, DisposalInputRecord } from './disposal-input';

/** A precondition row's verdict: `null` passes, a code blocks. */
type RowVerdict = TaskEndDisposeBlockReason | null;

export function decideDisposal(
  record: DisposalInputRecord,
): TaskEndDisposeOutcome {
  const mode: TaskEndDisposeModeFields = {
    requestedMode: record.requestedMode,
    effectiveMode: 'off',
    modeReason: deriveModeReason(record.requestedMode),
    activityScope: 'in-process',
  };

  const rows: ReadonlyArray<(r: DisposalInputRecord) => RowVerdict> = [
    checkCarrier, // P2
    checkLinks, // P3
    checkListing, // P4
    checkContainment, // P5
    checkLock, // P6
    checkWorkingTree, // P7
    checkMerge, // P8
    checkOpenPr, // P9
    checkActivity, // P10
  ];
  for (const row of rows) {
    const reason = row(record);
    if (reason !== null) {
      return { step: 'dispose', state: 'blocked', reason, ...mode };
    }
  }
  const harvestBlock = checkHarvest(record);
  if (harvestBlock !== null) {
    return { step: 'dispose', state: 'blocked', reason: harvestBlock, ...mode };
  }
  if (record.probeErrors.length > 0) {
    return {
      step: 'dispose',
      state: 'blocked',
      reason: 'precondition-unverifiable',
      ...mode,
    };
  }
  return {
    step: 'dispose',
    state: 'skipped',
    reason: 'eligible-report-only',
    ...mode,
  };
}

/** P1: `auto` and `confirm` are not reachable in this build (C1, D6). */
function deriveModeReason(
  requested: TaskEndDisposeRequestedMode,
): TaskEndDisposeModeReason {
  switch (requested) {
    case 'off':
      return 'none';
    case 'auto':
      return 'auto-unavailable';
    case 'confirm':
      return 'confirm-unavailable';
    default:
      return assertNever(requested);
  }
}

/** P2: only `done` is eligible; `cancelled` never disposes (C2). */
function checkCarrier(r: DisposalInputRecord): RowVerdict {
  if (r.carrier.kind === 'unparseable') return 'precondition-unverifiable';
  return r.carrier.status === 'done' ? null : 'status-not-eligible';
}

/** P3: linked to this task by at least one source, and to no other task. */
function checkLinks(r: DisposalInputRecord): RowVerdict {
  const links = r.links;
  if (links.kind === 'error') return 'precondition-unverifiable';
  if (!links.bySession && !links.byName && !links.byContextLine) {
    return 'no-linked-worktree';
  }
  return links.otherNonTerminalTaskIds.length > 0
    ? 'linked-to-other-task'
    : null;
}

/** P4: listed by `git worktree list` from the main root, and not the main. */
function checkListing(r: DisposalInputRecord): RowVerdict {
  const listing = r.worktreeEntry;
  switch (listing.kind) {
    case 'error':
      return 'precondition-unverifiable';
    case 'not-listed':
      return 'not-listed';
    case 'listed':
      return listing.entry.isMain || listing.entry.isBare
        ? 'is-main-worktree'
        : null;
    default:
      return assertNever(listing);
  }
}

/**
 * P5: the real path lies strictly under the real agent directory. For a
 * missing directory (AC 4.10) the nearest existing parent must be under or
 * equal to it, and every remaining segment must pass the lexical check.
 */
function checkContainment(r: DisposalInputRecord): RowVerdict {
  const agentDir = r.agentDirRealPath;
  const mainDir = r.mainRealPath;
  if (agentDir === null || mainDir === null) {
    return 'precondition-unverifiable';
  }
  const resolution = r.pathResolution;
  switch (resolution.kind) {
    case 'error':
      return 'precondition-unverifiable';
    case 'resolved':
      if (!r.dirExists) return 'precondition-unverifiable';
      if (isSamePath(resolution.realPath, mainDir)) return 'outside-agent-dir';
      return isStrictlyInside(resolution.realPath, agentDir)
        ? null
        : 'outside-agent-dir';
    case 'missing': {
      if (r.dirExists) return 'precondition-unverifiable';
      const parent = resolution.nearestParentRealPath;
      const parentAllowed =
        isSamePath(parent, agentDir) || isStrictlyInside(parent, agentDir);
      if (!parentAllowed) return 'outside-agent-dir';
      // At least one segment: an empty remainder would make the path the
      // existing parent itself, which contradicts `missing`.
      if (resolution.remainingSegments.length === 0) {
        return 'outside-agent-dir';
      }
      return resolution.remainingSegments.every(isLexicallySafeSegment)
        ? null
        : 'outside-agent-dir';
    }
    default:
      return assertNever(resolution);
  }
}

/** P6: git does not report the worktree as locked. */
function checkLock(r: DisposalInputRecord): RowVerdict {
  // P4 already passed, so the entry is listed; anything else is unverifiable.
  if (r.worktreeEntry.kind !== 'listed') return 'precondition-unverifiable';
  return r.worktreeEntry.entry.locked === true ? 'locked' : null;
}

/**
 * P7: clean tracked state, no untracked non-ignored files, no existing
 * archive destination, and the archivable ignored files within both caps.
 * A missing directory has nothing to inspect or archive.
 */
function checkWorkingTree(r: DisposalInputRecord): RowVerdict {
  if (!r.dirExists) return null;

  const porcelain = r.porcelain;
  if (porcelain.kind === 'error') return 'precondition-unverifiable';
  if (
    !isCount(porcelain.trackedChanges) ||
    !isCount(porcelain.untrackedNonIgnored)
  ) {
    return 'precondition-unverifiable';
  }
  if (porcelain.trackedChanges > 0) return 'dirty-tracked';
  if (porcelain.untrackedNonIgnored > 0) return 'untracked-files';

  switch (r.archiveDestination.kind) {
    case 'error':
      return 'precondition-unverifiable';
    case 'exists':
      return 'archive-exists';
    case 'absent':
      break;
    default:
      return assertNever(r.archiveDestination);
  }

  return checkArchiveSize(r);
}

/** P7 caps: computed here from the file list, never passed in (AC 6.6). */
function checkArchiveSize(r: DisposalInputRecord): RowVerdict {
  if (!isCount(r.archiveMaxBytes) || !isCount(r.archiveMaxFiles)) {
    return 'precondition-unverifiable';
  }
  const ignored = r.ignoredFiles;
  switch (ignored.kind) {
    case 'error':
      return 'precondition-unverifiable';
    case 'truncated':
      return 'archive-too-large';
    case 'ok':
      break;
    default:
      return assertNever(ignored);
  }

  let files = 0;
  let bytes = 0;
  for (const file of ignored.files) {
    if (isAllowListed(file.relPath, r.allowList)) continue;
    if (!isCount(file.bytes)) return 'precondition-unverifiable';
    files += 1;
    bytes += file.bytes;
  }
  return files > r.archiveMaxFiles || bytes > r.archiveMaxBytes
    ? 'archive-too-large'
    : null;
}

/** P8: the branch tip is an ancestor of `origin/main` as last fetched. */
function checkMerge(r: DisposalInputRecord): RowVerdict {
  switch (r.merge.kind) {
    case 'ancestor':
      return null;
    case 'not-ancestor':
      return 'not-merged';
    case 'unverified':
      return 'merge-unverified';
    default:
      return assertNever(r.merge);
  }
}

/** P9: no open PR; without `gh`, P8 alone decides (C3). */
function checkOpenPr(r: DisposalInputRecord): RowVerdict {
  switch (r.openPr.kind) {
    case 'none':
    case 'gh-unavailable':
      return null;
    case 'open':
      return 'open-pr';
    case 'error':
      return 'precondition-unverifiable';
    case 'not-queried':
      // The collector skips `gh` only when P2-P8 already fail, so reaching
      // P9 without an answer means the record is inconsistent: never a pass.
      return 'precondition-unverifiable';
    default:
      return assertNever(r.openPr);
  }
}

/** P10: no lane, live session or registered workspace inside the worktree. */
function checkActivity(r: DisposalInputRecord): RowVerdict {
  const activity: DisposalActivity = r.activity;
  if (activity.kind === 'unavailable') return 'in-use-unverifiable';
  const targets = [r.worktreePath];
  if (r.pathResolution.kind === 'resolved') {
    targets.push(r.pathResolution.realPath);
  }
  const used = [...activity.lanes, ...activity.sessions, ...activity.workspaces]
    .filter((dir) => dir.length > 0)
    .some((dir) =>
      targets.some(
        (target) => isSamePath(dir, target) || isStrictlyInside(dir, target),
      ),
    );
  return used ? 'in-use' : null;
}

/** P11: completed or deliberately manual harvest passes; a missing carrier blocks. */
function checkHarvest(r: DisposalInputRecord): RowVerdict {
  switch (r.harvestOutcome) {
    case 'harvested':
    case 'already-harvested':
    case 'manual-only':
      return null;
    case 'pending':
      return 'harvest-pending';
    case 'harvest-failed':
      return 'harvest-failed';
    case 'no-carrier':
      return 'harvest-no-carrier';
    default:
      return assertNever(r.harvestOutcome);
  }
}

// ---------------------------------------------------------------------------
// Pure path and number helpers
// ---------------------------------------------------------------------------

function isSamePath(a: string, b: string): boolean {
  return path.relative(path.resolve(a), path.resolve(b)) === '';
}

/** `child` is below `parent`, never equal to it. */
function isStrictlyInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return (
    rel !== '' &&
    rel !== '..' &&
    !rel.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(rel)
  );
}

/** Not empty, not `.` or `..`, and no separator of either platform. */
function isLexicallySafeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== '.' &&
    segment !== '..' &&
    !segment.includes('/') &&
    !segment.includes('\\')
  );
}

/** Ignored files under a top-level allow-listed directory are regenerable. */
function isAllowListed(relPath: string, allowList: readonly string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return allowList.some((entry) => {
    const dir = entry.endsWith('/') ? entry : `${entry}/`;
    return normalized === dir.slice(0, -1) || normalized.startsWith(dir);
  });
}

function isCount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected disposal input: ${JSON.stringify(value)}`);
}
