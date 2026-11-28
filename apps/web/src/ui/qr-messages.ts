import { messageGroup, mergeMessageViews } from './locale/runtime.ts';
type Hyphen<K extends string> = K extends `${infer A}_${infer B}` ? `${A}-${Hyphen<B>}` : K;
type ProtocolKeyView<T extends Readonly<Record<string, string>>> = { readonly [K in keyof T as K extends string ? Hyphen<K> : never]: string };
/** Catalog keys use underscores; protocol display keys stay unchanged and are never locale-parsed. */
function protocolKeys<T extends Readonly<Record<string, string>>>(group: T): ProtocolKeyView<T> {
  const properties = Object.fromEntries(Object.keys(group).map(key => [key.replaceAll('_', '-'), { enumerable: true, get: () => group[key] }]));
  return Object.freeze(Object.defineProperties({}, properties)) as ProtocolKeyView<T>;
}
export const qrMessages = mergeMessageViews(messageGroup('qr'), {
  types: protocolKeys(messageGroup('qrTypes')), fields: protocolKeys(messageGroup('qrFields')), warnings: protocolKeys(messageGroup('qrWarnings')), errors: messageGroup('qrErrors'),
});
