BEGIN;
-- Serialize holds with transfers through the same account-row lock.
CREATE FUNCTION guard_wallet_hold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance_available numeric;
BEGIN
 IF TG_OP = 'INSERT' THEN
   PERFORM 1 FROM ledger_accounts WHERE id = NEW.account_id AND class = 'LIABILITY' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid wallet account'; END IF;
   SELECT available_minor INTO balance_available FROM ledger_wallet_available WHERE account_id = NEW.account_id;
   IF balance_available IS NULL OR balance_available < NEW.amount_minor THEN
     RAISE EXCEPTION 'insufficient funds for reservation';
   END IF;
 ELSIF TG_OP = 'UPDATE' THEN
   IF OLD.state <> 'ACTIVE' OR NEW.state NOT IN ('RELEASED','CAPTURED')
      OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
      OR NEW.operation_id IS DISTINCT FROM OLD.operation_id THEN
      RAISE EXCEPTION 'invalid reservation transition';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_hold_insert BEFORE INSERT ON ledger_holds FOR EACH ROW EXECUTE FUNCTION guard_wallet_hold();
CREATE TRIGGER wallet_hold_update BEFORE UPDATE ON ledger_holds FOR EACH ROW EXECUTE FUNCTION guard_wallet_hold();
COMMIT;
