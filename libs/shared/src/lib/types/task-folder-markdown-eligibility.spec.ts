import { isReadableTaskFolderMarkdownName } from './task-folder-markdown-eligibility';

describe('task folder markdown eligibility', () => {
  it('accepts direct markdown names regardless of case', () => {
    expect(isReadableTaskFolderMarkdownName('decisions.md')).toBe(true);
    expect(isReadableTaskFolderMarkdownName('review-1.md')).toBe(true);
    expect(isReadableTaskFolderMarkdownName('Design-spec-v3.md')).toBe(true);
    expect(isReadableTaskFolderMarkdownName('foo.MD')).toBe(true);
  });
  it.each(['../x.md', 'a/b.md', '.md', 'foo%2e%2e.md', 'foo bar.md', 'a..md', 'x.md\0'])('rejects %s', (name) => {
    expect(isReadableTaskFolderMarkdownName(name)).toBe(false);
  });
});
