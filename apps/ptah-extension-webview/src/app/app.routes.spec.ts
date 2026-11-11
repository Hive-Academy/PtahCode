import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CanMatchFn, Route } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import {
  ACCEPTED_INITIAL_VIEWS,
  SURFACE_ACTIVE,
  SURFACE_ROUTE_IDS,
  VSCodeService,
} from '@ptah-extension/core';

import { onboardingFirstRunGuard } from '@ptah-extension/onboarding/services';

import { appRoutes } from './app.routes';
import { reviewOnlySurface } from './review-only-surface.guard';
import { electronOnlySurface } from './electron-only-surface.guard';

describe('Electron shell layout boundary', () => {
  it('bounds the outer row and configuration host', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../../../libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts',
      ),
      'utf-8',
    );
    const rowClasses = source.match(
      /<!-- 3-Panel Content Area -->\s*<div class="([^"]+)"/,
    )?.[1];
    const hostClasses = source.match(
      /data-test="configuration-surface-host"[\s\S]*?class="([^"]+)"/,
    )?.[1];
    expect(rowClasses?.split(' ')).toContain('min-h-0');
    expect(hostClasses?.split(' ')).toContain('min-h-0');
  });
});

function routeFor(path: string): Route {
  const route = appRoutes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

describe('UI gallery route', () => {
  it('keeps listbox selection explicit and shows the shared surfaces', () => {
    const galleryDir = join(__dirname, 'ui-gallery');
    const source = [
      readFileSync(join(__dirname, 'ui-gallery.component.ts'), 'utf-8'),
      ...readdirSync(galleryDir)
        .filter((file) => file.endsWith('.ts') || file.endsWith('.html'))
        .map((file) => readFileSync(join(galleryDir, file), 'utf-8')),
    ].join('\n');
    expect(source).toMatch(/ngListbox\s+selectionMode="explicit"/);
    expect(source).toMatch(/<ptah-surface-card\s*>/);
    expect(source).toContain('<ptah-surface-tile');
    expect(source).toMatch(/<ptah-gallery-button-family[\s/>]/);
    expect(source).toMatch(/<ptah-gallery-form-controls-family[\s/>]/);
    expect(source).toMatch(/\bptahIconButton\b/);
    expect(source).not.toMatch(/\biconOnly\b/);
  });

  it('loads only on Electron before the wildcard', async () => {
    const route = routeFor('ui-gallery');
    expect(route.canMatch).toEqual([electronOnlySurface]);
    expect(route.canMatch?.[0]).toBe(electronOnlySurface);
    expect(route.data?.['standalone']).toBe(true);
    expect(route.component).toBeUndefined();
    expect(typeof route.loadComponent).toBe('function');
    expect(route.providers).toBeUndefined();
    expect(
      appRoutes.findIndex((entry) => entry.path === 'ui-gallery'),
    ).toBeLessThan(appRoutes.findIndex((entry) => entry.path === '**'));
    const { UiGalleryComponent } = await import('./ui-gallery.component');
    expect(await route.loadComponent?.()).toBe(UiGalleryComponent);
  });

  it('has no navigation definition or non-gallery app file pointing to ui-gallery', () => {
    expect(SURFACE_ROUTE_IDS).not.toContain('ui-gallery');
    expect(ACCEPTED_INITIAL_VIEWS).not.toContain('ui-gallery');

    function collectNonGalleryAppSources(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'ui-gallery') return [];
          return collectNonGalleryAppSources(full);
        }
        if (
          entry.name.endsWith('.spec.ts') ||
          entry.name === 'app.routes.ts' ||
          entry.name === 'ui-gallery.component.ts'
        ) {
          return [];
        }
        return /\.(ts|html)$/.test(entry.name) ? [full] : [];
      });
    }

    const referencingFiles = collectNonGalleryAppSources(__dirname).filter(
      (file) => readFileSync(file, 'utf-8').includes('ui-gallery'),
    );
    expect(referencingFiles).toEqual([]);
  });
});

describe('review runs route', () => {
  it('lazily resolves the review runs page on Electron', async () => {
    const route = routeFor('review-runs');
    TestBed.configureTestingModule({
      providers: [{ provide: VSCodeService, useValue: { isElectron: true } }],
    });
    expect(route.canMatch).toEqual([reviewOnlySurface]);
    expect(
      TestBed.runInInjectionContext(() =>
        reviewOnlySurface(route, [], {} as Parameters<CanMatchFn>[2]),
      ),
    ).toBe(true);
    const { ReviewRunsPageComponent } =
      await import('@ptah-extension/review-runs-ui');
    expect(await route.loadComponent?.()).toBe(ReviewRunsPageComponent);
  });

  it('refuses the route on hosts without the review surface', () => {
    const route = routeFor('review-runs');
    TestBed.configureTestingModule({
      providers: [{ provide: VSCodeService, useValue: { isElectron: false } }],
    });
    expect(
      TestBed.runInInjectionContext(() =>
        reviewOnlySurface(route, [], {} as Parameters<CanMatchFn>[2]),
      ),
    ).toBe(false);
    expect(appRoutes.at(-1)?.path).toBe('**');
  });
});

describe('onboarding route (TASK_2026_ONBOARDING)', () => {
  it('guards only the chat route with the first-run guard', () => {
    const guarded = appRoutes
      .filter((route) => route.canActivate !== undefined)
      .map((route) => route.path);

    expect(guarded).toEqual(['chat']);
    expect(routeFor('chat').canActivate).toEqual([onboardingFirstRunGuard]);
  });

  it('lazily loads ONBOARDING_ROUTES with its own SURFACE_ACTIVE provider', async () => {
    const route = routeFor('onboarding');
    const module = await import('@ptah-extension/onboarding');

    expect(route.component).toBeUndefined();
    expect(route.loadComponent).toBeUndefined();
    expect(route.canMatch).toBeUndefined();
    expect(route.providers).toEqual([
      expect.objectContaining({ provide: SURFACE_ACTIVE }),
    ]);
    expect(await route.loadChildren?.()).toBe(module.ONBOARDING_ROUTES);
  });

  it('declares onboarding right after chat', () => {
    const order = appRoutes.map((route) => route.path);
    expect(order.indexOf('onboarding')).toBe(order.indexOf('chat') + 1);
  });

  it('has no routes for the deleted setup surfaces', () => {
    const paths = appRoutes.map((route) => route.path);
    for (const legacyPath of ['setup-wizard', 'harness-builder', 'setup-hub']) {
      expect(paths).not.toContain(legacyPath);
    }
  });

  it('imports onboarding eagerly only through its narrow services entry', () => {
    const source = readFileSync(join(__dirname, 'app.routes.ts'), 'utf-8');
    expect(source).toContain("from '@ptah-extension/onboarding/services'");
    expect(source).not.toMatch(/from '@ptah-extension\/onboarding'/);
  });
});
