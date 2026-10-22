# Typed errors and retries

- **Specification ID:** G13
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.4_architecture_planning
- **Module:** module_0.4.5_failure_contract
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define errors and retry policies shared by adapters and UI. Preserve actionable recovery without disclosing secrets.

## Required behavior

1. Use stable codes, retryability, user action, correlation ID, and sanitized diagnostics; separate transport failure from semantic rejection.
2. Retry only idempotent reads and explicitly safe operations with bounded backoff, jitter, and cancellation.
3. Require reconciliation before resubmitting economic transactions and redact payloads from telemetry.

## Dependencies

- [G08: Client state authority](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.4_state_management/spec-client-state-authority.md)

## Acceptance evidence

- Retries are bounded under permanent failure.
- Every public error code maps to a tested visible recovery action.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
