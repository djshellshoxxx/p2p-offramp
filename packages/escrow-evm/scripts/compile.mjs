/** Pinned local compiler. Importing this module performs no compilation or chain operation. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
const root = fileURLToPath(new URL('../', import.meta.url));
export const compilerSettings = Object.freeze({ optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'shanghai' });
export function compileContracts() {
  if (!solc.version().startsWith('0.8.38+commit.1835d247')) throw Error('Unexpected solc build');
  const sources = Object.fromEntries(['BasicEscrow.sol', 'TestActors.sol'].map(name => [name, { content: readFileSync(root + 'contracts/' + name, 'utf8') }]));
  const input = { language: 'Solidity', sources, settings: { ...compilerSettings, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import(path) {
    if (!path.startsWith('@openzeppelin/contracts/') || path.includes('..')) return { error: 'Unsupported import' };
    try { return { contents: readFileSync(root + 'node_modules/' + path, 'utf8') }; } catch { return { error: 'Missing pinned dependency' }; }
  } }));
  const errors = (output.errors ?? []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  const result = {};
  for (const [source, contracts] of Object.entries(output.contracts)) for (const [name, artifact] of Object.entries(contracts)) {
    if (!artifact.evm.bytecode.object) continue;
    result[name] = { abi: artifact.abi, bytecode: '0x' + artifact.evm.bytecode.object, deployedBytecode: '0x' + artifact.evm.deployedBytecode.object,
      compiler: solc.version(), source, sourceSha256: sources[source] ? createHash('sha256').update(sources[source].content).digest('hex') : null };
  }
  return result;
}
export function compileEscrow() { return compileContracts().BasicEscrow; }
