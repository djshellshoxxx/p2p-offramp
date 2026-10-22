-- Reconciliation queries are read-only and must run against a consistent snapshot.
-- Debit/credit signs are normalized by account class: asset/expense debit increases, liability/equity/revenue credit increases.
CREATE VIEW ledger_account_balances AS
SELECT a.id AS account_id,a.owner_id,a.currency,a.class,
 CASE WHEN a.class IN ('ASSET','EXPENSE') THEN coalesce(sum(e.debit_minor::numeric-e.credit_minor::numeric),0)
 ELSE coalesce(sum(e.credit_minor::numeric-e.debit_minor::numeric),0) END AS balance_minor
FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id GROUP BY a.id,a.owner_id,a.currency,a.class;
CREATE VIEW ledger_wallet_available AS
SELECT b.account_id,b.owner_id,b.currency,b.balance_minor,
 coalesce(h.active_hold_minor,0) AS held_minor,
 b.balance_minor-coalesce(h.active_hold_minor,0) AS available_minor
FROM ledger_account_balances b
LEFT JOIN (SELECT account_id,sum(amount_minor::numeric) AS active_hold_minor FROM ledger_holds WHERE state='ACTIVE' GROUP BY account_id) h
ON h.account_id=b.account_id;
CREATE VIEW ledger_reconciliation_exceptions AS
SELECT j.id AS journal_id, count(e.id) AS entries, count(DISTINCT e.currency) AS currencies,
 coalesce(sum(e.debit_minor::numeric),0) AS debits,
 coalesce(sum(e.credit_minor::numeric),0) AS credits
FROM ledger_journals j LEFT JOIN ledger_entries e ON e.journal_id=j.id
GROUP BY j.id HAVING count(e.id)<2 OR count(DISTINCT e.currency)<>1 OR coalesce(sum(e.debit_minor::numeric),0)<>coalesce(sum(e.credit_minor::numeric),0);
