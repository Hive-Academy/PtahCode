import { GitHubReviewError } from './github-review.error';

export const MAX_BODY_CHARS = 65_536;

function closeBlocks(value: string): string {
  let inFence = false;
  let details = 0;
  for (const line of value.split('\n')) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const tag of line.match(/<details(?:\s[^>]*)?>|<\/details>/g) ?? []) {
      details += tag.startsWith('</') ? -1 : 1;
    }
  }
  return value + (inFence ? '\n```' : '') + '\n</details>'.repeat(Math.max(0, details));
}

/** Keep marker suffixes whole; optional Markdown is removed as complete sections. */
export function boundedBody(content: string, markers: readonly string[], maxChars = MAX_BODY_CHARS): string {
  const suffix = markers.length ? `\n\n${markers.join('\n')}` : '';
  const full = `${content}${suffix}`;
  if (full.length <= maxChars) return full;
  const pieces = content.split(/\n\n/);
  const selected = [...pieces];
  while (selected.length) {
    const omitted = `\n\n… ${pieces.length - selected.length} sections omitted because of GitHub's comment limit.`;
    const reduced = `${closeBlocks(selected.join('\n\n'))}${omitted}${suffix}`;
    if (reduced.length <= maxChars) return reduced;
    if (selected.length > 2) { selected.pop(); continue; }
    if (selected.length === 2) {
      if (selected[1].length > 2_000) { selected[1] = `${selected[1].slice(0, 1_999)}…`; continue; }
      selected.pop();
      continue;
    }
    // Reserve room for the omission notice, marker suffix and any closing blocks.
    const excess = reduced.length - maxChars;
    if (selected[0].length <= excess + 1) break;
    selected[0] = `${selected[0].slice(0, -excess - 1)}…`;
  }
  throw new GitHubReviewError('publication-unavailable', 'Required review body exceeds GitHub limit');
}
