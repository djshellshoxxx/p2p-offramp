import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { LedgerError, withSerializable } from "./ledger.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reserveFunds(pool: Pool, input: {
  actorId: string; accountId: string; amountMinor: bigint; operationId: string;
}): Promise<string> {
  if (![input.actorId,input.accountId,input.operationId].every(v=>uuid.test(v)) ||
      input.amountMinor <= 0n || input.amountMinor > 9223372036854775807n) {
    throw new LedgerError("INVALID_INPUT", "invalid hold request");
  }
  return withSerializable(pool, async client => {
    const existing = await client.query<{ id:string; account_id:string; amount_minor:string }>(
      "SELECT id,account_id,amount_minor FROM ledger_holds WHERE operation_id=$1", [input.operationId]
    );
    if (existing.rows.length) {
      const hold=existing.rows[0];
      if (hold.account_id!==input.accountId || BigInt(hold.amount_minor)!==input.amountMinor)
        throw new LedgerError("IDEMPOTENCY_CONFLICT", "operation reused");
      const owner=await client.query<{owner_id:string|null}>("SELECT owner_id FROM ledger_accounts WHERE id=$1",[input.accountId]);
      if (owner.rows[0]?.owner_id!==input.actorId) throw new LedgerError("UNAUTHORIZED","wallet not owned");
      return hold.id;
    }
    const owner=await client.query<{owner_id:string|null}>(
      "SELECT owner_id FROM ledger_accounts WHERE id=$1 FOR UPDATE",[input.accountId]
    );
    if (owner.rows[0]?.owner_id!==input.actorId) throw new LedgerError("UNAUTHORIZED","wallet not owned");
    const id=randomUUID();
    await client.query(
      "INSERT INTO ledger_holds(id,operation_id,account_id,amount_minor) VALUES($1,$2,$3,$4)",
      [id,input.operationId,input.accountId,input.amountMinor.toString()]
    );
    await client.query(
      "INSERT INTO ledger_outbox(operation_id,topic,payload) VALUES($1,'hold.created',$2::jsonb)",
      [input.operationId,JSON.stringify({holdId:id,accountId:input.accountId})]
    );
    return id;
  });
}

export async function releaseHold(pool: Pool, input: {
  actorId: string; holdId: string;
}): Promise<"RELEASED"> {
  if (!uuid.test(input.actorId) || !uuid.test(input.holdId))
    throw new LedgerError("INVALID_INPUT","invalid identifiers");
  return withSerializable(pool,async client=>{
    // Acquire account lock before hold lock, consistent with reserve/capture.
    const initial=await client.query<{account_id:string}>(
      "SELECT account_id FROM ledger_holds WHERE id=$1",[input.holdId]
    );
    if (!initial.rows.length) throw new LedgerError("NOT_FOUND","hold unavailable");
    const account=await client.query<{owner_id:string|null}>(
      "SELECT owner_id FROM ledger_accounts WHERE id=$1 FOR UPDATE",[initial.rows[0].account_id]
    );
    if (account.rows[0]?.owner_id!==input.actorId)
      throw new LedgerError("UNAUTHORIZED","hold not owned");
    const row=await client.query<{state:string;account_id:string}>(
      "SELECT state,account_id FROM ledger_holds WHERE id=$1 FOR UPDATE",[input.holdId]
    );
    if (!row.rows.length || row.rows[0].account_id!==initial.rows[0].account_id)
      throw new LedgerError("INVALID_STATE","hold changed");
    if (row.rows[0].state==="RELEASED") return "RELEASED";
    if (row.rows[0].state!=="ACTIVE")
      throw new LedgerError("INVALID_STATE","hold already captured");
    await client.query("UPDATE ledger_holds SET state='RELEASED',updated_at=now() WHERE id=$1",[input.holdId]);
    await client.query(
      "INSERT INTO ledger_outbox(operation_id,topic,payload) VALUES($1,'hold.released',$2::jsonb)",
      [input.holdId,JSON.stringify({holdId:input.holdId})]
    );
    return "RELEASED";
  });
}

/**
 * Capture an existing reservation and settle the liability transfer atomically.
 * Idempotency is scoped to the hold: a captured hold can only return its original
 * journal's operation identifier, never produce a second posting.
 */
export async function captureHold(pool: Pool, input: {
  actorId: string; holdId: string; recipientAccountId: string;
}): Promise<string> {
  if (![input.actorId,input.holdId,input.recipientAccountId].every(v => uuid.test(v)))
    throw new LedgerError("INVALID_INPUT", "invalid capture identifiers");
  return withSerializable(pool, async client => {
    // Read the hold first without locking; acquire account locks in deterministic
    // UUID order to match the transfer service and avoid lock-order deadlocks.
    const initial = await client.query<{account_id:string}>(
      "SELECT account_id FROM ledger_holds WHERE id=$1", [input.holdId]
    );
    if (!initial.rows.length) throw new LedgerError("NOT_FOUND", "hold unavailable");
    const sourceId = initial.rows[0].account_id;
    if (sourceId === input.recipientAccountId)
      throw new LedgerError("INVALID_INPUT", "self capture forbidden");
    const accounts = await client.query<{id:string;owner_id:string|null;currency:string;class:string}>(
      "SELECT id,owner_id,currency,class FROM ledger_accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [[sourceId,input.recipientAccountId]]
    );
    if (accounts.rows.length !== 2 || accounts.rows.some(a => a.class !== "LIABILITY"))
      throw new LedgerError("INVALID_ACCOUNT", "invalid liability wallet");
    const source = accounts.rows.find(a => a.id === sourceId);
    const recipient = accounts.rows.find(a => a.id === input.recipientAccountId);
    if (!source || source.owner_id !== input.actorId)
      throw new LedgerError("UNAUTHORIZED", "source wallet not owned");
    if (!recipient || source.currency !== recipient.currency)
      throw new LedgerError("CURRENCY_MISMATCH", "wallet currencies differ");

    const result = await client.query<{state:string;amount_minor:string;operation_id:string;account_id:string}>(
      "SELECT state,amount_minor,operation_id,account_id FROM ledger_holds WHERE id=$1 FOR UPDATE",
      [input.holdId]
    );
    const hold = result.rows[0];
    if (!hold || hold.account_id !== sourceId)
      throw new LedgerError("INVALID_STATE", "hold changed during capture");
    // The journal operation ID is deterministically the hold ID. The hold's
    // creation operation ID is reserved for the original reservation event.
    if (hold.state === "CAPTURED") {
      const posted = await client.query<{operation_id:string;metadata:{recipientAccountId?:string}}>(
        "SELECT operation_id,metadata FROM ledger_journals WHERE operation_id=$1 AND kind='HOLD_CAPTURE'",
        [input.holdId]
      );
      if (!posted.rows.length || posted.rows[0].metadata.recipientAccountId !== input.recipientAccountId)
        throw new LedgerError("IDEMPOTENCY_CONFLICT", "hold captured to different recipient");
      return posted.rows[0].operation_id;
    }
    if (hold.state !== "ACTIVE") throw new LedgerError("INVALID_STATE", "hold not active");
    // Check posted balance, not available balance: the hold already reserves
    // this amount and therefore reduces available balance by its own value.
    const balance = await client.query<{balance_minor:string}>(
      "SELECT balance_minor FROM ledger_account_balances WHERE account_id=$1", [sourceId]
    );
    if (!balance.rows.length || BigInt(balance.rows[0].balance_minor) < BigInt(hold.amount_minor))
      throw new LedgerError("INSUFFICIENT_FUNDS", "reserved funds no longer backed");
    const journal = await client.query<{id:string}>(
      "INSERT INTO ledger_journals(operation_id,kind,metadata) VALUES($1,'HOLD_CAPTURE',$2::jsonb) RETURNING id",
      [input.holdId,JSON.stringify({recipientAccountId:input.recipientAccountId,holdId:input.holdId})]
    );
    await client.query(
      "INSERT INTO ledger_entries(journal_id,account_id,currency,debit_minor,credit_minor) VALUES($1,$2,$3,$4,0),($1,$5,$3,0,$4)",
      [journal.rows[0].id,sourceId,source.currency,hold.amount_minor,input.recipientAccountId]
    );
    await client.query(
      "UPDATE ledger_holds SET state='CAPTURED',updated_at=now() WHERE id=$1 AND state='ACTIVE'",
      [input.holdId]
    );
    await client.query(
      "INSERT INTO ledger_outbox(operation_id,topic,payload) VALUES($1,'hold.captured',$2::jsonb)",
      [input.holdId,JSON.stringify({holdId:input.holdId,recipientAccountId:input.recipientAccountId,journalId:journal.rows[0].id})]
    );
    return input.holdId;
  });
}
