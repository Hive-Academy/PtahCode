import { TestBed } from '@angular/core/testing';
import { GraphSelectionBarComponent } from './graph-selection-bar.component';

describe('GraphSelectionBarComponent', () => {
  it('emits bulk actions after confirmation', () => {
    const fixture = TestBed.createComponent(GraphSelectionBarComponent);
    fixture.componentRef.setInput('count', 2);
    fixture.detectChanges();
    const calls: string[] = [];
    fixture.componentInstance.pinAll.subscribe(() => calls.push('pin'));
    fixture.componentInstance.unpinAll.subscribe(() => calls.push('unpin'));
    fixture.componentInstance.forgetAll.subscribe(() => calls.push('forget'));
    fixture.componentInstance.clear.subscribe(() => calls.push('clear'));
    const button = (name: string): HTMLButtonElement => [...fixture.nativeElement.querySelectorAll('button')].find((item: HTMLButtonElement) => item.textContent?.trim() === name) as HTMLButtonElement;
    button('Pin all').click(); button('Unpin all').click(); button('Forget all').click(); fixture.detectChanges();
    button('Forget all').click(); fixture.detectChanges(); button('Clear selection').click();
    expect(calls).toEqual(['pin', 'unpin', 'forget', 'clear']);
  });
});
