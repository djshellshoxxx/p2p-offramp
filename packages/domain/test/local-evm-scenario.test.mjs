import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../src/registry.ts';
import { encodePrivateAgreement, encodeCapabilities, checkFundingWindow } from '../src/trade-terms.ts';
// SYNTHETIC, TEST-ONLY local scenario (see fixtures/local-evm-scenario/README.md). Not a trust root, not an independent golden vector.
const dir = new URL('./fixtures/local-evm-scenario/', import.meta.url);
const registryBytes = new Uint8Array(await readFile(new URL('registry.json', dir)));
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rejects = (work, code) => assert.throws(work, error => error.code === code);

test('local scenario registry loads only with the recorded SHA-256 and serves the synthetic local entries', async () => {
  assert.equal(scenario.registrySha256, '14e7ecfb5aff74253affe0d2e8560728763f01db405bcc7efdca964ef103ca6a');
  assert.equal(sha(registryBytes), scenario.registrySha256);
  const service = new RegistryService();
  const result = await service.load(registryBytes, scenario.registrySha256);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.releaseId, 'test-local-only');
  const network = service.network('local-evm');
  assert.equal(network.environment, 'local'); assert.equal(network.chainIdentity, scenario.domain.chainId);
  assert.deepEqual(network.assets.map(asset => asset.decimals), [18, 6]);
  const deployment = service.deployment('local-evm', 'escrow-local-v1');
  assert.equal(deployment.address, scenario.domain.verifyingContract); assert.equal(deployment.runtime.upgradeable, false);
});
test('local scenario registry: a tampered byte or wrong digest is INTEGRITY_FAILURE', async () => {
  const tampered = Uint8Array.from(registryBytes); tampered[tampered.indexOf(0x31)] ^= 1;
  const result = await new RegistryService().load(tampered, scenario.registrySha256);
  assert.equal(result.ok, false); assert.equal(result.error.code, 'INTEGRITY_FAILURE');
  const wrong = await new RegistryService().load(registryBytes, 'f'.repeat(64));
  assert.equal(wrong.ok, false); assert.equal(wrong.error.code, 'INTEGRITY_FAILURE');
});
test('local scenario terms encodings match the recorded SHA-256 values', () => {
  assert.equal(Object.keys(scenario.sets).length, 2);
  for (const [name, set] of Object.entries(scenario.sets)) {
    const agreement = sha(encodePrivateAgreement(set.privateAgreementInput)), capabilities = sha(encodeCapabilities(set.privateAgreementInput.capabilities));
    assert.equal(agreement, set.privateAgreementSha256, name); assert.equal(capabilities, set.capabilitiesSha256, name);
    assert.equal(set.terms.privateAgreementHash, agreement, name); assert.equal(set.terms.capabilitiesHash, capabilities, name);
  }
  assert.equal(scenario.sets.native.privateAgreementSha256, '972459f32afc027880b2e4910469dbce213ed14e19e7273412fb8bed0fa83605');
  assert.equal(scenario.sets.erc20.privateAgreementSha256, '346b2013fd019f7d9b9e2f789e458940e5c990d9fc540c7d871a6023acc9fbab');
  assert.equal(scenario.sets.native.capabilitiesSha256, '6a53056d4685133d77cb26b16b7c5c281581a414b586337e0314a5296280e2e4');
  const tampered = { ...scenario.sets.native.privateAgreementInput, fiatMinorUnits: '5001' };
  assert.notEqual(sha(encodePrivateAgreement(tampered)), scenario.sets.native.privateAgreementSha256);
});
test('local scenario funding window: ok, expired and window-too-long cases', () => {
  const { acceptBeforeSeconds: accept, escrowExpirySeconds: expiry } = scenario.sets.native.terms, window = scenario.fundingWindow;
  assert.doesNotThrow(() => checkFundingWindow(accept, expiry, window.okChainTimeSeconds));
  rejects(() => checkFundingWindow(accept, expiry, window.expiredChainTimeSeconds), 'EXPIRED');
  rejects(() => checkFundingWindow(accept, expiry, window.tooEarlyChainTimeSeconds), 'INVALID_INPUT');
});
