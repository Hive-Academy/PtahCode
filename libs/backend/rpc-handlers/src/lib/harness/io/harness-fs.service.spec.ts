import 'reflect-metadata';

jest.mock('node:os', () => ({
  ...jest.requireActual<typeof import('node:os')>('node:os'),
  homedir: jest.fn(),
}));

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type { UserLayerMirrorService } from '@ptah-extension/agent-generation';
import { serializeSkillDocument } from '@ptah-extension/shared';
import type { HarnessCreateSkillParams } from '@ptah-extension/shared';
import { HarnessFsService } from './harness-fs.service';

function makeService(workspace: IWorkspaceProvider | null) {
  const mirror: jest.Mocked<Pick<UserLayerMirrorService, 'mirrorAll'>> = {
    mirrorAll: jest.fn().mockResolvedValue(undefined),
  };
  const service = new HarnessFsService(
    null as never,
    null as never,
    mirror as never,
    workspace,
  );
  return { service, mirror };
}

beforeEach(() => {
  const realOs = jest.requireActual<typeof import('node:os')>('node:os');
  jest.mocked(os.homedir).mockReturnValue(realOs.homedir());
});

describe('HarnessFsService mirror root', () => {
  it('delivers the default root to the user-layer mirror', async () => {
    const { service, mirror } = makeService(null);

    await service['mirrorHarnessPlugin']('/plugin');

    expect(mirror.mirrorAll).toHaveBeenCalledWith({
      pluginPaths: [],
      harnessPluginRoots: ['/plugin'],
      synthesizedSkillsRoot: path.join(os.homedir(), '.ptah', 'skills'),
    });
  });

  it('delivers a configured alternate root to the user-layer mirror', async () => {
    const alternateRoot = path.join(os.tmpdir(), 'alternate-ptah-skills');
    const workspace = {
      getConfiguration: <T>(_section: string, key: string): T => {
        expect(key).toBe('skillSynthesis.skillsRoot');
        return alternateRoot as T;
      },
    } as IWorkspaceProvider;
    const { service, mirror } = makeService(workspace);

    await service['mirrorHarnessPlugin']('/plugin');

    expect(mirror.mirrorAll).toHaveBeenCalledWith({
      pluginPaths: [],
      harnessPluginRoots: ['/plugin'],
      synthesizedSkillsRoot: alternateRoot,
    });
  });
});

describe('HarnessFsService skill serialization', () => {
  let temporaryHome: string;

  beforeEach(async () => {
    temporaryHome = await mkdtemp(path.join(os.tmpdir(), 'harness-fs-test-'));
    jest.mocked(os.homedir).mockReturnValue(temporaryHome);
  });

  afterEach(async () => {
    jest.mocked(os.homedir).mockReset();
    await rm(temporaryHome, { recursive: true, force: true });
  });

  async function writeAndRead(params: HarnessCreateSkillParams) {
    const { service } = makeService(null);
    const response = await service.createSkillPlugin(params);
    const disk = await readFile(response.skillPath, 'utf8');
    return { disk, response };
  }

  it('keeps byte-identical legacy output without allowed_tools', async () => {
    const body = '---\nname: existing-caller\n---\n# Verbatim body';
    const { disk, response } = await writeAndRead({
      name: 'Legacy "Skill"',
      description: 'A "quoted" description\nwith a newline',
      content: body,
    });

    expect(response.skillId).toBe('legacy-skill');
    expect(disk).toBe(
      '---\n' +
        'name: "Legacy \\"Skill\\""\n' +
        'description: "A \\"quoted\\" description\\nwith a newline"\n' +
        'source: custom\n' +
        '---\n\n' +
        body +
        '\n',
    );
  });

  it('existing tool-bearing createSkillPlugin caller with delimiter-prefixed body writes body verbatim', async () => {
    const body = '---\nname: existing-caller\n---\n# Verbatim body';
    const { disk } = await writeAndRead({
      name: 'tool-skill',
      description: 'Keeps the existing tool format',
      content: body,
      allowedTools: ['Read', 'bad tool\nsource: injected'],
    });

    expect(disk).toBe(
      '---\n' +
        'name: "tool-skill"\n' +
        'description: "Keeps the existing tool format"\n' +
        'source: custom\n' +
        'allowed_tools:\n' +
        '  - Read\n' +
        '  - badtoolsource:injected\n' +
        '---\n\n' +
        body +
        '\n',
    );
  });

  it('edited Preview content is byte-equal to createSkillPlugin disk output', async () => {
    const params: HarnessCreateSkillParams = {
      name: 'Edited Skill',
      description: 'An edited "description"',
      content: '# Edited body\n\n---\n\nThe delimiter stays in the body.',
    };
    const preview = serializeSkillDocument({
      name: params.name,
      description: params.description,
      body: params.content,
    }).content;

    const { disk, response } = await writeAndRead(params);

    expect(disk).toBe(preview);
    expect(response.skillId).toBe('edited-skill');
  });
});
