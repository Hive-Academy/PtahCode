import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hasLiveRecordWriter, hasScrubProof, parseRecordHead, renderRecord } from './subagent-handoff-record';

/** Atomically remove notes from an orphaned, proofless pending record. */
export async function neutralizeOrphanRecord(file: string): Promise<void> {
  if (hasLiveRecordWriter(file)) return;
  const original = await fs.readFile(file, 'utf8');
  if (parseRecordHead(original) !== 'pending' || hasScrubProof(original)) return;
  const temp = `${file}.${randomBytes(4).toString('hex')}.scrub.tmp`;
  try {
    await fs.writeFile(temp, renderRecord('Handoff notes unavailable because final redaction was not verified.'), { encoding: 'utf8', flag: 'wx' });
    if (hasLiveRecordWriter(file)) return;
    if (await fs.readFile(file, 'utf8') !== original) return;
    if (hasLiveRecordWriter(file)) return;
    await fs.rename(temp, file);
  } finally {
    await removeTemp(temp);
  }
}

async function removeTemp(temp: string): Promise<void> {
  try {
    await fs.unlink(temp);
  } catch (error: unknown) {
    // degradation-audit: reported - only an already absent temporary file is ignored.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
