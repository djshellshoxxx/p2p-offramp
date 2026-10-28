// In-process fake Nostr relay: node:http upgrade + a minimal RFC 6455 text-frame implementation. TEST ONLY.
import http from 'node:http';
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export function encodeFrame(text, opcode = 1) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) header = Buffer.from([0x80 | opcode, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  return Buffer.concat([header, payload]);
}
function decodeFrames(state, chunk, onFrame) {
  state.buf = Buffer.concat([state.buf, chunk]);
  for (;;) {
    const b = state.buf;
    if (b.length < 2) return;
    const opcode = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, offset = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); offset = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); offset = 10; }
    const total = offset + (masked ? 4 : 0) + len;
    if (b.length < total) return;
    const mask = masked ? b.subarray(offset, offset + 4) : null;
    const data = Buffer.from(b.subarray(offset + (masked ? 4 : 0), total));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    state.buf = b.subarray(total);
    onFrame(opcode, data);
  }
}
/** behavior.onMessage(conn, parsed, relay) may return true to suppress the default handler. */
export async function startFakeRelay(behavior = {}) {
  const relay = { events: [], received: [], conns: new Set(), connectCount: 0, behavior, refuse: false };
  const server = http.createServer((req, res) => { res.statusCode = 426; res.end(); });
  server.on('upgrade', (req, socket) => {
    relay.connectCount++;
    if (relay.refuse) { socket.destroy(); return; }
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const conn = { socket, subs: new Map(), state: { buf: Buffer.alloc(0) },
      send: text => { if (!socket.destroyed) socket.write(encodeFrame(text)); },
      sendBinary: bytes => { if (!socket.destroyed) socket.write(Buffer.concat([Buffer.from([0x82, bytes.length]), Buffer.from(bytes)])); },
      drop: () => socket.destroy() };
    relay.conns.add(conn);
    socket.on('close', () => relay.conns.delete(conn));
    socket.on('error', () => {});
    socket.on('data', chunk => decodeFrames(conn.state, chunk, (opcode, data) => {
      if (opcode === 8) { socket.end(); return; }
      if (opcode === 9) { socket.write(encodeFrame(data.toString(), 10)); return; }
      if (opcode !== 1) return;
      let parsed; try { parsed = JSON.parse(data.toString()); } catch { return; }
      relay.received.push(parsed);
      if (relay.behavior.onMessage?.(conn, parsed, relay) === true) return;
      if (parsed[0] === 'REQ') {
        conn.subs.set(parsed[1], parsed.slice(2));
        for (const event of relay.events) conn.send(JSON.stringify(['EVENT', parsed[1], event]));
        conn.send(JSON.stringify(['EOSE', parsed[1]]));
      } else if (parsed[0] === 'CLOSE') conn.subs.delete(parsed[1]);
      else if (parsed[0] === 'EVENT') { relay.events.push(parsed[1]); conn.send(JSON.stringify(['OK', parsed[1].id, true, ''])); }
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  relay.port = server.address().port;
  relay.wsUrl = `ws://127.0.0.1:${relay.port}`;
  relay.dropAll = () => { for (const c of [...relay.conns]) c.drop(); };
  relay.broadcast = text => { for (const c of relay.conns) c.send(text); };
  relay.stop = async () => { relay.dropAll(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); };
  return relay;
}
