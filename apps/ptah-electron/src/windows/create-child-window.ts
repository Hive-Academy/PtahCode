import { BrowserWindow } from 'electron';
import * as path from 'path';
import type { ChildWindowOptions } from './child-window-registry';
import { installNavigationGuard } from './window-guards';

export function createChildWindow(options: ChildWindowOptions): BrowserWindow {
  const { appDir, placement } = options;
  const window = new BrowserWindow({
    width: placement.width,
    height: placement.height,
    ...(placement.x !== undefined && placement.y !== undefined
      ? { x: placement.x, y: placement.y }
      : {}),
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    title: options.title,
    icon: path.join(appDir, 'assets', 'icons', 'icon.png'),
    show: true,
    webPreferences: {
      preload: path.join(appDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  installNavigationGuard(window);
  return window;
}
