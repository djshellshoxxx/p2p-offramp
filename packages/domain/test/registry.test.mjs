import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RegistryService } from '../src/registry.ts';
// Synthetic fixtures only: local dev chain ID, repeated-digit addresses and made-up hashes. Nothing here is a
// real or approved network, contract, mint or endpoint.
const SOL_A = '11111111111111111111111111111112', SOL_B = '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM';
const evmNetwork = () => ({ id: 'local-evm', chain: 'evm', chainIdentity: '31337', genesisHash: `0x${'ab'.repeat(32)}`,
  endpoints: [{ id: 'local', url: 'http://127.0.0.1:8545/' }], finality: { kind: 'evm-finalized-tag' },
  assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' },
    { id: 'test-token', kind: 'erc20', address: `0x${'11'.repeat(20)}`, decimals: 6, transferPolicy: 'exact-transfer' }],
  deployments: [{ id: 'escrow-v1', address: `0x${'22'.repeat(20)}`, protocolVersion: 1, artifactSha256: 'a'.repeat(64),
    runtime: { kind: 'evm-code', keccak256: 'b'.repeat(64), upgradeable: false }, supportedAssetIds: ['native', 'test-token'] }],
  environment: 'local' });
const solNetwork = () => ({ id: 'local-sol', chain: 'solana', chainIdentity: SOL_B, genesisHash: SOL_B,
  endpoints: [{ id: 'test', url: 'https://rpc.example.invalid/' }], finality: { kind: 'solana-commitment', commitment: 'finalized' },
  assets: [{ id: 'native', kind: 'native', address: null, decimals: 9, transferPolicy: 'exact-transfer' },
    { id: 'test-mint', kind: 'spl', address: SOL_A, decimals: 6, transferPolicy: 'exact-transfer' }],
  deployments: [{ id: 'escrow-v1', address: SOL_B, protocolVersion: 1, artifactSha256: 'c'.repeat(64),
    runtime: { kind: 'solana-program', programDataSha256: 'd'.repeat(64), upgradeAuthority: null }, supportedAssetIds: ['test-mint'] }],
  environment: 'testnet' });
const registry = (networks = [evmNetwork(), solNetwork()]) => ({ version: 1, releaseId: 'fixture-0001', networks });
const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const load = async (value, service = new RegistryService()) => { const bytes = encode(value); return { service, result: await service.load(bytes, sha(bytes)) }; };
const code = (result, expected) => { assert.equal(result.ok, false, 'expected failure'); assert.equal(result.error.code, expected); assert.doesNotMatch(JSON.stringify(result.error), /127\.0\.0\.1|example|SECRET/); };
const mutate = (edit) => { const value = registry(); edit(value); return value; };

test('G11 loads a strict registry only after the exact-byte SHA-256 matches, then serves frozen lookups', async () => {
  const { service, result } = await load(registry());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(Object.isFrozen(result.value) && Object.isFrozen(result.value.networks[0].deployments[0].supportedAssetIds));
  assert.equal(service.network('local-evm').chainIdentity, '31337');
  assert.equal(service.deployment('local-sol', 'escrow-v1').runtime.kind, 'solana-program');
  assert.equal(service.network('unknown'), null); assert.equal(service.deployment('local-evm', 'unknown'), null);
  assert.equal(new RegistryService().network('local-evm'), null, 'nothing is known before an authenticated load');
});
test('G11 digest is checked before parsing; mismatched, malformed or reused-different digests fail closed', async () => {
  const bytes = encode(registry());
  const service = new RegistryService();
  code(await service.load(bytes, sha(encode(registry([evmNetwork()])))), 'INTEGRITY_FAILURE');
  for (const digest of ['A'.repeat(64), 'a'.repeat(63), '', 42]) code(await service.load(bytes, digest), 'INVALID_INPUT');
  // Invalid JSON with a matching digest is still rejected; garbage with a wrong digest never reaches the parser.
  const garbage = encode('{not json'); code(await service.load(garbage, sha(bytes)), 'INTEGRITY_FAILURE');
  code(await new RegistryService().load(garbage, sha(garbage)), 'INVALID_INPUT');
  assert.equal((await service.load(bytes, sha(bytes))).ok, true);
  assert.equal((await service.load(bytes, sha(bytes))).ok, true, 'same authenticated bytes are idempotent');
  const other = encode(registry([evmNetwork()])); code(await service.load(other, sha(other)), 'CONFLICT');
  assert.equal(service.network('local-sol').id, 'local-sol', 'a refused reload keeps the original entries');
  code(await new RegistryService(async () => { throw Error('SECRET'); }).load(bytes, sha(bytes)), 'UNAVAILABLE');
});
test('G11 rejects encoding, version, size and JSON-shape abuse', async () => {
  code((await load(encode('﻿' + JSON.stringify(registry())).reduce((s, b) => s + String.fromCharCode(b), ''))).result, 'INVALID_INPUT');
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...encode(registry())]); code(await new RegistryService().load(bom, sha(bom)), 'INVALID_INPUT');
  const badUtf8 = new Uint8Array([0x7b, 0xff, 0x7d]); code(await new RegistryService().load(badUtf8, sha(badUtf8)), 'INVALID_INPUT');
  code((await load({ ...registry(), version: 2 })).result, 'UNSUPPORTED_VERSION');
  code((await load('{"version":1,"version":1,"releaseId":"x","networks":[]}')).result, 'INVALID_INPUT');
  code((await load({ ...registry(), extra: true })).result, 'INVALID_INPUT');
  code((await load('{"version":1,"releaseId":"x","networks":[],"__proto__":{}}')).result, 'INVALID_INPUT');
  code((await load(JSON.stringify(registry()).replace('"decimals":18', '"decimals":1.8e1'))).result, 'INVALID_INPUT');
  code((await load(JSON.stringify(registry()).replace('"decimals":18', '"decimals":-18'))).result, 'INVALID_INPUT');
  const deep = '['.repeat(20) + ']'.repeat(20); code((await load(`{"version":1,"releaseId":"x","networks":${deep}}`)).result, 'INVALID_INPUT');
  const big = new Uint8Array(1024 * 1024 + 1).fill(0x20); code(await new RegistryService().load(big, sha(big)), 'LIMIT_EXCEEDED');
  code((await load(registry(Array.from({ length: 33 }, (_, n) => ({ ...evmNetwork(), id: `n${n}`, chainIdentity: String(n + 1) }))))).result, 'LIMIT_EXCEEDED');
});
test('G11 rejects bad IDs, duplicates, wrong family pairs, decimals and missing references', async () => {
  const cases = [
    v => { v.releaseId = '../escape'; }, v => { v.networks[0].id = 'a/b'; }, v => { v.networks[0].id = ''; }, v => { v.networks[0].id = 'x'.repeat(65); },
    v => { v.networks[1].id = 'local-evm'; }, v => { v.networks.push({ ...evmNetwork(), id: 'dup-chain' }); },
    v => { v.networks[0].chain = 'bitcoin'; }, v => { v.networks[0].environment = 'staging'; },
    v => { v.networks[0].assets[1].kind = 'spl'; }, v => { v.networks[1].assets[1].kind = 'erc20'; },
    v => { v.networks[0].assets[0].address = `0x${'11'.repeat(20)}`; }, v => { v.networks[0].assets[1].address = null; },
    v => { v.networks[0].assets[1].address = `0x${'AB'.repeat(20)}`; }, v => { v.networks[0].assets[1].address = `0x${'00'.repeat(20)}`; },
    v => { v.networks[1].assets[1].address = '0OIl' + SOL_A.slice(4); }, v => { v.networks[1].assets[1].address = '1'.repeat(44); },
    v => { v.networks[0].assets[1].decimals = 39; }, v => { v.networks[0].assets.push({ ...v.networks[0].assets[0], id: 'native2' }); },
    v => { v.networks[0].assets[1].id = 'native'; }, v => { v.networks[0].assets[1].transferPolicy = 'fee-on-transfer'; },
    v => { v.networks[0].deployments[0].supportedAssetIds = ['missing']; }, v => { v.networks[0].deployments[0].supportedAssetIds = []; },
    v => { v.networks[0].deployments[0].supportedAssetIds = ['native', 'native']; },
    v => { v.networks[0].deployments.push({ ...v.networks[0].deployments[0], id: 'escrow-v2' }); },
    v => { v.networks[0].deployments[0].runtime = { kind: 'solana-program', programDataSha256: 'd'.repeat(64), upgradeAuthority: null }; },
    v => { v.networks[0].chainIdentity = '0x7a69'; }, v => { v.networks[0].chainIdentity = '031337'; }, v => { v.networks[0].genesisHash = 'ab'.repeat(32); },
    v => { v.networks[1].genesisHash = SOL_A; }, v => { v.networks[0].finality = { kind: 'confirmations', count: 12 }; },
    v => { v.networks[1].finality = { kind: 'solana-commitment', commitment: 'confirmed' }; }, v => { v.networks[0].deployments[0].artifactSha256 = 'A'.repeat(64); },
    v => { v.networks[0].endpoints = []; }, v => { v.networks[0].endpoints.push({ ...v.networks[0].endpoints[0], url: 'http://127.0.0.1:8546/' }); },
  ];
  for (const [index, edit] of cases.entries()) {
    const result = (await load(mutate(edit))).result;
    assert.equal(result.ok, false, `case ${index} must be rejected`); assert.equal(result.error.code, 'INVALID_INPUT', `case ${index}`);
  }
  code((await load(mutate(v => { v.networks[0].deployments[0].protocolVersion = 2; }))).result, 'UNSUPPORTED_VERSION');
});
test('G11 rejects mutable deployments and credential-bearing or non-HTTPS endpoints', async () => {
  for (const edit of [v => { v.networks[0].deployments[0].runtime.upgradeable = true; },
    v => { v.networks[1].deployments[0].runtime.upgradeAuthority = SOL_A; }]) code((await load(mutate(edit))).result, 'INVALID_INPUT');
  for (const [url, environment] of [['https://user:SECRET@rpc.example.invalid/', 'testnet'], ['https://rpc.example.invalid/?apikey=SECRET', 'testnet'],
    ['https://rpc.example.invalid/#SECRET', 'testnet'], ['http://rpc.example.invalid/', 'testnet'], ['http://127.0.0.1:8545/', 'testnet'],
    ['http://127.0.0.1:8545/', 'mainnet'], ['wss://rpc.example.invalid/', 'testnet'], ['https://RPC.example.invalid/', 'testnet'], ['javascript:alert(1)', 'local']]) {
    code((await load(mutate(v => { v.networks[1].endpoints = [{ id: 'e', url }]; v.networks[1].environment = environment; }))).result, 'INVALID_INPUT');
  }
  assert.equal((await load(mutate(v => { v.networks[0].endpoints = [{ id: 'e', url: 'http://localhost:8545/' }]; }))).result.ok, true, 'loopback HTTP only for local');
});
