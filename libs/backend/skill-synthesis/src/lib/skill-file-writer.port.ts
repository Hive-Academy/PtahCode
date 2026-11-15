/**
 * Write port for one phase file inside a skill clone folder (U-D13 (1)).
 *
 * The user-layer mirror owns the slug lock, the folder snapshot and the
 * sidecar refresh of a skill clone. Its public write methods address only
 * `SKILL.md`. This port names the two operations that a phase file needs, so
 * the enhancer does not copy the mirror's private snapshot logic. A host that
 * does not bind the token refuses a phase-file apply and a phase-file revert;
 * the preview and the snapshot read still work.
 */
import type { SkillClonePhaseFile } from '@ptah-extension/shared';

export interface WriteSkillFileArgs {
  readonly slug: string;
  readonly file: SkillClonePhaseFile;
  readonly newBody: string;
  /** SHA256 of the phase body observed when the proposal was generated. */
  readonly expectedBodyHash?: string;
}

export interface WriteSkillFileResult {
  readonly stale?: false;
  readonly slug: string;
  /** Stamp of the folder-wide snapshot taken before the write. */
  readonly historyTs: string | null;
  /** Content hash of the whole clone folder after the write. */
  readonly currentContentHash: string;
}

export interface StaleSkillFileResult {
  readonly stale: true;
  readonly slug: string;
  readonly historyTs: null;
  /** Hash of the live phase body; empty when the phase file is absent. */
  readonly liveBodyHash: string;
}

export interface RevertSkillFileArgs {
  readonly slug: string;
  readonly file: SkillClonePhaseFile;
  readonly historyTs: string;
}

export interface RevertSkillFileResult {
  /** `false` when the snapshot or the file in it does not exist. */
  readonly restored: boolean;
  readonly revertedFrom: string;
  /** Stamp of the folder-wide snapshot taken before the restore. */
  readonly newHistoryTs: string | null;
}

export interface SkillFileWriterPort {
  /** Snapshot the whole folder, then write only `file`. */
  writeEnhancedSkillFile(args: WriteSkillFileArgs): Promise<WriteSkillFileResult | StaleSkillFileResult>;
  /** Snapshot the whole folder, then restore only `file` from `historyTs`. */
  revertSkillFile(args: RevertSkillFileArgs): Promise<RevertSkillFileResult>;
}

export const SKILL_FILE_WRITER_TOKEN = Symbol.for('PtahSkillFileWriter');
