#!/usr/bin/env bash
# Initialize https://github.com/djshellshoxxx/p2p-offramp (Iteration 2).
# Usage: bash scripts/initialize-specifications.sh [repository-directory]
# Preserves existing files. Requires Bash 4+ and standard Unix utilities.
set -euo pipefail
umask 077
ROOT="${1:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)}"
mkdir -p -- "$ROOT"
ROOT="$(cd -- "$ROOT" && pwd -P)"
created=0
preserved=0
catalog=""

write_new() {
    local relative="$1" body="$2" current="$ROOT" part
    local -a parts
    IFS='/' read -r -a parts <<< "$relative"
    for part in "${parts[@]}"; do
        if [[ -z "$part" || "$part" == "." || "$part" == ".." ]]; then
            printf 'Invalid path: %s\n' "$relative" >&2
            exit 1
        fi
        current="$current/$part"
        if [[ -L "$current" ]]; then
            printf 'Refusing symbolic link: %s\n' "$current" >&2
            exit 1
        fi
    done
    mkdir -p -- "${current%/*}"
    if [[ -e "$current" ]]; then
        if [[ ! -f "$current" ]]; then
            printf 'Expected a file: %s\n' "$current" >&2
            exit 1
        fi
        preserved=$((preserved + 1))
        return
    fi
    (set -o noclobber; printf '%s\n' "$body" > "$current")
    created=$((created + 1))
}

while IFS='|' read -r section feature module slug scope detail; do
    [[ -n "$section" ]] || continue
    title="${slug//-/ }"
    title="${title^}"
    relative="$section/$feature/$module/spec-$slug.md"
    body="$(cat <<EOF
# $title

- **Repository:** djshellshoxxx/p2p-offramp
- **Section:** $section
- **Feature:** $feature
- **Module:** $module
- **Status:** Placeholder — awaiting Iteration 3
- **Specification:** spec-$slug.md

## Scope

Define $scope. Specify $detail.

## Iteration 3 Completion Checklist

- Define boundaries, dependencies, and explicit non-goals.
- Specify normative requirements using MUST, SHOULD, and MAY.
- Define applicable schemas, interfaces, errors, and versioning.
- Describe state transitions, invariants, and failure recovery.
- Assess adversaries, trust assumptions, privacy leakage, and mitigations.
- Separate verified cryptographic facts from external assertions.
- Cite authoritative sources and pin evaluated protocol versions.
- Define acceptance criteria, negative tests, and interoperability tests.
- Record unresolved decisions, feasibility limits, and deployment blockers.
EOF
)"
    write_new "$relative" "$body"
    catalog+="- [$title](../../../$relative)"$'\n'
done <<'SPEC_MANIFEST'
00_PLANNING_AND_THREAT_MODELING|feature_0.1_threat_modeling|module_0.1.1_network_adversaries|isp-eavesdropping-mitigation|ISP observation and traffic-correlation capabilities|mitigation requirements and residual metadata exposure
00_PLANNING_AND_THREAT_MODELING|feature_0.1_threat_modeling|module_0.1.1_network_adversaries|node-sniffing-defense|malicious relay and node observation scenarios|eclipse, censorship, and collusion defenses with measurable evaluation criteria
00_PLANNING_AND_THREAT_MODELING|feature_0.1_threat_modeling|module_0.1.2_physical_adversaries|physical-coercion-threat-model|threats from mugging, coercion, and device seizure|protective requirements and limits of software-based physical safety
00_PLANNING_AND_THREAT_MODELING|feature_0.1_threat_modeling|module_0.1.2_physical_adversaries|physical-surveillance-matrix|correlation through cameras, location histories, seized devices, and legally compelled disclosures|data minimization boundaries and exposures that cryptography cannot remove
00_PLANNING_AND_THREAT_MODELING|feature_0.1_threat_modeling|module_0.1.3_blockchain_adversaries|sybil-and-collusion-threat-model|adversaries controlling multiple traders, couriers, or jurors|economic assumptions and coordinated manipulation scenarios
00_PLANNING_AND_THREAT_MODELING|feature_0.1_threat_modeling|module_0.1.3_blockchain_adversaries|transaction-ordering-threat-model|front-running, censorship, reorganization, and replay threats|transaction binding and chain-specific finality assumptions
00_PLANNING_AND_THREAT_MODELING|feature_0.2_crypto_primitives|module_0.2.1_zk_circuits|zktls-circuit-architecture|the boundaries between zkTLS transcript authentication and application proof statements|witness inputs, public claims, provider trust, and circuit feasibility gates
00_PLANNING_AND_THREAT_MODELING|feature_0.2_crypto_primitives|module_0.2.1_zk_circuits|proof-system-selection|evaluation criteria for zkTLS, Semaphore-style membership, and candidate proof systems|setup assumptions, maintenance checks, verification costs, and deployment compatibility
00_PLANNING_AND_THREAT_MODELING|feature_0.2_crypto_primitives|module_0.2.1_zk_circuits|circuit-public-input-contract|canonical public inputs, witnesses, and domain separators|binding to application, chain, action, and protocol version
00_PLANNING_AND_THREAT_MODELING|feature_0.2_crypto_primitives|module_0.2.1_zk_circuits|proof-system-upgrade-policy|circuit identifiers and verification-key provenance|migration gates and retirement of compromised proof versions
00_PLANNING_AND_THREAT_MODELING|feature_0.2_crypto_primitives|module_0.2.2_stealth_key_derivation|stealth-scheme-boundaries|compatibility boundaries between EIP-5564 and independently evaluated Monero-style mechanisms|curve assumptions without treating distinct address systems as interchangeable
00_PLANNING_AND_THREAT_MODELING|feature_0.2_crypto_primitives|module_0.2.2_stealth_key_derivation|key-derivation-domain-separation|separate derivation domains for spending, viewing, messaging, and recovery|entropy requirements and test vectors using established primitives
00_PLANNING_AND_THREAT_MODELING|feature_0.3_system_integration|module_0.3.1_static_deployment|content-addressed-release-manifest|signed manifests for IPFS and optional Arweave static artifacts|content verification and exclusion of private data from permanent artifacts
00_PLANNING_AND_THREAT_MODELING|feature_0.3_system_integration|module_0.3.1_static_deployment|static-release-pipeline|reproducible building, signing, pinning, and deployment|rollback discovery and cache behavior without assuming immutable artifacts can be deleted
00_PLANNING_AND_THREAT_MODELING|feature_0.3_system_integration|module_0.3.2_contract_verification|contract-audit-pipeline|static analysis, fuzzing, dependency checking, and human review gates|artifact provenance and the distinction between automated checks and completed audits
00_PLANNING_AND_THREAT_MODELING|feature_0.3_system_integration|module_0.3.2_contract_verification|formal-verification-properties|conservation, authorization, liveness, and settlement invariants|environmental assumptions and required formal proof coverage
00_PLANNING_AND_THREAT_MODELING|feature_0.4_architecture_planning|module_0.4.1_system_boundaries|system-context-contract|actors, trust boundaries, external dependencies, and authoritative state ownership|cross-section dependencies and experimental capability labels
00_PLANNING_AND_THREAT_MODELING|feature_0.4_architecture_planning|module_0.4.1_system_boundaries|cross-domain-event-envelope|versioned event identifiers and canonical serialization|replay handling and restrictions on shared personal metadata
00_PLANNING_AND_THREAT_MODELING|feature_0.5_delivery_planning|module_0.5.1_implementation_roadmap|implementation-dependency-plan|implementation stages ordered by dependency and feasibility|prototype, test deployment, and production entry and exit criteria
00_PLANNING_AND_THREAT_MODELING|feature_0.5_delivery_planning|module_0.5.1_implementation_roadmap|acceptance-gate-matrix|requirement-to-evidence mappings for acceptance|security, interoperability, accessibility, and operational release blockers
00_PLANNING_AND_THREAT_MODELING|feature_0.6_protocol_governance|module_0.6.1_change_control|protocol-change-process|proposal, review, approval, and protocol versioning rules|decision records and stakeholder participation boundaries
00_PLANNING_AND_THREAT_MODELING|feature_0.6_protocol_governance|module_0.6.1_change_control|administrative-authority-model|upgrade, pause, configuration, and emergency authorities|authorization thresholds, time delays, and unilateral-control limits
00_PLANNING_AND_THREAT_MODELING|feature_0.7_compliance_assessment|module_0.7.1_jurisdiction_matrix|jurisdiction-requirements-matrix|a source-backed matrix of potentially applicable financial, sanctions, consumer, and cash-handling requirements|review ownership and applicability without asserting unresolved legal classifications
00_PLANNING_AND_THREAT_MODELING|feature_0.7_compliance_assessment|module_0.7.1_jurisdiction_matrix|role-classification-matrix|separate assessments for publishers, operators, liquidity providers, arbiters, and couriers|custody, control, compensation, and operational facts needed for jurisdiction-specific review
00_PLANNING_AND_THREAT_MODELING|feature_0.8_data_governance|module_0.8.1_data_lifecycle|data-retention-matrix|collection purposes, retention, access, and disposal for each data class|conflicts among minimization, dispute evidence, and applicable preservation requirements
00_PLANNING_AND_THREAT_MODELING|feature_0.8_data_governance|module_0.8.1_data_lifecycle|privacy-claims-register|testable privacy claims and their assumptions|known linkability and exclusion of unsupported absolute anonymity claims
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.1_escrow_state_machine|state-transitions-and-events|permitted escrow creation, locking, verification, release, timeout, and dispute transitions|authorized actors, events, and balance invariants for each transition
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.1_escrow_state_machine|escrow-contract-interface|escrow identifiers, entry points, and typed errors|authorization and idempotency for externally callable operations
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.1_escrow_state_machine|escrow-timeout-and-refunds|funding, evidence, dispute, and refund deadlines|permissionless timeout execution and mutually exclusive terminal outcomes
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.1_escrow_state_machine|chain-adapter-contract|adapter interfaces for independent EVM and Solana implementations|finality and reorganization handling without assuming atomic cross-chain settlement
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.2_token_handling|erc20-spl-deposit-adapters|a common deposit-adapter interface for ERC-20 and SPL implementations|capability negotiation while preserving chain-specific accounting rules
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.2_token_handling|native-asset-accounting|native-asset deposits, reserves, fees, and withdrawals|conservation checks and failed-recipient-transfer behavior
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.2_token_handling|erc20-token-adapter|allowance, transfer, decimals, and balance-delta handling|explicit policies for fee-on-transfer, rebasing, and callback-enabled assets
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.1_multichain_escrow|module_1.1.2_token_handling|spl-token-adapter|mint, token-account, program-owner, and authority validation|token-extension support and account lifecycle requirements
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.2_zktls_fiat_verification|module_1.2.1_tls_handshake_engine|tlsnotary-wasm-browser-bridge|browser integration boundaries for an evaluated TLSNotary WebAssembly implementation|supported session operations, resource limits, and cancellation semantics
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.2_zktls_fiat_verification|module_1.2.1_tls_handshake_engine|zktls-provider-interface|a provider-neutral interface for TLSNotary and Reclaim adapters|provider-specific trust assumptions without assuming equivalent proof models
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.2_zktls_fiat_verification|module_1.2.1_tls_handshake_engine|wasm-session-lifecycle|session initialization, resource bounds, and disposal|secret handling that excludes bank credentials from logs and relay messages
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.2_zktls_fiat_verification|module_1.2.1_tls_handshake_engine|tls-source-authentication|source identity and session provenance for payment evidence|freshness checks and rejection of unsupported endpoints or TLS configurations
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.2_zktls_fiat_verification|module_1.2.2_bank_receipt_verifier|bank-receipt-witness-schema|private receipt fields and minimal public escrow claims|canonical amount, currency, recipient, reference, and timestamp representations
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.2_zktls_fiat_verification|module_1.2.2_bank_receipt_verifier|bank-receipt-proof-statement|the statement binding authenticated receipt fields to a trade|limitations from reversibility, ambiguous status labels, and unsupported formats
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.2_zktls_fiat_verification|module_1.2.2_bank_receipt_verifier|payment-proof-replay-prevention|payment identifiers and trade-bound replay protection|duplicate rejection without publishing raw account or transaction identifiers
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.3_zk_reputation|module_1.3.1_anonymous_credit_prover|semaphore-identity-commitments|identity commitment generation and group-membership boundaries|credential lifecycle and compatibility with the evaluated Semaphore version
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.3_zk_reputation|module_1.3.1_anonymous_credit_prover|reputation-group-membership|membership eligibility, group updates, and anonymous proof verification|issuer trust and maintenance checks for Semaphore or Sismo-style integrations
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.3_zk_reputation|module_1.3.1_anonymous_credit_prover|reputation-score-statement|threshold claims derived from authenticated trade outcomes|score provenance and limits of group membership alone
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.3_zk_reputation|module_1.3.1_anonymous_credit_prover|reputation-revocation|expiry and revocation of compromised or disqualified credentials|group-update privacy implications and acceptable stale-root windows
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.3_zk_reputation|module_1.3.2_nullifier_engine|nullifier-domain-derivation|nullifier scopes for ratings, trade actions, and reputation|domain separation preventing duplicates without unnecessary cross-context linkability
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.3_zk_reputation|module_1.3.2_nullifier_engine|nullifier-consumption-state|atomic nullifier consumption and duplicate detection|reorganization handling and limits on preventing Sybil identities
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.4_order_discovery|module_1.4.1_encrypted_relay_protocol|encrypted-order-envelope|signed encrypted order payloads with versioning and expiry|public discovery metadata and residual relay visibility
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.4_order_discovery|module_1.4.1_encrypted_relay_protocol|nostr-order-relay-adapter|application events and compatible Nostr operations|event validation and verified NIP references before assigning identifiers
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.4_order_discovery|module_1.4.1_encrypted_relay_protocol|waku-order-relay-adapter|message topics, retrieval, and duplicate suppression|delivery assumptions and metadata exposure of enabled Waku capabilities
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.4_order_discovery|module_1.4.1_encrypted_relay_protocol|order-lifecycle-reconciliation|distributed order creation, amendment, cancellation, expiry, and fills|authoritative ordering and stale or conflicting relay-view resolution
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.5_liquidity_provision|module_1.5.1_market_maker_vaults|liquidity-vault-accounting|optional vault deposits, reservations, withdrawals, and fees|custody implications and protection of committed escrow balances
01_P2P_SHIELDED_OFFRAMP_ENGINE|feature_1.5_liquidity_provision|module_1.5.1_market_maker_vaults|quote-reservation-interface|signed quotes, expiry, inventory reservation, and limits|stale-price defenses and prevention of simultaneous liquidity overcommitment
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.1_fuzzy_geohashing|module_2.1.1_coordinate_obfuscation|500m-radial-blur-algorithm|a configurable coarse-location baseline starting at approximately 500 meters|boundary and population-density behavior without equating radius with anonymity
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.1_fuzzy_geohashing|module_2.1.1_coordinate_obfuscation|fuzzy-geohash-ring-calculation|coarse cells and disclosure regions spanning approximately 500 meters to 2 kilometers|latitude and cell-boundary behavior with explicit precision assumptions
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.1_fuzzy_geohashing|module_2.1.1_coordinate_obfuscation|location-disclosure-budget|update frequency, precision limits, and cumulative disclosure controls|tests for repeated-query averaging and movement reconstruction
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.2_p2p_proximity_pings|module_2.2.1_webrtc_mesh|webrtc-ephemeral-signaling|authenticated ephemeral signaling for matched peers|replay protection and binding to an active trade session
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.2_p2p_proximity_pings|module_2.2.1_webrtc_mesh|ice-candidate-privacy-policy|permitted ICE candidates and relay-only behavior|compatibility limits and prevention of silent direct-address disclosure
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.2_p2p_proximity_pings|module_2.2.1_webrtc_mesh|proximity-channel-lifecycle|establishment, authentication, heartbeat, and teardown|timeouts and recovery when permitted connections cannot be established
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.3_proximity_verification|module_2.3.1_zero_knowledge_distance|distance-proof-statement|a proof that committed coordinates satisfy a distance threshold such as 50 meters|numerical precision without claiming that the proof authenticates physical location
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.3_proximity_verification|module_2.3.1_zero_knowledge_distance|location-input-authenticity|provenance and freshness requirements for coordinate inputs|spoofing, relay, and collusion limits of candidate sensors or attestations
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.3_proximity_verification|module_2.3.1_zero_knowledge_distance|proximity-proof-session-binding|challenge and commitment binding to one trade session|replay rejection and leakage bounds for repeated distance queries
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.4_safe_zone_discovery|module_2.4.1_signed_zone_directory|safe-zone-record-schema|signed location records, facilities, accessibility, and provenance|publisher authentication without treating signatures as safety guarantees
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.4_safe_zone_discovery|module_2.4.1_signed_zone_directory|safe-zone-publication-policy|submission, moderation, expiry, and revocation|defenses against malicious recommendations and outdated information
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.5_meetup_presence_trigger|module_2.5.1_geofence_verification|geofence-trigger-state-machine|entry, dwell, confirmation, and exit states|uncertainty handling without allowing presence alone to authorize cash settlement
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.5_meetup_presence_trigger|module_2.5.1_geofence_verification|geofence-event-contract|privacy-minimized trade-coordination events|authentication and trade binding without raw coordinate histories
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.6_private_map_rendering|module_2.6.1_vector_tile_cache|vector-tile-cache-addressing|tile identifiers, content verification, expiry, and bundle selection|map licensing and attribution requirements
02_SMART_MEETUP_GEOLOCATION_ENGINE|feature_2.6_private_map_rendering|module_2.6.1_vector_tile_cache|map-fetch-privacy-policy|prefetching and gateway policies that reduce viewport disclosure|residual visibility of IPFS peers, gateways, and local caches
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.1_blind_courier_protocol|module_3.1.1_three_party_escrow|courier-handshake-state-machine|buyer, seller, and courier commitments and custody transitions|cancellation, dispute, and settlement rules for incomplete handoffs
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.1_blind_courier_protocol|module_3.1.1_three_party_escrow|courier-role-authorization|role-bound assignment and handoff capabilities|authorization separation preventing role impersonation
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.1_blind_courier_protocol|module_3.1.1_three_party_escrow|courier-compensation-accounting|delivery fees, refundable balances, and compensation allocation|outcomes for partial completion, cancellation, and adjudicated failure
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.2_courier_assignment|module_3.2.1_route_segmentation|courier-leg-assignment-envelope|minimal records for delivery legs and authorized endpoints|field visibility and assignment expiry
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.2_courier_assignment|module_3.2.1_route_segmentation|route-information-access-control|compartmentalized delivery-detail access|metadata and collusion limits without assuming unobservable movement
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.2_courier_assignment|module_3.2.1_route_segmentation|leg-handoff-state-machine|acceptance, arrival, handoff, failure, and reassignment transitions|continuity checks preventing completion after ambiguous custody changes
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.3_container_integrity|module_3.3.1_seed_commitment|container-seed-commitment|seed generation, commitment publication, and challenge verification|entropy and binding without treating seed knowledge as proof of contents
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.3_container_integrity|module_3.3.1_seed_commitment|tamper-evidence-attestation|seal identifiers, inspections, and damage evidence formats|limits when seals, sensors, or observations can be substituted
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.3_container_integrity|module_3.3.1_seed_commitment|container-secret-lifecycle|secret provisioning, restricted access, expiry, and disposal|recovery that preserves the meaning of previously committed evidence
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.4_locker_access|module_3.4.1_smart_locker_adapter|locker-command-interface|authenticated reservation, unlocking, status, and release operations|device identity validation and adapter-specific failure codes
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.4_locker_access|module_3.4.1_smart_locker_adapter|locker-time-window-policy|access windows, clock uncertainty, and credential expiry|offline behavior preventing reuse of stale access credentials
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.4_locker_access|module_3.4.1_smart_locker_adapter|locker-failure-recovery|recovery from power loss, jammed doors, network loss, and sensor conflicts|manual intervention boundaries and dispute-evidence preservation
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.5_courier_collateral|module_3.5.1_staking_vault|courier-stake-accounting|deposits, reservations, unbonding, and withdrawal eligibility|solvency checks across concurrent commitments
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.5_courier_collateral|module_3.5.1_staking_vault|courier-slashing-authorization|evidence and adjudication required for collateral deductions|appeal windows and rejection of unilateral accusations as sufficient grounds
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.6_delivery_confirmation|module_3.6.1_handoff_protocol|delivery-challenge-response|fresh role-bound challenges and signed handoff acknowledgments|replay rejection and the distinction between acknowledgment and proof of cash quantity
03_CASH_IN_TRANSIT_BLIND_COURIERS|feature_3.6_delivery_confirmation|module_3.6.1_handoff_protocol|delivery-receipt-schema|mutually acknowledged custody receipts and evidence commitments|handling of missing, contradictory, or coerced acknowledgments
04_WEB3_DISPUTE_ARBITERS|feature_4.1_juror_selection|module_4.1.1_vrf_drafting|vrf-chainlink-juror-selector|an optional Chainlink VRF adapter for juror selection|chain support and provider evaluation without making provider selection mandatory
04_WEB3_DISPUTE_ARBITERS|feature_4.1_juror_selection|module_4.1.1_vrf_drafting|juror-randomness-interface|randomness requests, fulfillment validation, and draft seeds|withholding and retry behavior preventing selective redrafting
04_WEB3_DISPUTE_ARBITERS|feature_4.1_juror_selection|module_4.1.1_vrf_drafting|anonymous-juror-eligibility|eligibility proofs and conflict-of-interest exclusions|identity-independence assumptions and related-party manipulation limits
04_WEB3_DISPUTE_ARBITERS|feature_4.1_juror_selection|module_4.1.1_vrf_drafting|juror-draft-state-machine|pool snapshots, selection, acceptance, replacement, and panel formation|deadlines and bounds on repeated selection
04_WEB3_DISPUTE_ARBITERS|feature_4.2_juror_incentives|module_4.2.1_voting_stake_accounting|juror-voting-weight|stake snapshots, voting weights, and concentration limits|assumptions concerning borrowed stake, collusion, and wealthy participants
04_WEB3_DISPUTE_ARBITERS|feature_4.2_juror_incentives|module_4.2.1_voting_stake_accounting|juror-fee-distribution|fee accrual and payouts for completed rounds|deterministic accounting without equating majority agreement with factual correctness
04_WEB3_DISPUTE_ARBITERS|feature_4.3_evidence_access|module_4.3.1_chat_key_escrow|chat-evidence-commitment-format|authenticated transcript commitments bound to a trade|completeness and context limits of selective disclosure
04_WEB3_DISPUTE_ARBITERS|feature_4.3_evidence_access|module_4.3.1_chat_key_escrow|chat-key-release-policy|scoped evidence-key custody and threshold access authorization|expiry and minimization without claiming disclosed plaintext can be revoked
04_WEB3_DISPUTE_ARBITERS|feature_4.3_evidence_access|module_4.3.1_chat_key_escrow|selective-chat-proof-statement|narrow claims about authenticated chat evidence|circuit feasibility and the distinction between proofs and encrypted storage
04_WEB3_DISPUTE_ARBITERS|feature_4.4_fiat_evidence_assessment|module_4.4.1_arbiter_payment_verifier|arbiter-payment-evidence-interface|juror access to the shared receipt verification interface|accepted proof versions and consistent settlement and arbitration rules
04_WEB3_DISPUTE_ARBITERS|feature_4.4_fiat_evidence_assessment|module_4.4.1_arbiter_payment_verifier|conflicting-payment-evidence-policy|assessment of pending, reversed, duplicate, or contradictory evidence|conditions requiring human judgment rather than automatic settlement
04_WEB3_DISPUTE_ARBITERS|feature_4.5_jury_decision|module_4.5.1_commit_reveal_voting|jury-vote-commitment|commitments bound to dispute, round, juror credential, and fresh secret|canonical encoding and copied-commitment resistance
04_WEB3_DISPUTE_ARBITERS|feature_4.5_jury_decision|module_4.5.1_commit_reveal_voting|jury-reveal-and-tally|reveal windows, quorum, abstentions, and tally outcomes|non-reveal behavior without assuming commit-reveal prevents bribery
04_WEB3_DISPUTE_ARBITERS|feature_4.5_jury_decision|module_4.5.1_commit_reveal_voting|jury-decision-certificate|authenticated decisions accepted by settlement contracts|the relationship among on-chain tallies, threshold signatures, and multisignature execution
04_WEB3_DISPUTE_ARBITERS|feature_4.6_dispute_settlement|module_4.6.1_escrow_enforcement|adjudicated-release-interface|settlement operations accepting final authorized dispute outcomes|replay protection and balance-bounded execution
04_WEB3_DISPUTE_ARBITERS|feature_4.6_dispute_settlement|module_4.6.1_escrow_enforcement|penalty-execution-accounting|penalty allocation and deduction ordering|bounded liability and insufficient-collateral outcomes
04_WEB3_DISPUTE_ARBITERS|feature_4.6_dispute_settlement|module_4.6.1_escrow_enforcement|appeal-and-finality-state-machine|appeal eligibility, rounds, deadlines, and final authorization|liveness limits preventing indefinite fund immobilization
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.1_network_privacy|module_5.1.1_tor_i2p_routing|wasm-tor-client-wrapper|a feasibility-gated interface for browser privacy routing|browser networking limits and alternatives such as compatible browsers or native companions
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.1_network_privacy|module_5.1.1_tor_i2p_routing|browser-routing-feasibility|supported browser, companion, and trusted-gateway integration models|network constraints without assuming page JavaScript transparently routes arbitrary traffic through Tor or I2P
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.1_network_privacy|module_5.1.1_tor_i2p_routing|private-transport-interface|connection, health, cancellation, and error semantics|authenticated configuration and distinctions between end-to-end routing and gateway protection
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.1_network_privacy|module_5.1.1_tor_i2p_routing|routing-failure-policy|fail-closed behavior for unavailable selected transports|visible recovery choices and prohibition of silent privacy downgrades
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.2_financial_privacy|module_5.2.1_stealth_addresses|stealth-address-generation|sender derivation and recipient discovery for an explicitly supported EIP-5564 scheme|key-input validation and interoperable test vectors
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.2_financial_privacy|module_5.2.1_stealth_addresses|eip5564-announcement-scanner|event scanning, view-tag filtering, checkpoints, and reorganization recovery|provider metadata exposure and malformed-announcement handling
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.2_financial_privacy|module_5.2.1_stealth_addresses|stealth-payment-spending|spend authorization and transaction construction for discovered payments|gas-funding and consolidation linkability not resolved by stealth generation alone
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.3_encrypted_messaging|module_5.3.1_message_adapters|application-message-envelope|authenticated messages bound to participants, trades, and versions|sequence, expiry, and replay fields independent of messaging providers
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.3_encrypted_messaging|module_5.3.1_message_adapters|nip44-messaging-adapter|evaluated NIP-44 encryption and compatible Nostr event handling|key handling and inherited metadata exposure without assuming forward secrecy
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.3_encrypted_messaging|module_5.3.1_message_adapters|xmtp-messaging-adapter|supported identity, conversation, and delivery operations|recovery and privacy properties of the evaluated XMTP version
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.4_shielded_transfers|module_5.4.1_shielded_pool_adapter|shielded-pool-capability-interface|adapter capabilities for independently evaluated shielded protocols|chain support, trust assumptions, audit requirements, and asset boundaries
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.4_shielded_transfers|module_5.4.1_shielded_pool_adapter|shielded-transfer-recovery|tracking and recovery of interrupted shielded transfers|note and credential handling that excludes private material from telemetry
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.5_collaborative_transactions|module_5.5.1_coinjoin_adapter|coinjoin-capability-interface|optional adapters for compatible UTXO collaborative transactions|transaction-model and privacy differences from account-based shielded pools
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.5_collaborative_transactions|module_5.5.1_coinjoin_adapter|coinjoin-session-failure-policy|cancellation, coordinator unavailability, and wallet-state recovery|custody boundaries and independent evaluation of supported protocols
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.6_duress_response|module_5.6.1_duress_pin|duress-authentication-state-machine|normal, locked, and enrolled duress client states|rate limits and limits of resistance to coercion or forensic inspection
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.6_duress_response|module_5.6.1_duress_pin|duress-action-policy|bounded user-configured responses to a duress signal|accidental-trigger safeguards and observable client-state differences
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.7_local_data_isolation|module_5.7.1_decoy_storage|encrypted-storage-compartments|isolated encrypted profile storage and key-access boundaries|browser persistence and backup confidentiality limits
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.7_local_data_isolation|module_5.7.1_decoy_storage|decoy-profile-data-model|a separate optional profile containing user-configured decoy data|consistency requirements without promising forensic indistinguishability
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.7_local_data_isolation|module_5.7.1_decoy_storage|local-storage-lifecycle|locking, migration, export, and deletion behavior|secure-deletion limits in browsers, backups, and flash storage
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.8_emergency_recovery|module_5.8.1_timelocked_sweep|emergency-sweep-authorization|preauthorized destinations and scoped transfer authority|destination-substitution and malicious-trigger protections
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.8_emergency_recovery|module_5.8.1_timelocked_sweep|emergency-sweep-timelock|scheduling, cancellation, maturation, and execution states|contract or client enforcement and corresponding availability assumptions
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.8_emergency_recovery|module_5.8.1_timelocked_sweep|emergency-sweep-execution|transaction preparation, fee bounds, and completion tracking|unsupported-asset handling and protection of active escrow commitments
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.9_security_configuration|module_5.9.1_feature_policy_engine|feature-policy-schema|required, optional, unsupported, and conflicting capabilities|validation that preserves mandatory custody and authorization invariants
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.9_security_configuration|module_5.9.1_feature_policy_engine|capability-negotiation-contract|negotiation of compatible trade capabilities and security requirements|downgrade resistance and rejection of incompatible mandatory policies
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.10_security_modes|module_5.10.1_mode_orchestrator|security-mode-matrix|named configurations with explicit capability requirements|measurable guarantees without labeling any mode absolutely anonymous
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.10_security_modes|module_5.10.1_mode_orchestrator|security-mode-transition-state-machine|activation, validation, degradation, and deactivation states|active-trade behavior when required capabilities disappear
05_ADVANCED_PRIVACY_INFRASTRUCTURE|feature_5.10_security_modes|module_5.10.1_mode_orchestrator|cross-feature-privacy-validation|consistency checks across routing, WebRTC, maps, messaging, storage, and payment adapters|rejection of combinations undermining requested privacy properties
SPEC_MANIFEST

MASTER="00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.2_specification_catalog/spec-master-specification-index.md"
body="$(cat <<EOF
# Master Specification Index

- **Repository:** https://github.com/djshellshoxxx/p2p-offramp
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.4_architecture_planning
- **Module:** module_0.4.2_specification_catalog
- **Status:** Iteration 2 scaffold; technical specifications await Iteration 3

## Scope

Define the navigation catalog for all planned specification placeholders. Identify completion requirements and distinguish planned capabilities from implemented or validated behavior.

## Structure

Every specification follows Section / Feature / Module / Specification.
The initialization utility resides separately in scripts/initialize-specifications.sh.
Numbered feature and module names match the supplied Iteration 2 example paths.
Additional capabilities retain the complete Iteration 1 scope while separating single-responsibility features.

## Generation and Preservation

Run bash scripts/initialize-specifications.sh from a checkout to initialize missing files.
Existing specifications and this index are preserved, so future catalog changes require explicit review.
The script contains the complete embedded manifest and needs no downloads.

## Iteration 3

Expand each selected path into a developer-ready specification with normative requirements, interfaces, state transitions, security assessment, acceptance evidence, and unresolved decisions.
Verify protocol documentation and compatibility against authoritative sources at expansion time.
Placeholders do not establish feasibility, legal classification, implementation, or security guarantees.

## Suggested Completion Order

1. System boundaries, threat models, cryptographic assumptions, and jurisdiction assessments.
2. Shared schemas, keys, escrow invariants, and chain-specific accounting.
3. Order discovery, payment evidence, messaging, and reputation.
4. Meetup, courier, locker, and physical-evidence components.
5. Jury selection, evidence access, appeals, and settlement.
6. Cross-feature configuration, acceptance gates, and release verification.

## Important Design Boundaries

Location proofs alone do not authenticate physical location.
Receipt proofs alone do not guarantee irreversible settlement.
Container secrets do not establish cash contents.
Browser Tor integration requires feasibility validation.
Chainlink, TLSNotary, Reclaim, Semaphore, Sismo, and messaging providers remain candidates pending evaluation.
A provider-specific filename establishes a specification topic, not an implemented integration.

## Specification Catalog

$catalog
EOF
)"
write_new "$MASTER" "$body"
printf 'Scaffold ready: %s\nCreated: %d; preserved: %d\nMaster index: %s\n' "$ROOT" "$created" "$preserved" "$MASTER"

