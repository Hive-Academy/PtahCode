// Keep Nx's daemon out of one-shot checks in linked worktrees unless the
// caller explicitly chose a value. Return a fresh environment for the child.
export function nxChildEnv(env, isLinkedWorktree) {
  const daemonDisabled =
    isLinkedWorktree && !Object.hasOwn(env, 'NX_DAEMON');
  return {
    env: daemonDisabled ? { ...env, NX_DAEMON: 'false' } : { ...env },
    daemonDisabled,
  };
}

// A linked git worktree has a `.git` FILE (`gitdir: ...`) at its root; the
// main checkout has a `.git` directory. `stat` must not throw when the entry
// is missing (`statSync(p, { throwIfNoEntry: false })`).
export function isLinkedWorktree(gitEntryPath, stat) {
  return stat(gitEntryPath)?.isFile() === true;
}
