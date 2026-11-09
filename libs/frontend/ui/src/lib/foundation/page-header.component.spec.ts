import { TestBed } from '@angular/core/testing';
import { PtahPageHeaderComponent } from './page-header.component';

it('renders a heading and emits back', () => {
  const fixture = TestBed.createComponent(PtahPageHeaderComponent);
  fixture.componentRef.setInput('title', 'Reviews');
  fixture.componentRef.setInput('backLabel', 'Back');
  const back = jest.fn();
  fixture.componentInstance.back.subscribe(back);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Reviews');
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  expect(button.classList.contains('btn-ghost')).toBe(true);
  expect(button.classList.contains('btn-xs')).toBe(true);
  expect(button.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
  expect(button.textContent?.trim()).toBe('Back');
  button.click();
  expect(back).toHaveBeenCalledTimes(1);
});
