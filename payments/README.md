# Payments prototype

**Not production-ready. Do not accept real customer funds.** This is a distinct custodial wallet/ledger prototype, not the existing non-custodial off-ramp.

## Local database

Use PostgreSQL 16 or later in an isolated development database. Apply migrations in order:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_ledger.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/002_reconciliation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/003_hold_guards.sql
```

Use a separate migration-owner role and a restricted runtime role. The application role must not have UPDATE/DELETE permissions on journal or entry tables. Run `npm install` and `npm run typecheck` after checking out the repository. Database-backed integration tests, hold capture, idempotent webhook processing, API endpoints and deployment automation remain pending.

## Accounting semantics

Liability wallet balances increase by credits and decrease by debits. A transfer debits the sender liability and credits the recipient liability. Active holds reduce available funds without moving posted funds. A capture operation must atomically mark the hold captured and post the corresponding debit/credit journal in one database transaction; it is not implemented yet. Reversals require compensating journals. Reconcile using `ledger_reconciliation_exceptions`, then independently reconcile aggregate customer liabilities against settlement-bank assets.

## Important current limitations

The schema's journal constraints validate balanced single-currency postings, but no business-operation-specific journal posting permissions are yet enforced. No database-backed concurrency tests have run. The hold release API does not emit an outbox event. There is no auth service; actor IDs are currently passed by trusted callers only and must not be accepted directly from untrusted clients. Do not expose these functions as public API endpoints until auth and policy checks are complete.

## Integration tests

Use a **disposable** PostgreSQL database; the integration suite creates persistent test accounts and journals. Apply all migrations in order, then run:

```sh
npm install
npm run typecheck
TEST_DATABASE_URL=postgresql://localhost/p2p_payments_test npm run test:integration
```

The test runner skips database integration tests when `TEST_DATABASE_URL` is unset; a skipped run is **not** a successful ledger validation. The runtime user must be able to insert accounts, journals, entries, holds and outbox records, but must not be able to modify or delete posted journals/entries. Tests exercise concurrent wallet debits, reservation races, idempotency and reconciliation; they do not yet include process crashes, failover or real payment-rail settlement.

## Current implementation gates

- Verify the SQL migrations against PostgreSQL 16+ and compile TypeScript.
- Review trigger semantics and privileges, especially the journal immutability boundary and unauthorized journal insertion.
- Add cross-operation authorization, per-account balance constraints and replay-safe webhook ingestion.
- Add hold capture audit/outbox consumption tests and process-crash fault injection.
- Reconcile ledger liabilities to actual custody assets, not merely journal debits and credits.
- Obtain legal and compliance signoff before any live funds.
