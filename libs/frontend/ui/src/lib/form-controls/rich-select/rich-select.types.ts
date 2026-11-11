/** One option of `ptah-select`. */
export interface PtahSelectOption<T = unknown> {
  readonly value: T;
  readonly label: string;
  /** A second line under the label. */
  readonly description?: string;
  /** The group header. Options with the same group appear together, in the order of the first option. */
  readonly group?: string;
  readonly disabled?: boolean;
  /** Extra words that the search also matches (ids, aliases). */
  readonly keywords?: readonly string[];
  /** A key for the icon template (`ng-template[ptahSelectIcon]`). */
  readonly icon?: string;
}

/** A group of visible options after the search filter. */
export interface PtahSelectGroup<T = unknown> {
  readonly name: string | null;
  readonly headerId: string;
  readonly items: readonly PtahSelectItem<T>[];
}

/** A visible option with its position in the flat list of visible options. */
export interface PtahSelectItem<T = unknown> {
  readonly option: PtahSelectOption<T>;
  readonly index: number;
  readonly id: string;
}

/** The context of the icon template. */
export interface PtahSelectIconContext<T = unknown> {
  readonly $implicit: PtahSelectOption<T>;
  /** `trigger` for the selected value in the closed control, `option` in the list. */
  readonly place: 'trigger' | 'option';
}
