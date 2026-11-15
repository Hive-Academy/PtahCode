import { z } from 'zod';
import type { StackSummary, StackSummaryItem } from '@ptah-extension/shared';

const itemSchema = z.strictObject({
  kind: z.enum(['language', 'framework', 'library', 'test-tool', 'pattern']),
  name: z.string().trim().min(1).max(100),
  evidence: z.string().trim().min(1).max(300),
  sourcePhase: z.enum(['project-profile', 'architecture-assessment']),
});
const summarySchema = z.strictObject({ items: z.array(itemSchema).max(30) });
const blockPattern = /```stack-summary\s*\r?\n([\s\S]*?)\r?\n```/g;

export interface StackSummaryExtraction {
  summary: StackSummary;
  warning?: string;
}

/** Parse only the bounded machine-readable block; older runs use a conservative heading scan. */
export function extractStackSummary(
  phaseContents: Record<string, string>,
): StackSummaryExtraction {
  const structured: StackSummaryItem[] = [];
  let foundBlock = false;
  let warning: string | undefined;
  for (const phase of ['project-profile', 'architecture-assessment'] as const) {
    const content = phaseContents[phase] ?? '';
    const blocks = [...content.matchAll(blockPattern)];
    if (blocks.length === 0) continue;
    foundBlock = true;
    if (blocks.length !== 1 || blocks[0][1].length > 16_000) {
      warning ??= 'Malformed stack summary block';
      continue;
    }
    try {
      const parsed = summarySchema.safeParse(JSON.parse(blocks[0][1]));
      if (!parsed.success || parsed.data.items.some((item) => item.sourcePhase !== phase)) {
        warning ??= 'Invalid stack summary data';
        continue;
      }
      structured.push(...parsed.data.items);
      if (dedupe(structured).length > 30) {
        structured.splice(structured.length - parsed.data.items.length);
        warning ??= 'Stack summary exceeds 30 unique items';
      }
    } catch {
      warning ??= 'Malformed stack summary JSON';
      continue;
    }
  }
  if (foundBlock) return { summary: { items: dedupe(structured), source: 'structured' }, warning };

  const items: StackSummaryItem[] = [];
  for (const phase of ['project-profile', 'architecture-assessment'] as const) {
    const content = phaseContents[phase] ?? '';
    if (content.length > 200_000) continue;
    let section: StackSummaryItem['kind'] | 'tech-stack' | undefined;
    for (const line of content.split(/\r?\n/).slice(0, 1000)) {
      const heading = /^#{2,4}\s+(.+)$/i.exec(line);
      if (heading) {
        const title = heading[1].toLowerCase();
        section = /tech stack/.test(title) ? 'tech-stack' :
          /language/.test(title) ? 'language' :
          /framework/.test(title) ? 'framework' :
          /dependenc|librar/.test(title) ? 'library' :
          /test/.test(title) ? 'test-tool' :
          /^(?:detected|observed|current|existing)\s+(?:patterns?|architecture)\b/.test(title) ? 'pattern' : undefined;
        continue;
      }
      if (!section || items.length >= 30) continue;
      const category = section === 'tech-stack'
        ? /^[-*]\s+(languages?|frameworks?|libraries|test(?:ing)? tools?)\s*:\s*/i.exec(line)
        : null;
      const kind = category ? /language/i.test(category[1]) ? 'language' :
        /framework/i.test(category[1]) ? 'framework' :
        /librar/i.test(category[1]) ? 'library' : 'test-tool' : section;
      if (kind === 'tech-stack') continue;
      const candidate = category ? line.slice(category[0].length) : line;
      const bullet = category
        ? /^([@\w][\w@./+-]{1,79})(?:\s|$)/.exec(candidate)
        : /^[-*]\s+(.+?)(?:\s+\([^)]*\)|\s+[—–:]\s+.*)?$/.exec(candidate);
      if (!bullet || line.length > 300) continue;
      const name = bullet[1].trim().replace(/\s+v?\d+(?:\.\d+)*$/i, '');
      if (!name || name.length > 100) continue;
      items.push({ kind, name, evidence: line.trim(), sourcePhase: phase });
    }
  }
  return { summary: { items: dedupe(items), source: 'legacy' },
    warning: items.length ? undefined : 'No verified stack items found in saved analysis' };
}

function dedupe(items: StackSummaryItem[]): StackSummaryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
