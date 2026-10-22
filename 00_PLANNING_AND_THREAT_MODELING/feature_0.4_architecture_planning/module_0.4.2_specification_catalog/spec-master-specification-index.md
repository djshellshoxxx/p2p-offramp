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

- [Isp eavesdropping mitigation](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.1_threat_modeling/module_0.1.1_network_adversaries/spec-isp-eavesdropping-mitigation.md)
- [Node sniffing defense](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.1_threat_modeling/module_0.1.1_network_adversaries/spec-node-sniffing-defense.md)
- [Physical coercion threat model](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.1_threat_modeling/module_0.1.2_physical_adversaries/spec-physical-coercion-threat-model.md)
- [Physical surveillance matrix](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.1_threat_modeling/module_0.1.2_physical_adversaries/spec-physical-surveillance-matrix.md)
- [Sybil and collusion threat model](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.1_threat_modeling/module_0.1.3_blockchain_adversaries/spec-sybil-and-collusion-threat-model.md)
- [Transaction ordering threat model](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.1_threat_modeling/module_0.1.3_blockchain_adversaries/spec-transaction-ordering-threat-model.md)
- [Zktls circuit architecture](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.1_zk_circuits/spec-zktls-circuit-architecture.md)
- [Proof system selection](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.1_zk_circuits/spec-proof-system-selection.md)
- [Circuit public input contract](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.1_zk_circuits/spec-circuit-public-input-contract.md)
- [Proof system upgrade policy](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.1_zk_circuits/spec-proof-system-upgrade-policy.md)
- [Stealth scheme boundaries](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.2_stealth_key_derivation/spec-stealth-scheme-boundaries.md)
- [Key derivation domain separation](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.2_stealth_key_derivation/spec-key-derivation-domain-separation.md)
- [Content addressed release manifest](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.1_static_deployment/spec-content-addressed-release-manifest.md)
- [Static release pipeline](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.1_static_deployment/spec-static-release-pipeline.md)
- [Contract audit pipeline](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.2_contract_verification/spec-contract-audit-pipeline.md)
- [Formal verification properties](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.2_contract_verification/spec-formal-verification-properties.md)
- [System context contract](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md)
- [Cross domain event envelope](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-cross-domain-event-envelope.md)
- [Implementation dependency plan](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.5_delivery_planning/module_0.5.1_implementation_roadmap/spec-implementation-dependency-plan.md)
- [Acceptance gate matrix](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.5_delivery_planning/module_0.5.1_implementation_roadmap/spec-acceptance-gate-matrix.md)
- [Protocol change process](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.6_protocol_governance/module_0.6.1_change_control/spec-protocol-change-process.md)
- [Administrative authority model](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.6_protocol_governance/module_0.6.1_change_control/spec-administrative-authority-model.md)
- [Jurisdiction requirements matrix](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.7_compliance_assessment/module_0.7.1_jurisdiction_matrix/spec-jurisdiction-requirements-matrix.md)
- [Role classification matrix](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.7_compliance_assessment/module_0.7.1_jurisdiction_matrix/spec-role-classification-matrix.md)
- [Data retention matrix](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.8_data_governance/module_0.8.1_data_lifecycle/spec-data-retention-matrix.md)
- [Privacy claims register](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.8_data_governance/module_0.8.1_data_lifecycle/spec-privacy-claims-register.md)
- [State transitions and events](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-state-transitions-and-events.md)
- [Escrow contract interface](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-escrow-contract-interface.md)
- [Escrow timeout and refunds](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-escrow-timeout-and-refunds.md)
- [Chain adapter contract](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-chain-adapter-contract.md)
- [Erc20 spl deposit adapters](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-erc20-spl-deposit-adapters.md)
- [Native asset accounting](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-native-asset-accounting.md)
- [Erc20 token adapter](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-erc20-token-adapter.md)
- [Spl token adapter](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-spl-token-adapter.md)
- [Tlsnotary wasm browser bridge](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.1_tls_handshake_engine/spec-tlsnotary-wasm-browser-bridge.md)
- [Zktls provider interface](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.1_tls_handshake_engine/spec-zktls-provider-interface.md)
- [Wasm session lifecycle](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.1_tls_handshake_engine/spec-wasm-session-lifecycle.md)
- [Tls source authentication](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.1_tls_handshake_engine/spec-tls-source-authentication.md)
- [Bank receipt witness schema](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.2_bank_receipt_verifier/spec-bank-receipt-witness-schema.md)
- [Bank receipt proof statement](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.2_bank_receipt_verifier/spec-bank-receipt-proof-statement.md)
- [Payment proof replay prevention](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.2_bank_receipt_verifier/spec-payment-proof-replay-prevention.md)
- [Semaphore identity commitments](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.3_zk_reputation/module_1.3.1_anonymous_credit_prover/spec-semaphore-identity-commitments.md)
- [Reputation group membership](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.3_zk_reputation/module_1.3.1_anonymous_credit_prover/spec-reputation-group-membership.md)
- [Reputation score statement](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.3_zk_reputation/module_1.3.1_anonymous_credit_prover/spec-reputation-score-statement.md)
- [Reputation revocation](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.3_zk_reputation/module_1.3.1_anonymous_credit_prover/spec-reputation-revocation.md)
- [Nullifier domain derivation](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.3_zk_reputation/module_1.3.2_nullifier_engine/spec-nullifier-domain-derivation.md)
- [Nullifier consumption state](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.3_zk_reputation/module_1.3.2_nullifier_engine/spec-nullifier-consumption-state.md)
- [Encrypted order envelope](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.1_encrypted_relay_protocol/spec-encrypted-order-envelope.md)
- [Nostr order relay adapter](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.1_encrypted_relay_protocol/spec-nostr-order-relay-adapter.md)
- [Waku order relay adapter](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.1_encrypted_relay_protocol/spec-waku-order-relay-adapter.md)
- [Order lifecycle reconciliation](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.1_encrypted_relay_protocol/spec-order-lifecycle-reconciliation.md)
- [Liquidity vault accounting](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.5_liquidity_provision/module_1.5.1_market_maker_vaults/spec-liquidity-vault-accounting.md)
- [Quote reservation interface](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.5_liquidity_provision/module_1.5.1_market_maker_vaults/spec-quote-reservation-interface.md)
- [500m radial blur algorithm](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.1_fuzzy_geohashing/module_2.1.1_coordinate_obfuscation/spec-500m-radial-blur-algorithm.md)
- [Fuzzy geohash ring calculation](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.1_fuzzy_geohashing/module_2.1.1_coordinate_obfuscation/spec-fuzzy-geohash-ring-calculation.md)
- [Location disclosure budget](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.1_fuzzy_geohashing/module_2.1.1_coordinate_obfuscation/spec-location-disclosure-budget.md)
- [Webrtc ephemeral signaling](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.2_p2p_proximity_pings/module_2.2.1_webrtc_mesh/spec-webrtc-ephemeral-signaling.md)
- [Ice candidate privacy policy](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.2_p2p_proximity_pings/module_2.2.1_webrtc_mesh/spec-ice-candidate-privacy-policy.md)
- [Proximity channel lifecycle](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.2_p2p_proximity_pings/module_2.2.1_webrtc_mesh/spec-proximity-channel-lifecycle.md)
- [Distance proof statement](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.3_proximity_verification/module_2.3.1_zero_knowledge_distance/spec-distance-proof-statement.md)
- [Location input authenticity](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.3_proximity_verification/module_2.3.1_zero_knowledge_distance/spec-location-input-authenticity.md)
- [Proximity proof session binding](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.3_proximity_verification/module_2.3.1_zero_knowledge_distance/spec-proximity-proof-session-binding.md)
- [Safe zone record schema](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.4_safe_zone_discovery/module_2.4.1_signed_zone_directory/spec-safe-zone-record-schema.md)
- [Safe zone publication policy](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.4_safe_zone_discovery/module_2.4.1_signed_zone_directory/spec-safe-zone-publication-policy.md)
- [Geofence trigger state machine](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.5_meetup_presence_trigger/module_2.5.1_geofence_verification/spec-geofence-trigger-state-machine.md)
- [Geofence event contract](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.5_meetup_presence_trigger/module_2.5.1_geofence_verification/spec-geofence-event-contract.md)
- [Vector tile cache addressing](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.6_private_map_rendering/module_2.6.1_vector_tile_cache/spec-vector-tile-cache-addressing.md)
- [Map fetch privacy policy](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.6_private_map_rendering/module_2.6.1_vector_tile_cache/spec-map-fetch-privacy-policy.md)
- [Courier handshake state machine](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.1_blind_courier_protocol/module_3.1.1_three_party_escrow/spec-courier-handshake-state-machine.md)
- [Courier role authorization](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.1_blind_courier_protocol/module_3.1.1_three_party_escrow/spec-courier-role-authorization.md)
- [Courier compensation accounting](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.1_blind_courier_protocol/module_3.1.1_three_party_escrow/spec-courier-compensation-accounting.md)
- [Courier leg assignment envelope](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.2_courier_assignment/module_3.2.1_route_segmentation/spec-courier-leg-assignment-envelope.md)
- [Route information access control](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.2_courier_assignment/module_3.2.1_route_segmentation/spec-route-information-access-control.md)
- [Leg handoff state machine](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.2_courier_assignment/module_3.2.1_route_segmentation/spec-leg-handoff-state-machine.md)
- [Container seed commitment](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.3_container_integrity/module_3.3.1_seed_commitment/spec-container-seed-commitment.md)
- [Tamper evidence attestation](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.3_container_integrity/module_3.3.1_seed_commitment/spec-tamper-evidence-attestation.md)
- [Container secret lifecycle](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.3_container_integrity/module_3.3.1_seed_commitment/spec-container-secret-lifecycle.md)
- [Locker command interface](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.4_locker_access/module_3.4.1_smart_locker_adapter/spec-locker-command-interface.md)
- [Locker time window policy](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.4_locker_access/module_3.4.1_smart_locker_adapter/spec-locker-time-window-policy.md)
- [Locker failure recovery](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.4_locker_access/module_3.4.1_smart_locker_adapter/spec-locker-failure-recovery.md)
- [Courier stake accounting](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.5_courier_collateral/module_3.5.1_staking_vault/spec-courier-stake-accounting.md)
- [Courier slashing authorization](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.5_courier_collateral/module_3.5.1_staking_vault/spec-courier-slashing-authorization.md)
- [Delivery challenge response](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.6_delivery_confirmation/module_3.6.1_handoff_protocol/spec-delivery-challenge-response.md)
- [Delivery receipt schema](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.6_delivery_confirmation/module_3.6.1_handoff_protocol/spec-delivery-receipt-schema.md)
- [Vrf chainlink juror selector](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.1_juror_selection/module_4.1.1_vrf_drafting/spec-vrf-chainlink-juror-selector.md)
- [Juror randomness interface](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.1_juror_selection/module_4.1.1_vrf_drafting/spec-juror-randomness-interface.md)
- [Anonymous juror eligibility](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.1_juror_selection/module_4.1.1_vrf_drafting/spec-anonymous-juror-eligibility.md)
- [Juror draft state machine](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.1_juror_selection/module_4.1.1_vrf_drafting/spec-juror-draft-state-machine.md)
- [Juror voting weight](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.2_juror_incentives/module_4.2.1_voting_stake_accounting/spec-juror-voting-weight.md)
- [Juror fee distribution](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.2_juror_incentives/module_4.2.1_voting_stake_accounting/spec-juror-fee-distribution.md)
- [Chat evidence commitment format](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.3_evidence_access/module_4.3.1_chat_key_escrow/spec-chat-evidence-commitment-format.md)
- [Chat key release policy](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.3_evidence_access/module_4.3.1_chat_key_escrow/spec-chat-key-release-policy.md)
- [Selective chat proof statement](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.3_evidence_access/module_4.3.1_chat_key_escrow/spec-selective-chat-proof-statement.md)
- [Arbiter payment evidence interface](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.4_fiat_evidence_assessment/module_4.4.1_arbiter_payment_verifier/spec-arbiter-payment-evidence-interface.md)
- [Conflicting payment evidence policy](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.4_fiat_evidence_assessment/module_4.4.1_arbiter_payment_verifier/spec-conflicting-payment-evidence-policy.md)
- [Jury vote commitment](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.5_jury_decision/module_4.5.1_commit_reveal_voting/spec-jury-vote-commitment.md)
- [Jury reveal and tally](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.5_jury_decision/module_4.5.1_commit_reveal_voting/spec-jury-reveal-and-tally.md)
- [Jury decision certificate](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.5_jury_decision/module_4.5.1_commit_reveal_voting/spec-jury-decision-certificate.md)
- [Adjudicated release interface](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.6_dispute_settlement/module_4.6.1_escrow_enforcement/spec-adjudicated-release-interface.md)
- [Penalty execution accounting](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.6_dispute_settlement/module_4.6.1_escrow_enforcement/spec-penalty-execution-accounting.md)
- [Appeal and finality state machine](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.6_dispute_settlement/module_4.6.1_escrow_enforcement/spec-appeal-and-finality-state-machine.md)
- [Wasm tor client wrapper](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.1_tor_i2p_routing/spec-wasm-tor-client-wrapper.md)
- [Browser routing feasibility](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.1_tor_i2p_routing/spec-browser-routing-feasibility.md)
- [Private transport interface](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.1_tor_i2p_routing/spec-private-transport-interface.md)
- [Routing failure policy](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.1_tor_i2p_routing/spec-routing-failure-policy.md)
- [Stealth address generation](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.2_financial_privacy/module_5.2.1_stealth_addresses/spec-stealth-address-generation.md)
- [Eip5564 announcement scanner](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.2_financial_privacy/module_5.2.1_stealth_addresses/spec-eip5564-announcement-scanner.md)
- [Stealth payment spending](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.2_financial_privacy/module_5.2.1_stealth_addresses/spec-stealth-payment-spending.md)
- [Application message envelope](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_encrypted_messaging/module_5.3.1_message_adapters/spec-application-message-envelope.md)
- [Nip44 messaging adapter](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_encrypted_messaging/module_5.3.1_message_adapters/spec-nip44-messaging-adapter.md)
- [Xmtp messaging adapter](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_encrypted_messaging/module_5.3.1_message_adapters/spec-xmtp-messaging-adapter.md)
- [Shielded pool capability interface](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.4_shielded_transfers/module_5.4.1_shielded_pool_adapter/spec-shielded-pool-capability-interface.md)
- [Shielded transfer recovery](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.4_shielded_transfers/module_5.4.1_shielded_pool_adapter/spec-shielded-transfer-recovery.md)
- [Coinjoin capability interface](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.5_collaborative_transactions/module_5.5.1_coinjoin_adapter/spec-coinjoin-capability-interface.md)
- [Coinjoin session failure policy](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.5_collaborative_transactions/module_5.5.1_coinjoin_adapter/spec-coinjoin-session-failure-policy.md)
- [Duress authentication state machine](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.6_duress_response/module_5.6.1_duress_pin/spec-duress-authentication-state-machine.md)
- [Duress action policy](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.6_duress_response/module_5.6.1_duress_pin/spec-duress-action-policy.md)
- [Encrypted storage compartments](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.1_decoy_storage/spec-encrypted-storage-compartments.md)
- [Decoy profile data model](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.1_decoy_storage/spec-decoy-profile-data-model.md)
- [Local storage lifecycle](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.1_decoy_storage/spec-local-storage-lifecycle.md)
- [Emergency sweep authorization](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.8_emergency_recovery/module_5.8.1_timelocked_sweep/spec-emergency-sweep-authorization.md)
- [Emergency sweep timelock](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.8_emergency_recovery/module_5.8.1_timelocked_sweep/spec-emergency-sweep-timelock.md)
- [Emergency sweep execution](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.8_emergency_recovery/module_5.8.1_timelocked_sweep/spec-emergency-sweep-execution.md)
- [Feature policy schema](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.9_security_configuration/module_5.9.1_feature_policy_engine/spec-feature-policy-schema.md)
- [Capability negotiation contract](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.9_security_configuration/module_5.9.1_feature_policy_engine/spec-capability-negotiation-contract.md)
- [Security mode matrix](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.10_security_modes/module_5.10.1_mode_orchestrator/spec-security-mode-matrix.md)
- [Security mode transition state machine](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.10_security_modes/module_5.10.1_mode_orchestrator/spec-security-mode-transition-state-machine.md)
- [Cross feature privacy validation](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.10_security_modes/module_5.10.1_mode_orchestrator/spec-cross-feature-privacy-validation.md)
