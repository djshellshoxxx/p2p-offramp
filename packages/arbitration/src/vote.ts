/** Exact specified fixed-width Vote ABI encoding. This computes a digest only, never signs or persists a live vote. */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { address, choiceOf, data, diagnostic, hex32, result, roundOf, stop, uint, type DiagnosticOnly, type ReferenceResult } from './shared.ts';
export const VOTE_TYPE = 'Vote(uint256 chainId,address tribunal,bytes32 policyHash,bytes32 caseId,uint8 round,bytes32 jurorId,bytes32 evidenceRoot,uint8 choice,bytes32 salt)';
const encodeHex = (bytes: Uint8Array): string => `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
const unhex = (text: string): Uint8Array => Uint8Array.from(text.slice(2).match(/../g)!, pair => parseInt(pair, 16));
export const VOTE_TYPEHASH = encodeHex(keccak_256(new TextEncoder().encode(VOTE_TYPE)));
export interface VoteInput { readonly chainId: bigint; readonly tribunal: string; readonly policyHash: string; readonly caseId: string;
  readonly round: 0 | 1; readonly jurorId: string; readonly evidenceRoot: string; readonly choice: 0 | 1 | 2; readonly salt: string; }
export interface VoteVector extends DiagnosticOnly { readonly typeHash: string; readonly words: readonly string[]; readonly preimage: string; readonly digest: string; }
function word(value: bigint): string { return `0x${uint(value).toString(16).padStart(64, '0')}`; }
export function parseVote(input: unknown): VoteInput {
  const raw = data(input, ['chainId', 'tribunal', 'policyHash', 'caseId', 'round', 'jurorId', 'evidenceRoot', 'choice', 'salt']);
  const chainId = uint(raw.chainId); if (chainId === 0n) return stop();
  return Object.freeze({ chainId, tribunal: address(raw.tribunal), policyHash: hex32(raw.policyHash), caseId: hex32(raw.caseId),
    round: roundOf(raw.round), jurorId: hex32(raw.jurorId), evidenceRoot: hex32(raw.evidenceRoot), choice: choiceOf(raw.choice), salt: hex32(raw.salt) });
}
export function vectorOf(input: unknown): VoteVector {
  const vote = parseVote(input), words = Object.freeze([VOTE_TYPEHASH, word(vote.chainId), `0x${vote.tribunal.slice(2).padStart(64, '0')}`,
    vote.policyHash, vote.caseId, word(BigInt(vote.round)), vote.jurorId, vote.evidenceRoot, word(BigInt(vote.choice)), vote.salt]);
  const preimage = `0x${words.map(value => value.slice(2)).join('')}`, bytes = unhex(preimage);
  try { return diagnostic({ typeHash: VOTE_TYPEHASH, words, preimage, digest: encodeHex(keccak_256(bytes)) }); }
  finally { bytes.fill(0); }
}
export const encodeVoteVector = (input: unknown): ReferenceResult<VoteVector> => result(() => vectorOf(input));
