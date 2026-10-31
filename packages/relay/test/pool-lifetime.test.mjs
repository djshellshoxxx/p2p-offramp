import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createRelayPool } from '../src/pool.ts';
import { AD_KIND, FAST, makeBroker, memoryNetwork, NOW, sellerCrypto, signedAd } from './support/harness.mjs';

// Hold the connection boundary explicitly: no timing race or external relay is needed.
function heldNetwork() {
  const sockets = [];
  return { sockets, connector() {
    const socket = { onopen: null, onmessage: null, onclose: null, onerror: null,
      sent: [], closed: false,
      send(text) { this.sent.push(JSON.parse(text)); },
      close() { this.closed = true; },
      deliver(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); },
    };
    sockets.push(socket);
    return socket;
  } };
}
function setup(net = heldNetwork()) {
  const { broker } = makeBroker();
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example' }],
    verifier: sellerCrypto, connect: net.connector, timing: FAST, nowSeconds: () => NOW });
  return { pool, broker, net };
}
const unknown = event => ({ ok: true, value: [{ eventId: event.id, relayId: 'relay-a', status: 'unknown' }] });
const filter = () => ({ kinds: [AD_KIND], '#t': ['p2p-offramp-ad-v1'], since: NOW - 60, limit: 10 });

for (const end of ['caller abort', 'pool close']) {
  test(`publish: ${end} during connect closes the socket and never sends a late EVENT`, async () => {
    const { pool, broker, net } = setup();
    const controller = new AbortController(), event = await signedAd();
    const pending = pool.publish(event, controller.signal);
    const socket = net.sockets[0], lateOpen = socket.onopen;
    try {
      if (end === 'caller abort') controller.abort(); else pool.close();
      lateOpen?.({});
      await setImmediate();
      assert.equal(socket.sent.length, 0, 'no EVENT after cancellation while connecting');
      assert.equal(socket.closed, true, 'cancellation releases the connecting socket');
      assert.deepEqual(await pending, unknown(event));
    } finally { broker.dispose(); pool.close(); await pending; }
  });
}

for (const end of ['caller abort', 'pool close', 'broker revoke']) {
  test(`publish: ${end} after send closes the socket and settles unknown before timeout`, async () => {
    const { pool, broker, net } = setup();
    const controller = new AbortController(), event = await signedAd();
    let settled = false;
    const pending = pool.publish(event, controller.signal).then(value => { settled = true; return value; });
    const socket = net.sockets[0];
    socket.onopen({});
    await setImmediate();
    assert.equal(socket.sent.length, 1);
    const lateAck = socket.onmessage;
    try {
      if (end === 'caller abort') controller.abort();
      else if (end === 'pool close') pool.close();
      else broker.dispose();
      await setImmediate();
      assert.equal(socket.closed, true, 'publication socket is released immediately');
      assert.equal(settled, true, 'does not wait for the publication timeout');
      lateAck?.({ data: JSON.stringify(['OK', event.id, true, 'late']) });
      assert.deepEqual(await pending, unknown(event), 'late ACK cannot upgrade an uncertain outcome');
    } finally { broker.dispose(); pool.close(); await pending; }
  });
}

test('unsolicited CLOSED cannot poison a future subscription id', async () => {
  const { pool, broker, net } = setup(memoryNetwork());
  try {
    pool.subscribe([filter()], { onEvent() {} });
    await setImmediate();
    net.sockets[0].deliver(JSON.stringify(['CLOSED', 's2', 'refused before request']));
    const events = [];
    const second = pool.subscribe([filter()], { onEvent: event => events.push(event.id) });
    assert.equal(second.ok, true);
    const event = await signedAd();
    net.sockets[0].deliver(JSON.stringify(['EVENT', second.value.id, event]));
    assert.deepEqual(events, [event.id]);
  } finally { pool.close(); broker.dispose(); }
});

test('EOSE after CLOSED does not call the ended subscription handler', async () => {
  const { pool, broker, net } = setup(memoryNetwork());
  try {
    let eose = 0;
    const sub = pool.subscribe([filter()], { onEvent() {}, onEose() { eose++; } });
    await setImmediate();
    net.sockets[0].deliver(JSON.stringify(['CLOSED', sub.value.id, 'ended']));
    net.sockets[0].deliver(JSON.stringify(['EOSE', sub.value.id]));
    assert.equal(eose, 0);
  } finally { pool.close(); broker.dispose(); }
});

test('publish: abort between socket open and the async continuation releases the socket', async () => {
  const { pool, broker, net } = setup();
  const controller = new AbortController(), event = await signedAd();
  const pending = pool.publish(event, controller.signal);
  const socket = net.sockets[0];
  try {
    socket.onopen({});
    controller.abort();
    assert.deepEqual(await pending, unknown(event));
    assert.equal(socket.closed, true);
    assert.equal(socket.sent.length, 0);
  } finally { broker.dispose(); pool.close(); await pending; }
});

for (const end of ['pool close', 'last subscription close']) {
  test(`read: ${end} releases a pending connection without waiting for its timeout`, async () => {
    const { pool, broker, net } = setup();
    const sub = pool.subscribe([filter()], { onEvent() {} });
    const socket = net.sockets[0], lateOpen = socket.onopen;
    try {
      if (end === 'pool close') pool.close(); else sub.value.close();
      await setImmediate();
      assert.equal(socket.closed, true);
      lateOpen?.({});
      await setImmediate();
      assert.equal(socket.sent.length, 0);
      assert.equal(net.sockets.length, 1, 'no reconnect after cancellation');
    } finally { broker.dispose(); pool.close(); }
  });
}

test('read: revocation from the open-status observer closes the socket before sending REQ', async () => {
  const { broker } = makeBroker(), net = memoryNetwork();
  let revoked = false;
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example' }],
    verifier: sellerCrypto, connect: net.connector, timing: FAST, nowSeconds: () => NOW,
    onStatus(status) {
      if (!revoked && status[0].state === 'open') { revoked = true; broker.dispose(); }
    },
  });
  try {
    pool.subscribe([filter()], { onEvent() {} });
    await setImmediate();
    assert.equal(revoked, true);
    assert.equal(net.sockets[0].sent.length, 0, 'revocation precedes the first subscription request');
    assert.equal(net.sockets[0].closed, true);
    assert.notEqual(pool.status()[0].state, 'open');
  } finally { pool.close(); broker.dispose(); }
});

test('read and publication sockets share four physical slots, including delayed closure',async()=>{
 const net=heldNetwork(),{pool,broker}=setup(net),event=await signedAd();
 const jobs=[];
 try{
  pool.subscribe([filter()],{onEvent(){}});net.sockets[0].onopen({});await setImmediate();
  for(let i=0;i<3;i++)jobs.push(pool.publish(event));
  assert.equal(net.sockets.length,4,'one read plus three publication connections');
  assert.deepEqual(await pool.publish(event),{ok:false,error:'LIMIT_EXCEEDED'});
  const original=net.sockets[1],closed=original.onclose;
  original.onopen({});await setImmediate();original.deliver(['OK',event.id,true,'accepted']);
  await jobs[0];assert.equal(original.closed,true);
  assert.deepEqual(await pool.publish(event),{ok:false,error:'LIMIT_EXCEEDED'},'close request retains native slot');
  closed({});await setImmediate();
  jobs.push(pool.publish(event));assert.equal(net.sockets.length,5,'a native close acknowledgement frees exactly one slot');
 }finally{pool.close();broker.dispose();await Promise.all(jobs);}
});

test('four read connections refuse extra publication I/O',async()=>{
 const net=memoryNetwork(),{broker}=makeBroker({endpoints:['relay-a','relay-b','relay-c','relay-d']});
 const pool=createRelayPool({broker,relays:['a','b','c','d'].map(id=>({endpointId:`relay-${id}`,url:'wss://fixture.example'})),verifier:sellerCrypto,connect:net.connector,timing:FAST,nowSeconds:()=>NOW});
 try{pool.subscribe([filter()],{onEvent(){}});await setImmediate();assert.equal(net.sockets.length,4);assert.deepEqual(await pool.publish(await signedAd()),{ok:false,error:'LIMIT_EXCEEDED'});assert.equal(net.sockets.length,4);}
 finally{pool.close();broker.dispose();}
});
