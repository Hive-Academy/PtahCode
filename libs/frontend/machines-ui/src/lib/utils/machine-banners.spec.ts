import type { RemoteMachine } from '../services/machines-store';
import { machineBanners } from './machine-banners';

const ANUBIS: RemoteMachine = {
  machineId: 'm2',
  alias: 'anubis',
  displayName: 'Anubis',
  state: 'reconnecting',
  lastSeenAt: 1_000_000,
  nextRetryAt: 1_017_000,
};

describe('machineBanners', () => {
  it('a machine going offline never says its sessions failed', () => {
    const [banner] = machineBanners({ ...ANUBIS, state: 'offline' }, 1_012_000);
    expect(banner.label).toBe('Offline');
    expect(banner.text).toContain('they are shown as unknown, not failed');
  });

  it('sanitises the machine name', () => {
    const [banner] = machineBanners(
      { ...ANUBIS, displayName: 'An\u202Eubis' },
      1_012_000,
    );
    expect(banner.text).toContain('Sessions on Anubis keep running');
  });

  it('omits "Next attempt" once the retry time has passed', () => {
    const [banner] = machineBanners(ANUBIS, 1_020_000);
    expect(banner.text).not.toContain('Next attempt');
  });
});
