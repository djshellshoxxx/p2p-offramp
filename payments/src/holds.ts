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
    const row=await client.query<{state:string;owner_id:string|null}>(
      "SELECT h.state,a.owner_id FROM ledger_holds h JOIN ledger_accounts a ON a.id=h.account_id WHERE h.id=$1 FOR UPDATE OF h,a",
      [input.holdId]
    );
    if (row.rows[0]?.owner_id!==input.actorId) throw new LedgerError("UNAUTHORIZED","hold not owned");
    if (row.rows[0].state==="RELEASED") return "RELEASED";
    if (row.rows[0].state!=="ACTIVE") throw new LedgerError("INVALID_STATE","hold already captured");
    await client.query("UPDATE ledger_holds SET state='RELEASED',updated_at=now() WHERE id=$1",[input.holdId]);
    return "RELEASED";
  });
}
