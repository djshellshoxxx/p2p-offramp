/** Offline test-vector oracle. No application imports, Noble code, network, or dependency installation.
 * Pass an existing node_modules containing js-sha3 0.8.0 and elliptic 6.6.1. Both tools are MIT licensed.
 * These fixtures check G16 integration; they do not qualify either provider or enable the app capability.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

if (process.argv.length !== 3) throw new Error('Pass the absolute existing node_modules directory.');
const root = resolve(process.argv[2]), require = createRequire(import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lockBytes = readFileSync(resolve(root, '../package-lock.json')), lock = JSON.parse(lockBytes);
const provider = (name, version, sourceFile) => {
  const p = JSON.parse(readFileSync(resolve(root, name, 'package.json')));
  if (p.version !== version || p.license !== 'MIT') throw new Error('Unexpected offline oracle package.');
  return { name, version, license: p.license, sourceFile,
    sourceSha256: sha(readFileSync(resolve(root, name, sourceFile))),
    lockedIntegrity: lock.packages[`node_modules/${name}`].integrity };
};
const provenance = { kind: 'offline independent integration oracle; not provider approval',
  sourcePackageLockSha256: sha(lockBytes),
  providers: [provider('js-sha3', '0.8.0', 'src/sha3.js'), provider('elliptic', '6.6.1', 'lib/elliptic/ec/index.js')] };
const { keccak_256 } = require(resolve(root, 'js-sha3'));
const { ec: EC } = require(resolve(root, 'elliptic')), ec = new EC('secp256k1');
const hash = bytes => keccak_256(bytes), utf8Hash = text => hash(Buffer.from(text, 'utf8'));
const uint = value => BigInt(value).toString(16).padStart(64, '0');
const address = value => value.slice(2).padStart(64, '0');
const hashWords = words => hash(Buffer.from(words.join(''), 'hex'));
// Exact field order and type string transcribed from canonical G16, not from the TS implementation.
const fields = [['v','uint8'],['orderId','bytes32'],['revision','uint64'],['networkId','string'],['deploymentId','string'],
  ['seller','address'],['buyer','address'],['assetKind','uint8'],['asset','address'],['amountBaseUnits','uint256'],
  ['privateAgreementHash','bytes32'],['capabilitiesHash','bytes32'],['sellerNonce','bytes32'],
  ['acceptBeforeSeconds','uint64'],['escrowExpirySeconds','uint64'],['mode','uint8']];
const type = `TradeTerms(${fields.map(([name, type]) => `${type} ${name}`).join(',')})`;
const typeHash = utf8Hash(type), domainTypeHash = utf8Hash('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
const digest = (domain, terms) => {
  const values = { ...terms, v: 1, mode: 0, assetKind: terms.assetKind === 'native' ? 0 : 1 };
  const structHash = hashWords([typeHash, ...fields.map(([name, type]) => type === 'string' ? utf8Hash(values[name])
    : type === 'address' ? address(values[name]) : type === 'bytes32' ? values[name] : uint(values[name]))]);
  const domainSeparator = hashWords([domainTypeHash, utf8Hash('P2POfframp'), utf8Hash('1'), uint(domain.chainId), address(domain.verifyingContract)]);
  return { typeHash, domainSeparator, structHash, termsHash: hash(Buffer.from(`1901${domainSeparator}${structHash}`, 'hex')) };
};
const domain = { chainId: '31337', verifyingContract: `0x${'22'.repeat(20)}` };
const terms = { orderId: 'a'.repeat(64), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-v1',
  seller: `0x${'33'.repeat(20)}`, buyer: `0x${'44'.repeat(20)}`, assetKind: 'native', asset: `0x${'0'.repeat(40)}`,
  amountBaseUnits: '1000000000000000000', privateAgreementHash: 'b'.repeat(64), capabilitiesHash: 'c'.repeat(64),
  sellerNonce: 'd'.repeat(64), acceptBeforeSeconds: '1700000000', escrowExpirySeconds: '1700086400' };
const max64 = ((1n << 64n) - 1n).toString(), max256 = ((1n << 256n) - 1n).toString();
const cases = [
  ['native', domain, terms],
  ['erc20', domain, { ...terms, assetKind: 'erc20', asset: `0x${'11'.repeat(20)}` }],
  ['maximum-width', domain, { ...terms, revision: max64, amountBaseUnits: max256, acceptBeforeSeconds: max64, escrowExpirySeconds: max64 }],
  ['maximum-chain-and-text', { ...domain, chainId: max256 }, { ...terms, networkId: 'n'.repeat(64), deploymentId: 'd'.repeat(64) }],
];
// Public, synthetic scalars 1 and 2 are deliberately unsuitable for funds.
const keys = [1, 2].map(value => ec.keyFromPrivate(value.toString(16).padStart(64, '0'), 'hex'));
const publicKey = key => key.getPublic(false, 'hex');
const account = key => `0x${hash(Buffer.from(publicKey(key).slice(2), 'hex')).slice(-40)}`;
const sign = (key, termsHash, role) => {
  const signature = key.sign(termsHash, { canonical: true });
  if (signature.recoveryParam !== 0 && signature.recoveryParam !== 1) throw new Error('Unexpected recovery identifier.');
  if (!ec.verify(termsHash, signature, key) || ec.recoverPubKey(Buffer.from(termsHash, 'hex'), signature, signature.recoveryParam).encode('hex', false) !== publicKey(key)) throw new Error('Oracle signature self-check failed.');
  return { role, account: account(key), publicKey: publicKey(key), signature: signature.r.toString(16, 64) + signature.s.toString(16, 64) + (27 + signature.recoveryParam).toString(16) };
};
const signedTerms = { ...terms, seller: account(keys[0]), buyer: account(keys[1]) };
cases.push(['signed-native', domain, signedTerms], ['signed-erc20-other-domain', { chainId: '1', verifyingContract: `0x${'55'.repeat(20)}` }, { ...signedTerms, assetKind: 'erc20', asset: `0x${'11'.repeat(20)}` }]);
const vectors = cases.map(([id, domain, terms]) => {
  const expected = digest(domain, terms);
  return { id, domain, terms, ...expected, ...(id.startsWith('signed-') ? { acceptances: keys.map((key, index) => sign(key, expected.termsHash, index === 0 ? 'seller' : 'buyer')) } : {}) };
});
console.log(JSON.stringify({ version: 1, provenance, vectors }, null, 2));
