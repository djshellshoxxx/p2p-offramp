/** Project-owned trust boundary. Deployment values must come from a signed release manifest. */
export type Deployment = Readonly<{chainId: number; escrowAddress: `0x${string}`; runtimeCodeHash: `0x${string}`}>;
export function requireDeployment(manifest: readonly Deployment[], chainId: number): Deployment {
  const deployment = manifest.find(x => x.chainId === chainId);
  if (!deployment || !/^0x[0-9a-fA-F]{40}$/.test(deployment.escrowAddress) || !/^0x[0-9a-fA-F]{64}$/.test(deployment.runtimeCodeHash)) throw new Error("untrusted chain deployment");
  return deployment;
}
/** Follow-up: independently verify manifest signature, chain genesis, eth_getCode hash and finality. */
