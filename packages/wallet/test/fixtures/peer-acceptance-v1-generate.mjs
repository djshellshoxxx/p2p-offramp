// Standalone deterministic generator for peer-acceptance-v1.json (D1 PeerAcceptance v1 candidate vectors).
// Uses only the pinned viem 2.57.10 (repository dependency) and the synthetic scenario; it never imports
// production digest helpers from packages/wallet/src. See peer-acceptance-v1-README.md.
//   node packages/wallet/test/fixtures/peer-acceptance-v1-generate.mjs           # print to stdout
//   node packages/wallet/test/fixtures/peer-acceptance-v1-generate.mjs --check   # exit 1 unless byte-identical
//   node packages/wallet/test/fixtures/peer-acceptance-v1-generate.mjs --write   # overwrite the frozen JSON
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { hashTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const VIEM_VERSION = '2.57.10';
const OUTPUT = new URL('./peer-acceptance-v1.json', import.meta.url);
const SCENARIO = new URL('../../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url);
const NOTICE = 'SYNTHETIC candidate D1 vectors; viem 2.57.10 encoding/signing, existing public test keys. No independent protocol approval.';
const NOT_AFTER_SECONDS = '1699995000';

const tradeTermsTypes = { TradeTerms: [['v', 'uint8'], ['orderId', 'bytes32'], ['revision', 'uint64'], ['networkId', 'string'],
  ['deploymentId', 'string'], ['seller', 'address'], ['buyer', 'address'], ['assetKind', 'uint8'], ['asset', 'address'],
  ['amountBaseUnits', 'uint256'], ['privateAgreementHash', 'bytes32'], ['capabilitiesHash', 'bytes32'], ['sellerNonce', 'bytes32'],
  ['acceptBeforeSeconds', 'uint64'], ['escrowExpirySeconds', 'uint64'], ['mode', 'uint8']].map(([name, type]) => ({ name, type })) };
const peerAcceptanceTypes = { PeerAcceptance: [['v', 'uint8'], ['termsHash', 'bytes32'], ['role', 'uint8'], ['account', 'address'],
  ['ownMessagingKey', 'bytes32'], ['counterpartyMessagingKey', 'bytes32'], ['notAfterSeconds', 'uint64']].map(([name, type]) => ({ name, type })) };

const strip = value => value.slice(2);
/** BIP-340 x-only public key: x coordinate of d*G (parity-independent), from viem's uncompressed public key. */
const xOnly = privateKeyHex => privateKeyToAccount(privateKeyHex).publicKey.slice(4, 68);

function assertViemVersion() {
  const { version } = createRequire(import.meta.url)('viem/package.json');
  if (version !== VIEM_VERSION) throw Error(`Expected viem ${VIEM_VERSION}, found ${version}`);
}

export async function generatePeerAcceptanceV1() {
  assertViemVersion();
  const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8'));
  const domain = { name: 'P2POfframp', version: '1', chainId: BigInt(scenario.domain.chainId), verifyingContract: scenario.domain.verifyingContract };
  // Synthetic messaging keys: 32 bytes of 0x01 (own) and 0x02 (counterparty).
  const ownMessagingKey = xOnly('0x' + '01'.repeat(32)), counterpartyMessagingKey = xOnly('0x' + '02'.repeat(32));
  const vectors = [];
  for (const role of ['seller', 'buyer']) for (const assetKind of ['native', 'erc20']) {
    const terms = scenario.sets[assetKind].terms;
    const termsMessage = { ...terms, v: 1, mode: 0, assetKind: terms.assetKind === 'native' ? 0 : 1,
      revision: BigInt(terms.revision), amountBaseUnits: BigInt(terms.amountBaseUnits),
      acceptBeforeSeconds: BigInt(terms.acceptBeforeSeconds), escrowExpirySeconds: BigInt(terms.escrowExpirySeconds) };
    for (const field of ['orderId', 'privateAgreementHash', 'capabilitiesHash', 'sellerNonce']) termsMessage[field] = '0x' + terms[field];
    const termsHash = strip(hashTypedData({ domain, types: tradeTermsTypes, primaryType: 'TradeTerms', message: termsMessage }));
    const binding = { v: 1, termsHash, role, account: terms[role], ownMessagingKey, counterpartyMessagingKey, notAfterSeconds: NOT_AFTER_SECONDS };
    const typed = { domain, types: peerAcceptanceTypes, primaryType: 'PeerAcceptance', message: { ...binding, role: role === 'seller' ? 0 : 1,
      termsHash: '0x' + termsHash, ownMessagingKey: '0x' + ownMessagingKey, counterpartyMessagingKey: '0x' + counterpartyMessagingKey,
      notAfterSeconds: BigInt(NOT_AFTER_SECONDS) } };
    const account = privateKeyToAccount('0x' + scenario.testOnlyKeys[role].privateKeyHex);
    vectors.push({ role, assetKind, binding, digest: strip(hashTypedData(typed)),
      termsSignature: await account.sign({ hash: '0x' + termsHash }), bindingSignature: await account.signTypedData(typed) });
  }
  return JSON.stringify({ notice: NOTICE, domain: scenario.domain, vectors }, null, 2) + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const output = await generatePeerAcceptanceV1();
  if (process.argv.includes('--write')) writeFileSync(OUTPUT, output);
  else if (process.argv.includes('--check')) {
    if (readFileSync(OUTPUT, 'utf8') !== output) { console.error('peer-acceptance-v1.json differs from generator output'); process.exit(1); }
    console.log('peer-acceptance-v1.json is byte-identical to generator output');
  } else process.stdout.write(output);
}
