# Independent browser session-selection follow-up — 2026-11-18

Reviewed source delta:
`ba4c1484dd17b96b936835f5a9fd87ac5ac6d421`, following the earlier independently tested
`b74cf599c93a9dd7c2c332eae7404d190a1a07d5` browser candidate. This is a source review of the
three-file selection repair, not a new full native or browser execution claim.

The original controller forwarded every UI selection to the seller-only canonical exchange
selection operation. That refused buyer selection. Multiple seller sessions could also remain
canonically pinned, while the UI used the first selected session as its current display choice.

The repair introduces one private `#selectedSessionId` for display. It is reset with other private
state by `#drop`; the projection marks at most one currently known session selected. Selecting a
seller session still calls the canonical exchange's selection/pinning operation. Selecting a buyer
session requires that session to exist in the current exchange and changes only the local display
choice. The protocol comment now distinguishes those two meanings of selection.

Exact review construction, stored trade binding, D1 acceptance, manual fiat confirmation, canonical
journal admission, and wallet prompt authority are unchanged by this patch. A UI display choice
does not become a signature or spending capability.

The accompanying native fixture now explicitly selects the buyer's received terms before review,
performs two negotiations in the same two profiles, checks that the displayed selection moves,
and restores the second trade by its actual ID from a backup containing both trades. Those changes
exercise the previously missed behavior without dropping the unknown-broadcast/restore/expiry
assertions.

No new defect was found in the inspected delta. The implementation owner's native regression
result was reported separately; this independent follow-up did not rerun unrelated suites. The
real browser qualification gate remains separate from this source assessment.
