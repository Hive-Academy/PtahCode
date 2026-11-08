/** Split the POSIX shell quoting used by Codex's shlex display string. */
export function splitCodexShellWords(command: string): string[] | null {
  const words: string[] = [];
  let word = '';
  let started = false;
  let quote: "'" | '"' | undefined;

  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (quote === "'") {
      if (char === "'") quote = undefined;
      else word += char;
      continue;
    }
    if (char === '"') {
      quote = quote === '"' ? undefined : '"';
      started = true;
      continue;
    }
    if (quote === '"') {
      if (char === '\\' && index + 1 < command.length) {
        const next = command[index + 1];
        if (next === '\\' || next === '"' || next === '$' || next === '`' || next === '\n') {
          if (next !== '\n') word += next;
          index++;
          continue;
        }
      }
      word += char;
      continue;
    }
    if (char === "'") {
      quote = "'";
      started = true;
    } else if (char === '\\') {
      // shlex 1.3 quotes every word that holds a backslash, so an unquoted
      // one means a plain space-joined argv (Codex's join fallback) with a
      // Windows path; splitting it would drop the separators.
      return null;
    } else if (/\s/.test(char)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote) return null;
  if (started) words.push(word);
  return words;
}
