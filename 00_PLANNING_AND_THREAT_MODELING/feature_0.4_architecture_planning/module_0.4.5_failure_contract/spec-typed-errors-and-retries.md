# Typed errors and bounded retries

## 1. Metadata

- **Specification ID:** G13
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Give callers stable recovery behavior without leaking raw provider errors or repeating uncertain economic actions. Distinguish locally rejected preparation, read failure and possible broadcast. Existing G02 Result/VaultError shapes remain compatible and are normalized at the application boundary.

## 3. Architecture and data contracts

```typescript
type RecoveryAction = "none" | "edit-input" | "unlock" | "reconnect" |
  "reload" | "reconcile" | "export" | "change-provider";
type CoreErrorCode = "INVALID_INPUT" | "UNSUPPORTED_VERSION" | "UNSUPPORTED_PROVIDER" |
  "WRONG_CHAIN" | "UNAUTHORIZED" | "USER_REJECTED" | "LOCKED" | "CONFLICT" |
  "UNAVAILABLE" | "TIMEOUT" | "CANCELLED" | "LIMIT_EXCEEDED" |
  "INTEGRITY_FAILURE" | "BROADCAST_UNKNOWN" | "EXPIRED";
interface CoreError {
  code: CoreErrorCode;
  retryable: boolean;
  action: RecoveryAction;
  correlationId: string; // 16 random bytes as lowercase hex, one local operation only
  messageKey: string; // fixed translation catalog key, no interpolation of secrets
}
type CoreResult<T> = { ok: true; value: T } | { ok: false; error: CoreError };
```

Adapters expose CoreResult and translate foreign thrown exceptions into these fixed errors. G02 retains its documented Result and maps at the coordinator. Telemetry is off by default; correlation IDs are not global/device/session identities and are never appended to external protocol messages.

## 4. Retry algorithm and classification

Only policy-authorized idempotent reads are eligible for automatic retry. Use at most three total attempts, each with a 10-second timeout, with full-jitter delays uniformly chosen in [0,500] ms then [0,1000] ms; the overall operation budget is 35 seconds including delays. Cancellation and G05 generation invalidation stop new attempts immediately. Resource caps remain those of the requested adapter; read retry never enlarges buffers or resets overall deadlines.

`INVALID_INPUT`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_PROVIDER`, `WRONG_CHAIN`, `UNAUTHORIZED`, `USER_REJECTED`, `LOCKED`, `CONFLICT`, `INTEGRITY_FAILURE`, `EXPIRED` are not automatically retried. `TIMEOUT`/`UNAVAILABLE` are retryable only for reads. `CANCELLED` is never retried. A publish, wallet signing request, transaction submission, token approval, release or refund has zero automatic resubmission attempts. `BROADCAST_UNKNOWN` always maps to reconcile, never retry. Relay publication retry requires its separately specified native event-ID idempotency policy; it is not assumed safe by this generic wrapper.

A provider HTTP 429/503 may inform a longer user-visible wait but cannot override the 35-second budget. Parse Retry-After only as bounded provider data; no sleep after cancellation. Uncertain outcomes survive app restart in G12.

## 5. Interfaces and recovery mapping

```typescript
interface ReadRetryOptions { signal: AbortSignal; operationId: string; }
function retryRead<T>(operation: (signal: AbortSignal) => Promise<CoreResult<T>>,
  options: ReadRetryOptions): Promise<CoreResult<T>>;
```

Inject clocks/randomness for tests only. Each timed-out attempt aborts and awaits its wrapper completion before another starts; adapters that cannot cancel must have stale outputs discarded and bounded concurrency. Errors map as follows: bad input -> edit-input; locked -> unlock; wrong chain/provider -> reconnect/change-provider; conflict -> reload; integrity failure -> change-provider and no automatic retry; uncertain broadcast -> reconcile; unsupported format -> export/recovery; cancelled/user rejected -> none. No exception message or stack goes into public errors. Unknown provider errors before any send become UNAVAILABLE; any failure after a send-capable call begins is classified conservatively through G12 rather than presumed unsent.

## 6. Threat assessment

Raw JSON-RPC and wallet exceptions can contain signed requests, addresses, URLs with credentials and user text. Normalize and discard them at boundaries; debug mode cannot turn on secret-bearing logs in release builds. Retry storms amplify outages and linkability, so enforce attempt/deadline limits and no parallel retries. False-negative submission errors can duplicate deposits or expose unnecessary allowances; reconcile instead. A fixed message code is not proof of the server's honesty.

## 7. Verification and references

Use fake clocks and deterministic jitter to assert exactly three attempts at most, 35-second deadline, abort before/during/backoff, no overlap, and no retry for all nonretryable codes. Test provider 429 with negative/huge/malformed Retry-After, callbacks arriving after timeout, and network generation changes. For every wallet/economic operation assert one invocation even on error; assert BROADCAST_UNKNOWN retains durable journal references. Secret fixtures in arbitrary nested errors must not appear in UI/log output. Sources: [DOM AbortSignal](https://dom.spec.whatwg.org/#abortsignal), [EIP-1193 errors](https://eips.ethereum.org/EIPS/eip-1193).
