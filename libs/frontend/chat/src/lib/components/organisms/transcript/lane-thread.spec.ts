import { AgentId, createExecutionChatMessage, type AgentDeliveryReceipt } from '@ptah-extension/shared';
import { laneThreadEntries } from './lane-thread';

describe('laneThreadEntries', () => {
  it('adds preview receipts and failed completion in chronological order', () => {
    const receipt: AgentDeliveryReceipt = { id: 'r', agentId: 'lane', sender: 'parent', preview: 'Check the files',
      state: 'accepted', mode: 'queue-next-turn', delivery: 'queue', createdAt: 10, updatedAt: 10 };
    const entries = laneThreadEntries([], [receipt], 'Claude', 'Docs', 'Codex',
      [{ agentId: 'lane', kind: 'completion', state: 'pending' }], { status: 'failed', timestamp: 20 });
    expect(entries.map(entry => entry.body || entry.verdict)).toEqual(['Check the files', 'Failed']);
    expect(entries[0].sender).toBe('Parent agent · Claude');
    expect(entries[1]).toMatchObject({ verdict: 'Failed', parentDelivery: { kind: 'completion', state: 'pending' } });
  });
  it('orders text messages and only attributes a receipt on exact id', () => {
    const messages = [
      createExecutionChatMessage({ id: 'lane:user:a', role: 'user', timestamp: 200, rawContent: 'Second' }),
      createExecutionChatMessage({ id: 'lane:user:b', role: 'user', timestamp: 100, rawContent: 'First' }),
    ];
    const receipt: AgentDeliveryReceipt = {
      id: 'a', agentId: 'lane', sender: 'user', state: 'accepted', mode: 'queue-next-turn',
      delivery: 'queue', createdAt: 200, updatedAt: 200,
    };
    const entries = laneThreadEntries(messages, [receipt], 'Claude', 'Docs', 'Codex');
    expect(entries.map(entry => entry.body)).toEqual(['First', 'Second']);
    expect(entries.map(entry => entry.sender)).toEqual(['Parent agent · Claude', 'You']);
    expect(entries[1].receipt).toBe(receipt);
  });
  it('labels an unmatched user-role spawn prompt as parent agent', () => {
    const messages = [createExecutionChatMessage({ id: 'spawn', role: 'user', timestamp: 1, rawContent: 'Investigate the lane' })];
    expect(laneThreadEntries(messages, [], 'Claude', 'Codex', 'CLI')[0].sender).toBe('Parent agent · Claude');
  });
  it('joins a receipt by preview when stream ids differ and does not add a duplicate row', () => {
    const messages = [createExecutionChatMessage({ id: 'stream-42', role: 'user', timestamp: 20, rawContent: 'Please inspect   the files' })];
    const receipt: AgentDeliveryReceipt = { id: 'receipt-9', agentId: 'lane', sender: 'user', preview: 'Please inspect the files',
      state: 'accepted', mode: 'queue-next-turn', delivery: 'queue', createdAt: 19, updatedAt: 19 };
    const entries = laneThreadEntries(messages, [receipt], '', 'Codex', 'CLI');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sender: 'You', receipt });
  });
  it('leaves assistant messages to the rich transcript instead of duplicating them in the thread', () => {
    const messages = [createExecutionChatMessage({ id: 'assistant-1', role: 'assistant', timestamp: 21, rawContent: 'Working on it' })];
    expect(laneThreadEntries(messages, [], '', 'Codex', 'CLI')).toEqual([]);
  });
  it.each([
    ['delivered', 'Deliverables written'],
    ['no-deliverable', 'No deliverable'],
    ['failed', 'Failed'],
    ['unverified', 'Unverified'],
  ] as const)('uses pushed %s verdict', (verdict, label) => {
    const entries = laneThreadEntries([], [], 'Claude', 'Docs', 'Codex',
      [{ agentId: 'lane', kind: 'completion', state: 'pending', verdict }],
      { status: 'completed', timestamp: 20 });
    expect(entries[0].verdict).toBe(label);
  });
  it('does not infer deliverables from a completed status', () => {
    const entries = laneThreadEntries([], [], 'Claude', 'Docs', 'Codex', [],
      { status: 'completed', timestamp: 20 });
    expect(entries[0].verdict).toBe('Unverified');
    expect(entries[0].body).toBe('');
  });

  it('shows no parent delivery when no parent-delivery push exists', () => {
    const entries = laneThreadEntries([], [], 'Claude', 'Docs', 'Codex', [],
      { status: 'completed', timestamp: 20 });
    expect(entries[0].parentDelivery).toBeUndefined();
  });

  describe('lane-to-lane sender', () => {
    const sender = AgentId.from('22222222-2222-4222-8222-222222222222');
    const fromLane: AgentDeliveryReceipt = { id: 'peer-1', agentId: 'lane', sender: 'lane', senderAgentId: sender,
      preview: 'Schema is ready', state: 'settled', mode: 'queue-next-turn', delivery: 'queue', createdAt: 5, updatedAt: 6 };

    it('labels the entry with the sender lane name from the resolver', () => {
      const entries = laneThreadEntries([], [fromLane], 'Claude', 'Docs', 'Codex', [], undefined,
        id => (id === sender ? 'Schema lane' : undefined));
      expect(entries[0]).toMatchObject({ sender: 'From lane Schema lane', senderKind: 'peer-lane', senderAgentId: sender });
    });

    it('falls back to the agent id when no name is known', () => {
      const entries = laneThreadEntries([], [fromLane], 'Claude', 'Docs', 'Codex');
      expect(entries[0]).toMatchObject({ sender: `From lane ${sender}`, senderKind: 'peer-lane' });
    });

    it('attributes a matched transcript message to the sender lane', () => {
      const messages = [createExecutionChatMessage({ id: 'lane:user:peer-1', role: 'user', timestamp: 7, rawContent: 'Schema is ready' })];
      const entries = laneThreadEntries(messages, [fromLane], 'Claude', 'Docs', 'Codex', [], undefined, () => 'Schema');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ sender: 'From lane Schema', senderKind: 'peer-lane', receipt: fromLane });
    });

    describe('equal previews from two peers', () => {
      const other = AgentId.from('33333333-3333-4333-8333-333333333333');
      const names = (id: string) => (id === sender ? 'Schema' : id === other ? 'Docs' : undefined);
      const fromOther: AgentDeliveryReceipt = { ...fromLane, id: 'peer-2', senderAgentId: other, createdAt: 8, updatedAt: 9 };
      const messages = [
        createExecutionChatMessage({ id: 'stream-2', role: 'user', timestamp: 10, rawContent: 'Schema is ready' }),
        createExecutionChatMessage({ id: 'stream-1', role: 'user', timestamp: 7, rawContent: 'Schema is ready' }),
      ];

      it('gives each message its own peer in time order, whatever the receipt order', () => {
        const entries = laneThreadEntries(messages, [fromOther, fromLane], 'Claude', 'Docs', 'Codex', [], undefined, names);
        expect(entries).toHaveLength(2);
        expect(entries.map(entry => [entry.id, entry.sender, entry.senderAgentId])).toEqual([
          ['stream-1', 'From lane Schema', sender],
          ['stream-2', 'From lane Docs', other],
        ]);
      });

      it('prefers an id match and leaves the remaining receipt to the other message', () => {
        const byId = [messages[0], { ...messages[1], id: 'lane:user:peer-2' }];
        const entries = laneThreadEntries(byId, [fromLane, fromOther], 'Claude', 'Docs', 'Codex', [], undefined, names);
        expect(entries.map(entry => [entry.id, entry.senderAgentId])).toEqual([
          ['lane:user:peer-2', other],
          ['stream-2', sender],
        ]);
      });

      it('names no peer when two candidates cannot be told apart', () => {
        const tied = { ...fromOther, createdAt: fromLane.createdAt };
        const entries = laneThreadEntries([messages[1]], [fromLane, tied], 'Claude', 'Docs', 'Codex', [], undefined, names);
        const message = entries.find(entry => entry.id === 'stream-1');
        expect(message).toMatchObject({ sender: 'From another lane', senderKind: 'peer-lane' });
        expect(message?.senderAgentId).toBeUndefined();
        expect(entries.filter(entry => entry.id.startsWith('receipt:'))).toHaveLength(1);
      });

      it.each([
        ['A then B', true],
        ['B then A', false],
      ])('names no peer for either of two messages drawn from a tied group (%s)', (_order, aFirst) => {
        const tied = { ...fromOther, createdAt: fromLane.createdAt };
        const receipts = aFirst ? [fromLane, tied] : [tied, fromLane];
        const entries = laneThreadEntries(messages, receipts, 'Claude', 'Docs', 'Codex', [], undefined, names);
        expect(entries).toHaveLength(2);
        for (const entry of entries) {
          expect(entry).toMatchObject({ sender: 'From another lane', senderKind: 'peer-lane' });
          expect(entry.senderAgentId).toBeUndefined();
        }
      });

      it('keeps an id match authoritative and names the peer of the receipt left over', () => {
        const tied = { ...fromOther, createdAt: fromLane.createdAt };
        const byId = [messages[0], { ...messages[1], id: 'lane:user:peer-2' }];
        const entries = laneThreadEntries(byId, [fromLane, tied], 'Claude', 'Docs', 'Codex', [], undefined, names);
        expect(entries.map(entry => [entry.id, entry.sender])).toEqual([
          ['lane:user:peer-2', 'From lane Docs'],
          ['stream-2', 'From lane Schema'],
        ]);
      });
    });

    it('keeps user, parent and own-lane entries on their own kinds', () => {
      const entries = laneThreadEntries([], [{ ...fromLane, id: 'u', sender: 'user' }, { ...fromLane, id: 'p', sender: 'parent' }],
        'Claude', 'Docs', 'Codex', [], { status: 'completed', timestamp: 20 });
      expect(entries.map(entry => entry.senderKind)).toEqual(['user', 'parent', 'this-lane']);
    });
  });

  it('names the CLI once when the lane label equals the CLI', () => {
    const entries = laneThreadEntries([], [], 'Claude', 'opencode', 'opencode', [],
      { status: 'completed', timestamp: 20 });
    expect(entries[0].sender).toBe('opencode');
  });

  it('emits an ack thread entry only for read, acted, or rejected receipts that have ackAt', () => {
    const base: AgentDeliveryReceipt = {
      id: 'r1',
      agentId: AgentId.from('11111111-1111-4111-8111-111111111111'),
      sender: 'user',
      state: 'settled',
      mode: 'queue-next-turn',
      delivery: 'queue',
      createdAt: 10,
      updatedAt: 50,
    };
    expect(laneThreadEntries([], [{ ...base, ackState: 'pending', ackAt: 30 }], 'Claude', 'Docs', 'Codex')).toEqual([]);
    expect(laneThreadEntries([], [{ ...base, ackState: 'unavailable', ackAt: 30 }], 'Claude', 'Docs', 'Codex')).toEqual([]);
    expect(laneThreadEntries([], [{ ...base, ackState: 'read' }], 'Claude', 'Docs', 'Codex')).toEqual([]);

    const acted = laneThreadEntries([], [{ ...base, ackState: 'acted', ackAt: 42 }], 'Claude', 'Docs', 'Codex');
    expect(acted).toEqual([
      {
        id: 'ack:r1',
        sender: 'Docs · Codex',
        senderKind: 'this-lane',
        kind: 'ack',
        timestamp: 42,
        body: 'Lane reports acted',
        ackState: 'acted',
      },
    ]);
  });
});
