import { messages } from './messages.ts';

export type Route = { readonly page: 'home' | 'offers' | 'recovery' | 'settings' | 'unknown' } |
  { readonly page: 'trade'; readonly localId: string };

/** Never decode arbitrary fragments or turn a route into an external action. */
export function parseRoute(hash: string): Route {
  if (hash === '' || hash === '#' || hash === '#/' || hash === '#/home') return { page: 'home' };
  for (const page of ['offers', 'recovery', 'settings'] as const) if (hash === `#/${page}`) return { page };
  const trade = /^#\/trade\/([A-Za-z0-9_-]{16,64})$/.exec(hash);
  return trade?.[1] ? { page: 'trade', localId: trade[1] } : { page: 'unknown' };
}

export function isProfileId(input: string): boolean { return /^[0-9a-f]{32}$/.test(input); }

export function errorMessage(code: unknown): string {
  return typeof code === 'string' && Object.hasOwn(messages.errors, code)
    ? messages.errors[code as keyof typeof messages.errors]
    : messages.errors.PROTOCOL_ERROR;
}
