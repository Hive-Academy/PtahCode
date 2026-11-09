import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdvancedSettingsGroupComponent } from '../../advanced/advanced-settings-group.component';
import { CodexSandboxSettingComponent } from '../../advanced/codex-sandbox-setting.component';
import { CodexAgentBehaviorComponent } from './codex-agent-behavior.component';

@Component({ selector: 'ptah-advanced-settings-group', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div [attr.data-testid]="groupId()"></div>' })
class GroupStub { readonly groupId = input.required<string>(); }

@Component({ selector: 'ptah-codex-sandbox-setting', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div data-testid="sandbox"></div>' })
class SandboxStub {}

describe('CodexAgentBehaviorComponent', () => {
  it('mounts the existing settings group and sandbox in one column', async () => {
    await TestBed.configureTestingModule({ imports: [CodexAgentBehaviorComponent] })
      .overrideComponent(CodexAgentBehaviorComponent, {
        remove: { imports: [AdvancedSettingsGroupComponent, CodexSandboxSettingComponent] },
        add: { imports: [GroupStub, SandboxStub] },
      }).compileComponents();
    const fixture = TestBed.createComponent(CodexAgentBehaviorComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const section = host.querySelector('[data-testid="codex-agent-behavior"]');
    expect(section?.classList.contains('flex-col')).toBe(true);
    expect(section?.querySelector('[data-testid="codex-agents"]')).not.toBeNull();
    expect(section?.querySelector('[data-testid="sandbox"]')).not.toBeNull();
  });
});
