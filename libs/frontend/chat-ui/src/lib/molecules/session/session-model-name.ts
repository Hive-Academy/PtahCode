import { resolveModelDisplayName } from '@ptah-extension/shared';

/** A Claude-style id the shared formatter does not know the family of: `claude-fable-5-2`. */
const CLAUDE_FAMILY_ID = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8}|-\d{4}-\d{2}-\d{2})?$/i;

/**
 * A model's display name for the session stats: the catalog name, else the
 * shared formatter, else a readable form of a Claude-style id of a family the
 * formatter does not list (`claude-fable-5-2` → "Fable 5.2"). Any other id
 * stays raw.
 */
export function sessionModelDisplayName(
  modelId: string,
  availableModels?: ReadonlyArray<{ id: string; name: string }>,
): string {
  const resolved = resolveModelDisplayName(modelId, availableModels);
  // The shared formatter strips a date but keeps an unknown family raw
  // (`claude-fable-5-20261001` -> `claude-fable-5`): read that form too.
  const match = resolved.match(CLAUDE_FAMILY_ID);
  if (!match) return resolved;
  const [, family, major, minor] = match;
  const name = family[0].toUpperCase() + family.slice(1).toLowerCase();
  return `${name} ${minor ? `${major}.${minor}` : major}`;
}
