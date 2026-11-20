import { rolldown, VERSION } from 'rolldown';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const source = 'contracts/solana/localnet/client-run.mjs';
const warnings = [];
const build = await rolldown({ input: resolve(source), platform: 'node',
  external: id => !id.startsWith('.') && !isAbsolute(id), onwarn: warning => warnings.push(warning) });
try {
  const result = await build.generate({ format: 'esm' });
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const chunks = result.output.filter(output => output.type === 'chunk');
  const outputs = chunks.map((chunk, index) => {
    const bytes = Buffer.from(chunk.code);
    const compressed = gzipSync(bytes, { mtime: 0 });
    const file = `05-compiled-${index}.mjs.gz`;
    writeFileSync('/workspace/scratch/dcf03ef9bee8/g32-native-funding-checks/' + file, compressed);
    return { file, rawBytes: bytes.length, rawSha256: digest(bytes), gzipBytes: compressed.length,
      gzipSha256: digest(compressed), gzipMtime: 0 };
  });
  const inputs = [...new Set(chunks.flatMap(chunk => Object.keys(chunk.modules)))].sort().map(path => {
    if (!isAbsolute(path)) return { path, virtual: true };
    return { path: relative(process.cwd(), path), sha256: digest(readFileSync(path)) };
  });
  console.log(JSON.stringify({ check: 'Build-only entrypoint compilation; output is never evaluated',
    nodeVersion: process.version, rolldownVersion: VERSION, source, inputCount: inputs.length, inputs,
    warnings, outputs, external: 'Node builtins and bare package imports', nativeValidatorExecuted: false,
    compiledOutputExecuted: false }, null, 2));
} finally { await build.close(); }
