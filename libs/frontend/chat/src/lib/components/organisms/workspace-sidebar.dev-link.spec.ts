import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ElectronLayoutService, VSCodeService } from '@ptah-extension/core';
import { SessionLivenessRegistry } from '@ptah-extension/chat-state';
import { WorkspaceSidebarComponent } from './workspace-sidebar.component';
import { McpServersCardComponent } from '../molecules/mcp-servers-card.component';

@Component({ selector: 'ptah-mcp-servers-card', template: '' })
class McpCardStub {}

function render(isDevInstance: boolean | undefined) {
  const navigateByUrl = jest.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    imports: [WorkspaceSidebarComponent],
    providers: [
      {
        provide: VSCodeService,
        useValue: { config: signal({ isDevInstance }) },
      },
      { provide: Router, useValue: { navigateByUrl } },
      {
        provide: ElectronLayoutService,
        useValue: {
          workspaceFolders: signal([]),
          activeWorkspaceIndex: signal(0),
          addFolder: jest.fn(),
        },
      },
      {
        provide: SessionLivenessRegistry,
        useValue: { liveWorkspaces: signal(new Set()) },
      },
    ],
  });
  TestBed.overrideComponent(WorkspaceSidebarComponent, {
    remove: { imports: [McpServersCardComponent] },
    add: { imports: [McpCardStub] },
  });
  const fixture = TestBed.createComponent(WorkspaceSidebarComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    link: el.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-sidebar-ui-gallery-link"]',
    ),
    navigateByUrl,
  };
}

describe('WorkspaceSidebarComponent dev-only UI gallery link', () => {
  it('renders in the dev instance and navigates to /ui-gallery', () => {
    const { link, navigateByUrl } = render(true);
    expect(link?.textContent?.trim()).toBe('UI gallery');
    // Raw on purpose: the owner stylesheet would override `justify-start` (left-aligned label).
    expect(link?.hasAttribute('ptahbutton')).toBe(false);
    expect(link?.hasAttribute('data-ptah-button')).toBe(false);
    expect(link?.classList.contains('btn')).toBe(true);
    expect(link?.classList.contains('btn-ghost')).toBe(true);
    expect(link?.classList.contains('justify-start')).toBe(true);
    link?.click();
    expect(navigateByUrl).toHaveBeenCalledWith('/ui-gallery');
  });

  it.each([false, undefined])('is absent when isDevInstance is %s', (flag) => {
    expect(render(flag).link).toBeNull();
  });
});
