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
.ptah-time-live,
.ptah-time-sr {
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

/**
 * Boxed layout: one box for each unit, a mono value over a small label.
 * Digits never animate. The box width is a minimum, so a wide value grows it.
 */
export const PTAH_COUNTDOWN_BOXED_STYLES = `
.ptah-cd-boxes {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: var(--ptah-countdown-gap);
}
.ptah-cd-box {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  min-width: var(--ptah-cd-box-w);
  padding: var(--ptah-space-2) var(--ptah-space-1);
  background: var(--ptah-countdown-box-bg);
  border: var(--ptah-border-width) solid var(--ptah-countdown-box-edge);
  border-radius: var(--ptah-countdown-box-radius);
}
.ptah-cd-value {
  font-family: var(--ptah-font-mono);
  font-size: var(--ptah-cd-value-size);
  font-weight: var(--ptah-text-page-title-weight);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ptah-cd-unit {
  margin-top: var(--ptah-space-1);
  font-size: var(--ptah-text-caption-size);
  line-height: var(--ptah-text-caption-leading);
  font-weight: var(--ptah-text-caption-weight);
}
:host([data-size='sm']) {
  --ptah-cd-value-size: var(--ptah-countdown-value-sm);
  --ptah-cd-box-w: var(--ptah-countdown-box-w-sm);
}
:host([data-size='md']) {
  --ptah-cd-value-size: var(--ptah-countdown-value-md);
  --ptah-cd-box-w: var(--ptah-countdown-box-w-md);
}
:host([data-size='lg']) {
  --ptah-cd-value-size: var(--ptah-countdown-value-lg);
  --ptah-cd-box-w: var(--ptah-countdown-box-w-lg);
}
:host([data-layout='boxed']) {
  align-items: stretch;
}
:host([data-layout='boxed'][data-state='urgent']) .ptah-cd-box {
  border-color: var(--ptah-state-warn);
}
:host([data-layout='boxed'][data-state='expired']) .ptah-cd-box {
  border-color: var(--ptah-state-err);
}
`;
