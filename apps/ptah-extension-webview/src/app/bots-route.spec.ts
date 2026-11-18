import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlatformLocation } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  withDisabledInitialNavigation,
} from '@angular/router';
import {
  MemoryPlatformLocation,
  SURFACE_ACTIVE,
  SurfaceRouterService,
  VSCodeService,
} from '@ptah-extension/core';
import { appRoutes } from './app.routes';
import { electronOnlySurface } from './electron-only-surface.guard';

@Component({
  selector: 'ptah-bots-route-test',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class BotsRouteTestComponent {}

function botsRoute() {
  const route = appRoutes.find((entry) => entry.path === 'bots');
  if (!route) throw new Error('Missing bots route');
  return route;
}

describe('bots route', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
  });

  it('declares an Electron-only lazy page with its active-surface provider before machines', () => {
    const route = botsRoute();
    expect(route.canMatch).toEqual([electronOnlySurface]);
    expect(route.component).toBeUndefined();
    expect(typeof route.loadComponent).toBe('function');
    expect(route.providers).toEqual([
      expect.objectContaining({
        provide: SURFACE_ACTIVE,
        useFactory: expect.any(Function),
      }),
    ]);
    const paths = appRoutes.map((entry) => entry.path);
    expect(paths.indexOf('bots') + 1).toBe(paths.indexOf('machines'));
    const source = readFileSync(join(__dirname, 'app.routes.ts'), 'utf8');
    expect(source).toContain(
      "import('@ptah-extension/bots-ui').then((m) => m.BotsPageComponent)",
    );
    expect(source).not.toMatch(/from ['"]@ptah-extension\/bots-ui['"]/);
  });

  it.each([
    [true, '/bots', 'bots', 1],
    [false, '/chat', 'chat', 0],
  ] as const)(
    'direct navigation with isElectron=%s lands on %s',
    async (isElectron, expectedUrl, expectedSurface, lazyLoads) => {
      const loadBots = jest.fn(async () => BotsRouteTestComponent);
      // Preserve production route providers, guard and wildcard. Isolate the
      // page under concurrent implementation and the unrelated first-run guard.
      const routes = appRoutes.map((route) => {
        if (route.path === 'bots') return { ...route, loadComponent: loadBots };
        if (route.path === 'chat') return { ...route, canActivate: [] };
        return { ...route };
      });
      TestBed.configureTestingModule({
        providers: [
          { provide: PlatformLocation, useClass: MemoryPlatformLocation },
          { provide: VSCodeService, useValue: { isElectron } },
          provideRouter(routes, withDisabledInitialNavigation()),
        ],
      });
      const router = TestBed.inject(Router);
      const surfaces = TestBed.inject(SurfaceRouterService);
      expect(await router.navigateByUrl('/bots')).toBe(true);
      expect(router.url).toBe(expectedUrl);
      expect(surfaces.currentSurface()).toBe(expectedSurface);
      expect(loadBots).toHaveBeenCalledTimes(lazyLoads);
    },
  );
});
