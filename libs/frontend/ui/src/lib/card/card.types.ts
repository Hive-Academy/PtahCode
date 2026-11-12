/** Card family types (TASK_2026_1012_b1dc, `family-card-look.md`). */

/**
 * `card`: the default card (base-200 fill, base-300 border).
 * `subtle`: a quieter plane (surface-1 fill).
 * `inset`: a nested block inside a card (base-100 fill, smaller radius).
 * `raised`: a card that floats over the page (surface-3 fill and a shadow).
 */
export type PtahCardVariant = 'card' | 'subtle' | 'inset' | 'raised';

/** none: 0. sm: 12 px. md: 16 px (default). lg: 20 px. */
export type PtahCardPadding = 'none' | 'sm' | 'md' | 'lg';

/** Color of the status spine and of the selected ring. */
export type PtahCardTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'accent'
  | 'secondary'
  | 'primary';

/** Padding scale of `ptah-native-card`. compact = `sm`, comfortable = `md`. */
export type PtahCardDensity = 'compact' | 'comfortable';

/** Heading level of `ptah-section-header`. The look does not depend on the level. */
export type PtahSectionLevel = 2 | 3 | 4;

/** group: 14 px title (default, most used). section: 16 px title. */
export type PtahSectionSize = 'group' | 'section';
