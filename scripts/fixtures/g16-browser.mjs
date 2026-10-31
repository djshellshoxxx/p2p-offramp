/** Private browser qualification entry. Public synthetic inputs only; never imported by the app.
 * Node prepares same-provider integration signatures. This module only hashes/recovers public data.
 */
import { keccak256, stringWord, addressWord, uintWord, eip712Digest, domainSeparator,
  tradeTermsStructHash, evmTermsHash, verifyEoaSignature, verifyEoaAcceptance, TRADE_TERMS_TYPE } from '../../packages/wallet/src/evm-terms.ts';
import { verifyEvmAgreementBundle } from '../../packages/wallet/src/evm-agreement.ts';
import { createEvmAgreementHost } from '../../packages/wallet/test/lib/evm-agreement-host.ts';
import { encodePrivateAgreement, encodeCapabilities, sha256Hex } from '../../packages/domain/index.ts';
import { parseEvmAgreementInput } from '../../packages/schemas/src/evm-agreement-input.ts';
import { parseEvmAgreementCheckRequest, parseEvmAgreementCheckReply } from '../../packages/schemas/src/evm-agreement-protocol.ts';

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
const enc = text => new TextEncoder().encode(text);
const cat = (...parts) => { const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; } return bytes; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const cleared = arrays => arrays.every(bytes => bytes.every(byte => byte === 0));

/** Fixture contract only, not a peer/file import or application Worker API. Returns counts/codes only. */
export async function runG16BrowserQualification(corpus) {
  let assertions = 0;
  const groups = [];
  const check = (condition, code) => { assertions++; if (!condition) throw new Error('G16_BROWSER_' + code); };
  check(globalThis.isSecureContext === true && typeof crypto.subtle?.digest === 'function', 'NATIVE_CRYPTO_UNAVAILABLE');
  check(!('ethereum' in globalThis) && !('solana' in globalThis), 'UNEXPECTED_WALLET');
  const verify = (bundle, options = {}) => verifyEvmAgreementBundle(bundle, { isCurrent: () => true, ...options });
  const ok = result => { check(result.ok === true, 'EXPECTED_SUCCESS'); return result.value; };
  const failure = (result, code) => {
    check(result.ok === false && result.error.code === code, 'EXPECTED_' + code);
    check(!/PRIVATE-FIXTURE|paymentInstructions|agreementSalt|signature|https:\/\//.test(JSON.stringify(result)), 'PRIVATE_DIAGNOSTIC');
  };
  const bundleAt = index => {
    const bundle = structuredClone(corpus.bundles[index]);
    for (const acceptance of bundle.acceptances) acceptance.signature = Uint8Array.from(acceptance.signature);
    return bundle;
  };

  // Independent known answers retained unchanged. No browser signing is used to produce expectations.
  for (const vector of corpus.keccak.keccak256) check(hex(keccak256(enc(vector.utf8))) === vector.digest, 'KECCAK_KAT');
  const mail = corpus.keccak.etherMail;
  const personType = 'Person(string name,address wallet)', mailType = `Mail(Person from,Person to,string contents)${personType}`;
  const person = (name, account) => keccak256(cat(keccak256(enc(personType)), stringWord(name), addressWord(account)));
  const struct = keccak256(cat(keccak256(enc(mailType)), person('Cow', '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826'),
    person('Bob', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), stringWord('Hello, Bob!')));
  const domain = keccak256(cat(keccak256(enc('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
    stringWord('Ether Mail'), stringWord('1'), uintWord(1n, (1n << 256n) - 1n), addressWord('0xcccccccccccccccccccccccccccccccccccccccc')));
  check(hex(keccak256(enc(mailType))) === mail.mailTypeHash && hex(struct) === mail.mailStructHash, 'MAIL_STRUCT');
  check(hex(domain) === mail.domainSeparator && hex(eip712Digest(domain, struct)) === mail.signingHash, 'MAIL_DOMAIN_DIGEST');
  const mailSignature = cat(unhex(mail.signature.r), unhex(mail.signature.s), Uint8Array.of(mail.signature.v));
  check(verifyEoaSignature(mail.signingHash, mailSignature, mail.signature.signer), 'MAIL_RECOVERY');
  mailSignature.fill(0);
  let signatures = 0;
  for (const vector of corpus.evm.vectors) {
    check(hex(keccak256(enc(TRADE_TERMS_TYPE))) === vector.typeHash, 'G16_TYPE');
    check(hex(domainSeparator(vector.domain)) === vector.domainSeparator, 'G16_DOMAIN');
    check(hex(tradeTermsStructHash(vector.terms)) === vector.structHash, 'G16_STRUCT');
    check(evmTermsHash(vector.domain, vector.terms) === vector.termsHash, 'G16_DIGEST');
    for (const acceptance of vector.acceptances ?? []) {
      const signature = unhex(acceptance.signature);
      check(verifyEoaAcceptance(vector.domain, vector.terms, acceptance.role, signature), 'G16_SIGNATURE');
      check(!verifyEoaAcceptance(vector.domain, vector.terms, acceptance.role === 'seller' ? 'buyer' : 'seller', signature), 'G16_ROLE_REPLAY');
      check(!verifyEoaAcceptance({ ...vector.domain, chainId: '2' }, vector.terms, acceptance.role, signature), 'G16_CHAIN_REPLAY');
      signature.fill(0); signatures++;
    }
  }
  check(corpus.evm.vectors.length === 6 && signatures === 4, 'INDEPENDENT_VECTOR_COUNT');
  groups.push('independent public digest and EOA known answers');

  for (const vector of corpus.private.privateAgreements) {
    const privateBytes = encodePrivateAgreement(vector.input), caps = encodeCapabilities(vector.input.capabilities);
    try {
      check(hex(privateBytes) === vector.bytesHex, 'PRIVATE_ENCODING');
      check(await sha256Hex(privateBytes) === vector.privateAgreementHash && await sha256Hex(caps) === vector.capabilitiesHash, 'PRIVATE_COMMITMENTS');
    } finally { privateBytes.fill(0); caps.fill(0); }
  }
  groups.push('retained Python-implementation private encoding and SHA256 expectations');

  // Structural-only pre-clone snapshot: no crypto, no verifier lifecycle. Counts/codes only.
  const structCode = mutate => {
    const bundle = bundleAt(0); mutate(bundle);
    let snap;
    try { snap = parseEvmAgreementInput(bundle); return 'OK'; } catch (error) { return error?.code ?? 'OTHER'; }
    finally { if (snap) for (const acceptance of snap.acceptances) acceptance.signature.fill(0); }
  };
  for (let index = 0; index < corpus.bundles.length; index++) {
    const bundle = bundleAt(index), before = JSON.stringify(bundle), snap = parseEvmAgreementInput(bundle);
    check(snap.acceptances.length === 2 && Object.isFrozen(snap) && Object.isFrozen(snap.terms) && Object.isFrozen(snap.acceptances), 'STRUCT_FROZEN');
    check(snap.acceptances.every((a, i) => a.signature.byteLength === 65 && a.signature.buffer.byteLength === 65 &&
      a.signature.buffer !== bundle.acceptances[i].signature.buffer && !Object.isFrozen(a.signature)), 'STRUCT_SIGNATURE_COPY');
    bundle.acceptances[0].signature.fill(0); bundle.terms.amountBaseUnits = '2'; bundle.privateAgreement.paymentInstructions = 'changed';
    check(snap.acceptances[0].signature.some(byte => byte !== 0) && snap.terms.amountBaseUnits !== '2' &&
      snap.privateAgreement.paymentInstructions !== 'changed', 'STRUCT_INDEPENDENT');
    check(before !== JSON.stringify(bundle) && !('verified' in snap), 'STRUCT_NO_AUTHORITY');
    for (const acceptance of snap.acceptances) acceptance.signature.fill(0);
  }
  check(structCode(b => { b.acceptances.reverse(); }) === 'OK', 'STRUCT_ORDER');
  check(structCode(b => { b.acceptances[0].termsHash = 'f'.repeat(64); b.acceptances[0].signature.fill(1); }) === 'OK', 'STRUCT_NOT_VERIFIER');
  check(structCode(b => { b.privateAgreement.v = 2; }) === 'UNSUPPORTED_VERSION', 'STRUCT_VERSION');
  check(structCode(b => { b.extra = true; }) === 'INVALID_INPUT', 'STRUCT_EXTRA');
  check(structCode(b => { b.privateAgreement.paymentInstructions = 'x'.repeat(4097); }) === 'LIMIT_EXCEEDED', 'STRUCT_TEXT_LIMIT');
  check(structCode(b => { b.terms.amountBaseUnits = '9'.repeat(5000); }) === 'INVALID_INPUT', 'STRUCT_DECIMAL_WIDTH');
  check(structCode(b => { b.acceptances[0].signature = new Uint8Array(66); }) === 'INVALID_INPUT', 'STRUCT_SIGNATURE_WIDTH');
  check(structCode(b => { b.acceptances[0].signature = new Proxy(b.acceptances[0].signature, {}); }) === 'INVALID_INPUT', 'STRUCT_PROXY');
  check(structCode(b => { b.acceptances.push(b.acceptances[0]); }) === 'LIMIT_EXCEEDED', 'STRUCT_ACCEPTANCE_COUNT');
  let structGetter = 0;
  check(structCode(b => { Object.defineProperty(b.terms, 'buyer', { enumerable: true, get() { structGetter++; throw Error('PRIVATE-FIXTURE'); } }); }) === 'INVALID_INPUT' && structGetter === 0, 'STRUCT_GETTER');
  const offset = bundleAt(0), backing = new ArrayBuffer(300), view = new Uint8Array(backing, 100, 65); view.set(offset.acceptances[0].signature);
  offset.acceptances[0].signature = view; const offsetSnap = parseEvmAgreementInput(offset);
  check(offsetSnap.acceptances[0].signature.buffer.byteLength === 65 && offsetSnap.acceptances[0].signature.every((byte, i) => byte === view[i]), 'STRUCT_OFFSET_VIEW');
  for (const acceptance of offsetSnap.acceptances) acceptance.signature.fill(0);
  groups.push('bounded structural pre-clone input snapshot (parser only, not Worker lifecycle)');

  for (let index = 0; index < corpus.bundles.length; index++) {
    const source = bundleAt(index);
    let snap;
    try {
      snap = parseEvmAgreementInput(source);
      const result = ok(await verify(snap));
      check(result.termsHash === corpus.nodeDigests[index], 'STRUCT_TO_VERIFIER_PARITY');
    } finally { if (snap) for (const acceptance of snap.acceptances) acceptance.signature.fill(0); }
  }
  groups.push('parser snapshot feeds real verifier with same-provider complete-bundle parity');

  for (let index = 0; index < corpus.bundles.length; index++) {
    const bundle = bundleAt(index), before = JSON.stringify(bundle), result = ok(await verify(bundle));
    check(result.termsHash === corpus.nodeDigests[index] && result.termsHash === evmTermsHash(bundle.domain, bundle.terms), 'BUNDLE_PARITY');
    check(result.testOnly === true && result.economicPreparationAllowed === false, 'SPENDING_DISABLED');
    check(Object.isFrozen(result) && Object.isFrozen(result.accounts), 'FROZEN_OUTPUT');
    check(!/paymentInstructions|agreementSalt|signature|capabilities/.test(JSON.stringify(result)), 'PRIVATE_OUTPUT');
    check(before === JSON.stringify(bundle), 'CALLER_UNCHANGED');
  }
  groups.push('same-provider native ERC20 and nonempty-capability integration bundles');

  for (const field of ['paymentInstructions', 'agreementSalt', 'orderId', 'revision']) {
    const bundle = bundleAt(0);
    bundle.privateAgreement[field] = field === 'revision' ? '2' : field === 'paymentInstructions' ? 'PRIVATE-FIXTURE tamper' : 'f'.repeat(64);
    failure(await verify(bundle), 'INTEGRITY_FAILURE');
  }
  for (const kind of ['amount', 'chain', 'contract']) {
    const bundle = bundleAt(0);
    if (kind === 'amount') bundle.terms.amountBaseUnits = '2';
    if (kind === 'chain') bundle.domain.chainId = '1';
    if (kind === 'contract') bundle.domain.verifyingContract = '0x' + '55'.repeat(20);
    failure(await verify(bundle), 'INTEGRITY_FAILURE');
    for (const acceptance of bundle.acceptances) acceptance.termsHash = evmTermsHash(bundle.domain, bundle.terms);
    failure(await verify(bundle), 'UNAUTHORIZED');
  }
  const wrongRole = bundleAt(0); wrongRole.acceptances[0].signature = wrongRole.acceptances[1].signature;
  failure(await verify(wrongRole), 'UNAUTHORIZED');
  const duplicate = bundleAt(0); duplicate.acceptances[0].role = 'buyer'; failure(await verify(duplicate), 'INVALID_INPUT');
  groups.push('private commitment tamper domain replay and distinct role binding');

  let getterCalls = 0;
  for (const key of ['outer', 'privateAgreement', 'domain', 'terms', 'acceptance', 'array']) {
    const bundle = bundleAt(0), object = key === 'outer' ? bundle : key === 'acceptance' ? bundle.acceptances[0] : key === 'array' ? bundle.acceptances : bundle[key];
    Object.defineProperty(object, key === 'array' ? '0' : Object.keys(object)[0], { get() { getterCalls++; throw Error('PRIVATE-FIXTURE accessor'); } });
    failure(await verify(bundle), 'INVALID_INPUT');
  }
  check(getterCalls === 0, 'GETTER_EXECUTED');
  const long = bundleAt(0); long.privateAgreement.paymentInstructions = 'x'.repeat(4097); failure(await verify(long), 'LIMIT_EXCEEDED');
  const caps = bundleAt(0); caps.privateAgreement.capabilities = Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, version: '1', policyHash: 'a'.repeat(64) }));
  failure(await verify(caps), 'LIMIT_EXCEEDED');
  const sparse = bundleAt(0); delete sparse.acceptances[0]; failure(await verify(sparse), 'INVALID_INPUT');
  const extra = bundleAt(0); extra.acceptances.push(extra.acceptances[0]); failure(await verify(extra), 'LIMIT_EXCEEDED');
  const hugeSig = bundleAt(0); hugeSig.acceptances[0].signature = new Uint8Array(100000); failure(await verify(hugeSig), 'INVALID_INPUT');
  const proxy = bundleAt(0); proxy.acceptances[0].signature = new Proxy(proxy.acceptances[0].signature, {}); failure(await verify(proxy), 'INVALID_INPUT');
  const revoked = Proxy.revocable(new Uint8Array(65), {}); revoked.revoke();
  const badProxy = bundleAt(0); badProxy.acceptances[0].signature = revoked.proxy; failure(await verify(badProxy), 'INVALID_INPUT');
  const utf8 = bundleAt(0); utf8.privateAgreement.paymentInstructions = '\ud800'; failure(await verify(utf8), 'INVALID_INPUT');
  const highS = bundleAt(0), sig = highS.acceptances[0].signature;
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  sig.set(unhex((n - BigInt('0x' + hex(sig.subarray(32, 64)))).toString(16).padStart(64, '0')), 32);
  sig[64] = sig[64] === 27 ? 28 : 27; failure(await verify(highS), 'INVALID_INPUT');
  groups.push('bounded malformed accessor proxy sparse UTF8 and low-s refusal');

  const override = bundleAt(0); let overrides = 0;
  for (const acceptance of override.acceptances) {
    Object.defineProperty(acceptance.signature, 'byteLength', { get() { overrides++; throw Error('PRIVATE-FIXTURE length'); } });
    acceptance.signature[Symbol.iterator] = () => { overrides++; throw Error('PRIVATE-FIXTURE iterator'); };
    acceptance.signature.subarray = () => { overrides++; throw Error('PRIVATE-FIXTURE subarray'); };
  }
  ok(await verify(override)); check(overrides === 0, 'SIGNATURE_OVERRIDE_EXECUTED');
  groups.push('intrinsic signature copy without caller overrides');

  for (const at of [1, 2]) for (const reason of ['abort', 'generation']) {
    const bundle = bundleAt(0), entered = deferred(), gate = deferred(), observed = [], controller = new AbortController(); let generation = 1;
    const pending = verify(bundle, { signal: controller.signal, isCurrent: () => generation === 1, sha256: async bytes => {
      observed.push(bytes); const native = crypto.subtle.digest('SHA-256', bytes);
      if (observed.length === at) { entered.resolve(); await gate.promise; } return native;
    } });
    await entered.promise;
    if (reason === 'abort') { controller.abort(); check(cleared(observed), 'ABORT_WIPE_IMMEDIATE'); } else generation++;
    gate.resolve(); failure(await pending, 'CANCELLED');
    check(observed.length === at && cleared(observed), 'CANCEL_WIPE_TERMINAL');
  }
  const aborted = new AbortController(); aborted.abort(); let called = 0;
  failure(await verify(bundleAt(0), { signal: aborted.signal, sha256: async () => { called++; return new ArrayBuffer(32); } }), 'CANCELLED');
  check(called === 0, 'PREABORT_HASH_CALLED');
  failure(await verify(bundleAt(0), { isCurrent: () => false }), 'CANCELLED');
  groups.push('abort and generation guards at both native SHA awaits');

  const captured = bundleAt(0), entered = deferred(), gate = deferred(), observed = [];
  const pending = verify(captured, { sha256: async bytes => {
    observed.push(bytes); const native = crypto.subtle.digest('SHA-256', bytes);
    if (observed.length === 1) { entered.resolve(); await gate.promise; } return native;
  } });
  await entered.promise;
  captured.privateAgreement.paymentInstructions = 'PRIVATE-FIXTURE late mutation'; captured.domain.chainId = '1';
  captured.terms.amountBaseUnits = '2'; captured.acceptances[0].signature.fill(0);
  gate.resolve(); check(ok(await pending).termsHash === corpus.nodeDigests[0], 'CAPTURED_SNAPSHOT');
  check(cleared(observed), 'SNAPSHOT_BUFFERS_CLEAR');
  const early = [], earlyEntered = deferred(), earlyGate = deferred();
  const earlyPending = verify(bundleAt(0), { sha256: async bytes => {
    early.push(bytes); const native = crypto.subtle.digest('SHA-256', bytes);
    if (early.length === 2) { earlyEntered.resolve(); await earlyGate.promise; } return native;
  } });
  await earlyEntered.promise; const alreadyCleared = early[0].every(byte => byte === 0);
  earlyGate.resolve(); ok(await earlyPending);
  check(alreadyCleared && cleared(early), 'PRIVATE_BUFFER_LIFETIME');
  groups.push('immutable snapshot and private buffer clearing before later hash completes');

  for (const at of [1, 2]) {
    const observed = [];
    failure(await verify(bundleAt(0), { sha256: async bytes => {
      observed.push(bytes); if (observed.length === at) throw Error('PRIVATE-FIXTURE native failure'); return crypto.subtle.digest('SHA-256', bytes);
    } }), 'UNAVAILABLE');
    check(observed.length === at && cleared(observed), 'FAILED_BACKEND_WIPE');
  }
  groups.push('sanitized hash failure and terminal buffer clearing');

  // Private request -> REAL verifier -> strict reply. Structural schema only: header IDs are data, not authority,
  // and the trusted verifier context (isCurrent/signal/sha256) never travels in the request or reply.
  const MAXSEQ = Number.MAX_SAFE_INTEGER - 1;
  const wipeReq = request => { if (request) for (const acceptance of request.input.acceptances) acceptance.signature.fill(0); };
  const protoCode = fn => { try { fn(); return 'OK'; } catch (error) { return error?.name === 'CoreSchemaError' ? error.code : 'OTHER'; } };
  const toReply = (requestId, generation, result) => ({ version: 1, requestId, generation, operation: 'checkEvmAgreement', kind: 'response',
    result: result.ok ? { ok: true, value: { testOnly: result.value.testOnly, economicPreparationAllowed: result.value.economicPreparationAllowed,
      termsHash: result.value.termsHash, accounts: { seller: result.value.accounts.seller, buyer: result.value.accounts.buyer } } }
      : { ok: false, error: { code: result.error.code } } });
  for (let index = 0; index < corpus.bundles.length; index++) {
    let request;
    try {
      request = parseEvmAgreementCheckRequest({ version: 1, requestId: index + 1, generation: 3, operation: 'checkEvmAgreement', input: bundleAt(index) });
      check(Object.isFrozen(request) && request.input.acceptances.length === 2 && request.requestId === index + 1, 'PROTO_REQUEST_SHAPE');
      const verified = await verify(request.input);
      const reply = parseEvmAgreementCheckReply(toReply(request.requestId, request.generation, verified));
      check(reply.result.ok === true && reply.result.value.termsHash === corpus.nodeDigests[index], 'PROTO_NODE_DIGEST_PARITY');
      check(reply.result.value.testOnly === true && reply.result.value.economicPreparationAllowed === false && Object.isFrozen(reply.result), 'PROTO_SPENDING_DISABLED');
      check(!/paymentInstructions|agreementSalt|signature|capabilities/.test(JSON.stringify(reply)), 'PROTO_PRIVATE_REPLY');
    } finally { wipeReq(request); }
  }
  // Real failed CoreResult -> code-only reply projection (not the richer error object).
  {
    let request;
    try {
      const tampered = bundleAt(0); tampered.terms.amountBaseUnits = '2';
      request = parseEvmAgreementCheckRequest({ version: 1, requestId: 7, generation: 0, operation: 'checkEvmAgreement', input: tampered });
      const verified = await verify(request.input);
      check(verified.ok === false, 'PROTO_EXPECT_FAILURE');
      const reply = parseEvmAgreementCheckReply(toReply(7, 0, verified));
      check(reply.result.ok === false && reply.result.error.code === verified.error.code && Object.keys(reply.result.error).length === 1, 'PROTO_FAILURE_CODE_ONLY');
      check(protoCode(() => parseEvmAgreementCheckReply({ ...toReply(7, 0, verified), result: verified })) === 'INVALID_INPUT', 'PROTO_RICH_ERROR_REJECTED');
    } finally { wipeReq(request); }
  }
  // Header/shape refusal before body touch, meta-trap sanitization, privacy.
  let bodyTouched = 0;
  const spyBody = new Proxy(bundleAt(0), { ownKeys(t) { bodyTouched++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, k) { bodyTouched++; return Reflect.getOwnPropertyDescriptor(t, k); } });
  for (const header of [{ version: 1, requestId: 0, generation: 0 }, { version: 1, requestId: MAXSEQ + 1, generation: 0 },
    { version: 1, requestId: 1, generation: -1 }, { version: 2, requestId: 1, generation: 0 }]) {
    check(protoCode(() => parseEvmAgreementCheckRequest({ ...header, operation: 'checkEvmAgreement', input: spyBody })) === 'INVALID_INPUT', 'PROTO_HEADER_REFUSAL');
  }
  check(protoCode(() => parseEvmAgreementCheckRequest({ version: 1, requestId: 1, generation: 0, operation: 'status', input: spyBody })) === 'INVALID_INPUT', 'PROTO_OPERATION_REFUSAL');
  check(bodyTouched === 0, 'PROTO_BODY_TOUCHED');
  const forged = Object.assign(new Error('PRIVATE-FIXTURE forged'), { name: 'CoreSchemaError', code: 'LIMIT_EXCEEDED' });
  let sanitized;
  try { parseEvmAgreementCheckRequest({ version: 1, requestId: 1, generation: 0, operation: 'checkEvmAgreement', input: new Proxy({}, { ownKeys() { throw forged; } }) }); }
  catch (error) { sanitized = error; }
  check(sanitized !== undefined && sanitized !== forged && sanitized.code === 'INVALID_INPUT' && !String(sanitized.message).includes('PRIVATE-FIXTURE'), 'PROTO_TRAP_SANITIZED');
  check(protoCode(() => parseEvmAgreementCheckReply({ version: 1, requestId: 1, generation: 0, operation: 'checkEvmAgreement', kind: 'response', extra: 1,
    result: { ok: false, error: { code: 'BUSY' } } })) === 'INVALID_INPUT', 'PROTO_REPLY_EXTRA');
  check(parseEvmAgreementCheckReply({ version: 1, requestId: 1, generation: 0, operation: 'checkEvmAgreement', kind: 'response',
    result: { ok: false, error: { code: 'BUSY' } } }).result.error.code === 'BUSY', 'PROTO_BUSY_CODE');
  groups.push('private request-reply schema around the real verifier (structural, header IDs are data only)');

  // Actual host lifecycle around the REAL verifier. Only the sha256 seam is supplied (wrapping native digest);
  // no fake verifier, clock or timer, so the 30s bound is not exercised. Direct host calls: not transport/app inclusion.
  // Oracle rule: observed verifier arrays are asserted cleared BEFORE any test-owned cleanup; cleanup never masks assertions.
  {
    const hostRequest = (id, gen, input) => ({ version: 1, requestId: id, generation: gen, operation: 'checkEvmAgreement', input });
    const hostWipe = arrays => { for (const bytes of arrays) bytes.fill(0); };
    // One event-loop turn: drain barrier AFTER known backend completion, not a retry or poll.
    const drain = () => new Promise(done => setTimeout(done, 0));
    // Coherent: every corpus bundle through the real verifier via the host.
    {
      const observed = [], host = createEvmAgreementHost({ sha256: async bytes => {
        observed.push(bytes); return crypto.subtle.digest('SHA-256', bytes);
      } });
      try {
        for (let index = 0; index < corpus.bundles.length; index++) {
          const hostReply = await host.dispatch(hostRequest(index + 1, 0, bundleAt(index)));
          check(hostReply !== undefined && hostReply.requestId === index + 1 && hostReply.generation === 0 && hostReply.result.ok === true, 'HOST_COHERENT_OK');
          check(hostReply.result.value.termsHash === corpus.nodeDigests[index], 'HOST_NODE_DIGEST_PARITY');
          check(hostReply.result.value.testOnly === true && hostReply.result.value.economicPreparationAllowed === false, 'HOST_SPENDING_DISABLED');
          check(!/paymentInstructions|agreementSalt|signature|capabilities/.test(JSON.stringify(hostReply)), 'HOST_PRIVATE_REPLY');
        }
        check(observed.length > 0, 'HOST_REAL_HASH_USED');
        check(cleared(observed), 'HOST_OBSERVED_CLEARED');
      } finally { host.dispose(); hostWipe(observed); }
    }
    // Held SHA at first and second await: invalidate, BUSY while held, backend completion + drain, then recovery.
    for (const at of [1, 2]) {
      const observed = [], entered = deferred(), gate = deferred(), backendDone = deferred();
      const host = createEvmAgreementHost({ sha256: async bytes => {
        observed.push(bytes);
        const native = crypto.subtle.digest('SHA-256', bytes);
        if (observed.length === at) {
          entered.resolve();
          await gate.promise;
          try { return await native; } finally { backendDone.resolve(); }
        }
        return native;
      } });
      try {
        const pending = host.dispatch(hostRequest(1, 0, bundleAt(0)));
        await entered.promise;
        host.invalidate();
        check(host.generation === 1, 'HOST_INVALIDATE_GENERATION');
        // Physical slot still held: current-generation request must be BUSY BEFORE the gate is released.
        const busy = await host.dispatch(hostRequest(2, 1, bundleAt(0)));
        check(busy !== undefined && busy.requestId === 2 && busy.generation === 1 && busy.result.ok === false && busy.result.error.code === 'BUSY', 'HOST_BUSY_UNTIL_SETTLED');
        gate.resolve();
        check(await pending === undefined, 'HOST_INVALIDATED_QUIET');
        // Explicit completion of the held backend digest, then one event-loop turn to drain verifier/host finalizers.
        await backendDone.promise;
        await drain();
        check(observed.length >= at, 'HOST_HELD_REACHED');
        check(cleared(observed), 'HOST_HELD_OBSERVED_CLEARED_BEFORE_RECOVERY');
        const fresh = await host.dispatch(hostRequest(3, 1, bundleAt(0)));
        check(fresh !== undefined && fresh.requestId === 3 && fresh.generation === 1 && fresh.result.ok === true && fresh.result.value.termsHash === corpus.nodeDigests[0], 'HOST_RECOVERY_AFTER_RELEASE');
        check(cleared(observed), 'HOST_HELD_OBSERVED_CLEARED_FINAL');
      } finally { gate.resolve(); host.dispose(); hostWipe(observed); }
    }
    // Dispose is quiet: a held job disposed settles to no reply and later dispatches are refused silently.
    {
      const observed = [], entered = deferred(), gate = deferred(), backendDone = deferred();
      const host = createEvmAgreementHost({ sha256: async bytes => {
        observed.push(bytes);
        const native = crypto.subtle.digest('SHA-256', bytes);
        if (observed.length === 1) {
          entered.resolve();
          await gate.promise;
          try { return await native; } finally { backendDone.resolve(); }
        }
        return native;
      } });
      try {
        const pending = host.dispatch(hostRequest(1, 0, bundleAt(0)));
        await entered.promise;
        host.dispose();
        gate.resolve();
        check(await pending === undefined, 'HOST_DISPOSE_QUIET');
        await backendDone.promise;
        await drain();
        check(observed.length >= 1, 'HOST_DISPOSE_REACHED');
        check(cleared(observed), 'HOST_DISPOSE_OBSERVED_CLEARED');
        check(await host.dispatch(hostRequest(2, 0, bundleAt(0))) === undefined, 'HOST_DISPOSED_REFUSES');
      } finally { gate.resolve(); host.dispose(); hostWipe(observed); }
    }
    groups.push('actual host lifecycle around real verifier (direct call; invalidate, BUSY while held, backend-completion drain, quiet dispose)');
  }
  return Object.freeze({ assertions, groups, independentKeccakKats: 2, independentG16Digests: 6,
    independentG16Signatures: signatures, officialMailRecovery: true, retainedPrivateEncodingVectors: 2,
    sameProviderIntegrationBundles: corpus.bundles.length, heldCancellationSchedules: 4,
    runtime: typeof document === 'undefined' ? 'dedicated-module-worker' : 'document',
    testOnly: true, economicPreparationAllowed: false, privateDetailsReturned: false });
}
