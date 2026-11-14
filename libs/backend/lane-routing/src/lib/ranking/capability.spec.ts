import { capabilitiesFromTools } from './capability';

describe('machine capability derivation', () => {
  it('derives browser only from an effective browser tool', () => {
    expect([...capabilitiesFromTools(['ptah_browser_navigate'])]).toEqual(['browser']);
    expect([...capabilitiesFromTools(['execute_code', 'ptah_search_files'])]).toEqual([]);
  });

});
