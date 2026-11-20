/** Test-only browser result correlation. No previous attempt can complete a later wait. */
export const MAX_UPDATE_ATTEMPTS = 32;
export type AttemptState<T> =
  | Readonly<{ id: number; state: 'pending' }>
  | Readonly<{ id: number; state: 'completed'; result: T }>
  | Readonly<{ id: number; state: 'failed'; error: string }>;

interface Attempt<T> {
  state: AttemptState<T>;
  readonly promise: Promise<T>;
}

export class AttemptLedger<T> {
  readonly #attempts = new Map<number, Attempt<T>>();

  start(run: () => Promise<T>): number {
    if (typeof run !== 'function') throw Error('INVALID_UPDATE_ATTEMPT');
    if (this.#attempts.size >= MAX_UPDATE_ATTEMPTS) throw Error('UPDATE_ATTEMPT_LIMIT');
    // Admit synchronously; the callback cannot run before its own pending state exists.
    const id = this.#attempts.size + 1;
    const promise = Promise.resolve().then(run);
    const attempt: Attempt<T> = { state: Object.freeze({ id, state: 'pending' }), promise };
    this.#attempts.set(id, attempt);
    // Both handlers are attached immediately, including when the caller only polls read().
    // Completion has no public setter or caller-selected identity.
    void promise.then(
      result => { attempt.state = Object.freeze({ id, state: 'completed', result }); },
      () => { attempt.state = Object.freeze({ id, state: 'failed', error: 'UPDATE_ATTEMPT_FAILED' }); },
    );
    return id;
  }

  #get(id: number): Attempt<T> {
    if (!Number.isSafeInteger(id) || id < 1) throw Error('UNKNOWN_UPDATE_ATTEMPT');
    const attempt = this.#attempts.get(id);
    if (!attempt) throw Error('UNKNOWN_UPDATE_ATTEMPT');
    return attempt;
  }

  read(id: number): AttemptState<T> { return this.#get(id).state; }

  /** The owned promise retains the original failure; polled snapshots expose a fixed label. */
  wait(id: number): Promise<T> { return this.#get(id).promise; }
}
