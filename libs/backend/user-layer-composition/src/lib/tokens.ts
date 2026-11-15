/** Shared symbol preserves bindings installed by the current mirror implementation. */
export const USER_LAYER_MIRROR_SERVICE = Symbol.for('PtahUserLayerMirrorService');
export const USER_LAYER_BOOTSTRAP = Symbol.for('PtahUserLayerBootstrap');
export const USER_LAYER_COMPOSITION_TOKENS = {
  USER_LAYER_MIRROR_SERVICE,
  USER_LAYER_BOOTSTRAP,
} as const;
