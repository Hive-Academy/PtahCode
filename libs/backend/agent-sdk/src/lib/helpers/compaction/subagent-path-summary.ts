/** Bound prompt/record expansion without reducing the actual permission set. */
export function summarizeSubagentPaths(paths: readonly string[]): string {
  const shown = paths.slice(0, 20).join(', ');
  return paths.length > 20 ? `${shown}, and ${paths.length - 20} more` : shown;
}
