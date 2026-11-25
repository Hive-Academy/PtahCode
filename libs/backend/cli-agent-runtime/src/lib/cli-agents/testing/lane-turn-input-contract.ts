import type { CliAdapterManifest } from '@ptah-extension/shared';
import type { SdkHandle } from '../cli-adapters/cli-adapter.interface';

/**
 * Req 4.3 contract: every `turnInput` item a manifest claims as supported has
 * the handle operation that carries it. Pure and framework-free, so adapter
 * specs assert `expect(laneTurnInputContractViolations(handle, manifest)).toEqual([])`
 * and the lib build (no jest types) still compiles this file.
 */
export function laneTurnInputContractViolations(
  handle: SdkHandle,
  manifest: CliAdapterManifest,
): string[] {
  const input = manifest.turnInput;
  if (!input) return [];
  const violations: string[] = [];
  const has = (operation: keyof SdkHandle) => typeof handle[operation] === 'function';
  const needs = (claimed: boolean, operation: keyof SdkHandle, item: string) => {
    if (claimed && !has(operation)) violations.push(`${item} is supported but the handle has no ${String(operation)}()`);
  };
  needs(input.model.state === 'supported', 'applyTurnSettings', 'turnInput.model');
  needs(input.effort.state === 'supported', 'applyTurnSettings', 'turnInput.effort');
  const images = input.images.state === 'supported';
  needs(images, 'continue', 'turnInput.images');
  needs(images, 'turnInputSupport', 'turnInput.images');
  needs(images && input.images.onSteer === true, 'steer', 'turnInput.images.onSteer');
  needs(input.files.state === 'supported' && input.files.delivery === 'reference', 'continue', 'turnInput.files');
  needs(input.commands.state === 'supported', 'listTurnOptions', 'turnInput.commands');
  needs(input.skills.state === 'supported', 'listTurnOptions', 'turnInput.skills');
  return violations;
}

/** Throws one error naming every violation; a no-op for a manifest that keeps its claims. */
export function assertLaneTurnInputContract(
  name: string,
  handle: SdkHandle,
  manifest: CliAdapterManifest,
): void {
  const violations = laneTurnInputContractViolations(handle, manifest);
  if (violations.length > 0) throw new Error(`${name} turn input contract: ${violations.join('; ')}`);
}
