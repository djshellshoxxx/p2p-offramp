/** Single English source. Every entry requires translation review; this is draft source copy, not a published safety locale. */
import { createMessage, formatMessage, type MessageEntry, type MessageVariables, type MessageValues } from './catalog.ts';

const definitions = {
  privacy: {
    title: 'Independent privacy observations', intro: 'These local observations do not verify anonymity, encrypted messaging or payment settlement.',
    selected: 'Selected policy', observed: 'Observed state', source: 'Evidence source', reason: 'Observation reason',
    noPolicy: 'No network policy selected', none: 'No trusted observation', unknown: 'Unknown', unavailable: 'Unavailable', unsupported: 'Unsupported',
    ordinary: 'Ordinary', strict: 'Strict', direct: 'Direct connection', privateRoute: 'Verified private route', blocked: 'Blocked by policy',
    rpc: 'RPC channel', relay: 'Relay channel', map: 'Map channel', proofChannel: 'Proof channel', update: 'Update channel', wallet: 'Wallet channel',
    vault: 'Local vault', messaging: 'Message encryption', proof: 'Proof availability', locked: 'Locked', unlocked: 'Unlocked',
    authenticated: 'Authenticated encryption observed', available: 'Available', localVault: 'Local vault service inspection', transport: 'Live transport policy inspection', messagingProvider: 'Trusted messaging service', proofProvider: 'Trusted proof service',
    notObserved: 'Not observed', observedReason: 'Fresh observation', expired: 'Observation expired', invalid: 'Observation rejected', scopeChanged: 'Local scope changed', clockReversed: 'Monotonic clock reversed', policyBlocked: 'Selected or observed policy blocks direct transport',
    chainTitle: 'Public chain visibility', chainWarning: 'Public chain transactions reveal metadata. Local vault encryption and private routing do not make chain activity anonymous.',
    fiatTitle: 'Manual fiat settlement', fiatWarning: 'Fiat receipt depends on seller attestation. Proof availability does not prove that a payment is irreversible.',
    authorityWarning: 'Display only. These observations cannot enable trading, prepare transactions or authorize spending.',
    time: { source: 'Inspected at {milliseconds} milliseconds on this session’s monotonic clock. This is not a wall-clock timestamp.', variables: { milliseconds: 'text' } },
    refresh: 'The local vault is inspected again when its observation expires, vault status or selection changes, or this page becomes visible again. Network, messaging and proof services are not connected in this shell.',
    noTime: 'No evidence timestamp is available.', error: 'Privacy observations are unavailable. No privacy coverage or transaction authority is established.',
  },
  help: {
    profile: "A profile ID locates local encrypted data on this origin. It is not a wallet address or counterparty authentication.",
    unlock: "Unlocking exposes local plaintext to this browser session. It grants no wallet or transaction permission.",
    create: "Use a unique secret you can retain. This local operation creates storage keys, not external-wallet spending keys.",
    file: "Select your own encrypted backup. File names and checksums cannot establish that its contents are authentic.",
    restore: "The new passphrase seals a separate profile with fresh keys. Keep the original file and its old passphrase until recovery is verified.",
    export: "Downloading ciphertext does not test its passphrase or restore it. Keep the exported file private and retain its passphrase separately.",
    createConsent: "Consent applies only to creating this local profile. There is no server account or administrator able to reset its passphrase.",
    restoreConsent: "A successful local restore is not confirmation that a referenced transaction failed or that it is safe to submit again.",
    label: "Help", show: { source: "Help for {control}", variables: { control: "text" } } },
  "shell": {
    "appName": "P2P Off-ramp",
    "development": "Development shell",
    "skip": "Skip to main content",
    "navLabel": "Primary navigation",
    "home": "Home",
    "offers": "Offers",
    "recovery": "Recovery",
    "settings": "Settings",
    "fundsDisabled": "Funds disabled",
    "networkDisabled": "Network access disabled",
    "offline": "Browser offline",
    "online": "Browser online",
    "networkHelp": "This shell makes no RPC, relay, or wallet connections. Browser connectivity does not verify private routing.",
    "locked": "Vault locked",
    "unlocked": "Vault unlocked",
    "sessionLabel": "Local session",
    "lock": "Lock vault",
    "refresh": "Refresh vault status",
    "starting": "Opening local services…",
    "unavailable": "Local private operations are unavailable. Recovery guidance remains available.",
    "localOnly": "Local only",
    "homeTitle": "Your local workspace",
    "homeIntro": "A recoverable static client under development. You can create, restore, or open a local encrypted profile. Trading is unavailable.",
    "readyTitle": "What is available",
    "readyText": "Local encrypted profile creation, unlock, session lock, encrypted file export, and fresh-key restore on this browser origin. Trade terms can be checked read-only on the Offers page when a network registry is loaded.",
    "disabledTitle": "Trading is not enabled",
    "disabledText": "Offer discovery, wallet connections, signing, escrow, messaging, and payments are unavailable in this build.",
    "openOffers": "Review trade terms",
    "unlock": "Unlock existing profile",
    "unlockHelp": "Use the ID and passphrase of a profile already stored on this exact browser origin. This does not connect a wallet or authorize a payment.",
    "profile": "Profile ID",
    "profileHelp": "Enter the exact 32-character lowercase hexadecimal ID. It is never added to a URL.",
    "passphrase": "Passphrase",
    "passphraseHelp": "Used only for this unlock attempt. The field is cleared when submitted, cancelled, or closed. Browser extensions and compromised code can still read unlocked memory.",
    "submitUnlock": "Unlock local vault",
    "cancel": "Cancel",
    "unlocking": "Unlocking local vault…",
    "unlockedHelp": "The local vault session is open. This shell does not display private records or enable trading. Lock it when you finish.",
    "offersTitle": "Offers",
    "offersIntro": "Offer discovery is unavailable.",
    "offersHelp": "No relay is connected and no live offers have been loaded. This page does not show example prices or counterparties.",
    "tradeTitle": "Trade review",
    "syntheticDemo": "SYNTHETIC DEMO · test-only data",
    "testnet": "SEPOLIA TESTNET · owner-signed registry",
    "testnetLocalProof": "SEPOLIA LOCAL PROOF · unapproved fixture key",
    "tradeIntro": "This local trade cannot be resolved in this build.",
    "tradeHelp": "A route is not proof of a trade, payment, approved contract, or chain state. No transaction will be replayed from this link.",
    "recoveryTitle": "Recovery",
    "recoveryIntro": "Keep an encrypted copy before changing browser, device, or origin.",
    "originTitle": "Local storage belongs to this origin",
    "originHelp": "A new domain, gateway, or CID origin can have a different IndexedDB vault. An empty browser does not establish that your keys or funds are gone. A changed path on the same origin does not isolate storage.",
    "backupVerifyTitle": "Authenticate a backup file against this profile",
    "backupVerifyHelp": "Unlock the profile to check a selected backup file and its passphrase against that exact committed revision. Exporting, downloading, unlocking or restoring another profile does not perform this check.",
    "backupVerifyScope": "This covers every encrypted local record in one profile, including opaque records. It does not cover external-wallet spending keys, complete relay history, chain truth or file retention on another device. A result is a point-in-time check; recheck before relying on its revision.",
    "backupVerifyFile": "Backup file to authenticate",
    "backupVerifyPassphrase": "Passphrase for this backup file",
    "backupVerify": "Verify this backup file",
    "backupVerifyCheck": "Recheck verified revision",
    "backupVerifying": "Authenticating the file and checking the committed profile…",
    "backupVerifyChecking": "Checking the selected profile revision…",
    "backupVerifyNone": "No authenticated backup verification is held for this profile selection.",
    "backupVerifyLocked": "Unlock the matching local profile before verifying its backup. A restored fresh-key profile needs its own exported file and verification.",
    "backupVerifyMismatch": "The file does not match the open profile’s committed revision, or the stored profile changed. Export the latest profile and verify its file again.",
    "backupVerifyFileRequired": "Choose the encrypted backup file to authenticate.",
    "backupVerifyCancelled": "Verification cancelled. No backup verification was established; profile data was not changed.",
    "backupVerifyCancel": "Cancel verification",
    "backupVerifyEnvelopeDigest": "Authenticated encrypted envelope SHA-256",
    "backupVerifyFileDigest": "Verified file SHA-256",
    "backupVerified": { source: "Backup file authenticated against profile {profileId}, revision {revision}. This result is local to this profile selection and check.", variables: { profileId: "identifier", revision: "count" } },
    "backupTitle": "Export an encrypted file",
    "backupHelp": "Export reads committed ciphertext for a known local profile. It does not include external-wallet spending keys. Keep the file private and retain its passphrase separately.",
    "unchecked": "Authentication not checked",
    "uncheckedHelp": "Every export in this shell is labelled unchecked, even after unlock. A checksum detects accidental corruption; it does not prove authenticity or a successful recovery.",
    "consent": "I understand this encrypted export is unchecked and saving it may expose the file to other software on this device.",
    "export": "Download unchecked encrypted backup",
    "exporting": "Preparing encrypted file…",
    "exported": "Unchecked encrypted file prepared. Your browser controls whether it is saved. This is not a verified recovery test.",
    "restoreTitle": "Restore an encrypted file",
    "restoreHelp": "Restore decrypts the file inside the local Worker and writes a separate new profile with fresh keys. Your existing profiles are never replaced or deleted. Do not send a passphrase through a link, clipboard, or support request.",
    "restoreFile": "Encrypted backup file",
    "restoreFileHelp": "Choose a file exported by this app. Files larger than 12 MiB are refused before reading.",
    "sourcePassphrase": "Backup passphrase",
    "restorePassphraseHelp": "The restored profile is sealed with this new passphrase. It may match the old one, but its keys are always fresh.",
    "restoreConsent": "I understand the file content is untrusted until it authenticates, its age is unknown, and any trade it references must be reconciled on-chain before economic actions.",
    "restoreConsentRequired": "Read and accept the restore notice before continuing.",
    "restoreFileRequired": "Choose an encrypted backup file.",
    "submitRestore": "Restore as new profile",
    "restoring": "Authenticating and restoring locally…",
    "openRestored": "Open restored profile",
    "lockToOpenRestored": "A profile is already unlocked. Use Lock vault before unlocking the restored profile; opening this page does not switch sessions.",
    "create": "Create new profile",
    "createHelp": "Creates an empty encrypted profile on this browser origin. No wallet, account, or server is involved. Only you hold the passphrase.",
    "newPassphrase": "New passphrase",
    "newPassphraseHelp": "At least 12 UTF-8 bytes. A password-manager-generated secret or a long multiword passphrase is best; length alone is not strength.",
    "confirmPassphrase": "Confirm new passphrase",
    "passphraseMismatch": "The passphrases do not match. Both fields were cleared.",
    "createConsent": "I understand there is no passphrase reset. Losing the passphrase and every encrypted backup means this local data is unrecoverable.",
    "createConsentRequired": "Read and accept the passphrase notice before creating a profile.",
    "submitCreate": "Create encrypted profile",
    "creating": "Creating encrypted profile locally…",
    "inventoryEmpty": "No local profiles exist on this origin yet. Create or restore one first.",
    "inventoryUnavailable": "The local profile list is unavailable. You can still type a known profile ID.",
    "inventoryTruncated": "More rows exist than this build lists. Keep your data and use recovery guidance.",
    "restoreUncertain": "The restore was interrupted and may have completed. Check local profiles before trying again; do not restore the same file twice without checking.",
    "reconcile": "Check local profiles",
    "recoveryRisk": "Without a usable backup and passphrase, local messaging and history data may be permanently lost. This shell cannot recover on-chain funds or confirm payment state.",
    "settingsTitle": "Settings",
    "settingsIntro": "Current capabilities and trust limits",
    "privacyTitle": "Privacy and connectivity",
    "privacyHelp": "RPC, relay, wallet, update discovery, and analytics connections are disabled. No service worker is installed by this client. Offline use is limited to an already loaded shell; fresh chain state is unavailable.",
    "trustTitle": "Executable trust",
    "trustHelp": "Static hosting and IPFS content addressing do not authenticate a first visit. Verify release artifacts and the distribution key through an independent trusted channel. This shell does not verify releases or switch origins.",
    "framingTitle": "Framing protection unverified",
    "framingHelp": "A CSP meta tag cannot enforce frame-ancestors. Host response headers require a separate deployment check; this shell does not claim clickjacking protection.",
    "localeTitle": "Language and compatibility",
    "localeHelp": "English source copy only. Browser capability checks are not device certification. Wallet support, physical device tests, translation review, and accessibility acceptance remain pending.",
    "unknownTitle": "Page unavailable",
    "unknownHelp": "This route is not supported. Return home or open recovery guidance. Link contents are not used as commands.",
    "returnHome": "Return home",
    "openRecovery": "Open recovery",
    "footer": "Development build · No real-funds readiness claimed",
    "locking": "Locking local vault…",
    "refreshing": "Checking local vault status…",
    "profileInvalid": "Enter an exact 32-character lowercase hexadecimal profile ID.",
    "consentRequired": "Read and accept the unchecked export notice before downloading.",
    "restored": {
      "source": "Restored as a new locked profile {id} with {records} {records|record|records}. Unlock it from Home.",
      "variables": {
        "id": "identifier",
        "records": "count"
      }
    },
    "restoredSelection": {
      "source": "Restored profile {id} is selected for unlock in this page only. Enter its new passphrase to open it.",
      "variables": {
        "id": "identifier"
      }
    },
    "created": {
      "source": "Profile {id} was created and unlocked. Note this ID and export an encrypted backup from Recovery.",
      "variables": {
        "id": "identifier"
      }
    },
    "capacityReached": {
      "source": "This origin already holds the maximum of {max} local profiles. Restore or create is refused; existing profiles are kept.",
      "variables": {
        "max": "count"
      }
    },
    "inventoryTitle": {
      "source": "Profiles on this origin ({count} of {max})",
      "variables": {
        "count": "count",
        "max": "count"
      }
    },
    "useProfile": {
      "source": "Use profile {id}",
      "variables": {
        "id": "identifier"
      }
    },
    "reconciledTitle": {
      "source": "Profiles on this origin now ({count}). A new profile here may be from the interrupted restore; nothing was deleted.",
      "variables": {
        "count": "count"
      }
    }
  },
  "shellErrors": {
    "INVALID_INPUT": "The local operation could not use this input. Check the profile ID and passphrase requirements.",
    "UNSUPPORTED_ENVIRONMENT": "This browser cannot open the encrypted local service. Use a supported secure browser context and keep your existing data.",
    "UNSUPPORTED_VERSION": "This local data version is unsupported. Keep the original data and use compatible recovery software.",
    "NOT_FOUND": "No profile was found for that ID on this origin. Check the ID and your original browser origin.",
    "AUTHENTICATION_FAILED": "The vault could not be authenticated. Check the passphrase and keep the original data.",
    "LOCKED": "The local session is locked. Unlock the existing profile again if needed.",
    "CONFLICT": "Local data changed. Keep the original data and check its status before trying again.",
    "LIMIT_EXCEEDED": "A local safety limit was reached. Keep the original data and use recovery guidance.",
    "QUOTA_EXCEEDED": "Browser storage for this origin is full. Nothing was saved. Free space or export a backup, then try again; existing profiles are kept.",
    "STORAGE_UNAVAILABLE": "Local storage is unavailable. Check browser storage permissions and keep your original data.",
    "CANCELLED": "The local operation was cancelled. No success is confirmed.",
    "BUSY": "Another local operation is running. Wait for it to finish before trying again.",
    "PROTOCOL_ERROR": "The local service could not complete this operation safely. Keep your data and open recovery guidance.",
    "TIMEOUT": "The local operation timed out. Check local status before trying again."
  },
  "trade": {
    "versionPrefix": "v",
    "banner": "Preview only. Trading is disabled in this build.",
    "title": "Trade terms review",
    "intro": "Read-only terms as supplied. Nothing here can be accepted, signed, funded or sent.",
    "sourceFile": "Source: a local file you selected. Its contents were checked against the loaded registry; that does not make the counterparty trustworthy.",
    "sourceSynthetic": "Source: SYNTHETIC test-only sample built into this demo. Never use these addresses or amounts on a real network.",
    "sourceSaved": "Source: an encrypted review loaded from this profile and checked against the current registry.",
    "network": "Network",
    "chainId": "Chain ID",
    "environment": "Registry environment",
    "deployment": "Escrow deployment",
    "contract": "Escrow contract",
    "orderId": "Order ID",
    "revision": "Revision",
    "sellerNonce": "Seller nonce",
    "seller": "Crypto seller (funds escrow, confirms fiat receipt)",
    "buyer": "Crypto buyer (pays fiat, receives crypto)",
    "asset": "Asset",
    "assetNative": "native coin",
    "assetToken": "ERC-20 token",
    "tokenAddress": "Token contract",
    "amount": "Crypto amount",
    "fiat": "Fiat amount",
    "instructions": "Payment instructions (from the counterparty, exactly as agreed)",
    "instructionsEmpty": "None supplied.",
    "instructionsHidden": "Hidden: the text contains characters that can disguise its meaning. Ask the counterparty for plain text.",
    "mixedScript": "Warning: some words mix Latin with Cyrillic or Greek letters, which can imitate other words.",
    "capabilities": "Optional capabilities",
    "capabilitiesNone": "None (core manual trade).",
    "versionHidden": "version hidden: it contains characters that can disguise text",
    "capabilityUnsupported": "Not supported by this build. Terms that require it cannot be used here.",
    "acceptBefore": "Accept before",
    "escrowExpiry": "Escrow expiry",
    "unixSeconds": "Unix seconds",
    "clockNote": "Remaining time uses this device’s clock for display only. Chain time decides funding, release and refund.",
    "hashes": "Integrity checks",
    "agreementHash": "Private agreement SHA-256 (recomputed and matched)",
    "capabilitiesHash": "Capabilities SHA-256 (recomputed and matched)",
    "termsDigest": "Signed terms digest (EIP-712)",
    "termsDigestUnavailable": "Not computed in this build because signing is disabled.",
    "riskTitle": "Manual settlement risk",
    "risk": "The seller releases crypto only after confirming fiat receipt. A dishonest seller can withhold release after you pay; at expiry the escrowed crypto refunds to the seller. This app cannot verify fiat payments or make them reversible.",
    "blockedTitle": "Why these terms cannot be accepted here",
    "blockedTrading": "Trading, wallet connections, signing and funding are disabled in this build.",
    "blockedExpired": "The acceptance deadline has passed by this device’s clock.",
    "blockedCapabilities": "The terms require optional capabilities this build does not support.",
    "addressHelp": "Full addresses are shown in both forms and never shortened. Compare every character.",
    "groupedLabel": "Grouped for reading",
    "invalid": "Not displayable: the supplied value is not in canonical form.",
    "baseUnits": {
      "source": "{units} base units at {decimals} decimals",
      "variables": {
        "units": "base-unit amount",
        "decimals": "count"
      }
    }
  },
  "tradePage": {
    "syntheticBadge": " (synthetic)",
    "discoveryTitle": "Offer discovery is unavailable",
    "discoveryHelp": "No relay is connected and no live offers have been loaded. This page does not show example prices or counterparties.",
    "reviewTitle": "Review trade terms locally",
    "reviewHelp": "Check a trade-terms file against the network registry loaded in this build. Checking is read-only and offline: nothing is accepted, signed, funded or sent.",
    "registryLoading": "Loading the network registry…",
    "registryUnavailable": "No approved network registry is loaded in this build, so trade terms cannot be checked. Registry and release trust (G11/G15) await an owner decision.",
    "registryFailed": "The network registry failed its integrity check and was not used. Terms cannot be checked.",
    "demoBanner": "SYNTHETIC LOCAL DEMO: test-only registry for local chain 31337. Not a trust root; never use these values with real funds.",
    "fileLabel": "Trade-terms file (JSON, at most 64 KiB)",
    "fileHelp": "The file is read locally. Larger files are refused before reading.",
    "fileRequired": "Choose a trade-terms file first.",
    "check": "Check terms",
    "cancel": "Cancel check",
    "samplesTitle": "Synthetic samples",
    "samplesHelp": "Built-in test-only samples. They go through the same checks as a file.",
    "reading": "Reading the file…",
    "checking": "Checking the terms against the registry…",
    "cancelled": "Check cancelled. Nothing was stored.",
    "accepted": "Terms checked. The review is open below and in this session list.",
    "openReview": "Open review",
    "sessionTitle": "Reviewed in this session",
    "sessionEmpty": "No terms reviewed yet in this session.",
    "sessionHelp": "Up to 8 unsaved reviews are kept in memory, alongside saved reviews from the open profile. Locking or reloading clears this list. Removing an entry does not delete its encrypted saved copy.",
    "save": "Save encrypted review",
    "persistenceHelp": "Unlock a profile to save or load reviews. Each profile can hold up to 8 saved reviews; saved copies can be deleted explicitly. Saved original terms include private payment instructions. Loading checks every document against the current registry again. If a save is interrupted by locking, cancellation or a timeout, unlock and load saved reviews to check whether it committed.",
    "persistenceBusy": "Working with encrypted reviews…",
    "persistenceSaved": "Review saved encrypted in this profile.",
    "persistenceLoaded": "Saved reviews loaded and checked against the current registry.",
    "persistenceFailed": "The review operation did not complete with a confirmed result. A save may have committed even after cancellation, locking or a timeout. Unlock and load saved reviews to check. Existing profile data was retained.",
    "persistenceInvalid": "Saved reviews could not be checked against the current registry. The session list was retained and profile data was not changed.",
    "persistenceQuota": "The browser storage quota was exceeded. Existing profile data was retained. Free storage before retrying.",
    "cancelPersistence": "Cancel review operation",
    "remove": "Remove from session",
    "tradeMissingTitle": "Review not in this session",
    "tradeMissing": "This review is not in the current session. Reviews are kept in memory only and are cleared on reload. A link is not proof of a trade and nothing is replayed from it.",
    "backToOffers": "Back to offers",
    "savedTitle": "Saved in this profile",
    "savedHelp": "Saving stores only the original terms file, encrypted in the open profile (at most 8). Loading checks every saved file again against the registry in this build. Locking clears all reviews from memory. An interrupted save or deletion may have committed; unlock and load before retrying.",
    "savedLocked": "Unlock a profile to save reviews or load saved ones.",
    "loadSaved": "Load saved reviews",
    "saveToProfile": "Save to profile",
    "deleteFromProfile": "Delete from profile",
    "savedBadge": "Saved in profile",
    "savedFailedOther": "The saved-review operation did not complete with a confirmed result. A save or deletion may have committed. Unlock and load saved reviews before retrying.",
    "unreviewableTitle": "Saved files that no longer pass review",
    "testnetLocalProofBanner": {
      "source": "SEPOLIA LOCAL PROOF: this registry uses fixture key {key}… (manifest {sequence}, valid until {expires}). This key is not an owner-approved trust root. Trading, wallet connections, signing and funding stay disabled.",
      "variables": {
        "key": "identifier",
        "sequence": "count",
        "expires": "text"
      }
    },
    "testnetBanner": {
      "source": "SEPOLIA TESTNET: the network registry is signed by the owner's testnet-only key {key}… (manifest {sequence}, valid until {expires}). Test network only: never use real funds. Trading stays disabled in this build.",
      "variables": {
        "key": "identifier",
        "sequence": "count",
        "expires": "text"
      }
    },
    "sessionItem": {
      "source": "Order {orderId} revision {revision}",
      "variables": {
        "orderId": "identifier",
        "revision": "identifier"
      }
    },
    "savedSkipped": {
      "source": "{count} other {count|trade record was|trade records were} not a readable saved review and {count|was|were} left unchanged.",
      "variables": {
        "count": "count"
      }
    },
    "unreviewableItem": {
      "source": "Saved record {record}…",
      "variables": {
        "record": "identifier"
      }
    }
  },
  "tradePageSavedBusy": {
    "save": "Saving to the profile…",
    "load": "Loading saved reviews…",
    "delete": "Deleting from the profile…"
  },
  "tradePageSavedDone": {
    "save": "Saved in the open profile.",
    "load": "Saved reviews loaded and checked again.",
    "delete": "Deleted from the open profile."
  },
  "tradePageSavedFailed": {
    "LOCKED": "The profile is locked. Unlock it and try again.",
    "LIMIT_EXCEEDED": "The profile already holds 8 saved reviews. Delete one first.",
    "NOT_FOUND": "That saved review is no longer in the profile.",
    "CONFLICT": "The profile changed in another tab. Unlock again and retry.",
    "QUOTA_EXCEEDED": "Browser storage is full. Nothing was saved.",
    "REGISTRY_NOT_READY": "Saved reviews cannot be checked because no registry is loaded.",
    "INVALID_SAVED_REVIEW": "Saved reviews could not all be checked against the current registry. No new reviews were loaded; encrypted data was retained.",
    "UNKNOWN_OUTCOME": "The operation was interrupted and may have committed. Unlock and load saved reviews to check.",
    "BUSY": "Another profile operation is running. Try again shortly."
  },
  "tradePageRejected": {
    "TOO_LARGE": "Refused: the file or one of its fields is larger than allowed.",
    "MALFORMED": "Refused: the file is not a valid trade-terms document.",
    "UNSUPPORTED_FORMAT": "Refused: this trade-terms format or version is not supported.",
    "INVALID_TERMS": "Refused: the public terms are not in canonical form.",
    "INVALID_AGREEMENT": "Refused: the private agreement is not valid.",
    "AGREEMENT_MISMATCH": "Refused: the private agreement belongs to a different order or revision.",
    "AGREEMENT_HASH_MISMATCH": "Refused: the private agreement does not match the hash in the public terms.",
    "CAPABILITIES_HASH_MISMATCH": "Refused: the capabilities do not match the hash in the public terms.",
    "UNKNOWN_NETWORK": "Refused: the network is not in the loaded registry.",
    "NOT_EVM_NETWORK": "Refused: the network is not an EVM network.",
    "UNKNOWN_DEPLOYMENT": "Refused: the escrow deployment is not in the loaded registry.",
    "UNSUPPORTED_ASSET": "Refused: the asset is not supported by this escrow deployment.",
    "UNFUNDABLE_WINDOW": "Refused: no chain time could satisfy the funding window for these deadlines.",
    "UNAVAILABLE": "The local hash check is unavailable in this browser. Nothing was stored.",
    "FILE_UNREADABLE": "The file could not be read. Nothing was stored.",
    "REGISTRY_NOT_READY": "Terms cannot be checked because no registry is loaded."
  },
  "diagnostics": {
    "title": "Local diagnostics",
    "help": "Review a limited local record of typed errors. Nothing is uploaded automatically.",
    "privacy": "Events exclude wallet and trade identifiers, addresses, amounts, endpoint details, private content, keys, exact timestamps and raw error messages. The remaining combination may still identify a pattern of use.",
    "unconfigured": "Collection unavailable: this unsigned development shell has no authenticated release context. No events are collected, and diagnostic data from an unavailable release context is discarded. Clearing remains available without unlocking the vault.",
    "retention": "At most 500 events or 1 MiB are retained for seven days. Events from unsupported or unauthenticated release contexts are discarded. This is not a durable audit record.",
    "refresh": "Refresh diagnostics",
    "clear": "Clear local diagnostics",
    "cleared": "Local diagnostics cleared. No vault passphrase was needed.",
    "empty": "No local diagnostic events are available.",
    "select": "Select the events to include",
    "preview": "Preview selected diagnostic export",
    "previewTitle": "Diagnostic export preview",
    "sharing": "These are the final fields and bytes. Download only if you are comfortable sharing this combination. Sharing the file is a separate action outside this app. Support never needs your seed, private key or passphrase.",
    "exactBytes": "Exact export text (UTF-8 JSON)",
    "download": "Download the previewed diagnostics",
    "downloaded": "The previewed file was prepared for your browser. Nothing was uploaded.",
    "event": {
      "source": "Event {index}",
      "variables": {
        "index": "count"
      }
    },
    "byteCount": {
      "source": "{bytes} UTF-8 bytes; no events are included unless you selected them.",
      "variables": {
        "bytes": "count"
      }
    }
  },
  "diagnosticErrors": {
    "RELEASE_UNAVAILABLE": "The authenticated release context is unavailable or expired. Collection and export are blocked; clearing remains available.",
    "STORAGE_UNAVAILABLE": "Local diagnostic storage is unavailable. No successful clear or export is confirmed.",
    "REDACTION_FAILED": "This diagnostic selection could not be exported safely. Refresh the list and select the events again.",
    "REPORT_TOO_LARGE": "The diagnostic selection is too large. Select fewer events."
  },
  "diagnosticWarnings": {
    "DISCARDED_INVALID": "Invalid or unsupported diagnostic entries were discarded.",
    "DISCARDED_EXPIRED": "Expired or future-dated diagnostic entries were discarded.",
    "CAP_REACHED": "The local event limit was reached; older entries may have been discarded."
  },
  "recovery": {
    "title": "Offline transaction recovery references",
    "help": "Inspect the open profile’s stored journal references without connecting a wallet, relay or node. This view makes no writes and cannot retry or clear a transaction.",
    "unverified": "Every entry is an unverified offline reference. A stored label such as finalized does not prove current chain state, receipt, payment or safe resubmission. Reconcile against the original network and escrow using compatible recovery software.",
    "private": "This view and its export contain wallet, trade and transaction identifiers. Keep the file private; these fields can link your activity. No spending key, prepared calldata or signing authorization is exported.",
    "locked": "Unlock the local profile to inspect its recovery references. Locking or changing profile clears this view.",
    "load": "Inspect recovery references",
    "loading": "Reading unverified local references…",
    "refresh": "Restart reference inspection",
    "previous": "Previous reference page",
    "next": "Next reference page",
    "empty": "No supported journal references exist on this page. Unknown or future records are retained in the encrypted profile and backup.",
    "select": "Select references for a private recovery file",
    "consent": "I understand the selected file contains private recovery metadata, remains unverified and cannot authorize a transaction.",
    "preview": "Preview selected private references",
    "previewTitle": "Private recovery-reference preview",
    "exact": "Exact private recovery export (UTF-8 JSON)",
    "previewHelp": "These are the exact selected fields and bytes. Only the current page is exported; the full encrypted backup preserves all records. Sharing is a separate action outside this app.",
    "download": "Download previewed private recovery file",
    "downloaded": "The previewed private file was prepared for your browser. No network request or transaction was made.",
    "storedLabel": "Stored label (unverified)",
    "transaction": "Public chain transaction reference (unverified)",
    "nonce": "Recorded EVM nonce",
    "unknown": "Not recorded",
    "page": {
      "source": "Journal records {start}–{end} of {total}; local snapshot revision {revision}. This is not a chain height.",
      "variables": {
        "start": "count",
        "end": "count",
        "total": "count",
        "revision": "count"
      }
    },
    "unsupported": {
      "source": "{count} {count|record|records} on this page could not be interpreted. Nothing was deleted or rewritten. Keep a complete encrypted backup for compatible recovery software.",
      "variables": {
        "count": "count"
      }
    },
    "reference": {
      "source": "Reference {index}",
      "variables": {
        "index": "count"
      }
    }
  },
  "display": {
    "expired": "Expired",
    "remaining": {
      "source": "{duration} remaining",
      "variables": {
        "duration": "text"
      }
    },
    "day": "d",
    "hour": "h",
    "minute": "min",
    "second": "s"
  },
  "labels": {
    "networkDeployment": "Network / deployment",
    "tradeId": "Trade ID",
    "walletAccount": "Wallet account",
    "intentId": "Intent ID"
  },
  "document": {
    "title": "P2P Off-ramp — local development shell",
    "loading": "Loading the local workspace. If resources are unavailable, reload this same address after restoring the app files. Your encrypted local data is not reset.",
    "noscript": "This workspace needs JavaScript and a supported secure browser. Preserve your encrypted backup and use an independently verified recovery bundle.",
    "policyNotice": "Framing protection is unverified. This development shell is not an authenticated release. Funds remain disabled."
  },
  "samples": {
    "freshNative": "Core native sample (deadlines from now)",
    "frozenNative": "Frozen scenario: native (expired, has capability)",
    "frozenErc20": "Frozen scenario: ERC-20 (expired, has capability)"
  }
} as const;

type Definitions = typeof definitions;
type Group = keyof Definitions;
type Variables<D> = D extends { readonly variables: infer V extends MessageVariables } ? V : Readonly<Record<never, never>>;
type Entries = { readonly [G in Group]: { readonly [K in keyof Definitions[G]]: MessageEntry<Variables<Definitions[G][K]>> } };
type StaticGroup<G extends Group> = { readonly [K in keyof Definitions[G] as Definitions[G][K] extends string ? K : never]: string };
const contexts: Record<Group, string> = {
  privacy: 'Independent local privacy observations; no anonymity, settlement or economic authority',
  help: 'Local accessible control guidance; no private input or authority',
  shell: 'Local profile, recovery and offline application shell', shellErrors: 'Fixed local operation errors and recovery guidance',
  trade: 'Read-only canonical trade terms and seller-withholding disclosure', tradePage: 'Offline trade-terms review and encrypted saved copies',
  tradePageSavedBusy: 'Pending encrypted review operation', tradePageSavedDone: 'Confirmed encrypted review operation',
  tradePageSavedFailed: 'Unconfirmed or refused encrypted review operation', tradePageRejected: 'Fixed rejection reason for a hostile terms file',
  diagnostics: 'Explicit review and download of allowlisted local diagnostics', diagnosticErrors: 'Local diagnostics refusal',
  diagnosticWarnings: 'Discarded or bounded local diagnostic metadata', recovery: 'Unverified private journal reference inspection and export',
  display: 'Display-only deadline duration units', labels: 'Scalar unverified offline recovery fields', document: 'Static document title, loading, scriptless recovery and unauthenticated release notice',
  samples: 'Synthetic built-in trade-terms sample button labels',
};
const docsAnchor = '00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.3_localization/spec-natural-language-localization-tooltips-and-accessibility.md';
const critical = new Set(['shell.createConsent', 'shell.restoreConsent', 'shell.uncheckedHelp', 'shell.backupVerifyScope', 'trade.risk', 'recovery.unverified', 'recovery.private', 'diagnostics.privacy']);
const groups: Record<string, Record<string, MessageEntry>> = Object.create(null), catalog: Record<string, MessageEntry> = Object.create(null);
for (const group of Object.keys(definitions) as Group[]) {
  const entries: Record<string, MessageEntry> = Object.create(null);
  for (const [name, value] of Object.entries(definitions[group])) {
    const key = `${group}.${name}`, dynamic = typeof value === 'string' ? { source: value, variables: {} } : value;
    const severity = critical.has(key) ? 'critical' : /Errors|Warnings|Failed|Rejected/.test(group) || /consent|risk|warning|unverified|uncertain/i.test(name) ? 'warning' : 'information';
    const entry = createMessage({ key, ...dynamic, context: `${contexts[group]}: ${name}`, severity, reviewRequired: true, docsAnchor });
    entries[name] = entry; catalog[key] = entry;
  }
  groups[group] = Object.freeze(entries);
}
const entries = Object.freeze(groups) as Entries;
export const sourceCatalog: Readonly<Record<string, MessageEntry>> = Object.freeze(catalog);
/** No alternate locale is loaded or selected. Draft metadata is not human translation/security approval. */
export const SOURCE_LOCALE = Object.freeze({ locale: 'en', direction: 'ltr', revision: 1, translator: null, reviewer: null, status: 'draft' } as const);
export function english<G extends Group, K extends keyof Definitions[G]>(group: G, key: K, values: MessageValues<Variables<Definitions[G][K]>>): string {
  return formatMessage(entries[group][key] as MessageEntry<Variables<Definitions[G][K]>>, values);
}
/** Compatibility views contain only static strings. Dynamic messages use the typed english() boundary. */
export function englishGroup<G extends Group>(group: G): StaticGroup<G> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(definitions[group])) if (typeof value === 'string') result[key] = english(group, key as keyof Definitions[G], {} as MessageValues<Variables<Definitions[G][keyof Definitions[G]]>>);
  return Object.freeze(result) as StaticGroup<G>;
}
