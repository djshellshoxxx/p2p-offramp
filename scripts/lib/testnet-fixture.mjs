/**
 * TEST ONLY: writes a complete, ephemeral-key Sepolia testnet trust root into a temporary directory (owner public key,
 * G11 registry with a fixture deployment, signed G15 manifest and envelope), plus a builder for G16 terms-review
 * documents that match it. The private key never leaves this process. Never used by any build or release.
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keygen, REGISTRY_ASSET, signRelease } from '../sepolia/owner-release.mjs';
import { TRUSTED_KEY_PATH } from '../sepolia/verify-release.mjs';
import { encodeCapabilities, encodePrivateAgreement, sha256Hex, TERMS_REVIEW_FORMAT } from '../../packages/domain/index.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FIXTURE_ESCROW = `0x${'5e'.repeat(20)}`;
export const FIXTURE_SELLER = '0xacf7b7c8271e99b3be70c3f476c7c20963e06b8e';
export const FIXTURE_BUYER = '0x3b0d3efcce062566bd2a28c2f2bba7e1d1504ee5';

export function fixtureRegistry({ environment = 'testnet' } = {}) {
  return { version: 1, releaseId: 'sepolia-testnet-fixture',
    networks: [{ id: 'sepolia', chain: 'evm', chainIdentity: '11155111', genesisHash: '0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',
      endpoints: [{ id: 'sepolia-public', url: 'https://ethereum-sepolia-rpc.publicnode.com/' }], finality: { kind: 'evm-finalized-tag' },
      assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
      deployments: [{ id: 'escrow-sepolia-v1', address: FIXTURE_ESCROW, protocolVersion: 1, artifactSha256: 'd'.repeat(64),
        runtime: { kind: 'evm-code', keccak256: 'e'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] }],
      environment }] };
}

/** Writes the trust root under `root`; `now` (unix seconds) anchors the manifest window [now - 60, now + days]. */
export async function writeTestnetTrust(root, { now = Math.floor(Date.now() / 1000), days = 30, registry = fixtureRegistry() } = {}) {
  for (const file of ['contracts/evm/foundry.toml', 'package-lock.json', 'THIRD_PARTY_NOTICES.md']) { await mkdir(resolve(root, file, '..'), { recursive: true }); await copyFile(resolve(ROOT, file), resolve(root, file)); }
  await mkdir(resolve(root, REGISTRY_ASSET, '..'), { recursive: true });
  await writeFile(resolve(root, REGISTRY_ASSET), JSON.stringify(registry, null, 2) + '\n');
  const owner = keygen();
  await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  const signed = await signRelease({ privateJwk: owner.privateJwk, sequence: 1, days, now: now - 60, root, sourceCommit: 'c'.repeat(40) });
  await writeFile(resolve(root, 'registry/testnet/sepolia.release.json'), signed.manifestBytes);
  await writeFile(resolve(root, 'registry/testnet/sepolia.release.sig.json'), JSON.stringify(signed.envelope));
  return { keyId: owner.keyId, expiresAt: now - 60 + days * 86_400 };
}

/** A G16 terms-review document for the fixture deployment; deadlines relative to `nowSeconds`. */
export async function fixtureTermsDocument(nowSeconds, { deploymentId = 'escrow-sepolia-v1' } = {}) {
  const orderId = 'a7'.repeat(32);
  const privateAgreement = { v: 1, orderId, revision: '1', fiatCurrency: 'EUR', fiatMinorUnits: '100', fiatScale: 2,
    paymentInstructions: 'SEPOLIA TESTNET FIXTURE. No fiat payment is made.', capabilities: [], agreementSalt: '4b'.repeat(32) };
  const terms = { orderId, revision: '1', networkId: 'sepolia', deploymentId, seller: FIXTURE_SELLER, buyer: FIXTURE_BUYER,
    assetKind: 'native', asset: `0x${'0'.repeat(40)}`, amountBaseUnits: '100000000000000',
    privateAgreementHash: await sha256Hex(encodePrivateAgreement(privateAgreement)), capabilitiesHash: await sha256Hex(encodeCapabilities([])),
    sellerNonce: '9d'.repeat(32), acceptBeforeSeconds: String(nowSeconds + 900), escrowExpirySeconds: String(nowSeconds + 7200) };
  return { format: TERMS_REVIEW_FORMAT, terms, privateAgreement };
}
