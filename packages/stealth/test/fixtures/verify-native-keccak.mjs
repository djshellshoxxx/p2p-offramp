/** Independent native Keccak check of PUBLIC fixtures only; no RPC, deployed contract or upstream SDK claim. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const tool = process.argv[2]; if (!tool) throw Error('Supply the exact pinned Foundry1.5.1 cast binary path.');
const version = execFileSync(tool, ['--version'], { encoding: 'utf8', timeout: 5000 });
assert.match(version, /^cast Version: 1\.5\.1-v1\.5\.1\n/); assert.match(version, /Commit SHA: b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2\n/);
const vectors = JSON.parse(readFileSync(new URL('./comparison-vectors.json', import.meta.url)));
const checks = [];
for (const p of vectors.profiles) {
  const hash = execFileSync(tool, ['keccak', '0x' + p.sharedSecretPreimageHex], { encoding: 'utf8', timeout: 5000 }).trim();
  assert.equal(hash, '0x' + p.hashedSharedSecretHex); checks.push({ profileId: p.id, preimageBytes: p.sharedSecretPreimageBytes, hash });
}
const topic = execFileSync(tool, ['keccak', 'Announcement(uint256,address,address,bytes,bytes)'], { encoding: 'utf8', timeout: 5000 }).trim();
assert.equal(topic, vectors.announcementTopic0); checks.push({ eventTopic0: topic });
process.stdout.write(JSON.stringify({ nativeIndependentByteChecks: checks.length, tool: 'actual Foundry1.5.1 cast b0a9dd9', upstreamSDKExecuted: false, nativeDepositProof: false, checks }, null, 2) + '\n');
