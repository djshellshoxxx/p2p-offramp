/** Offline G14 bundled-extension discipline. Not loaded by the app; no G16 capability mapping or spend authority. */
export { createExtensionRegistry, parseExtensionManifest, EXTENSION_LIMITS } from './src/registry.ts';
export type { ExtensionContext, ExtensionInstance, ExtensionRegistration, ExtensionRegistry, ExtensionRegistryOptions, ValidatedExtensionProposal, ExtensionManifestV1, NegotiatedCapabilitySet } from './src/registry.ts';
