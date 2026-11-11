/** Badge family types (TASK_2026_957_fda3, `family-3-look.md`). */

/** Meaning of a badge. `neutral` is metadata; the other tones carry state. */
export type PtahBadgeTone = 'neutral' | 'accent' | 'info' | 'ok' | 'warn' | 'err';

/** `soft` is a tinted fill (default). `outline` is an edge with no fill. */
export type PtahBadgeAppearance = 'soft' | 'outline';

/** xs: 16 px high, for dense rows. sm: 20 px high (default). */
export type PtahBadgeSize = 'xs' | 'sm';

/** The five state inks. Each ink has its own glyph shape, so color is never the only cue. */
export type PtahStatusInk = 'run' | 'idle' | 'need' | 'err' | 'done';

/** `pill`: glyph and text in a soft badge. `inline`: glyph and text, no fill. `dot`: glyph only, named by `label`. */
export type PtahStatusAppearance = 'pill' | 'inline' | 'dot';
