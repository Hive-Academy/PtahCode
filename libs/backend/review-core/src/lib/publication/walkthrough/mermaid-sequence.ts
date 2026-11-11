import type { TriageDiagram } from './triage-output.schema';
import { identityRedact, type Redact } from './walkthrough-text';

/** Mermaid labels keep letters, digits, spaces and a few safe symbols. Everything else is dropped. */
function label(value: string, redact: Redact): string {
  return redact(value).replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} _./():,-]/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * Builds a Mermaid `sequenceDiagram` from model data. The model never writes Mermaid syntax:
 * participant ids are generated here, labels are filtered, and unknown participants drop their steps.
 * Returns null when no useful diagram remains.
 */
export function renderSequenceDiagram(diagram: TriageDiagram, redact: Redact = identityRedact): string | null {
  const ids = new Map<string, string>();
  const lines: string[] = [];
  for (const participant of diagram.participants) {
    if (ids.has(participant.id)) continue;
    const name = label(participant.label, redact);
    if (!name) continue;
    const id = `P${ids.size + 1}`;
    ids.set(participant.id, id);
    lines.push(`  participant ${id} as ${name}`);
  }
  if (ids.size < 2) return null;
  let steps = 0;
  for (const step of diagram.steps) {
    const from = ids.get(step.from);
    const to = ids.get(step.to);
    const text = label(step.label, redact);
    if (!from || !to || !text) continue;
    lines.push(`  ${from}->>${to}: ${text}`);
    steps++;
  }
  return steps === 0 ? null : ['```mermaid', 'sequenceDiagram', ...lines, '```'].join('\n');
}
