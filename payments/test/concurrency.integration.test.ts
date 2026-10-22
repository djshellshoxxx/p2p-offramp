import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { transfer } from "../src/ledger.js";
import { reserveFunds, releaseHold, captureHold } from "../src/holds.js";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test("integration tests require TEST_DATABASE_URL", {skip:"Provide a disposable migrated PostgreSQL database"}, () => {});
} else {
  const pool = new pg.Pool({connectionString:url,max:24});
  after(async()=>pool.end());
  const wallet=async(owner:string)=>{
    const r=await pool.query<{id:string}>("INSERT INTO ledger_accounts(owner_id,currency,class,label) VALUES($1,'CAD','LIABILITY','integration wallet') RETURNING id",[owner]);
    return r.rows[0].id;
  };
  const fund=async(accountId:string,amount:bigint)=>{
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const clearing=await client.query<{id:string}>("INSERT INTO ledger_accounts(currency,class,label) VALUES('CAD','ASSET','integration clearing') RETURNING id");
      const j=await client.query<{id:string}>("INSERT INTO ledger_journals(operation_id,kind) VALUES($1,'TEST_SEED') RETURNING id",[randomUUID()]);
      await client.query("INSERT INTO ledger_entries(journal_id,account_id,currency,debit_minor,credit_minor) VALUES($1,$2,'CAD',$4,0),($1,$3,'CAD',0,$4)",[j.rows[0].id,clearing.rows[0].id,accountId,amount.toString()]);
      await client.query("COMMIT");
    } catch(e){await client.query("ROLLBACK");throw e;} finally{client.release();}
  };
  const available=async(accountId:string)=>{
    const r=await pool.query<{available_minor:string}>("SELECT available_minor FROM ledger_wallet_available WHERE account_id=$1",[accountId]);
    return BigInt(r.rows[0].available_minor);
  };
  const assertBalanced=async()=>{
    const r=await pool.query("SELECT * FROM ledger_reconciliation_exceptions");
    assert.equal(r.rowCount,0,"all committed journals must balance");
  };

  test("parallel transfers cannot overspend",async()=>{
    const owner=randomUUID(),recipient=randomUUID();
    const source=await wallet(owner),target=await wallet(recipient);
    await fund(source,100n);
    const results=await Promise.allSettled(Array.from({length:20},()=>transfer(pool,{
      actorId:owner,idempotencyKey:randomUUID(),fromAccountId:source,toAccountId:target,currency:"CAD",amountMinor:10n
    })));
    assert.equal(results.filter(x=>x.status==="fulfilled").length,10);
    assert.equal(await available(source),0n);
    assert.equal(await available(target),100n);
    await assertBalanced();
  });

  test("same transfer key posts once and rejects changed request",async()=>{
    const owner=randomUUID(),recipient=randomUUID();
    const source=await wallet(owner),target=await wallet(recipient);
    await fund(source,50n);
    const req={actorId:owner,idempotencyKey:randomUUID(),fromAccountId:source,toAccountId:target,currency:"CAD",amountMinor:20n};
    const first=await transfer(pool,req);
    assert.equal(await transfer(pool,req),first);
    await assert.rejects(transfer(pool,{...req,amountMinor:21n}));
    assert.equal(await available(source),30n);
    await assertBalanced();
  });

  test("hold competes with transfer and cannot overspend",async()=>{
    const owner=randomUUID(),recipient=randomUUID();
    const source=await wallet(owner),target=await wallet(recipient);
    await fund(source,100n);
    const results=await Promise.allSettled([
      reserveFunds(pool,{actorId:owner,accountId:source,amountMinor:80n,operationId:randomUUID()}),
      transfer(pool,{actorId:owner,idempotencyKey:randomUUID(),fromAccountId:source,toAccountId:target,currency:"CAD",amountMinor:80n})
    ]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.ok((await available(source))>=0n);
    await assertBalanced();
  });

  test("capture posts once and cannot change recipient",async()=>{
    const owner=randomUUID(),r1=randomUUID(),r2=randomUUID();
    const source=await wallet(owner),target=await wallet(r1),other=await wallet(r2);
    await fund(source,100n);
    const holdId=await reserveFunds(pool,{actorId:owner,accountId:source,amountMinor:35n,operationId:randomUUID()});
    assert.equal(await available(source),65n);
    const operation=await captureHold(pool,{actorId:owner,holdId,recipientAccountId:target});
    assert.equal(await captureHold(pool,{actorId:owner,holdId,recipientAccountId:target}),operation);
    await assert.rejects(captureHold(pool,{actorId:owner,holdId,recipientAccountId:other}));
    assert.equal(await available(source),65n);
    assert.equal(await available(target),35n);
    await assertBalanced();
  });

  test("release restores spendable balance",async()=>{
    const owner=randomUUID(),source=await wallet(owner);
    await fund(source,60n);
    const holdId=await reserveFunds(pool,{actorId:owner,accountId:source,amountMinor:25n,operationId:randomUUID()});
    assert.equal(await available(source),35n);
    assert.equal(await releaseHold(pool,{actorId:owner,holdId}),"RELEASED");
    assert.equal(await available(source),60n);
    await assert.rejects(captureHold(pool,{actorId:owner,holdId,recipientAccountId:await wallet(randomUUID())}));
    await assertBalanced();
  });
}
