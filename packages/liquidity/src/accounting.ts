import { account, data, decimal, diagnostic, id, result, stop, type DiagnosticOnly } from './shared.ts';
import type { CoreResult } from '../../schemas/index.ts';

/** Exact specification record. Native custody is deliberately not a ledger field. */
export interface VaultAccountingV1 {
  readonly assetId: string; readonly maker: string; readonly deposited: string;
  readonly available: string; readonly reserved: string; readonly inEscrow: string;
  readonly withdrawn: string; readonly releasedToBuyers: string; readonly version: 1;
}
export interface AccountingReport extends DiagnosticOnly {
  readonly ledger: VaultAccountingV1; readonly custodyBalance: string;
  readonly conservation: boolean; readonly solvent: boolean;
  readonly surplus: string; readonly safeAvailableWithdrawal: string;
}
export interface Ledger {
  readonly assetId: string; readonly maker: string; readonly deposited: bigint;
  readonly available: bigint; readonly reserved: bigint; readonly inEscrow: bigint;
  readonly withdrawn: bigint; readonly releasedToBuyers: bigint;
}
export function ledgerOf(input: unknown): Ledger {
  const raw = data(input, ['assetId', 'maker', 'deposited', 'available', 'reserved', 'inEscrow', 'withdrawn', 'releasedToBuyers', 'version']);
  if (raw.version !== 1) return stop('UNSUPPORTED_VERSION');
  return Object.freeze({ assetId: id(raw.assetId), maker: account(raw.maker), deposited: decimal(raw.deposited),
    available: decimal(raw.available), reserved: decimal(raw.reserved), inEscrow: decimal(raw.inEscrow),
    withdrawn: decimal(raw.withdrawn), releasedToBuyers: decimal(raw.releasedToBuyers) });
}
export function ledgerView(ledger: Ledger): VaultAccountingV1 {
  return Object.freeze({ assetId: ledger.assetId, maker: ledger.maker, deposited: ledger.deposited.toString(),
    available: ledger.available.toString(), reserved: ledger.reserved.toString(), inEscrow: ledger.inEscrow.toString(),
    withdrawn: ledger.withdrawn.toString(), releasedToBuyers: ledger.releasedToBuyers.toString(), version: 1 });
}
export function accounting(ledger: Ledger, custody: bigint): AccountingReport {
  const liabilities = ledger.available + ledger.reserved, free = custody > ledger.reserved ? custody - ledger.reserved : 0n;
  return diagnostic({ ledger: ledgerView(ledger), custodyBalance: custody.toString(),
    conservation: ledger.deposited === ledger.available + ledger.reserved + ledger.inEscrow + ledger.withdrawn + ledger.releasedToBuyers,
    solvent: custody >= liabilities, surplus: (custody > liabilities ? custody - liabilities : 0n).toString(),
    safeAvailableWithdrawal: (free < ledger.available ? free : ledger.available).toString() });
}
export function inspectVaultAccounting(input: unknown, custodyBalance: unknown): CoreResult<AccountingReport> {
  return result(() => accounting(ledgerOf(input), decimal(custodyBalance)));
}
