BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE ledger_account_class AS ENUM ('ASSET','LIABILITY','REVENUE','EXPENSE','EQUITY');
CREATE TYPE hold_state AS ENUM ('ACTIVE','CAPTURED','RELEASED');
CREATE TABLE ledger_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid, currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), class ledger_account_class NOT NULL,
 label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,currency)
);
CREATE TABLE ledger_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE, kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE ledger_entries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, journal_id uuid NOT NULL REFERENCES ledger_journals(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL, currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), debit_minor bigint NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
 credit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
 CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0)),
 FOREIGN KEY(account_id,currency) REFERENCES ledger_accounts(id,currency)
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries(account_id,id);
CREATE TABLE ledger_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE,
 account_id uuid NOT NULL REFERENCES ledger_accounts(id), amount_minor bigint NOT NULL CHECK (amount_minor > 0),
 state hold_state NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_holds_active_idx ON ledger_holds(account_id) WHERE state = 'ACTIVE';
CREATE TABLE ledger_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, operation_id uuid NOT NULL,
 topic text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz, UNIQUE(operation_id,topic)
);
CREATE TABLE ledger_idempotency (
 key text PRIMARY KEY, actor_id uuid NOT NULL, request_hash text NOT NULL,
 operation_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
-- Database role used by the application must not own tables and must have no UPDATE/DELETE on journals or entries.
-- Prevent accidental mutation by privileged roles as well; migrations must be run by a separately controlled owner.
CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable ledger rows'; END $$;
CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON ledger_journals FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
CREATE TRIGGER entry_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
-- Deferred balanced-journal assertion, invoked after entries are inserted; no empty journals permitted.
CREATE FUNCTION assert_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j uuid; n bigint; d numeric; c numeric; distinct_currency integer;
BEGIN
 j := COALESCE(NEW.journal_id, OLD.journal_id);
 SELECT count(*), coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0), count(DISTINCT currency)
 INTO n,d,c,distinct_currency FROM ledger_entries WHERE journal_id=j;
 IF n < 2 OR d <> c OR distinct_currency <> 1 THEN RAISE EXCEPTION 'unbalanced journal %', j; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER entry_balance_check AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_journal();
-- A journal with zero entries also needs a deferred check.
CREATE FUNCTION assert_journal_has_entries() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint; d numeric; c numeric; cur integer;
BEGIN
 SELECT count(*),coalesce(sum(debit_minor),0),coalesce(sum(credit_minor),0),count(DISTINCT currency)
 INTO n,d,c,cur FROM ledger_entries WHERE journal_id=NEW.id;
 IF n < 2 OR d <> c OR cur <> 1 THEN RAISE EXCEPTION 'journal lacks balanced entries'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balance_check AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_journal_has_entries();
COMMIT;
