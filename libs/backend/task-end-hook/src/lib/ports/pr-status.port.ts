/**
 * Whether a branch has an open pull request (dispose P9, plan Component 6.3).
 *
 * The Electron adapter maps `GitInfoService.readPrStatus`:
 * - `ok` with `pr.state === 'OPEN'` gives `open`, any other `ok` and `no-pr`
 *   give `none`;
 * - `gh-missing` and `not-github` give `gh-unavailable` (C3: the merge check
 *   P8 alone decides);
 * - `not-authenticated`, `timeout`, `failed`, a rejection or an unregistered
 *   service give `error`, which dispose records as
 *   `precondition-unverifiable`.
 *
 * The result is closed and carries no text.
 */
export type TaskEndPrStatus =
  | { readonly kind: 'open' }
  | { readonly kind: 'none' }
  | { readonly kind: 'gh-unavailable' }
  | { readonly kind: 'error' };

export interface PrStatusPort {
  /** Never rejects: every failure is the `error` member. */
  openPrStatus(mainRoot: string, branch: string): Promise<TaskEndPrStatus>;
}
