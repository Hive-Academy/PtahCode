import {
  PHASE_KINDS,
  SKELETON_STEPS,
  type PackDefinitionV1,
  type PhaseKind,
  type SkeletonStep,
} from '../../libs/shared/src/lib/types/phase-contract.types';

const phaseKinds = new Set<string>(PHASE_KINDS);

/** Parse one skill pack. Throws with a source-specific message on invalid input. */
export function parsePack(stem: string, source: string): PackDefinitionV1 {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== `# Pack: ${stem}`)
    throw new Error(`Pack title must be # Pack: ${stem}`);

  const sections = new Map<string, string[]>();
  let current = '';
  for (const line of lines.slice(1)) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = heading[1] ?? '';
      if (sections.has(current))
        throw new Error(`Duplicate pack section: ${current}`);
      sections.set(current, []);
    } else if (current) sections.get(current)?.push(line);
  }
  for (const section of ['Discipline', 'Skeleton mapping', 'Phase flow'])
    if (
      !sections.has(section) ||
      !sections.get(section)?.some((line) => line.trim())
    )
      throw new Error(`Missing pack section: ${section}`);

  const stepMap = {} as Record<SkeletonStep, PhaseKind[]>;
  for (const line of sections.get('Skeleton mapping') ?? []) {
    const match = /^- (clarify|plan|do|check|deliver):\s*(.*)$/.exec(line);
    if (!match) continue;
    const step = match[1] as SkeletonStep;
    if (stepMap[step]) throw new Error(`Duplicate skeleton step: ${step}`);
    const kinds = [...(match[2] ?? '').matchAll(/`([^`]+)`/g)].map(
      (m) => m[1] ?? '',
    );
    for (const kind of kinds)
      if (!phaseKinds.has(kind)) throw new Error(`Unknown phase kind: ${kind}`);
    stepMap[step] = kinds as PhaseKind[];
  }
  for (const step of SKELETON_STEPS)
    if (!stepMap[step]) throw new Error(`Missing skeleton step: ${step}`);

  const phaseFlow: PhaseKind[] = [];
  for (const line of sections.get('Phase flow') ?? []) {
    const match = /^- ([a-z-]+)(?: \(optional\))?(?::.*)?$/.exec(line);
    if (!match) continue;
    const kind = match[1] ?? '';
    if (!phaseKinds.has(kind)) throw new Error(`Unknown phase kind: ${kind}`);
    phaseFlow.push(kind as PhaseKind);
  }
  if (!phaseFlow.length) throw new Error('Phase flow has no phases');
  return {
    name: stem,
    displayName: stem.slice(0, 1).toUpperCase() + stem.slice(1),
    workTypes: [
      ...(sections
        .get('Discipline')
        ?.join(' ')
        .matchAll(
          /\b(?:FEATURE|BUGFIX|REFACTORING|DOCUMENTATION|RESEARCH|DEVOPS|SAAS_INIT|CREATIVE)\b/g,
        ) ?? []),
    ].map((m) => m[0]),
    phaseFlow,
    stepMap,
    version: 1,
  };
}
