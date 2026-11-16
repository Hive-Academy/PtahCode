import { TestBed } from '@angular/core/testing';
import {
  SettingsConnectionTestComponent,
  type SettingsConnectionTestState,
} from './settings-connection-test.component';

describe('SettingsConnectionTestComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SettingsConnectionTestComponent] });
  });

  function render(state: SettingsConnectionTestState = 'idle', message: string | null = null) {
    const fixture = TestBed.createComponent(SettingsConnectionTestComponent);
    fixture.componentRef.setInput('label', 'Test connection');
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('message', message);
    fixture.componentRef.setInput('testId', 'connection-test');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button') as HTMLButtonElement;
    const result = element.querySelector('[data-ptah-connection-result]') as HTMLElement;
    return { fixture, element, button, result };
  }

  it('keeps an empty polite status live region in the idle state', () => {
    const { result } = render();

    expect(result).not.toBeNull();
    expect(result.getAttribute('role')).toBe('status');
    expect(result.getAttribute('aria-live')).toBe('polite');
    expect(result.textContent?.trim()).toBe('');
  });

  it('puts success and failure text inside the same live region', () => {
    const { fixture, result, element } = render();

    fixture.componentRef.setInput('state', 'ok');
    fixture.componentRef.setInput('message', 'Connection succeeded');
    fixture.detectChanges();
    expect(element.querySelector('[data-ptah-connection-result]')).toBe(result);
    expect(result.querySelector('ptah-status')?.textContent).toContain('Connection succeeded');

    fixture.componentRef.setInput('state', 'fail');
    fixture.componentRef.setInput('message', 'Connection failed');
    fixture.detectChanges();
    expect(element.querySelector('[data-ptah-connection-result]')).toBe(result);
    expect(result.querySelector('ptah-status')?.textContent).toContain('Connection failed');
  });

  it('shows testing feedback and marks the button busy while running', () => {
    const { button, result } = render('running');

    expect(result.querySelector('ptah-status')?.textContent).toContain('Testing connection');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.classList.contains('cursor-wait')).toBe(true);
  });

  it('emits test on a button click but blocks activation while running', () => {
    const { fixture, button } = render();
    const onTest = jest.fn();
    fixture.componentInstance.test.subscribe(onTest);

    button.click();
    expect(onTest).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('state', 'running');
    fixture.detectChanges();
    button.click();
    expect(onTest).toHaveBeenCalledTimes(1);
  });

  it('renders the exact test id and no id or aria-label attributes', () => {
    const { element, button, result } = render();

    expect(button.getAttribute('data-testid')).toBe('connection-test');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent?.trim()).toBe('Test connection');
    expect(result.hasAttribute('data-ptah-connection-result')).toBe(true);
    expect(element.querySelectorAll('[data-testid]')).toHaveLength(1);
    expect(element.querySelectorAll('[id], [aria-label]')).toHaveLength(0);
  });
});
