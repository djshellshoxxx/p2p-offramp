#!/usr/bin/env node
/** Offline, scope-only report. Usage: acceptance-report.mjs candidate.json records.json.
 * Files configure evidence, never review authority. No CLI/env hook loads a reviewer or executable policy;
 * an otherwise complete candidate remains pending until a trusted library caller verifies its reviews.
 */
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateGate } from '../packages/security/src/acceptance-gates.ts';

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const refused = code => ({ report: { ok: false, error: { code } }, exitCode: 2 });
const limits = new WeakSet();
const limit = () => { const error = new Error('Report input exceeds its bounds.'); limits.add(error); throw error; };

function checkJsonStructure(source) {
  const stack = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      const start = index;
      for (index++; index < source.length; index++) {
        if (source[index] === '\\') index++;
        else if (source[index] === '"') break;
      }
      const top = stack.at(-1);
      if (top?.kind === 'object' && top.key) {
        const key = JSON.parse(source.slice(start, index + 1));
        if (top.keys.has(key)) throw Error('INVALID_INPUT');
        top.keys.add(key); top.key = false;
      }
    } else if (char === '{' || char === '[') {
      if (stack.length >= 16) limit();
      stack.push({ kind: char === '{' ? 'object' : 'array', key: char === '{', keys: new Set() });
    } else if (char === '}' || char === ']') stack.pop();
    else if (char === ',' && stack.at(-1)?.kind === 'object') stack.at(-1).key = true;
  }
}

async function jsonFile(path) {
  const initial = await lstat(path);
  if (!initial.isFile() || initial.isSymbolicLink()) throw Error('INVALID_INPUT');
  if (initial.size > MAX_INPUT_BYTES) limit();
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  let buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== initial.dev || stat.ino !== initial.ino) throw Error('INVALID_INPUT');
    if (stat.size > MAX_INPUT_BYTES) limit();
    buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > stat.size) limit();
    const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    checkJsonStructure(source);
    return JSON.parse(source);
  } finally { buffer?.fill(0); await handle.close(); }
}

/** Exposes no review-policy argument. Imported files cannot produce a promoted or approved release. */
export async function acceptanceReport(candidatePath, recordsPath) {
  try {
    const candidate = await jsonFile(candidatePath), records = await jsonFile(recordsPath);
    const report = await evaluateGate(records, candidate);
    return { report, exitCode: report.ok ? report.value.decision === 'passed' ? 0 : 1 : 2 };
  } catch (error) {
    // Error identity, rather than foreign property reads, distinguishes local limit refusals.
    return refused(typeof error === 'object' && error !== null && limits.has(error) ? 'LIMIT_EXCEEDED' : 'INVALID_INPUT');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = process.argv.length === 4 ? await acceptanceReport(process.argv[2], process.argv[3]) : refused('INVALID_INPUT');
  process.stdout.write(JSON.stringify(result.report) + '\n');
  process.exitCode = result.exitCode;
}
