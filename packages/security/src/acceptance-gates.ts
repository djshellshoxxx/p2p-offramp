/** Offline G24 evidence consistency checks. This local-v1 profile is not a release manifest wire protocol.
 * Imported decisions/names are data. Only a separately injected trusted review verifier can authenticate review.
 * Even a passing report grants no runtime, deployment, signing or promotion authority.
 */
export const ACCEPTANCE_LIMITS = Object.freeze({ records: 128, requirements: 128, targets: 32, testCases: 256,
  digests: 256, textUnits: 2 * 1024 * 1024, nodes: 60_000, findings: 4096 });
export type AcceptanceCode = 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'GATE_INCOMPLETE' | 'TARGET_UNTESTED' |
  'REVIEW_SCOPE_MISMATCH' | 'STALE_EVIDENCE' | 'EVIDENCE_FAILED' | 'CANCELLED' | 'UNAVAILABLE';
export type EvidenceOutcome = 'pass' | 'fail' | 'unsupported' | 'not-run';
export type ReviewRole = 'designer' | 'implementer' | 'independent-reviewer';
export type TargetKind = 'automated' | 'emulated-device' | 'physical-device';
export type Milestone = 'M0' | 'M1' | 'M2A' | 'M2B' | 'M2C' | 'M3' | 'M4' | 'M5' | 'M6';
export interface SpecDigest { readonly id: string; readonly sha256: string; }
export interface ArtifactDigest extends SpecDigest { readonly kind: 'asset' | 'compiler' | 'dependencies' | 'build-recipe' | 'deployment'; }
export interface AcceptanceTarget { readonly id: string; readonly kind: TargetKind; }
export interface AcceptanceRequirement {
  readonly id: string; readonly milestone: Milestone; readonly mandatory: boolean; readonly advertised: boolean;
  readonly targets: readonly AcceptanceTarget[]; readonly reviewRole: ReviewRole;
}
export interface AcceptanceCandidate {
  readonly format: 'p2p-offramp/acceptance-candidate/v1'; readonly sourceCommit: string;
  readonly specDigests: readonly SpecDigest[]; readonly artifactDigests: readonly ArtifactDigest[];
  readonly contributors: Readonly<{ designers: readonly string[]; implementers: readonly string[] }>;
  readonly requirements: readonly AcceptanceRequirement[];
}
export interface GateRecord {
  readonly id: string; readonly milestone: Milestone; readonly requirementIds: readonly string[];
  readonly specDigests: readonly SpecDigest[]; readonly sourceCommit: string; readonly artifactDigests: readonly ArtifactDigest[];
  readonly testCases: readonly Readonly<{ id: string; requirementId: string; targetId: string; result: EvidenceOutcome; reportDigest: string }>[];
  readonly targetMatrix: readonly Readonly<AcceptanceTarget & { environment: string }>[]; readonly reportDigests: readonly string[];
  readonly reviewer: Readonly<{ id: string; role: ReviewRole; scope: readonly string[] }>;
  readonly decision: 'pending' | 'failed' | 'passed'; readonly decidedAt: number; readonly expiresOnChange: boolean;
  /** Local-v1 append-only linkage. Only a fully covered, current, trusted passing successor suppresses a record. */
  readonly supersedes: readonly string[];
}
export interface AcceptanceFinding {
  readonly code: AcceptanceCode; readonly recordId?: string; readonly requirementId?: string; readonly targetId?: string;
}
export interface GateEvaluation {
  readonly format: 'p2p-offramp/acceptance-report/v1'; readonly sourceCommit: string;
  readonly specDigests: readonly SpecDigest[]; readonly artifactDigests: readonly ArtifactDigest[];
  readonly decision: 'pending' | 'failed' | 'passed'; readonly scopeOnly: true;
  readonly releaseEnabled: false; readonly promotionAllowed: false;
  readonly findings: readonly AcceptanceFinding[]; readonly supersededRecordIds: readonly string[];
  readonly requirements: readonly Readonly<{ id: string; result: EvidenceOutcome;
    targets: readonly Readonly<AcceptanceTarget & { result: EvidenceOutcome }>[] }>[];
  /** Counts evaluated requirements, not raw test cases. */
  readonly totals: Readonly<{ requirements: number; pass: number; fail: number; unsupported: number; 'not-run': number }>;
}
export type AcceptanceResult = Readonly<{ ok: true; value: GateEvaluation }> | Readonly<{ ok: false; error: Readonly<{ code: AcceptanceCode }> }>;
export interface AcceptanceOptions {
  /** Trusted composition capability; never read from an evidence/candidate file. Must authenticate the exact record and scope. */
  readonly verifyReview?: (record: GateRecord, candidate: AcceptanceCandidate) => boolean | Promise<boolean>;
  readonly nowSeconds?: () => number;
  readonly signal?: AbortSignal;
}
type Data = Record<string, unknown>;
interface Budget { units: number; nodes: number; }
const refusals = new WeakMap<object, AcceptanceCode>();
class Refused extends Error { constructor(code: AcceptanceCode) { super('Acceptance evaluation refused.'); refusals.set(this, code); } }
const stop = (code: AcceptanceCode = 'INVALID_INPUT'): never => { throw new Refused(code); };
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function count(budget: Budget): void { if (++budget.nodes > ACCEPTANCE_LIMITS.nodes) stop('LIMIT_EXCEEDED'); }
function object(input: unknown, required: readonly string[], budget: Budget, optional: readonly string[] = []): Data {
  count(budget);
  if (typeof input !== 'object' || input === null || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return stop();
  const keys = Reflect.ownKeys(input);
  if (keys.length > required.length + optional.length || keys.some(key => typeof key !== 'string' || !required.includes(key) && !optional.includes(key))) return stop();
  const out: Data = Object.create(null) as Data;
  for (const key of [...required, ...optional]) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor) { if (required.includes(key)) return stop(); continue; }
    if (!descriptor.enumerable || !('value' in descriptor)) return stop();
    out[key] = descriptor.value;
  }
  return out;
}
function list(input: unknown, max: number, budget: Budget, min = 0): unknown[] {
  count(budget);
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return stop();
  const size: unknown = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < min) return stop();
  if (size > max) return stop('LIMIT_EXCEEDED');
  if (Reflect.ownKeys(input).length !== size + 1) return stop();
  return Array.from({ length: size }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return stop();
    return descriptor.value as unknown;
  });
}
function text(input: unknown, budget: Budget, max = 240): string {
  if (typeof input !== 'string' || !input.length || input.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(input)) return stop();
  budget.units += input.length; if (budget.units > ACCEPTANCE_LIMITS.textUnits) return stop('LIMIT_EXCEEDED');
  return input;
}
function hex(input: unknown, budget: Budget): string { const value = text(input, budget, 64); return /^[0-9a-f]{64}$/.test(value) ? value : stop(); }
function commit(input: unknown, budget: Budget): string { const value = text(input, budget, 64); return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value) ? value : stop(); }
function choice<T extends string>(input: unknown, choices: readonly T[]): T { return typeof input === 'string' && choices.includes(input as T) ? input as T : stop(); }
function bool(input: unknown): boolean { return typeof input === 'boolean' ? input : stop(); }
const roles = ['designer', 'implementer', 'independent-reviewer'] as const;
const kinds = ['automated', 'emulated-device', 'physical-device'] as const;
const milestones = ['M0', 'M1', 'M2A', 'M2B', 'M2C', 'M3', 'M4', 'M5', 'M6'] as const;
function unique<T>(items: readonly T[], key: (item: T) => string): readonly T[] {
  if (new Set(items.map(key)).size !== items.length) return stop(); return Object.freeze([...items]);
}
function ids(input: unknown, budget: Budget, min = 0, max = ACCEPTANCE_LIMITS.requirements): readonly string[] {
  return unique(list(input, max, budget, min).map(item => text(item, budget)), id => id);
}
function digests(input: unknown, budget: Budget, artifacts: true): readonly ArtifactDigest[];
function digests(input: unknown, budget: Budget, artifacts: false): readonly SpecDigest[];
function digests(input: unknown, budget: Budget, artifacts: boolean): readonly (ArtifactDigest | SpecDigest)[] {
  return unique(list(input, ACCEPTANCE_LIMITS.digests, budget, 1).map(item => {
    const raw = object(item, artifacts ? ['id', 'kind', 'sha256'] : ['id', 'sha256'], budget);
    const base = { id: text(raw.id, budget), sha256: hex(raw.sha256, budget) };
    return artifacts ? Object.freeze({ ...base, kind: choice(raw.kind, ['asset', 'compiler', 'dependencies', 'build-recipe', 'deployment'] as const) }) : Object.freeze(base);
  }), item => item.id);
}
function candidate(input: unknown, budget: Budget): AcceptanceCandidate {
  const raw = object(input, ['format', 'sourceCommit', 'specDigests', 'artifactDigests', 'contributors', 'requirements'], budget);
  if (raw.format !== 'p2p-offramp/acceptance-candidate/v1') return stop();
  const contributors = object(raw.contributors, ['designers', 'implementers'], budget);
  const artifacts = digests(raw.artifactDigests, budget, true);
  for (const kind of ['compiler', 'dependencies', 'build-recipe']) if (artifacts.filter(item => item.kind === kind).length !== 1) return stop();
  if (!artifacts.some(item => item.kind === 'asset')) return stop();
  const requirements = unique(list(raw.requirements, ACCEPTANCE_LIMITS.requirements, budget, 1).map(item => {
    const r = object(item, ['id', 'milestone', 'mandatory', 'advertised', 'targets', 'reviewRole'], budget);
    const targets = unique(list(r.targets, ACCEPTANCE_LIMITS.targets, budget, 1).map(item => {
      const t = object(item, ['id', 'kind'], budget); return Object.freeze({ id: text(t.id, budget), kind: choice(t.kind, kinds) });
    }), target => target.id);
    return Object.freeze({ id: text(r.id, budget), milestone: choice(r.milestone, milestones), mandatory: bool(r.mandatory), advertised: bool(r.advertised), targets, reviewRole: choice(r.reviewRole, roles) });
  }), requirement => requirement.id);
  return Object.freeze({ format: 'p2p-offramp/acceptance-candidate/v1', sourceCommit: commit(raw.sourceCommit, budget),
    specDigests: digests(raw.specDigests, budget, false), artifactDigests: artifacts,
    contributors: Object.freeze({ designers: ids(contributors.designers, budget, 1), implementers: ids(contributors.implementers, budget, 1) }), requirements });
}
function record(input: unknown, budget: Budget): GateRecord {
  const raw = object(input, ['id', 'milestone', 'requirementIds', 'specDigests', 'sourceCommit', 'artifactDigests', 'testCases', 'targetMatrix',
    'reportDigests', 'reviewer', 'decision', 'decidedAt', 'expiresOnChange'], budget, ['supersedes']);
  const reviewer = object(raw.reviewer, ['id', 'role', 'scope'], budget);
  const requirementIds = ids(raw.requirementIds, budget, 1);
  const reportDigests = unique(list(raw.reportDigests, ACCEPTANCE_LIMITS.digests, budget, 1).map(value => hex(value, budget)), value => value);
  const targets = unique(list(raw.targetMatrix, ACCEPTANCE_LIMITS.targets, budget, 1).map(item => {
    const t = object(item, ['id', 'kind', 'environment'], budget);
    return Object.freeze({ id: text(t.id, budget), kind: choice(t.kind, kinds), environment: text(t.environment, budget) });
  }), target => target.id);
  const cases = unique(list(raw.testCases, ACCEPTANCE_LIMITS.testCases, budget, 1).map(item => {
    const c = object(item, ['id', 'requirementId', 'targetId', 'result', 'reportDigest'], budget);
    const requirementId = text(c.requirementId, budget), targetId = text(c.targetId, budget), reportDigest = hex(c.reportDigest, budget);
    if (!requirementIds.includes(requirementId) || !targets.some(target => target.id === targetId) || !reportDigests.includes(reportDigest)) return stop();
    return Object.freeze({ id: text(c.id, budget), requirementId, targetId, result: choice(c.result, ['pass', 'fail', 'unsupported', 'not-run'] as const), reportDigest });
  }), item => item.id);
  if (typeof raw.decidedAt !== 'number' || !Number.isSafeInteger(raw.decidedAt) || raw.decidedAt < 0) return stop();
  return Object.freeze({ id: text(raw.id, budget), milestone: choice(raw.milestone, milestones), requirementIds,
    sourceCommit: commit(raw.sourceCommit, budget), specDigests: digests(raw.specDigests, budget, false), artifactDigests: digests(raw.artifactDigests, budget, true),
    testCases: cases, targetMatrix: targets, reportDigests, reviewer: Object.freeze({ id: text(reviewer.id, budget), role: choice(reviewer.role, roles), scope: ids(reviewer.scope, budget, 1) }),
    decision: choice(raw.decision, ['pending', 'failed', 'passed'] as const), decidedAt: raw.decidedAt, expiresOnChange: bool(raw.expiresOnChange),
    supersedes: raw.supersedes === undefined ? Object.freeze([]) : ids(raw.supersedes, budget, 0, ACCEPTANCE_LIMITS.records) });
}
function fingerprint(items: readonly (SpecDigest | ArtifactDigest)[]): string {
  return items.map(item => `${'kind' in item ? item.kind : 'spec'}:${item.id}:${item.sha256}`).sort(cmp).join('|');
}
function sameIds(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every(id => right.includes(id)); }
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const addListener = EventTarget.prototype.addEventListener, removeListener = EventTarget.prototype.removeEventListener;
function checkAbort(signal: unknown): void {
  if (signal === undefined) return;
  try { if (Reflect.apply(nativeAborted, signal, []) === true) return stop('CANCELLED'); } catch { return stop('CANCELLED'); }
}
async function reviewed(verify: NonNullable<AcceptanceOptions['verifyReview']>, r: GateRecord, c: AcceptanceCandidate, signal?: AbortSignal): Promise<boolean> {
  const pending = Promise.resolve().then(() => verify(r, c)).then(value => value === true, () => false);
  if (!signal) return pending;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Refused('CANCELLED')); Reflect.apply(addListener, signal, ['abort', abort, { once: true }]);
      if (Reflect.apply(nativeAborted, signal, [])) abort();
    })]);
  } finally { if (abort) Reflect.apply(removeListener, signal, ['abort', abort]); }
}
interface Checked { readonly record: GateRecord; readonly findings: AcceptanceFinding[]; trusted: boolean; full: boolean; }
/** Every input is detached before review callbacks run; foreign getters, toJSON and thrown values are never read. */
export async function evaluateGate(records: unknown, releaseCandidate: unknown, options: AcceptanceOptions = {}): Promise<AcceptanceResult> {
  try {
    const budget = { units: 0, nodes: 0 }, opts = object(options, [], budget, ['verifyReview', 'nowSeconds', 'signal']);
    const verify = opts.verifyReview, clock = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    if (verify !== undefined && typeof verify !== 'function' || typeof clock !== 'function') return stop();
    const signal = opts.signal as AbortSignal | undefined; checkAbort(signal);
    let previous = -1;
    const time = (): number => {
      let value: unknown; try { value = clock(); } catch { checkAbort(signal); return stop('UNAVAILABLE'); }
      checkAbort(signal);
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value < previous) return stop('UNAVAILABLE');
      previous = value; return value;
    };
    const now = time(), c = candidate(releaseCandidate, budget);
    const parsed = unique(list(records, ACCEPTANCE_LIMITS.records, budget).map(value => record(value, budget)), item => item.id).slice().sort((a, b) => cmp(a.id, b.id));
    checkAbort(signal);
    const byId = new Map(parsed.map(r => [r.id, r]));
    for (const r of parsed) {
      if (r.requirementIds.some(id => !c.requirements.some(req => req.id === id && req.milestone === r.milestone))) return stop();
      for (const id of r.supersedes) {
        const old = byId.get(id);
        if (!old || old.id === r.id || old.milestone !== r.milestone || !sameIds(old.requirementIds, r.requirementIds) || old.decidedAt > r.decidedAt) return stop();
      }
    }
    const visiting = new Set<string>(), visited = new Set<string>();
    const visit = (r: GateRecord): void => {
      if (visiting.has(r.id)) return stop(); if (visited.has(r.id)) return;
      visiting.add(r.id); r.supersedes.forEach(id => visit(byId.get(id)!)); visiting.delete(r.id); visited.add(r.id);
    };
    parsed.forEach(visit);
    const checked: Checked[] = [];
    let findingCount = 0;
    const finding = (value: AcceptanceFinding): AcceptanceFinding => {
      if (++findingCount > ACCEPTANCE_LIMITS.findings) return stop('LIMIT_EXCEEDED'); return Object.freeze(value);
    };
    for (const r of parsed) {
      checkAbort(signal);
      const findings: AcceptanceFinding[] = [], item: Checked = { record: r, findings, trusted: false, full: true };
      const add = (code: AcceptanceCode, requirementId?: string, targetId?: string): void => { findings.push(finding({ code, recordId: r.id, ...(requirementId ? { requirementId } : {}), ...(targetId ? { targetId } : {}) })); };
      if (r.sourceCommit !== c.sourceCommit || fingerprint(r.specDigests) !== fingerprint(c.specDigests) || fingerprint(r.artifactDigests) !== fingerprint(c.artifactDigests) || !r.expiresOnChange || r.decidedAt > now) add('STALE_EVIDENCE');
      if (r.decision !== 'passed') add(r.decision === 'failed' ? 'EVIDENCE_FAILED' : 'GATE_INCOMPLETE');
      for (const id of r.requirementIds) {
        const req = c.requirements.find(req => req.id === id)!;
        if (r.reviewer.role !== req.reviewRole || !r.reviewer.scope.includes(id) || req.reviewRole === 'independent-reviewer' &&
            [...c.contributors.designers, ...c.contributors.implementers].some(contributor => contributor.toLowerCase() === r.reviewer.id.toLowerCase())) add('REVIEW_SCOPE_MISMATCH', id);
        const cases = r.testCases.filter(test => test.requirementId === id);
        for (const test of cases) {
          const expected = req.targets.find(target => target.id === test.targetId), actual = r.targetMatrix.find(target => target.id === test.targetId)!;
          if (!expected || expected.kind !== actual.kind) add('TARGET_UNTESTED', id, test.targetId);
          if (test.result === 'fail') add('EVIDENCE_FAILED', id, test.targetId);
          if (test.result === 'not-run' || test.result === 'unsupported' && (req.mandatory || req.advertised)) add('TARGET_UNTESTED', id, test.targetId);
        }
        if (!req.targets.every(target => cases.some(test => test.targetId === target.id && r.targetMatrix.some(actual => actual.id === target.id && actual.kind === target.kind) &&
          (test.result === 'pass' || test.result === 'unsupported' && !req.mandatory && !req.advertised)))) item.full = false;
      }
      if (!findings.length && typeof verify === 'function') item.trusted = await reviewed(verify as NonNullable<AcceptanceOptions['verifyReview']>, r, c, signal);
      checkAbort(signal); time();
      if (!findings.length && !item.trusted) add('REVIEW_SCOPE_MISMATCH');
      checked.push(item);
    }
    const suppressed = new Set<string>();
    const suppress = (id: string): void => { if (suppressed.has(id)) return; suppressed.add(id); byId.get(id)!.supersedes.forEach(suppress); };
    for (const item of checked) if (item.trusted && item.full && !item.findings.length) item.record.supersedes.forEach(suppress);
    const active = checked.filter(item => !suppressed.has(item.record.id)), findings = active.flatMap(item => item.findings);
    const requirementResults = c.requirements.map(req => {
      const relevant = active.filter(item => item.record.requirementIds.includes(req.id));
      if (!relevant.length) findings.push(finding({ code: 'GATE_INCOMPLETE', requirementId: req.id }));
      let unsupported = 0, covered = 0;
      const targets = req.targets.map(target => {
        const accepted = relevant.filter(item => item.trusted && !item.findings.length).flatMap(item => item.record.testCases.filter(test => test.requirementId === req.id && test.targetId === target.id &&
          item.record.targetMatrix.some(actual => actual.id === target.id && actual.kind === target.kind)));
        let result: EvidenceOutcome = 'not-run';
        if (accepted.some(test => test.result === 'pass')) { covered++; result = 'pass'; }
        else if (!req.mandatory && !req.advertised && accepted.some(test => test.result === 'unsupported')) { covered++; unsupported++; result = 'unsupported'; }
        else findings.push(finding({ code: 'TARGET_UNTESTED', requirementId: req.id, targetId: target.id }));
        if (relevant.some(item => item.record.decision === 'failed' || item.record.testCases.some(test => test.requirementId === req.id && test.targetId === target.id && test.result === 'fail'))) result = 'fail';
        return Object.freeze({ id: target.id, kind: target.kind, result });
      });
      const failed = relevant.some(item => item.record.decision === 'failed' || item.record.testCases.some(test => test.requirementId === req.id && test.result === 'fail'));
      const result: EvidenceOutcome = failed ? 'fail' : covered !== req.targets.length ? 'not-run' : unsupported === req.targets.length ? 'unsupported' : 'pass';
      return Object.freeze({ id: req.id, result, targets: Object.freeze(targets) });
    });
    if (findings.length > ACCEPTANCE_LIMITS.findings) return stop('LIMIT_EXCEEDED');
    const distinct = [...new Map(findings.map(f => [JSON.stringify(f), f])).values()].sort((a, b) => cmp(`${a.requirementId ?? ''}:${a.recordId ?? ''}:${a.targetId ?? ''}:${a.code}`, `${b.requirementId ?? ''}:${b.recordId ?? ''}:${b.targetId ?? ''}:${b.code}`));
    const decision = distinct.some(finding => finding.code === 'EVIDENCE_FAILED') ? 'failed' : distinct.length ? 'pending' : 'passed';
    checkAbort(signal);
    return Object.freeze({ ok: true, value: Object.freeze({ format: 'p2p-offramp/acceptance-report/v1', sourceCommit: c.sourceCommit, specDigests: c.specDigests, artifactDigests: c.artifactDigests,
      decision, scopeOnly: true, releaseEnabled: false, promotionAllowed: false, findings: Object.freeze(distinct), supersededRecordIds: Object.freeze([...suppressed].sort(cmp)),
      requirements: Object.freeze(requirementResults), totals: Object.freeze({ requirements: requirementResults.length,
        pass: requirementResults.filter(r => r.result === 'pass').length, fail: requirementResults.filter(r => r.result === 'fail').length,
        unsupported: requirementResults.filter(r => r.result === 'unsupported').length, 'not-run': requirementResults.filter(r => r.result === 'not-run').length }) }) });
  } catch (error) {
    const code = typeof error === 'object' && error !== null ? refusals.get(error) ?? 'INVALID_INPUT' : 'INVALID_INPUT';
    return Object.freeze({ ok: false, error: Object.freeze({ code }) });
  }
}
