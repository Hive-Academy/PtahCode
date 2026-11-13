import { capabilitiesFromTools, requiredCapabilities } from './capability';

describe('machine capability derivation', () => {
  it('derives browser only from an effective browser tool', () => {
    expect([...capabilitiesFromTools(['ptah_browser_navigate'])]).toEqual(['browser']);
    expect([...capabilitiesFromTools(['execute_code', 'ptah_search_files'])]).toEqual([]);
  });

  it('uses phase defaults only when the machine list is absent', () => {
    expect(requiredCapabilities('visual-review')).toEqual(['browser']);
    expect(requiredCapabilities('design', [])).toEqual([]);
    expect(requiredCapabilities('implement')).toEqual([]);
  });
});
