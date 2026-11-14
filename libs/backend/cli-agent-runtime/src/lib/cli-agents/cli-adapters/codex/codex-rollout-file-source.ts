import { listCodexRolloutFiles } from './codex-rollout-usage.reader';

/** Shared host binding for path-based Codex discovery. */
export function listCodexFiles(root: string, startAfter?: string): AsyncIterable<string> {
  return listCodexRolloutFiles(root, startAfter);
}
