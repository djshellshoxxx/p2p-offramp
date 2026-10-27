import type { ReviewedEvmTerms } from '../../../../../packages/domain/index.ts';
import { checkDisplayText } from './display-text.ts';
import { tradeMessages as t } from './trade-messages.ts';
import { describeDeadline, formatFiatMinor, formatUnits, fullAddress, type DisplayResult } from './trade-terms-display.ts';

export type TermsSource = 'file' | 'synthetic-sample';
export interface TradeTermsReviewProps {
  /** Output of the domain terms review. Display only: no callbacks, wallet, network or state. */
  readonly review: ReviewedEvmTerms;
  /** Device clock in unix seconds, display only. */
  readonly nowSeconds: string;
  readonly source: TermsSource;
}

function Text({ result }: { readonly result: DisplayResult<string> }) {
  return result.ok ? <>{result.value}</> : <span className="notice error">{t.invalid}</span>;
}
function Address({ value }: { readonly value: string }) {
  const result = fullAddress(value);
  if (!result.ok) return <span className="notice error">{t.invalid}</span>;
  return <>
    <code className="exact">{result.value.full}</code>
    <br /><small className="helper">{t.groupedLabel}: <code>{result.value.grouped}</code></small>
  </>;
}
function Deadline({ target, now }: { readonly target: string; readonly now: string }) {
  const result = describeDeadline(target, now);
  if (!result.ok) return <span className="notice error">{t.invalid}</span>;
  return <>{result.value.text} <small className="helper">({t.unixSeconds}: <code>{target}</code>)</small></>;
}
function Amount({ review }: { readonly review: ReviewedEvmTerms }) {
  const result = formatUnits(review.amountBaseUnits, review.asset.decimals);
  if (!result.ok) return <span className="notice error">{t.invalid}</span>;
  return <><strong>{result.value} {review.asset.id}</strong>
    <br /><small className="helper">{t.baseUnits(review.amountBaseUnits, review.asset.decimals)}</small></>;
}
function Instructions({ text }: { readonly text: string }) {
  if (text === '') return <>{t.instructionsEmpty}</>;
  const checked = checkDisplayText(text);
  if (!checked.ok) return <span className="notice error" role="alert">{t.instructionsHidden}</span>;
  return <>{checked.mixedScript ? <span className="notice error" role="alert">{t.mixedScript}</span> : null}
    <pre className="instructions">{checked.text}</pre></>;
}

/** True when the device clock is at or past the acceptance deadline (display only, never chain authority). */
export function acceptanceExpired(review: ReviewedEvmTerms, nowSeconds: string): boolean {
  const deadline = describeDeadline(review.acceptBeforeSeconds, nowSeconds);
  return !deadline.ok || deadline.value.state.kind === 'expired';
}

export function TradeTermsReview({ review, nowSeconds, source }: TradeTermsReviewProps) {
  const { asset, agreement } = review;
  const expired = acceptanceExpired(review, nowSeconds);
  return <section className="panel" aria-labelledby="trade-terms-title">
    <p className="warning" role="status">{t.banner}</p>
    <h2 id="trade-terms-title">{t.title}</h2>
    <p className="helper">{t.intro}</p>
    <p className={source === 'synthetic-sample' ? 'warning' : 'helper'}>{source === 'synthetic-sample' ? t.sourceSynthetic : t.sourceFile}</p>
    <p className="helper">{t.addressHelp}</p>
    <dl className="terms">
      <dt>{t.amount}</dt><dd><Amount review={review} /></dd>
      <dt>{t.asset}</dt><dd>{asset.id} ({asset.kind === 'native' ? t.assetNative : t.assetToken})</dd>
      {asset.address !== null ? <><dt>{t.tokenAddress}</dt><dd><Address value={asset.address} /></dd></> : null}
      <dt>{t.fiat}</dt><dd><Text result={formatFiatMinor(agreement.fiatMinorUnits, agreement.fiatScale, agreement.fiatCurrency)} /></dd>
      <dt>{t.seller}</dt><dd><Address value={review.seller} /></dd>
      <dt>{t.buyer}</dt><dd><Address value={review.buyer} /></dd>
      <dt>{t.acceptBefore}</dt><dd><Deadline target={review.acceptBeforeSeconds} now={nowSeconds} /></dd>
      <dt>{t.escrowExpiry}</dt><dd><Deadline target={review.escrowExpirySeconds} now={nowSeconds} /></dd>
      <dt>{t.instructions}</dt><dd><Instructions text={agreement.paymentInstructions} /></dd>
      <dt>{t.capabilities}</dt><dd>{agreement.capabilities.length === 0 ? t.capabilitiesNone : <ul>
        {agreement.capabilities.map(capability => <li key={capability.id}><code>{capability.id}</code> v{capability.version}
          {review.unsupportedCapabilities.includes(capability.id) ? <> <span className="notice error">{t.capabilityUnsupported}</span></> : null}</li>)}
      </ul>}</dd>
      <dt>{t.network}</dt><dd>{review.network.id}</dd>
      <dt>{t.chainId}</dt><dd>{review.network.chainId}</dd>
      <dt>{t.environment}</dt><dd>{review.network.environment}</dd>
      <dt>{t.deployment}</dt><dd>{review.deployment.id}</dd>
      <dt>{t.contract}</dt><dd><Address value={review.deployment.address} /></dd>
      <dt>{t.orderId}</dt><dd><code className="exact">{review.orderId}</code></dd>
      <dt>{t.revision}</dt><dd>{review.revision}</dd>
      <dt>{t.sellerNonce}</dt><dd><code className="exact">{review.sellerNonce}</code></dd>
    </dl>
    <p className="helper">{t.clockNote}</p>
    <h3>{t.hashes}</h3>
    <dl className="terms">
      <dt>{t.agreementHash}</dt><dd><code className="exact">{review.privateAgreementSha256}</code></dd>
      <dt>{t.capabilitiesHash}</dt><dd><code className="exact">{review.capabilitiesSha256}</code></dd>
      <dt>{t.termsDigest}</dt><dd>{t.termsDigestUnavailable}</dd>
    </dl>
    <section className="warning" aria-labelledby="settlement-risk-title"><h3 id="settlement-risk-title">{t.riskTitle}</h3><p>{t.risk}</p></section>
    <section className="plain-section" aria-labelledby="blocked-title">
      <h3 id="blocked-title">{t.blockedTitle}</h3>
      <ul>
        <li>{t.blockedTrading}</li>
        {expired ? <li>{t.blockedExpired}</li> : null}
        {review.unsupportedCapabilities.length > 0 ? <li>{t.blockedCapabilities}</li> : null}
      </ul>
    </section>
  </section>;
}
