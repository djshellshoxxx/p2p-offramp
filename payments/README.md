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
