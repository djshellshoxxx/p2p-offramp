import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSolanaTrade, isBoundSolanaTrade } from '../src/bind.ts';
import {
  bindingOf,
  COMPILED_GENESIS,
  error,
  escrowPda,
  key,
  makeRegistry,
  makeTerms,
  MINT,
  ok,
  PROGRAM,
  SYSTEM,
  SPL_2022_PROGRAM,
  vaultPda,
  WSOL,
} from './support.mjs';

const registry = makeRegistry();
const bind = (terms, binding = bindingOf(terms), view = registry) => bindSolanaTrade(view, binding, terms);
const sol = (changes = {}) => makeTerms('native', changes);
const spl = (changes = {}) => makeTerms('spl', changes);

test('binds-branded-frozen-trade', () => {
  const terms = sol();
  const trade = ok(bind(terms));
  assert.ok(isBoundSolanaTrade(trade));
  assert.ok(!isBoundSolanaTrade({ ...trade }));
  assert.ok(Object.isFrozen(trade) && Object.isFrozen(trade.terms) && Object.isFrozen(trade.escrow));
  assert.equal(Object.getPrototypeOf(trade.terms), null);
  assert.deepEqual(trade.escrow, escrowPda(terms.seller, terms.sellerNonce));
  assert.equal(trade.vault, null);
  assert.equal(trade.programDataAddress, 'XR3M7K34KSnyYV1HtPmoRkjuLWqhwfF3m1LgC3jaTfF');
  const token = ok(bind(spl()));
  assert.deepEqual(token.vault, vaultPda(token.escrow.address));
  assert.equal(token.asset.id, 'usd6');
});

test('INVALID_INPUT: tradeId-{uppercase,not-hash}, network-id-colon, chain-evm', () => {
  const terms = sol(),
    binding = bindingOf(terms);
  error(bind(terms, { ...binding, tradeId: binding.tradeId.toUpperCase() }), 'INVALID_INPUT');
  error(bind(terms, { ...binding, tradeId: 'ab'.repeat(32) }), 'INVALID_INPUT');
  error(bind(terms, { ...binding, networkId: 'solana:localnet' }), 'INVALID_INPUT');
  error(bind(terms, { ...binding, chain: 'evm' }), 'INVALID_INPUT');
  error(bind(terms, { ...binding, extra: 1 }), 'INVALID_INPUT');
});

test('INVALID_INPUT: terms-{extra-key,getter,proxy}', () => {
  const terms = sol(),
    binding = bindingOf(terms);
  error(bind({ ...terms, extra: '1' }, binding), 'INVALID_INPUT');
  const { revision: _, ...missing } = terms;
  error(bind(missing, binding), 'INVALID_INPUT');
  let touched = 0;
  const getter = { ...terms };
  Object.defineProperty(getter, 'revision', {
    enumerable: true,
    get() {
      touched++;
      return '1';
    },
  });
  error(bind(getter, binding), 'INVALID_INPUT');
  const traps = {
    get() {
      touched++;
      throw Error('SECRET');
    },
  };
  error(bind(new Proxy({ ...terms }, traps), binding), 'INVALID_INPUT');
  error(
    bind(
      new Proxy(
        { ...terms },
        {
          ownKeys() {
            throw Error('SECRET');
          },
        },
      ),
      binding,
    ),
    'INVALID_INPUT',
  );
  assert.equal(touched, 0, 'accessors and get traps are never invoked');
  const hidden = { ...terms };
  Object.defineProperty(hidden, 'revision', { value: '1', enumerable: false });
  error(bind(hidden, binding), 'INVALID_INPUT');
  error(bind(Object.assign(Object.create({ inherited: 1 }), terms), binding), 'INVALID_INPUT');
  error(bind({ ...terms, revision: 1 }, binding), 'INVALID_INPUT');
  error(bind({ ...terms, revision: { toString: () => '1' } }, binding), 'INVALID_INPUT');
});

test('INVALID_INPUT: buyer-{zero,escrow,vault}', () => {
  const base = sol(),
    escrow = escrowPda(base.seller, base.sellerNonce).address;
  error(bind(sol({ buyer: SYSTEM })), 'INVALID_INPUT');
  error(bind(sol({ buyer: escrow })), 'INVALID_INPUT');
  const token = spl(),
    tokenEscrow = escrowPda(token.seller, token.sellerNonce).address;
  error(bind(spl({ buyer: vaultPda(tokenEscrow).address })), 'INVALID_INPUT');
});

const UNSUPPORTED = 'UNSUPPORTED_PROVIDER: {evm,confirmed,authority,protocol2,unsupported-asset,token2022,wsol,' +
  'g16-spl-foreign-token-program}';
test(UNSUPPORTED, () => {
  const runtime = { kind: 'solana-program', programDataSha256: '0'.repeat(64), upgradeAuthority: null };
  const registries = {
    evm: { network: { chain: 'evm' } },
    confirmed: { network: { finality: { kind: 'solana-commitment', commitment: 'confirmed' } } },
    'finality-extra': { network: { finality: { kind: 'solana-commitment', commitment: 'finalized', extra: 1 } } },
    authority: { deployment: { runtime: { ...runtime, upgradeAuthority: key('authority') } } },
    'evm-runtime': { deployment: { runtime: { kind: 'evm-code', keccak256: '0'.repeat(64), upgradeable: false } } },
    protocol2: { deployment: { protocolVersion: 2 } },
    'unsupported-asset': { deployment: { supportedAssetIds: ['usd6'] } },
  };
  for (const [name, changes] of Object.entries(registries))
    error(bind(sol(), undefined, makeRegistry(changes)), 'UNSUPPORTED_PROVIDER', name);
  error(bind(sol(), { ...bindingOf(sol()), deploymentId: 'missing' }), 'UNSUPPORTED_PROVIDER');
  const throwing = {
    network() {
      throw Error('SECRET');
    },
    deployment() {
      return null;
    },
  };
  error(bind(sol(), undefined, throwing), 'UNSUPPORTED_PROVIDER');
  error(bind(spl({ tokenProgram: SPL_2022_PROGRAM })), 'UNSUPPORTED_PROVIDER');
  const wsolRegistry = makeRegistry({
    network: { assets: [{ id: 'wsol', kind: 'spl', address: WSOL, decimals: 9, transferPolicy: 'exact-transfer' }] },
    deployment: { supportedAssetIds: ['wsol'] },
  });
  error(bind(spl({ mint: WSOL }), undefined, wsolRegistry), 'UNSUPPORTED_PROVIDER');
  error(bind(spl({ tokenProgram: key('foreign-token-program') })), 'UNSUPPORTED_PROVIDER');
  error(bind(spl({ mint: key('unlisted-mint') })), 'UNSUPPORTED_PROVIDER');
  assert.equal(ok(bind(spl())).asset.address, MINT);
});

test('WRONG_CHAIN: terms-{genesis,program}', () => {
  error(bind(sol({ genesisHash: key('validator-genesis') })), 'WRONG_CHAIN');
  error(bind(sol({ programId: key('other-program') })), 'WRONG_CHAIN');
  assert.equal(ok(bind(sol())).network.genesisHash, COMPILED_GENESIS);
  assert.equal(ok(bind(sol())).deployment.address, PROGRAM);
});

test('LIMIT_EXCEEDED: native-2^53', () => {
  error(bind(sol({ amountBaseUnits: String(2 ** 53) })), 'LIMIT_EXCEEDED');
  assert.equal(ok(bind(sol({ amountBaseUnits: String(2 ** 53 - 1) }))).terms.amountBaseUnits, String(2 ** 53 - 1));
  assert.ok(ok(bind(spl({ amountBaseUnits: String(2n ** 64n - 1n) }))));
});
