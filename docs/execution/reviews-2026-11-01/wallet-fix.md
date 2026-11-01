# T25 independent error-boundary review

APPROVED. Removed unsafe instanceof check on foreign thrown objects; canonical normalizeError catches descriptor traps and copies only known fixed code metadata. Local ReaderFailure own code descriptors preserve INVALID_INPUT/INTEGRITY_FAILURE. No send/sign or state authority added.

Direct focused suite5/5PASS; new test exercises all8reader operations with hostile getPrototypeOf/getOwnPropertyDescriptor proxy throws; all return fixed UNAVAILABLE CoreResult and no raw private messages/URLs. Existing malformed native outputs preserve local integrity failures and cancellation remainsCANCELLED. No sourcewrites/whole suite.

## Source hashes
- `packages/wallet/src/evm-submit.ts` `c5d23b880e5a150a3c9ad63b724a321927046044174a7feb12cd79b52e36f92b`
- `packages/wallet/test/evm-submit.test.mjs` `f36c852b62b48330babd0d9929a46e6309c03c5f91ac69b893cdc23f7bf6c5d4`
- `packages/domain/src/errors.ts` `2a8d8bc2f199c4ae803ef3e16ba42a84d3868c66a780dbdb1d15c71320c442a5`
