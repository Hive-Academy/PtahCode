import 'reflect-metadata';
import { RouteDecideArgsSchema } from '@ptah-extension/lane-routing';
import { ROUTE_DECIDE_TOOL_NAME, buildRouteDecideTool } from './route-tools';

describe('buildRouteDecideTool', () => {
  it('names ptah_route_decide and is not read-only', () => {
    const tool = buildRouteDecideTool();
    expect(tool.name).toBe(ROUTE_DECIDE_TOOL_NAME);
    expect(tool.name).toBe('ptah_route_decide');
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });

  it('advertises one closed object generated from the zod contract', () => {
    const tool = buildRouteDecideTool();
    const schema = tool.inputSchema;
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).not.toHaveProperty('oneOf');
    expect([...(schema.required ?? [])]).toEqual(['stage', 'request']);

    const stage = schema.properties['stage'];
    expect(stage).toEqual({
      type: 'string',
      enum: ['pre-flight', 'gate-0.1'],
    });

    const keys = Object.keys(schema.properties).sort();
    expect(keys).toEqual(
      [
        'depth',
        'phases',
        'pins',
        'preferenceSource',
        'preferences',
        'request',
        'stage',
        'taskType',
      ].sort(),
    );

    const taskType = schema.properties['taskType'];
    expect(JSON.stringify(taskType)).toContain('gate-0.1');
    const request = schema.properties['request'];
    expect(JSON.stringify(request)).toContain('8000');
    expect(JSON.stringify(request)).not.toContain('Required when stage');
    expect(JSON.stringify(schema)).toContain('visual-review');
    expect(JSON.stringify(schema)).toContain('FEATURE');
  });

  it('keeps a stage note only on fields a stage requires', () => {
    const properties = buildRouteDecideTool().inputSchema.properties;

    expect(JSON.stringify(properties['taskType'])).toContain(
      'Required when stage is gate-0.1.',
    );
    expect(JSON.stringify(properties['depth'])).toContain(
      'Required when stage is gate-0.1.',
    );
    expect(JSON.stringify(properties['phases'])).toContain(
      'Required when stage is gate-0.1.',
    );

    expect(JSON.stringify(properties['pins'])).not.toContain(
      'Required when stage',
    );
    expect(JSON.stringify(properties['pins'])).not.toContain(
      'Required when stage is .',
    );
    expect(JSON.stringify(properties['preferenceSource'])).not.toContain(
      'Required when stage',
    );
    expect(JSON.stringify(properties['preferences'])).not.toContain(
      'Required when stage',
    );
    expect(JSON.stringify(properties['request'])).not.toContain(
      'Required when stage',
    );
  });

  it('keeps an empty-owner description without a required note', () => {
    const properties = buildRouteDecideTool().inputSchema.properties;

    const pins = properties['pins'] as { description?: string };
    expect(pins.description).toBe(
      'Executors fixed to a phase. Applies to stage gate-0.1.',
    );

    const preferenceSource = properties['preferenceSource'] as {
      description?: string;
    };
    expect(preferenceSource.description).toBe(
      'Free text, max 200 characters, no semicolon or line break. Applies to stage gate-0.1.',
    );

    const preferences = properties['preferences'] as { description?: string };
    expect(preferences.description).toBe(
      'Candidate preferences. Applies to stage gate-0.1.',
    );
  });

  it('describes candidate preference entries', () => {
    const preferences = buildRouteDecideTool().inputSchema.properties[
      'preferences'
    ] as {
      properties?: Record<string, { items?: { description?: string } }>;
    };
    const prefer = preferences.properties?.['prefer'];
    expect(prefer?.items?.description).toBe(
      'Candidate ids (cli id, ptahCliId, subagent:<role>, child-session) or display names; earlier entries rank higher.',
    );
  });

  it('accepts the same stage values the zod schema accepts', () => {
    expect(
      RouteDecideArgsSchema.safeParse({
        stage: 'pre-flight',
        request: 'ship the parser',
      }).success,
    ).toBe(true);
    const tool = buildRouteDecideTool();
    const stage = tool.inputSchema.properties['stage'];
    expect(stage).toMatchObject({ enum: ['pre-flight', 'gate-0.1'] });
  });

  it('advertises optional phase shape and weight while accepting legacy phases', () => {
    const phases = buildRouteDecideTool().inputSchema.properties['phases'];
    expect(phases).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          shape: {
            type: 'string',
            enum: ['mechanical', 'logic', 'contract', 'test', 'docs', 'review'],
          },
          weight: { type: 'integer', minimum: 0, maximum: 200000 },
        },
        required: ['id', 'kind'],
      },
    });
  });

  it('advertises both orchestration phase kinds', () => {
    const phases = buildRouteDecideTool().inputSchema.properties['phases'];
    expect(JSON.stringify(phases)).toContain('batch');
    expect(JSON.stringify(phases)).toContain('completion');
  });

  it('describes phase inputs and roster outputs', () => {
    const description = buildRouteDecideTool().description;
    for (const term of ['shape', 'weight', 'tier', 'effort']) {
      expect(description).toContain(term);
    }
    expect(description).toContain('"tier" is the model alias to pass');
    expect(description).toContain('for other CLI rows, pass "model" unless "lane-default"');
    expect(description).toContain('For ptah-cli and "claude" rows, pass "tier" as "modelTier"');
    expect(description).toContain('read and write sets, plus 10% framing');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildRouteDecideTool())).toBe(
      JSON.stringify(buildRouteDecideTool()),
    );
  });
});
