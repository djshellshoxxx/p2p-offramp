import { tradeMessages as t } from './trade-messages.ts';
import { describeDeadline, formatBaseUnits, formatFiatMinor, fullAddress, type DisplayResult, type FiatView } from './trade-terms-display.ts';

/** Already-validated view model. Display only: no callbacks, wallet, network or state. */
export interface TradeTermsViewModel {
  readonly networkId: string;
  readonly chainId: string;
  readonly deploymentId: string;
  readonly verifyingContract: string;
  readonly seller: string;
  readonly buyer: string;
  readonly asset: { readonly symbol: string; readonly decimals: number };
  readonly amountBaseUnits: string;
  readonly fiat: FiatView;
  readonly acceptBefore: string;
  readonly escrowExpiry: string;
  readonly nowSeconds: string;
}

function Text({ result }: { readonly result: DisplayResult<string> }) {
  return result.ok ? <>{result.value}</> : <span className="notice error">{t.invalid}</span>;
}
function Address({ value }: { readonly value: string }) {
  const result = fullAddress(value);
  if (!result.ok) return <span className="notice error">{t.invalid}</span>;
  return <>
    <code>{result.value.full}</code>
    <br /><small className="helper">{t.groupedLabel}: <code>{result.value.grouped}</code></small>
  </>;
}
function Deadline({ target, now }: { readonly target: string; readonly now: string }) {
  const result = describeDeadline(target, now);
  if (!result.ok) return <span className="notice error">{t.invalid}</span>;
  return <>{result.value.text} <small className="helper">({t.unixSeconds}: <code>{target}</code>)</small></>;
}

export function TradeTermsReview({ terms }: { readonly terms: TradeTermsViewModel }) {
  const { asset, fiat } = terms;
  return <section className="panel" aria-labelledby="trade-terms-title">
    <p className="warning" role="status">{t.banner}</p>
    <h2 id="trade-terms-title">{t.title}</h2>
    <p className="helper">{t.intro}</p>
    <p className="helper">{t.addressHelp}</p>
    <dl>
      <dt>{t.network}</dt><dd>{terms.networkId}</dd>
      <dt>{t.chainId}</dt><dd>{terms.chainId}</dd>
      <dt>{t.deployment}</dt><dd>{terms.deploymentId}</dd>
      <dt>{t.contract}</dt><dd><Address value={terms.verifyingContract} /></dd>
      <dt>{t.seller}</dt><dd><Address value={terms.seller} /></dd>
      <dt>{t.buyer}</dt><dd><Address value={terms.buyer} /></dd>
      <dt>{t.asset}</dt><dd>{asset.symbol} ({asset.decimals})</dd>
      <dt>{t.amount}</dt><dd><Text result={formatBaseUnits(terms.amountBaseUnits, asset.decimals, asset.symbol)} /></dd>
      <dt>{t.fiat}</dt><dd><Text result={formatFiatMinor(fiat.fiatMinorUnits, fiat.fiatScale, fiat.fiatCurrency)} /></dd>
      <dt>{t.acceptBefore}</dt><dd><Deadline target={terms.acceptBefore} now={terms.nowSeconds} /></dd>
      <dt>{t.escrowExpiry}</dt><dd><Deadline target={terms.escrowExpiry} now={terms.nowSeconds} /></dd>
    </dl>
  </section>;
}
