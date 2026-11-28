import type { LocalnetCommand, LocalnetResult } from './protocol.ts';

/** File reads belong to the UI operation that requested them, before any Worker command exists. */
export type LocalnetUiCommand = LocalnetCommand | (() => Promise<LocalnetCommand>);

export async function runLocalnetUiCommand(
  input: LocalnetUiCommand,
  current: () => boolean,
  request: (command: LocalnetCommand) => Promise<LocalnetResult>,
): Promise<LocalnetResult | undefined> {
  if (!current()) return undefined;
  let command: LocalnetCommand | undefined;
  try {
    command = typeof input === 'function' ? await input() : input;
    if (!current()) return undefined;
    return await request(command);
  } finally {
    if (command?.type === 'backup.restore') command.bytes.fill(0);
  }
}
