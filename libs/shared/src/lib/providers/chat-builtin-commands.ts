// Names reserved by Ptah's chat command discovery and provider controls.
const CHAT_BUILTIN_COMMANDS: ReadonlySet<string> = new Set([
  'clear', 'clear-style', 'compact', 'context', 'cost', 'deep-research',
  'memory', 'model', 'review', 'status',
]);

export function isChatBuiltinCommand(name: string): boolean {
  return CHAT_BUILTIN_COMMANDS.has(name.toLowerCase());
}
