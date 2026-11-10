import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SetupActionDirective } from './setup-action.directive';
import { provideSetupActionLook } from './setup-action.look';

@Component({
  standalone: true,
  imports: [SetupActionDirective],
  template: `
    <button type="button" [ptahSetupAction]="'primaryCompact'"><span>Continue</span></button>
    <button type="submit" [ptahSetupAction]="'primaryFull'" disabled><span>Start</span></button>
    <button type="button" [ptahSetupAction]="'ghost'">Hide</button>
    <button type="button" [ptahSetupAction]="'glass'" [ptahSetupActionBusy]="true">
      <svg aria-hidden="true"></svg><span>Resume</span>
    </button>
    <button type="reset" [ptahSetupAction]="undefined">Default</button>
  `,
})
class TestHostComponent {}

describe('SetupActionDirective', () => {
  it('keeps the native button and exact source classes for every observed look', () => {
    TestBed.configureTestingModule({ providers: [provideSetupActionLook('ghost')] });
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];

    expect(buttons.map((button) => button.className)).toEqual([
      'btn btn-primary btn-sm',
      'btn btn-primary mt-4',
      'btn btn-sm',
      'btn btn-primary btn-sm min-h-8',
      'btn btn-sm',
    ]);
    expect(buttons[1].type).toBe('submit');
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[3].querySelector('svg + span')?.textContent).toBe('Resume');
    expect(buttons[3].getAttribute('aria-busy')).toBe('true');
    expect(buttons[4].type).toBe('reset');
  });
});
