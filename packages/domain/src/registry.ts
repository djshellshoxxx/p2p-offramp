/**
 * G11 RegistryService (load/lookup only). The expected SHA-256 MUST come from the separately trusted G15
 * signed manifest; that trust root is an unresolved owner decision, so nothing here chooses a signer or
 * trusts the registry bytes on their own. Live RPC/deployment validation (validateLive) is not implemented:
 * network access stays disabled (connectOrigins: []).
 */
import { parseRegistryBytes, ValidationError, type CoreResult, type DeploymentV1, type NetworkV1, type RegistryV1 } from '../../schemas/index.ts';
import { createCoreError, createOperationId } from './errors.ts';

type Digest = (bytes: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>;
const failure = (code: Parameters<typeof createCoreError>[0]): CoreResult<never> =>
  Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) });

export class RegistryService {
  #registry: RegistryV1 | undefined;
  #digest: string | undefined;
  readonly #sha256: Digest;
  constructor(sha256: Digest = bytes => globalThis.crypto.subtle.digest('SHA-256', bytes)) { this.#sha256 = sha256; }

  /**
   * Hashes the exact delivered bytes before parsing anything. A different registry needs the G15 update flow,
   * so once loaded a service refuses a different digest (CONFLICT) instead of silently replacing entries.
   * Deviation: G11 sketches a synchronous load; native Web Crypto SHA-256 is asynchronous.
   */
  async load(bytes: Uint8Array, expectedSha256: string): Promise<CoreResult<RegistryV1>> {
    if (typeof expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedSha256) || !(bytes instanceof Uint8Array)) return failure('INVALID_INPUT');
    if (bytes.byteLength > 1024 * 1024) return failure('LIMIT_EXCEEDED');
    const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
    let actual: string;
    try { actual = Array.from(new Uint8Array(await this.#sha256(copy)), byte => byte.toString(16).padStart(2, '0')).join(''); }
    catch { return failure('UNAVAILABLE'); }
    if (actual !== expectedSha256) return failure('INTEGRITY_FAILURE');
    if (this.#registry) return this.#digest === actual ? Object.freeze({ ok: true, value: this.#registry }) : failure('CONFLICT');
    let registry: RegistryV1;
    try { registry = parseRegistryBytes(copy); }
    catch (error) {
      const code = error instanceof ValidationError ? error.code : 'INVALID_INPUT';
      return failure(code === 'UNSUPPORTED_VERSION' || code === 'LIMIT_EXCEEDED' ? code : 'INVALID_INPUT');
    }
    this.#registry = registry; this.#digest = actual;
    return Object.freeze({ ok: true, value: registry });
  }
  network(id: string): NetworkV1 | null { return this.#registry?.networks.find(value => value.id === id) ?? null; }
  deployment(networkId: string, deploymentId: string): DeploymentV1 | null {
    return this.network(networkId)?.deployments.find(value => value.id === deploymentId) ?? null;
  }
}
