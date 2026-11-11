import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ThemeName, ThemeService } from '@ptah-extension/core';
import { UiGalleryComponent } from './ui-gallery.component';

function createThemeServiceStub(initial: ThemeName = 'ptah-glass') {
  const currentTheme = signal<ThemeName>(initial);
  const setTheme = jest.fn<void, [ThemeName]>();
  const followTheme = jest.fn<void, [string]>((theme) => {
    currentTheme.set(theme as ThemeName);
  });
  return { currentTheme: currentTheme.asReadonly(), setTheme, followTheme };
}

it('renders the foundation samples without host data', () => {
  const themeStub = createThemeServiceStub();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: jest.fn() } },
      { provide: ThemeService, useValue: themeStub },
    ],
  });
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
  const themeStub = createThemeServiceStub();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl } },
      { provide: ThemeService, useValue: themeStub },
    ],
  });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const back = fixture.nativeElement.querySelector(
    'ptah-page-header button',
  ) as HTMLButtonElement;
  back.click();
  expect(navigateByUrl).toHaveBeenCalledWith('/chat');
});

it('renders each token section with its contract specimens', () => {
  const themeStub = createThemeServiceStub();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: jest.fn() } },
      { provide: ThemeService, useValue: themeStub },
    ],
  });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  expect(root.querySelectorAll('[data-testid="spacing-bar"]')).toHaveLength(7);
  expect(root.querySelectorAll('[data-testid="type-role-row"]')).toHaveLength(
    8,
  );
  expect(
    root.querySelectorAll('[data-testid="elevation-specimen"]'),
  ).toHaveLength(4);
});

it('switches between ptah-glass and ptah-glass-light via ThemeService', () => {
  const themeStub = createThemeServiceStub('ptah-glass');
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: jest.fn() } },
      { provide: ThemeService, useValue: themeStub },
    ],
  });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const buttons = Array.from(
    root.querySelectorAll('[aria-label="Theme switch"] button'),
  ) as HTMLButtonElement[];
  const darkButton = buttons.find((btn) => btn.textContent?.trim() === 'Dark');
  const lightButton = buttons.find(
    (btn) => btn.textContent?.trim() === 'Light',
  );

  expect(darkButton?.getAttribute('aria-pressed')).toBe('true');
  expect(lightButton?.getAttribute('aria-pressed')).toBe('false');

  lightButton?.click();
  fixture.detectChanges();
  expect(themeStub.followTheme).toHaveBeenCalledWith('ptah-glass-light');
  expect(lightButton?.getAttribute('aria-pressed')).toBe('true');

  darkButton?.click();
  fixture.detectChanges();
  expect(themeStub.followTheme).toHaveBeenCalledWith('ptah-glass');
  expect(themeStub.setTheme).not.toHaveBeenCalled();
  expect(darkButton?.getAttribute('aria-pressed')).toBe('true');
});

it('renders a section index with one link per gallery section', () => {
  const themeStub = createThemeServiceStub();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: jest.fn() } },
      { provide: ThemeService, useValue: themeStub },
    ],
  });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  const sections = Array.from(
    root.querySelectorAll('ptah-gallery-section > section[id]'),
  );
  const links = Array.from(
    root.querySelectorAll('nav[aria-label="Gallery sections"] a'),
  ) as HTMLAnchorElement[];

  expect(links).toHaveLength(sections.length);
  expect(links.map((link) => link.getAttribute('href'))).toEqual(
    sections.map((section) => `#${section.id}`),
  );
});

it('restores the theme of the user when the gallery closes', () => {
  const themeStub = createThemeServiceStub('ptah-glass');
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: jest.fn() } },
      { provide: ThemeService, useValue: themeStub },
    ],
  });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  fixture.componentInstance.setTheme('ptah-glass-light');
  themeStub.followTheme.mockClear();
  fixture.destroy();
  expect(themeStub.followTheme).toHaveBeenCalledWith('ptah-glass');
  expect(themeStub.setTheme).not.toHaveBeenCalled();
});

it('pairs each contract value with the utility that applies it', () => {
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: jest.fn() } },
      { provide: ThemeService, useValue: createThemeServiceStub() },
    ],
  });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const specimenFor = (caption: string): Element | null | undefined =>
    Array.from(root.querySelectorAll('p, span, code'))
      .find((node) => node.textContent?.includes(caption))
      ?.closest('[data-testid]');

  const fieldGap = specimenFor('--ptah-gap-field');
  expect(fieldGap?.textContent).toContain('16 px');
  expect(fieldGap?.querySelector('.gap-ptah-field')).not.toBeNull();
  expect(root.textContent).toContain('52 px');
  expect(root.querySelector('.h-ptah-control-field')).not.toBeNull();
  expect(root.textContent).toContain('11 px');
  expect(root.querySelector('.text-ptah-caption')).not.toBeNull();
});

it('renders the button family as one reference with the token look on every directive host', () => {
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: jest.fn() } },
      { provide: ThemeService, useValue: createThemeServiceStub() },
    ],
  });
  const fixture = TestBed.createComponent(UiGalleryComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  const section = root.querySelector('section#family-button');
  expect(section).not.toBeNull();

  expect(root.querySelectorAll('[data-ptah-look]')).toHaveLength(0);
  expect(
    root.querySelector('[data-testid="button-family-col-current"]'),
  ).toBeNull();
  const col = root.querySelector(
    '[data-testid="button-family-reference"]',
  ) as HTMLElement;
  expect(col).not.toBeNull();
  expect(col.querySelectorAll('button').length).toBeGreaterThan(0);
  expect(col.querySelectorAll('button:not([data-ptah-button])')).toHaveLength(
    0,
  );

  expect(
    col.querySelectorAll('[data-testid="button-matrix-specimen"]'),
  ).toHaveLength(15);
  expect(col.querySelectorAll('[data-testid="button-state-row"]')).toHaveLength(
    5,
  );
  expect(
    col.querySelectorAll('[data-testid="button-state-specimen"]'),
  ).toHaveLength(30);
  expect(col.querySelectorAll('button[data-state="hover"]')).toHaveLength(5);
  expect(col.querySelectorAll('button[data-state="focus"]')).toHaveLength(5);
  expect(col.querySelectorAll('button[data-state="active"]')).toHaveLength(5);
  expect(col.querySelectorAll('button:disabled')).toHaveLength(5);
  expect(col.querySelectorAll('button[aria-busy="true"]')).toHaveLength(5);
  expect(
    col.querySelectorAll(
      '[data-testid="icon-button-specimen"] [ptahIconButton]',
    ),
  ).toHaveLength(9);
  expect(
    col.querySelectorAll('[data-testid="leading-icon-specimen"] button'),
  ).toHaveLength(1);
  expect(
    col.querySelectorAll('[data-testid="long-text-specimen"] button'),
  ).toHaveLength(1);
});
