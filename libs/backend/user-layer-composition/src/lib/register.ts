import { type DependencyContainer } from 'tsyringe';
import { USER_LAYER_COMPOSITION_TOKENS } from './tokens';
import { UserLayerMirrorService } from './user-layer/user-layer-mirror.service';

export function registerUserLayerCompositionServices(container: DependencyContainer): void {
  container.registerSingleton(UserLayerMirrorService);
  container.register(USER_LAYER_COMPOSITION_TOKENS.USER_LAYER_MIRROR_SERVICE, {
    useToken: UserLayerMirrorService,
  });
}
