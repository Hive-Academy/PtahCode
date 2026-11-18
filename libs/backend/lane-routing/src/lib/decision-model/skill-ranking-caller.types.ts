/** Candidate labels must be unique within an item. */
export interface SkillRankingCandidate {
  readonly label: string;
  readonly name: string;
  readonly source?: string;
  readonly skillId?: string;
  readonly installs?: number;
  readonly description?: string;
}

/** Keys must be unique within a request; candidates arrive in fallback order. */
export interface SkillRankingCallerItem {
  readonly key: string;
  readonly kind: string;
  readonly name: string;
  readonly candidates: readonly SkillRankingCandidate[];
}

/** Original item keys and candidate labels; missing items need fallback. */
export interface SkillRankingCallerResult {
  readonly items: Record<string, { order: string[] }>;
}

/** Registry metadata is untrusted and must stay small and free of executable markup. */
export function skillRankingText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:[^\s]*/gi, '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/(?:[A-Za-z]:[\\/]|(?:^|\s)\/)[^\s]+/g, '')
    .trim()
    .slice(0, 200);
}
