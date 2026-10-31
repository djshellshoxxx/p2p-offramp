// Reproduce: npm install --cache /workspace/work/npm-cache --prefix /workspace/work/g16 --ignore-scripts ethers@6.15.0
// node packages/wallet/test/fixtures/g16-independent-generate.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
const { TypedDataEncoder, Wallet, version } = createRequire(resolve(process.argv[2] ?? '/workspace/work/g16', 'package.json'))('ethers');
if (version !== '6.15.0') throw Error('Expected ethers 6.15.0');
const scenario = JSON.parse(readFileSync(new URL('../../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url)));
const fields = [['v','uint8'],['orderId','bytes32'],['revision','uint64'],['networkId','string'],['deploymentId','string'],['seller','address'],['buyer','address'],['assetKind','uint8'],['asset','address'],['amountBaseUnits','uint256'],['privateAgreementHash','bytes32'],['capabilitiesHash','bytes32'],['sellerNonce','bytes32'],['acceptBeforeSeconds','uint64'],['escrowExpirySeconds','uint64'],['mode','uint8']];
const types = { TradeTerms: fields.map(([name,type]) => ({name,type})) };
const domain = {name:'P2POfframp',version:'1',...scenario.domain};
const vectors = [];
for (const [name, set] of Object.entries(scenario.sets)) {
 const terms = set.terms;
 const value = {...terms,v:1,mode:0,assetKind:terms.assetKind === 'native' ? 0 : 1};
 for (const field of ['orderId','privateAgreementHash','capabilitiesHash','sellerNonce']) value[field] = '0x'+value[field];
 const signatures = {};
 for (const role of ['seller','buyer']) signatures[role] = await new Wallet(scenario.testOnlyKeys[role].privateKeyHex).signTypedData(domain,types,value);
 vectors.push({name,domain:scenario.domain,terms,domainSeparator:TypedDataEncoder.hashDomain(domain).slice(2),structHash:TypedDataEncoder.from(types).hash(value).slice(2),digest:TypedDataEncoder.hash(domain,types,value).slice(2),signatures});
}
writeFileSync(new URL('./g16-independent.json',import.meta.url),JSON.stringify({provenance:'ethers 6.15.0 TypedDataEncoder and Wallet; independent implementation, same project-supplied synthetic inputs. Not independent security review, trust-root approval, contract interoperability or production readiness. Never fund these keys.',vectors},null,2)+'\n');
