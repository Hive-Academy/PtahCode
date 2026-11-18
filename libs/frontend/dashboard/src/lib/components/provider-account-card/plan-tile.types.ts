export type Tone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

/** Status pill that reserves the bar slot when no window is eligible. */
export interface PlanTileStatusPillView {
  readonly text: string;
  readonly tone: Tone;
}

/** An owner-level notice (evidence, cooldown), truncated with its tooltip. */
export interface PlanTileNoticeView {
  readonly key: string;
  readonly text: string;
  readonly tone: Tone;
  readonly title: string;
}

/**
 * One inline action on a tile, wired only to navigation that already
 * exists: `open-session` goes to the chat surface, `add-key` opens Settings
 * on the Providers tab focused on this provider.
 */
export interface PlanTileActionView {
  readonly kind: 'open-session' | 'add-key';
  readonly label: string;
  readonly providerId: string;
}

export interface PlanQuotaWindowView {
  readonly key: string;
  readonly label: string;
  readonly modelScope: string | null;
  readonly valueText: string;
  readonly percent: number | null;
  readonly tone: Tone;
  readonly allowanceText: string | null;
  readonly resetText: string;
  readonly provenance: readonly string[];
  readonly qualifier: string | null;
}
export type PlanAccountingView = {
  readonly key: string;
  readonly label: string;
  readonly valueText: string;
  readonly provenance: readonly string[];
} & (
  | { readonly kind: 'allowance' }
  | { readonly kind: 'balance' }
  | { readonly kind: 'requests' }
  | { readonly kind: 'tokens' }
  | { readonly kind: 'cost' }
  | { readonly kind: 'activity' }
);
export interface PlanTileView {
  readonly modelUsage: readonly {
    readonly model: string;
    readonly requests: number;
  }[];
  readonly primaryWindow: PlanQuotaWindowView | null;
  readonly secondaryWindows: readonly PlanQuotaWindowView[];
  readonly accounting: readonly PlanAccountingView[];
  readonly identity: string;
  readonly provenance: readonly string[];

  readonly key: string;
  readonly providerId: string;
  /** Generic label plus the short key suffix ("Claude account Â· a1b2"). */
  readonly label: string;
  /** Header line 1: the name with the key suffix, qualifiers removed. */
  readonly titleName: string;
  /** Header line 2: the label's parenthesized qualifiers, or `null`. */
  readonly titleQualifier: string | null;
  /** Plan badge text (e.g. "plus"), or `null` when no plan is known. */
  readonly planBadge: string | null;
  readonly statusPill: PlanTileStatusPillView | null;
  readonly statusNotice: string | null;
  readonly action: PlanTileActionView | null;
  readonly evidence: readonly PlanTileNoticeView[];
  readonly cooldown: string | null;
}
