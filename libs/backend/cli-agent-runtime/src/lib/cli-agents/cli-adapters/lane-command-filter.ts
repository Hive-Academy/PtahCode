/**
 * Lane slash-command filtering (D18).
 *
 * Provider commands that change a lane's permission policy are hidden from the
 * lane's `/` list and refused when typed by hand: a lane's approval mode is
 * set at spawn. Both functions share one matching rule, so the list a user sees
 * and the text the host refuses can never disagree.
 */

/** A command entry as a provider advertises it; only `name` is read. */
export interface NamedLaneCommand {
  readonly name: string;
}

/** Normalised command name: no leading `/`, lower case. */
function commandKey(name: string): string {
  return (name.startsWith('/') ? name.slice(1) : name).toLowerCase();
}

/** The first `/token` of a text after leading whitespace, without its `/`; else undefined. */
export function leadingLaneCommand(text: string): string | undefined {
  const token = text.trimStart().split(/\s/, 1)[0] ?? '';
  if (!token.startsWith('/') || token.length < 2) return undefined;
  return token.slice(1);
}

/** Drops every command whose name is hidden (case-insensitive, exact). */
export function filterLaneCommands<T extends NamedLaneCommand>(
  commands: readonly T[],
  hidden: readonly string[],
): T[] {
  if (hidden.length === 0) return [...commands];
  const blocked = new Set(hidden.map(commandKey));
  return commands.filter((command) => !blocked.has(commandKey(command.name)));
}

/**
 * The hidden command name that starts `text`, if any.
 *
 * Matching: leading whitespace (including newlines) is trimmed, the first
 * token up to the next whitespace must start with `/`, and the rest is
 * compared with each hidden name case-insensitively as an exact match.
 * Returns the hidden name as declared.
 */
export function blockedLaneCommand(
  text: string,
  hidden: readonly string[],
): string | undefined {
  if (hidden.length === 0) return undefined;
  const token = leadingLaneCommand(text);
  if (token === undefined) return undefined;
  const key = token.toLowerCase();
  return hidden.find((name) => commandKey(name) === key);
}

/** Whether `text` starts with a `/token` that names one of `names` (same matching rule). */
export function matchesLaneCommand(
  text: string,
  names: readonly string[],
): boolean {
  const token = leadingLaneCommand(text);
  if (token === undefined) return false;
  const key = token.toLowerCase();
  return names.some((name) => commandKey(name) === key);
}

/**
 * True when a turn's text is a raw `/command` delivery. The dispatcher sends a
 * raw command as the user typed it (trimmed) with no Ptah header; every other
 * message carries the header, so its text never equals its raw body.
 */
export function isRawCommandDelivery(text: string, rawBody: string | undefined): boolean {
  return rawBody !== undefined && text === rawBody.trimStart() && leadingLaneCommand(text) !== undefined;
}

/** The refusal text for a hidden command typed by hand (D18). */
export function blockedLaneCommandReason(name: string): string {
  return `Ptah does not allow /${commandKey(name)} in a lane: its approval mode is set at spawn.`;
}
