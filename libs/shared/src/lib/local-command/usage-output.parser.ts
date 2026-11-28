import type {
  UsageContributor,
  UsageLimit,
  UsageReport,
  UsageShare,
  UsageTopList,
  UsageWindow,
} from './local-command.types';
import {
  cleanText,
  normaliseCommandText,
  parseNumber,
} from './local-command-text';

/** `Current week (Fable): 4% used · resets Dec 5, 5am (Africa/Cairo)` */
const LIMIT_LINE =
  /^(Current week)\s*(?:\(([^)]*)\))?\s*:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*[·•]\s*(.+))?$/;
/** `Last 24h · 427 requests · 15 sessions`. */
const WINDOW_LINE =
  /^(Last\s+\S+)\s*[·•]\s*([\d,]+)\s+requests?\s*[·•]\s*([\d,]+)\s+sessions?\s*$/i;
/** `  45%  Run fewer sessions at once · up to 5 at once` */
const CONTRIBUTOR_LINE = /^\s+(\d+(?:\.\d+)?)%\s+(.+)$/;
/** `  Top skills: /session-handoff 21%, /agent-lanes 5%` */
const TOP_LINE = /^\s+Top\s+([^:]+):\s*(.*)$/;
const SHARE = /^(.+?)\s+(\d+(?:\.\d+)?)%$/;
const MORE = /^\+(\d+)\s+more$/;
const SEPARATOR = /\s+[·•]\s+/;

interface MutableWindow {
  title: string;
  requests: number | null;
  sessions: number | null;
  contributors: UsageContributor[];
  tops: UsageTopList[];
}

function parseLimit(match: RegExpExecArray): UsageLimit | null {
  const pct = parseNumber(match[3]);
  if (pct === null) return null;
  const window = cleanText(match[1]);
  const scope = match[2] ? cleanText(match[2]) : '';
  const reset = match[4] ? cleanText(match[4]) : '';
  return {
    window,
    label: scope || window,
    pct,
    reset: reset || null,
  };
}

function parseWindowHeader(match: RegExpExecArray): MutableWindow {
  return {
    title: cleanText(match[1]),
    requests: parseNumber(match[2]),
    sessions: parseNumber(match[3]),
    contributors: [],
    tops: [],
  };
}

function parseContributor(match: RegExpExecArray): UsageContributor | null {
  const pct = parseNumber(match[1]);
  if (pct === null) return null;
  const [label, ...hint] = match[2].split(SEPARATOR);
  const cleanLabel = cleanText(label);
  if (!cleanLabel) return null;
  const cleanHint = cleanText(hint.join(' · '));
  return { pct, label: cleanLabel, hint: cleanHint || null };
}

function parseTop(match: RegExpExecArray): UsageTopList {
  const items: UsageShare[] = [];
  let more = 0;
  for (const part of match[2].split(',')) {
    const entry = cleanText(part);
    if (!entry) continue;
    const moreMatch = MORE.exec(entry);
    if (moreMatch) {
      more += parseNumber(moreMatch[1]) ?? 0;
      continue;
    }
    const share = SHARE.exec(entry);
    const pct = share ? parseNumber(share[2]) : null;
    if (share && pct !== null) items.push({ name: cleanText(share[1]), pct });
  }
  return { kind: cleanText(match[1]), items, more };
}

/**
 * Parses Claude Code `/usage` stdout. Returns `null` unless the text has a
 * weekly-limit line or a window header with request and session counts.
 */
export function parseUsageOutput(text: string): UsageReport | null {
  if (typeof text !== 'string' || !text) return null;
  const notes: string[] = [];
  const limits: UsageLimit[] = [];
  const windows: MutableWindow[] = [];
  let current: MutableWindow | null = null;

  for (const line of normaliseCommandText(text)) {
    if (!line.trim()) continue;
    const limit = LIMIT_LINE.exec(line);
    if (limit) {
      const parsed = parseLimit(limit);
      if (parsed) limits.push(parsed);
      current = null;
      continue;
    }
    const header = WINDOW_LINE.exec(line);
    if (header) {
      current = parseWindowHeader(header);
      windows.push(current);
      continue;
    }
    if (current) {
      const top = TOP_LINE.exec(line);
      if (top) {
        current.tops.push(parseTop(top));
        continue;
      }
      const contributor = CONTRIBUTOR_LINE.exec(line);
      if (contributor) {
        const parsed = parseContributor(contributor);
        if (parsed) current.contributors.push(parsed);
        continue;
      }
    }
    // A free-standing line before any window (subscription note, the
    // "Approximate · …" caveat). The question heading carries no data.
    if (!current && !line.trim().endsWith('?')) {
      const note = cleanText(line);
      if (note) notes.push(note);
    }
  }

  if (limits.length === 0 && windows.length === 0) return null;
  const finished: UsageWindow[] = windows;
  return { kind: 'usage', notes, limits, windows: finished };
}
