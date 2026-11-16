import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahTableComponent } from './table.component';
import { PtahTableOrderButtonsComponent } from './table-order';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahTableComponent, PtahTableOrderButtonsComponent],
  template: `<ptah-table label="Order"
    ><tbody>
      <tr>
        <td>
          <ptah-table-order-buttons
            rowLabel="Quill"
            [index]="index()"
            [count]="3"
            (moveUp)="up()"
            (moveDown)="down()"
          />
        </td>
      </tr></tbody
  ></ptah-table>`,
})
class HostComponent {
  readonly index = signal(0);
  upCount = 0;
  downCount = 0;
  up(): void {
    this.upCount++;
    this.index.update((value) => value - 1);
  }
  down(): void {
    this.downCount++;
    this.index.update((value) => value + 1);
  }
}

describe('table order buttons', () => {
  it('labels, disables ends, emits moves, announces positions and preserves focus', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const up = root.querySelector<HTMLButtonElement>('[data-order-up]');
    const down = root.querySelector<HTMLButtonElement>('[data-order-down]');
    expect(up?.getAttribute('aria-label')).toBe('Move Quill up');
    expect(down?.getAttribute('aria-label')).toBe('Move Quill down');
    expect(up?.disabled).toBe(true);
    down?.focus();
    down?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.downCount).toBe(1);
    expect(down?.disabled).toBe(false);
    expect(document.activeElement).toBe(down);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Quill moved to position 2 of 3',
    );
    down?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(down?.disabled).toBe(true);
    expect(document.activeElement).toBe(up);
    up?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.upCount).toBe(1);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Quill moved to position 2 of 3',
    );
    fixture.destroy();
  });

  it('cancels pending focus after destroy', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-order-down]')
      ?.click();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
