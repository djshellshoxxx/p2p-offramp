/** Local/test-only G20 text/history composition. This facade grants no network or wallet authority. */
export { encodeMessage, decodeMessage, MESSAGE_FORMAT, MAX_TEXT_BYTES, MAX_MESSAGE_BYTES } from './src/envelope.ts';
export type { TextMessageV1, MessageExpectation } from './src/envelope.ts';
export { createDurableTradeChat, HISTORY_FORMAT, DEFAULT_HISTORY_MESSAGES, MAX_HISTORY_MESSAGES, MAX_HISTORY_BYTES } from './src/durable-chat.ts';
export type { DurableTradeChat, DurableTradeChatOptions, HistoryMessage, HistoryReceipt, HistoryView } from './src/durable-chat.ts';
