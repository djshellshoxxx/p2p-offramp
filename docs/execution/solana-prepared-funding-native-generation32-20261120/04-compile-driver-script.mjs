import { build, version } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const source = 'contracts/solana/localnet/client-run.mjs';
const result = await build({ entryPoints: [source], bundle: true, platform: 'node', format: 'esm',
  target: 'node24', packages: 'external', write: false, metafile: true, logLevel: 'silent' });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bundle = result.outputFiles[0].contents;
const compressed = gzipSync(bundle, { mtime: 0 });
const bundlePath = '/workspace/scratch/dcf03ef9bee8/g32-native-funding-checks/04-compile-output.mjs.gz';
writeFileSync(bundlePath, compressed);
const inputs = Object.keys(result.metafile.inputs).sort().map(path => ({ path, sha256: digest(readFileSync(path)) }));
console.log(JSON.stringify({ check: 'Build-only entrypoint compilation; compiled output is never evaluated',
  nodeVersion: process.version, esbuildVersion: version, source, inputCount: inputs.length, inputs,
  warnings: result.warnings, output: { file: '04-compile-output.mjs.gz', rawBytes: bundle.length,
    rawSha256: digest(bundle), gzipBytes: compressed.length, gzipSha256: digest(compressed), gzipMtime: 0 },
  packages: 'external', nativeValidatorExecuted: false, compiledOutputExecuted: false }, null, 2));
