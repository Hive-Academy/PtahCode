import { userLayerPassFailures } from './contracts';
import { USER_LAYER_COMPOSITION_TOKENS } from './tokens';

describe('user-layer composition contracts', () => {
  it('retains the mirror token identity during migration', () => {
    expect(USER_LAYER_COMPOSITION_TOKENS.USER_LAYER_MIRROR_SERVICE).toBe(
      Symbol.for('PtahUserLayerMirrorService'),
    );
  });

  it('counts both pass and retirement failures', () => {
    expect(userLayerPassFailures({ errors: 2, retiredSkills: { errors: 1 } })).toBe(3);
  });
});
