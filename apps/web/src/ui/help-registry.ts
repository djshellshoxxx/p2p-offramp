/** Fixed local guidance metadata. No imported mapping grants UI or economic authority. */
import { sourceCatalog } from './locale/en.ts';
export interface TooltipEntry {
  readonly controlId: string; readonly messageKey: string; readonly severity: 'information' | 'warning' | 'critical';
  readonly helpLink: string; readonly interactionTests: readonly string[];
}
const entryKeys = Object.freeze(['controlId', 'helpLink', 'interactionTests', 'messageKey', 'severity'] as const);
const interactions = Object.freeze(['hover', 'focus', 'tap', 'escape', 'blur'] as const);
const bad = (): never => { throw new Error('Invalid local help registry.'); };
function list(input: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return bad();
  const size = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (!Number.isSafeInteger(size) || size < 0 || size > maximum || Reflect.ownKeys(input).length !== size + 1) return bad();
  const copy: unknown[] = [];
  for (let index = 0; index < size; index++) {
    const d = Object.getOwnPropertyDescriptor(input, String(index)); if (!d || !d.enumerable || !('value' in d)) return bad(); copy.push(d.value);
  }
  return copy;
}

function sameInteractions(input: unknown): boolean { const values = list(input, interactions.length); return values.length === interactions.length && interactions.every((name,index) => values[index] === name); }
export function createTooltipRegistry(input: readonly TooltipEntry[]): Readonly<{ get(id: string): Readonly<TooltipEntry> | undefined; readonly size: number }> {
  try {
    const items = list(input, 64);
    const entries = new Map<string, Readonly<TooltipEntry>>();
    for (const entry of items) {
      if (!entry || Object.getPrototypeOf(entry) !== Object.prototype || Reflect.ownKeys(entry).length !== entryKeys.length || !entryKeys.every(key => Object.hasOwn(entry, key))) return bad();
      const copy: Record<string, unknown> = Object.create(null);
      for (const key of entryKeys) {
        const d = Object.getOwnPropertyDescriptor(entry, key); if (!d || !d.enumerable || !('value' in d)) return bad(); copy[key] = d.value;
      }
      if (typeof copy.controlId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(copy.controlId) || entries.has(copy.controlId) ||
          typeof copy.messageKey !== 'string' || !Object.hasOwn(sourceCatalog, copy.messageKey) || Object.keys(sourceCatalog[copy.messageKey]!.variables).length ||
          !['information','warning','critical'].includes(copy.severity as string) || copy.helpLink !== `#${copy.controlId}-help` ||
          !sameInteractions(copy.interactionTests)) return bad();
      entries.set(copy.controlId, Object.freeze({ controlId: copy.controlId, messageKey: copy.messageKey, severity: copy.severity as TooltipEntry['severity'],
        helpLink: copy.helpLink as string, interactionTests: interactions }));
    }
    return Object.freeze({ get: (id: string) => entries.get(id), size: entries.size });
  } catch { return bad(); }
}
const mapping = [
  ['unlock-profile','help.profile'], ['unlock-passphrase','help.unlock'], ['export-profile','help.profile'],
  ['create-passphrase','help.create'], ['restore-file','help.file'], ['restore-passphrase','help.restore'],
  ['verification-file','help.file'], ['export-consent','help.export'], ['create-consent','help.createConsent'], ['restore-consent','help.restoreConsent'],
] as const;
export const TooltipRegistry = createTooltipRegistry(mapping.map(([controlId,messageKey]) => ({controlId,messageKey,severity:controlId.endsWith('-consent')?'critical':'warning',helpLink:`#${controlId}-help`,interactionTests:interactions})));
