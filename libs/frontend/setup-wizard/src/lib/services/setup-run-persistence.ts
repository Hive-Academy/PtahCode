/**
 * Persistence of the Setup run index (TASK_2026_2330, plan 1.2).
 *
 * The index lives in localStorage under `ptah.setup-runs.v1` as
 * `{ version: 1, byWorkspace: Record<workspacePath, SetupRunRecord[]> }`.
 * It holds ids, statuses and steps only: no transcript, model output, file
 * contents or credentials. The backend stays the source of truth for status
 * and results; a lost or corrupt index is rebuilt by adoption.
 *
 * Pure: no Angular. The store owns the debounce and the storage handle.
 */

import { isOnboardingIdentityValue } from '@ptah-extension/core';
import {
  SETUP_RUN_STEPS,
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
  type SetupRunStep,
  type SetupRunWorkflow,
} from './setup-run.types';

export const SETUP_RUNS_STORAGE_KEY = 'ptah.setup-runs.v1';

/** Records kept per workspace; only terminal records are evicted. */
export const MAX_SETUP_RUNS_PER_WORKSPACE = 20;

const STORAGE_VERSION = 1;
const MAX_PATH_LENGTH = 4096;
const MAX_TEXT_LENGTH = 500;
const MAX_INTENT_LENGTH = 4000;
const MAX_LIST_LENGTH = 200;

/** Records per normalized workspace path. */
export type GuidanceHandoffState = number | 'skipped' | 'consumed';

export type StoredSetupRunRecord = SetupRunRecord & {
  /** A pending deadline in epoch milliseconds, or the settled scheduling decision. */
  guidanceHandoff?: GuidanceHandoffState;
};

export type SetupRunIndex = Readonly<
  Record<string, readonly StoredSetupRunRecord[]>
>;

/** The result of reading the stored index. */
export interface SetupRunIndexRead {
  index: SetupRunIndex;
  /** The stored payload was unreadable as a whole and was discarded. */
  corrupt: boolean;
}

const WORKFLOWS: readonly SetupRunWorkflow[] = [
  'analysis',
  'skill-review',
  'agent-generation',
  'project-guidance',
  'team-builder',
];

const STATUSES: readonly SetupRunStatus[] = [
  'running',
  'needs-input',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWorkflow(value: unknown): value is SetupRunWorkflow {
  return WORKFLOWS.includes(value as SetupRunWorkflow);
}

function isStatus(value: unknown): value is SetupRunStatus {
  return STATUSES.includes(value as SetupRunStatus);
}

/** Whether `step` is one of `workflow`'s steps. */
export function isSetupRunStepOf(
  workflow: SetupRunWorkflow,
  step: unknown,
): step is SetupRunStep {
  return (SETUP_RUN_STEPS[workflow] as readonly unknown[]).includes(step);
}

function boundedText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : null;
}

function nullableId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isOnboardingIdentityValue(value) ? value : undefined;
}

function timestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return null;
  const list: string[] = [];
  for (const item of value) {
    const text = boundedText(item, MAX_TEXT_LENGTH);
    if (text === null) return null;
    list.push(text);
  }
  return list;
}

/**
 * Normalize a workspace path for keys and comparison: trimmed, trailing
 * separators removed (a bare root keeps its separator). `null` when empty.
 */
export function normalizeSetupWorkspacePath(
  workspacePath: string | null | undefined,
): string | null {
  const trimmed = workspacePath?.trim() ?? '';
  if (!trimmed || trimmed.length > MAX_PATH_LENGTH) return null;
  const separated = trimmed.replace(/\\/g, '/');
  const windows =
    /^[a-z]:/i.test(separated) || /^\/\/[^/]+\/[^/]+/.test(separated);
  const normalized = windows ? separated.toLowerCase() : separated;
  const stripped = normalized.replace(/\/+$/, '');
  return /^[a-z]:$/.test(stripped) ? `${stripped}/` : stripped || '/';
}

/** Keep the filesystem spelling while validating the path for Setup. */
export function setupWorkspacePath(
  workspacePath: string | null | undefined,
): string | null {
  const path = workspacePath?.trim();
  if (!path || !normalizeSetupWorkspacePath(path)) return null;
  return /^[a-z]:$/i.test(path) ? path + '\\' : path;
}

export function sameSetupWorkspacePath(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const key = normalizeSetupWorkspacePath(left);
  return key !== null && key === normalizeSetupWorkspacePath(right);
}

/**
 * Validate one stored record. Unknown fields are dropped; a record with an
 * invalid required field is rejected (`null`).
 */
export function parseSetupRunRecord(
  value: unknown,
): StoredSetupRunRecord | null {
  if (!isObject(value)) return null;
  const {
    id,
    workspacePath,
    workflow,
    status,
    step,
    backendRunId,
    analysisRunId,
    parentId,
    unseen,
    createdAt,
    updatedAt,
  } = value;
  const workspace = setupWorkspacePath(
    typeof workspacePath === 'string' ? workspacePath : null,
  );
  const created = timestamp(createdAt);
  const updated = timestamp(updatedAt);
  const backend = nullableId(backendRunId);
  const analysis = nullableId(analysisRunId);
  const parent = nullableId(parentId);
  if (
    !isOnboardingIdentityValue(id) ||
    workspace === null ||
    !isWorkflow(workflow) ||
    !isStatus(status) ||
    !isSetupRunStepOf(workflow, step) ||
    backend === undefined ||
    analysis === undefined ||
    parent === undefined ||
    typeof unseen !== 'boolean' ||
    created === null ||
    updated === null
  ) {
    return null;
  }
  const record: StoredSetupRunRecord = {
    id,
    workspacePath: workspace,
    workflow,
    status,
    step,
    backendRunId: backend,
    analysisRunId: analysis,
    parentId: parent,
    unseen,
    createdAt: created,
    updatedAt: updated,
  };
  const origin = boundedText(value['origin'], MAX_TEXT_LENGTH);
  if (origin !== null) record.origin = origin;
  const error = boundedText(value['error'], MAX_TEXT_LENGTH);
  if (error !== null) record.error = error;
  if (workflow === 'agent-generation' && status === 'completed') {
    const handoff = value['guidanceHandoff'];
    const deadline = timestamp(handoff);
    if (deadline !== null) record.guidanceHandoff = deadline;
    else if (handoff === 'skipped' || handoff === 'consumed')
      record.guidanceHandoff = handoff;
  }
  if (workflow === 'skill-review' && isObject(value['selection'])) {
    const skillIds = stringList(value['selection']['skillIds']);
    if (skillIds !== null) record.selection = { skillIds };
  }
  if (workflow === 'team-builder') {
    const teamBuilder = value['teamBuilder'];
    if (isObject(teamBuilder)) {
      const intent =
        teamBuilder['intent'] === ''
          ? ''
          : boundedText(teamBuilder['intent'], MAX_INTENT_LENGTH);
      const installed = stringList(teamBuilder['installed']);
      if (intent !== null && installed !== null) {
        const selectedIds = stringList(teamBuilder['selectedIds']);
        const rawDecision = teamBuilder['ownerDecision'];
        const ownerDecision =
          rawDecision === 'match' ||
          rawDecision === 'raise' ||
          rawDecision === null
            ? rawDecision
            : undefined;
        const installCompleted =
          typeof teamBuilder['installCompleted'] === 'boolean'
            ? teamBuilder['installCompleted']
            : undefined;
        const hadAttachments =
          typeof teamBuilder['hadAttachments'] === 'boolean'
            ? teamBuilder['hadAttachments']
            : undefined;
        record.teamBuilder = {
          intent,
          installed,
          ...(selectedIds !== null ? { selectedIds } : {}),
          ...(ownerDecision !== undefined ? { ownerDecision } : {}),
          ...(installCompleted !== undefined ? { installCompleted } : {}),
          ...(hadAttachments !== undefined ? { hadAttachments } : {}),
        };
      }
    }
    const handoffTabId = value['handoffTabId'];
    if (isOnboardingIdentityValue(handoffTabId)) {
      record.handoffTabId = handoffTabId;
    }
  }
  return record;
}

/**
 * Keep at most {@link MAX_SETUP_RUNS_PER_WORKSPACE} records. The oldest
 * terminal records go first; a non-terminal record is never dropped, so a
 * workspace with more live runs than the cap keeps all of them.
 */
export function capWorkspaceRuns<T extends SetupRunRecord>(
  records: readonly T[],
): T[] {
  const excess = records.length - MAX_SETUP_RUNS_PER_WORKSPACE;
  if (excess <= 0) return [...records];
  const evicted = new Set(
    records
      .filter((record) => isTerminalSetupRunStatus(record.status))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, excess)
      .map((record) => record.id),
  );
  return records.filter((record) => !evicted.has(record.id));
}

/**
 * Read and validate the stored index.
 *
 * An unparseable payload, a wrong version or a wrong shape discards the whole
 * index (`corrupt: true`). Single invalid records, or records filed under the
 * wrong workspace, are discarded with a warning; the rest are kept.
 */
export function readSetupRunIndex(
  storage: Pick<Storage, 'getItem'>,
): SetupRunIndexRead {
  let raw: string | null;
  try {
    raw = storage.getItem(SETUP_RUNS_STORAGE_KEY);
  } catch {
    console.warn('[setup-run-persistence] Setup runs could not be read.');
    return { index: {}, corrupt: true };
  }
  if (raw === null) return { index: {}, corrupt: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[setup-run-persistence] Discarded unreadable Setup runs.');
    return { index: {}, corrupt: true };
  }
  if (
    !isObject(parsed) ||
    parsed['version'] !== STORAGE_VERSION ||
    !isObject(parsed['byWorkspace'])
  ) {
    console.warn('[setup-run-persistence] Discarded unknown Setup runs data.');
    return { index: {}, corrupt: true };
  }
  const index: Record<string, StoredSetupRunRecord[]> = {};
  const seen = new Set<string>();
  for (const [key, list] of Object.entries(parsed['byWorkspace'])) {
    const workspace = normalizeSetupWorkspacePath(key);
    if (workspace === null || !Array.isArray(list)) {
      console.warn('[setup-run-persistence] Discarded an invalid workspace.');
      continue;
    }
    const records: StoredSetupRunRecord[] = index[workspace] ?? [];
    for (const item of list) {
      const record = parseSetupRunRecord(item);
      if (
        !record ||
        normalizeSetupWorkspacePath(record.workspacePath) !== workspace ||
        seen.has(record.id)
      ) {
        console.warn('[setup-run-persistence] Discarded an invalid Setup run.');
        continue;
      }
      seen.add(record.id);
      records.push(record);
    }
    if (records.length > 0) index[workspace] = capWorkspaceRuns(records);
  }
  return { index, corrupt: false };
}

/** The stored form of `index`: only known record fields, capped per workspace. */
export function serializeSetupRunIndex(index: SetupRunIndex): string {
  const byWorkspace: Record<string, SetupRunRecord[]> = {};
  for (const [workspace, records] of Object.entries(index)) {
    const kept = capWorkspaceRuns(
      records
        .map((record) => parseSetupRunRecord(record))
        .filter((record): record is StoredSetupRunRecord => record !== null),
    );
    if (kept.length > 0) byWorkspace[workspace] = kept;
  }
  return JSON.stringify({ version: STORAGE_VERSION, byWorkspace });
}

/** Write `index`. Returns `false` (with a warning) when storage refuses it. */
export function writeSetupRunIndex(
  storage: Pick<Storage, 'setItem'>,
  index: SetupRunIndex,
): boolean {
  try {
    storage.setItem(SETUP_RUNS_STORAGE_KEY, serializeSetupRunIndex(index));
    return true;
  } catch {
    // degradation-audit: optional-capability - a refused storage write keeps Setup runs for the current session.
    console.warn('[setup-run-persistence] Setup runs could not be saved.');
    return false;
  }
}
