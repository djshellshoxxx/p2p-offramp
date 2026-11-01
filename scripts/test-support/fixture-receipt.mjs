/** Local test harness only. Poll one submitted hash; never submit or retry a transaction. */
const ATTEMPTS = 40, BUDGET_MS = 5000, DELAY_MS = 50;
const failure = () => Error('Fixture receipt unavailable.');
export async function waitForFixtureReceipt(rpc, hash, {
  now = () => performance.now(),
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  try {
    if (typeof rpc !== 'function' || typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw failure();
    const start = now(); let previous = start;
    if (!Number.isFinite(start) || start < 0) throw failure();
    const remaining = () => {
      const time = now();
      if (!Number.isFinite(time) || time < previous || time - start >= BUDGET_MS) throw failure();
      previous = time; return BUDGET_MS - (time - start);
    };
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const budget = remaining(); let timer;
      let receipt;
      try {
        receipt = await Promise.race([
          Promise.resolve().then(() => rpc('eth_getTransactionReceipt', [hash])),
          new Promise((_, reject) => { timer = setTimeout(() => reject(failure()), budget); }),
        ]);
      } finally { clearTimeout(timer); }
      remaining();
      if (receipt !== null) {
        if (typeof receipt !== 'object' || Array.isArray(receipt) || receipt.transactionHash !== hash || receipt.status !== '0x1') throw failure();
        return receipt;
      }
      if (attempt + 1 === ATTEMPTS) break;
      await wait(Math.min(DELAY_MS, remaining()));
    }
  } catch { throw failure(); }
  throw failure();
}
