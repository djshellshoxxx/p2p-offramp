# Localization, guidance and accessibility

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1 / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Make irreversible actions, privacy limits and recovery understandable in supported locales. English source strings are not a legal/safety substitute for human review. WCAG 2.2 AA is the acceptance target and requires audit evidence, not a self-declared badge.

## 3. Architecture and data contracts

MessageEntry: `{key,source,context,severity,variables,reviewRequired,docsAnchor}`; LocaleEntry adds translator, reviewer, revision and status draft/reviewed/published. Variables have typed purpose (base-unit amount, currency, address, chain, duration) and cannot contain trusted HTML. All interface/errors/receipts/aria labels/tooltips/date/number display use one locale catalog; machine error codes and canonical signed bytes remain locale-independent. Requested locale targets are en, fr, es, pt-BR, de, it, nl, ar, hi, zh-Hans, zh-Hant, ja, ko, id, tr, ru, uk, vi and th; only reviewed published locales are selectable for funds actions.

## 4. Algorithms and lifecycle

English source uses short sentences and explains escrow/finality/gas/chargeback on first use. Every critical control has visible helper text explaining who signs, public disclosure, deadline, destination and irreversible effects. TooltipRegistry stores `{controlId,messageKey,severity,helpLink,interactionTests}`. Hover/focus/tap open equivalent accessible help; critical warnings cannot exist only in a tooltip/title attribute. Localize via ICU-style messages and Intl with exact canonical numeric parsing; never round amounts for signing. Browser language is a suggestion; explicit selection persists locally without cloud translation requests. Missing safety strings block the locale's signing journey and offer a clearly labeled reviewed locale, never mixed-language silent fallback.

## 5. Interfaces and integration

Render direction at container/document level; isolate addresses/hashes with bidi-safe presentation while retaining raw canonical copy bytes. Keep address validation independent of localized numerals. Focus management restores prior control after dialogs; errors announce cause/safe next action, loading uses textual status, and reduced-motion does not remove state information. Every receipt includes canonical integer amount/asset identifiers alongside localized display. Translation review changes are versioned and attached to the release manifest evidence.

## 6. Errors, abuse and residual threats

LOCALE_INCOMPLETE, MESSAGE_VARIABLE_MISMATCH and AMOUNT_PARSE_AMBIGUOUS block affected actions. Reject translated markup, unsafe links and Unicode controls in machine-readable values. Risks include mistranslated seller-withholding/refund warnings, ambiguous decimals, bidi spoofing and invisible focus. No tooltip contains private bank/chat information or overlays wallet authorization details.

## 7. Verification and primary references

Test catalog key/variable parity, pseudolocalization expansion, long German, Arabic RTL, CJK wraps, plural branches, numeral differences, 320px/400% zoom and keyboard order. Human review covers legally/safety material copy; manual VoiceOver/TalkBack and contrast/target-size audits supplement automated checks. Funds release requires published locale evidence and WCAG assessment; other locales remain draft.

Primary references (exact implementation revisions must be pinned in the evidence record): [WCAG 2.2](https://www.w3.org/TR/WCAG22/); [ECMA-402 Intl](https://tc39.es/ecma402/); [WAI tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/).
