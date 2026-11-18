/**
 * TEST ONLY. Runs one scenario module in a fresh Node module graph in which apps/web/src/testnet/sepolia-network.ts
 * reads SEPOLIA_RELEASE_KEY_ID as an ephemeral fixture keyId, so the ordinary, override-free code paths (the testnet
 * build loader, the app runtime source, sepolia:verify and buildConfiguredEvmRecovery) can be exercised under a
 * test-only pin (D3 acceptance check 2). Production code has no pin seam and never loads this file; the committed
 * source pin stays null. It refuses to run unless the committed source still has the null pin it replaces.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/test-support/with-test-sepolia-pin.mjs <keyId> <scenario.mjs> <input.json>
 *
 * Prints the scenario's JSON result on stdout.
 */
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const [pin, scenario, input] = process.argv.slice(2);
if (!/^[0-9a-f]{64}$/.test(pin ?? '') || !scenario || !input) throw new Error('TEST_PIN_USAGE');
const target = new URL('../../apps/web/src/testnet/sepolia-network.ts', import.meta.url).href;
const NULL_PIN = /export const SEPOLIA_RELEASE_KEY_ID(\s*:\s*string\s*\|\s*null)?\s*=\s*null;/;
let applied = 0;
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== target) return result;
    const text = new TextDecoder().decode(result.source);
    if (!NULL_PIN.test(text)) throw new Error('TEST_PIN_SITE_NOT_FOUND');
    applied++;
    return { ...result, source: text.replace(NULL_PIN, match => match.replace(/null;$/, `${JSON.stringify(pin)};`)) };
  },
});
const { default: run } = await import(pathToFileURL(scenario).href);
const result = await run(JSON.parse(await readFile(input, 'utf8')));
const { SEPOLIA_RELEASE_KEY_ID } = await import(target);
if (applied !== 1 || SEPOLIA_RELEASE_KEY_ID !== pin) throw new Error('TEST_PIN_NOT_APPLIED');
console.log(JSON.stringify(result));
