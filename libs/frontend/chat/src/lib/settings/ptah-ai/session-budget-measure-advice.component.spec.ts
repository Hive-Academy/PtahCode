import { TestBed } from '@angular/core/testing';
import { SessionBudgetMeasureAdviceComponent } from './session-budget-measure-advice.component';

describe('SessionBudgetMeasureAdviceComponent', () => {
  it('keeps the busy action focusable and blocks repeated activation', () => {
    const fixture = TestBed.createComponent(SessionBudgetMeasureAdviceComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('[data-testid="session-budget-token-measure-switch"]') as HTMLButtonElement;
    const emit = jest.spyOn(fixture.componentInstance.switchMeasure, 'emit');
    button.focus();
    expect(document.activeElement).toBe(button);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
    button.click();
    expect(emit).not.toHaveBeenCalled();
    fixture.componentRef.setInput('busy', false);
    fixture.detectChanges();
    button.click();
    expect(emit).toHaveBeenCalledTimes(1);
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
