/** English strings for the unmounted trade-terms preview. Kept apart from the shell catalog on purpose. */
export const tradeMessages = {
  banner: 'Preview only. Trading is disabled in this build.',
  title: 'Trade terms review',
  intro: 'Read-only terms as supplied. Nothing here can be accepted, signed, funded or sent.',
  network: 'Network', chainId: 'Chain ID', deployment: 'Deployment', contract: 'Verifying contract',
  seller: 'Seller', buyer: 'Buyer', asset: 'Asset', amount: 'Amount', fiat: 'Fiat amount',
  acceptBefore: 'Accept before', escrowExpiry: 'Escrow expiry', unixSeconds: 'Unix seconds',
  addressHelp: 'Full addresses are shown in both forms and never shortened. Compare every character.',
  groupedLabel: 'Grouped for reading',
  invalid: 'Not displayable: the supplied value is not in canonical form.',
} as const;
