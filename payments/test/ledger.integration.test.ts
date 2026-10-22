import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { captureHold, reserveFunds, releaseHold } from "../src/holds.js";
import { transfer } from "../src/ledger.js";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test("PostgreSQL integration suite requires TEST_DATABASE_URL", {skip:"Set TEST_DATABASE_URL to a disposable migrated PostgreSQL database"}, () => {});
} else {
  const pool = new pg.Pool({connectionString:url,max:20});
  after(async () => { await pool.end(); });
  const makeWallet = async (owner:string,currency="CAD") => {
    const result=await pool.query<{id:string}>(
      "INSERT INTO ledger_accounts(owner_id,currency,class,label) VALUES($1,$2,'LIABILITY','test') RETURNING id",
      [owner,currency]
    );
    return result.rows[0].id;
  };
  test("migration exposes reconciliation view",async()=>{
    const rows=await pool.query("SELECT * FROM ledger_reconciliation_exceptions");
    assert.equal(rows.rowCount,0);
  });
  test("hold rejects empty wallet and preserves available funds",async()=>{
    const owner=randomUUID(), wallet=await makeWallet(owner);
    await assert.rejects(reserveFunds(pool,{actorId:owner,accountId:wallet,amountMinor:1n,operationId:randomUUID()}));
    const balance=await pool.query<{available_minor:string}>(
      "SELECT available_minor FROM ledger_wallet_available WHERE account_id=$1",[wallet]
    );
    assert.equal(balance.rows[0].available_minor,"0");
  });
  test("self transfer is rejected",async()=>{
    const owner=randomUUID(),wallet=await makeWallet(owner);
    await assert.rejects(transfer(pool,{actorId:owner,idempotencyKey:randomUUID(),fromAccountId:wallet,toAccountId:wallet,currency:"CAD",amountMinor:1n}));
  });
}
