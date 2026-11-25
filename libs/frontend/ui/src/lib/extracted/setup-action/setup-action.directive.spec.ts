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
    <button type="button" [ptahSetupAction]="'plainFull'" disabled>Start unavailable</button>
    <button type="button" ptahSetupAction="ghostLink">Use workspace model</button>
  `,
})
class TestHostComponent {}

describe('SetupActionDirective', () => {
  it('keeps the native button and exact source classes for every observed look', () => {
    TestBed.configureTestingModule({ providers: [provideSetupActionLook('ghost')] });
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];

    const expectedClasses = [
      'btn btn-primary btn-sm',
      'btn btn-primary mt-4',
      'btn btn-sm',
      'btn btn-primary btn-sm min-h-8',
      'btn btn-sm',
      'btn mt-4',
      'btn btn-ghost btn-sm px-2 text-xs font-medium text-base-content underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content',
    ];
    expect(buttons.map((button) => [...button.classList].sort())).toEqual(
      expectedClasses.map((classes) => classes.split(' ').sort()),
    );
    expect(buttons[1].type).toBe('submit');
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[3].querySelector('svg + span')?.textContent).toBe('Resume');
    expect(buttons[3].getAttribute('aria-busy')).toBe('true');
    expect(buttons[4].type).toBe('reset');
    expect(buttons[5].disabled).toBe(true);
  });
});
