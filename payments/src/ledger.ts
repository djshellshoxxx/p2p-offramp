import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";

export type Posting = { accountId: string; debitMinor: bigint; creditMinor: bigint };
export type TransferRequest = { actorId: string; idempotencyKey: string; fromAccountId: string; toAccountId: string; currency: string; amountMinor: bigint };

export class LedgerError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new LedgerError("INVALID_INPUT", "invalid UUID");
}

export async function withSerializable<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const code = (error as { code?: string }).code;
      if ((code === "40001" || code === "40P01") && attempt < 4) continue;
      throw error;
    } finally { client.release(); }
  }
  throw new LedgerError("RETRY_EXHAUSTED", "transaction retry exhausted");
}

export async function transfer(pool: Pool, input: TransferRequest): Promise<string> {
  for (const value of [input.actorId, input.fromAccountId, input.toAccountId]) assertUuid(value);
  if (input.fromAccountId === input.toAccountId || input.amountMinor <= 0n || input.amountMinor > 9223372036854775807n || !/^[A-Z]{3}$/.test(input.currency) || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 128) throw new LedgerError("INVALID_INPUT", "invalid transfer");
  const fingerprint = createHash("sha256").update(JSON.stringify({ actorId: input.actorId, from: input.fromAccountId, to: input.toAccountId, currency: input.currency, amount: input.amountMinor.toString() })).digest("hex");
  return withSerializable(pool, async client => {
    const operationId = randomUUID();
    const claim = await client.query<{ operation_id: string; request_hash: string }>(
      "INSERT INTO ledger_idempotency(key,actor_id,request_hash,operation_id) VALUES($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING RETURNING operation_id,request_hash",
      [input.idempotencyKey, input.actorId, fingerprint, operationId]
    );
    if (claim.rowCount === 0) {
      const existing = await client.query<{ operation_id: string; request_hash: string; actor_id: string }>("SELECT operation_id,request_hash,actor_id FROM ledger_idempotency WHERE key=$1", [input.idempotencyKey]);
      if (!existing.rows.length || existing.rows[0].request_hash !== fingerprint || existing.rows[0].actor_id !== input.actorId) throw new LedgerError("IDEMPOTENCY_CONFLICT", "key reused for different transfer");
      return existing.rows[0].operation_id;
    }
    const accounts = await client.query<{ id: string; owner_id: string | null; currency: string; class: string }>(
      "SELECT id,owner_id,currency,class FROM ledger_accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [[input.fromAccountId, input.toAccountId]]
    );
    if (accounts.rows.length !== 2 || accounts.rows.some(a => a.currency !== input.currency || a.class !== "LIABILITY")) throw new LedgerError("INVALID_ACCOUNT", "wallet account unavailable");
    const from = accounts.rows.find(a => a.id === input.fromAccountId);
    if (from?.owner_id !== input.actorId) throw new LedgerError("UNAUTHORIZED", "source account not owned by actor");
    const available = await client.query<{ available_minor: string }>("SELECT available_minor FROM ledger_wallet_available WHERE account_id=$1", [input.fromAccountId]);
    if (!available.rows.length || BigInt(available.rows[0].available_minor) < input.amountMinor) throw new LedgerError("INSUFFICIENT_FUNDS", "insufficient available funds");
    const journal = await client.query<{ id: string }>("INSERT INTO ledger_journals(operation_id,kind) VALUES($1,'P2P_TRANSFER') RETURNING id", [operationId]);
    const id = journal.rows[0].id;
    await client.query("INSERT INTO ledger_entries(journal_id,account_id,currency,debit_minor,credit_minor) VALUES($1,$2,$3,$4,0),($1,$5,$3,0,$4)", [id,input.fromAccountId,input.currency,input.amountMinor.toString(),input.toAccountId]);
    await client.query("INSERT INTO ledger_outbox(operation_id,topic,payload) VALUES($1,'transfer.completed',$2::jsonb)", [operationId,JSON.stringify({ operationId, journalId: id })]);
    return operationId;
  });
}
