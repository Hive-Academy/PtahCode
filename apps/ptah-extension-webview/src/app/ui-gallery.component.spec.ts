import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UiGalleryComponent } from './ui-gallery.component';

it('renders the foundation samples without host data', () => {
  TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { navigateByUrl: jest.fn() } }] });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.querySelectorAll('ptah-ui-status-badge')).toHaveLength(10);
  expect(root.querySelectorAll('ptah-state-panel')).toHaveLength(5);
  expect(root.querySelectorAll('ptah-meter')).toHaveLength(6);
  expect(root.querySelectorAll('[ptahListRow]')).toHaveLength(4);
});

it('navigates to chat from the page header back button', () => {
  const navigateByUrl = jest.fn();
  TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { navigateByUrl } }] });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const back = fixture.nativeElement.querySelector('ptah-page-header button') as HTMLButtonElement;
  back.click();
  expect(navigateByUrl).toHaveBeenCalledWith('/chat');
});
