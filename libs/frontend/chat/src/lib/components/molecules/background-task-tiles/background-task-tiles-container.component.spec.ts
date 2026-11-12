import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import { BackgroundTaskStore } from '@ptah-extension/chat-streaming';
import { ClockService } from '@ptah-extension/core';
import { BackgroundTaskTilesContainerComponent } from './background-task-tiles-container.component';

describe('BackgroundTaskTilesContainerComponent', () => {
  it('uses the shared clock only while tiles are present', () => {
    const now = signal(66_000);
    const tasks = signal<
      readonly {
        taskId: string;
        taskType: string;
        description: string;
        status: 'running';
      }[]
    >([]);
    let holders = 0;
    TestBed.configureTestingModule({
      imports: [BackgroundTaskTilesContainerComponent],
      providers: [
        {
          provide: ClockService,
          useValue: {
            now,
            acquire: () => {
              holders++;
              return () => { holders--; };
            },
          },
        },
        {
          provide: TabManagerService,
          useValue: {
            findTabByIdAcrossWorkspaces: () => ({
              tab: { claudeSessionId: 'session' },
            }),
          },
        },
        {
          provide: BackgroundTaskStore,
          useValue: {
            tasksForSession: () => tasks(),
            firstSeenAt: () => 1_000,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(BackgroundTaskTilesContainerComponent);
    fixture.componentRef.setInput('tabId', 'tab');
    fixture.detectChanges();
    expect(holders).toBe(0);

    tasks.set([
      {
        taskId: 'bash',
        taskType: 'local_bash',
        description: 'Compile',
        status: 'running',
      },
    ]);
    fixture.detectChanges();
    expect(holders).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('1m 5s');

    now.set(67_000);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1m 6s');
    tasks.set([]);
    fixture.detectChanges();
    expect(holders).toBe(0);
  });
});
