/** Claude Code's project key for a workspace path (SDK CLI sanitizer). */
export function claudeProjectDir(workspacePath: string): string {
  const escaped = workspacePath.replace(/[^a-zA-Z0-9]/g, '-');
  if (escaped.length <= 200) return escaped;

  // The CLI hashes the original UTF-16 string with a signed 32-bit Java hash.
  let hash = 0;
  for (let i = 0; i < workspacePath.length; i++) {
    hash = (Math.imul(31, hash) + workspacePath.charCodeAt(i)) | 0;
  }
  return `${escaped.slice(0, 200)}-${Math.abs(hash).toString(36)}`;
}
