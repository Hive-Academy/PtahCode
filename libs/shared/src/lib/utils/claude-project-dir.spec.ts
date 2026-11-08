import { claudeProjectDir } from './claude-project-dir';

describe('claudeProjectDir', () => {
  it.each([
    ['/home/user/my.project', '-home-user-my-project'],
    ['D:\\projects\\.claude-worktrees\\.ptah\\live-test-ws', 'D--projects--claude-worktrees--ptah-live-test-ws'],
    ['/home/user/my project', '-home-user-my-project'],
    ['/home/user/my_project', '-home-user-my-project'],
  ])('encodes %s', (workspace, expected) => {
    expect(claudeProjectDir(workspace)).toBe(expected);
  });

  it('uses the CLI length limit and original-path hash', () => {
    const workspace = '/some/path/' + 'a'.repeat(210);
    let hash = 0;
    for (const char of workspace) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
    expect(claudeProjectDir(workspace)).toBe(
      `${workspace.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 200)}-${Math.abs(hash).toString(36)}`,
    );
  });
});
