import { DOMAIN_TYPE, TRADE_TERMS_TYPE, snapshotEvmDomain, snapshotEvmTerms, type EvmDomainInput, type EvmTermsInput } from '../../../../packages/wallet/localnet.ts';
import type { EvmPreparedRequest } from '../../../../packages/domain/localnet.ts';
import type { LocalnetWalletRequest } from './protocol.ts';

const members = (type: string): readonly { readonly name: string; readonly type: string }[] => type.slice(type.indexOf('(') + 1, -1).split(',').map(member => {
  const [kind, name] = member.split(' '); return { name: name!, type: kind! };
});
/** Presentation/bridge expectation only. The canonical adapter independently reconstructs and verifies this payload. */
export function reviewedTermsRequest(account: string, inputDomain: EvmDomainInput, inputTerms: EvmTermsInput): LocalnetWalletRequest {
  const domain = snapshotEvmDomain(inputDomain), terms = snapshotEvmTerms(inputTerms);
  const typedData = JSON.stringify({ types: { EIP712Domain: members(DOMAIN_TYPE), TradeTerms: members(TRADE_TERMS_TYPE) }, primaryType: 'TradeTerms',
    domain: { name: 'P2POfframp', version: '1', chainId: domain.chainId, verifyingContract: domain.verifyingContract },
    message: { ...terms, v: 1, mode: 0, assetKind: terms.assetKind === 'native' ? 0 : 1, orderId: `0x${terms.orderId}`,
      privateAgreementHash: `0x${terms.privateAgreementHash}`, capabilitiesHash: `0x${terms.capabilitiesHash}`, sellerNonce: `0x${terms.sellerNonce}` } });
  return { method: 'eth_signTypedData_v4', params: [account, typedData] };
}
export function reviewedTransactionRequest(request: EvmPreparedRequest): LocalnetWalletRequest {
  return { method: 'eth_sendTransaction', params: [{ from: request.from, to: request.to, data: request.data,
    value: `0x${BigInt(request.value).toString(16)}`, nonce: `0x${BigInt(request.nonce).toString(16)}`, chainId: `0x${BigInt(request.chainId).toString(16)}` }] };
}
