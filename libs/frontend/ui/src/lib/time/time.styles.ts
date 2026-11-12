/**
 * Shared look of the timer owners. `--ptah-*` tokens only. The live region is
 * visually hidden but stays in the accessibility tree.
 */
export const PTAH_TIME_STYLES = `
:host {
  display: inline-flex;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ptah-time-live {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  margin: -0.0625rem;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
`;

/** Countdown tone. No animation. The color transition is off under reduced motion. */
export const PTAH_COUNTDOWN_STYLES = `
:host {
  transition: color var(--ptah-duration-fast) var(--ptah-ease-standard);
}
:host([data-state='urgent']) {
  color: var(--ptah-state-warn);
}
:host([data-state='expired']) {
  color: var(--ptah-state-err);
}
@media (prefers-reduced-motion: reduce) {
  :host {
    transition: none;
    animation: none;
  }
}
`;
