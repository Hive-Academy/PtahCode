import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { errorCodeOf, hasLiveRecordWriter, hasScrubProof, parseRecordHead, renderRecord } from './subagent-handoff-record';

/** Far exceeds any stop call and final scrub window, including another host's writer. */
export const NEUTRALIZE_MIN_AGE_MS = 24 * 60 * 60 * 1_000;

/** Atomically remove notes from an orphaned, proofless pending record. */
export async function neutralizeOrphanRecord(file: string, now: number): Promise<void> {
  if (hasLiveRecordWriter(file)) return;
  const original = await fs.readFile(file, 'utf8');
  if (parseRecordHead(original) !== 'pending' || hasScrubProof(original)) return;
  const temp = `${file}.${randomBytes(4).toString('hex')}.scrub.tmp`;
  let primaryError: unknown;
  try {
    await replaceIfStillOrphaned(file, temp, original, now);
  } catch (error: unknown) {
    primaryError = error;
  }
  try {
    await removeTemp(temp);
  } catch (cleanupError: unknown) {
    if (primaryError !== undefined) {
      throw new AggregateError([primaryError, cleanupError], 'Handoff neutralization and temp cleanup failed', { cause: primaryError });
    }
    throw cleanupError;
  }
  if (primaryError !== undefined) throw primaryError;
}

async function replaceIfStillOrphaned(file: string, temp: string, original: string, now: number): Promise<void> {
  await fs.writeFile(temp, renderRecord('Handoff notes unavailable because final redaction was not verified.'), { encoding: 'utf8', flag: 'wx' });
  if (hasLiveRecordWriter(file)) return;
  if (await fs.readFile(file, 'utf8') !== original) return;
  if (hasLiveRecordWriter(file)) return;
  if (now - (await fs.stat(file)).mtimeMs < NEUTRALIZE_MIN_AGE_MS) return;
  await fs.rename(temp, file);
}

async function removeTemp(temp: string): Promise<void> {
  try {
    await fs.unlink(temp);
  } catch (error: unknown) {
    // degradation-audit: reported - only an already absent temporary file is ignored.
    if (errorCodeOf(error) !== 'ENOENT') throw error;
  }
}
