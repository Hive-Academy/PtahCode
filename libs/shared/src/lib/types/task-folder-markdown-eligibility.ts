export function isReadableTaskFolderMarkdownName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/i.test(name) && !name.includes('..');
}
