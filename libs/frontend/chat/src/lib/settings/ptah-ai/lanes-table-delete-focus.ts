type FocusRow = { readonly id: string; readonly kind: string };

/** Restores focus across immediate and delayed row removal after Delete. */
export class LanesTableDeleteFocus {
  private targets: HTMLElement[] = [];
  private restoration: {
    rowId: string;
    rows: readonly FocusRow[];
    targets: HTMLElement[];
  } | null = null;

  capture(row: FocusRow, event: Event): void {
    this.restoration = null;
    const origin = event.target instanceof HTMLElement ? event.target : null;
    const table = origin?.closest<HTMLElement>('ptah-table');
    const triggers = Array.from(table?.querySelectorAll<HTMLButtonElement>(
      'tbody > tr[data-testid] ptah-table-row-actions button[aria-haspopup="menu"]',
    ) ?? []);
    const trigger = origin
      ?.closest('ptah-table-row-actions')
      ?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    const rowTestId = (row.kind === 'system' ? 'cli-provider-card-' : 'cli-matrix-row-') + row.id;
    const index = triggers.findIndex((candidate) =>
      candidate.closest('tr')?.getAttribute('data-testid') === rowTestId,
    );
    this.targets = [trigger, triggers[index + 1], triggers[index - 1], table]
      .filter((target): target is HTMLElement => !!target);
  }

  confirm(row: FocusRow, rows: readonly FocusRow[]): void {
    this.restoration = { rowId: row.id, rows, targets: this.targets.slice(1) };
  }

  cancel(): void {
    const targets = this.targets;
    this.targets = [];
    queueMicrotask(() => this.focusTarget(targets));
  }

  onRowsChanged(rows: readonly FocusRow[]): void {
    const restoration = this.restoration;
    if (!restoration || rows === restoration.rows) return;
    // Keep waiting while the row is still present (for example, marked busy first).
    if (rows.some((row) => row.id === restoration.rowId)) return;
    this.restoration = null;
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      this.focusTarget(restoration.targets);
    });
  }

  private focusTarget(targets: HTMLElement[]): void {
    const target = targets.find((candidate) =>
      candidate.isConnected && !candidate.matches(':disabled'),
    );
    if (target?.tagName === 'PTAH-TABLE') target.tabIndex = -1;
    target?.focus();
  }
}
