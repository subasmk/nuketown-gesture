/* Room-channel resilience: app-level liveness (hb/hbok + silence cull) and
   resume-based seat reclaim for pages whose socket died behind the proxy. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createRelayServer } from './server.mjs';

const V = 11;
const wait = ms => new Promise(r => setTimeout(r, ms));

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.msgs = [];
    ws.on('message', d => { try { ws.msgs.push(JSON.parse(d.toString())); } catch {} });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
const has = (ws, pred) => ws.msgs.some(pred);
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await wait(25); }
  return false;
}
const hello = (over = {}) => JSON.stringify({
  v: V, name: 'Tester', maps: ['nuketown'], map: 'nuketown',
  cosmetics: null, ...over
});
const snapshot = (epoch, round, tick) => JSON.stringify({
  t: 'snapshot', v: V, authorityEpoch: epoch, round, map: 'nuketown',
  tick, time: tick * 0.05, eventSeq: 0, manifestVersion: 0,
  actors: [{ netId: 'h1', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100, alive: true }]
});

test('room channel: hb is answered with hbok before and inside a room', async () => {
  const relay = createRelayServer();
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  const port = relay.address().port;
  try {
    const ws = await connect(port);
    ws.send(JSON.stringify({ t: 'hb' }));
    assert(await until(() => has(ws, m => m.t === 'hbok')), 'hbok before any room');

    ws.send(hello({ t: 'create', listed: false, resume: 'resume-abc-123' }));
    assert(await until(() => has(ws, m => m.t === 'room')), 'room created');
    ws.msgs.length = 0;
    ws.send(JSON.stringify({ t: 'hb' }));
    assert(await until(() => has(ws, m => m.t === 'hbok')), 'hbok inside a room');
    ws.close();
  } finally {
    await relay.close();
  }
});

test('room silence: a quiet peer loses the seat; traffic keeps it', async () => {
  const relay = createRelayServer({ roomSilenceMs: 400 });
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  const port = relay.address().port;
  try {
    const host = await connect(port);
    host.send(hello({ t: 'create', listed: false, rules: 'duel', resume: 'host-resume-1' }));
    assert(await until(() => has(host, m => m.t === 'room')), 'host seated');
    const room = host.msgs.find(m => m.t === 'room').room;

    const guest = await connect(port);
    guest.send(hello({ t: 'join', room, resume: 'guest-resume-1' }));
    assert(await until(() => has(guest, m => m.t === 'room')), 'guest seated');

    /* Host stays talkative, guest opts in with one heartbeat and then goes
       silent: only the guest is culled. */
    guest.send(JSON.stringify({ t: 'hb' }));
    assert(await until(() => has(guest, m => m.t === 'hbok')), 'guest opted in');
    const ping = setInterval(() => { try { host.send(JSON.stringify({ t: 'hb' })); } catch {} }, 100);
    const guestClosed = new Promise(r => guest.on('close', (code) => r(code)));
    const code = await Promise.race([guestClosed, wait(5000).then(() => 0)]);
    clearInterval(ping);
    assert.notStrictEqual(code, 0, 'silent heartbeating guest was terminated');
    assert.equal(host.readyState, WebSocket.OPEN, 'talkative host survived');

    /* A page from before the clock never heartbeats: silent or not, it keeps
       its seat exactly as it always did. */
    const legacy = await connect(port);
    legacy.send(hello({ t: 'join', room, resume: 'legacy-no-hb' }));
    assert(await until(() => has(legacy, m => m.t === 'room')), 'legacy page seated');
    let legacyClosed = false;
    legacy.on('close', () => { legacyClosed = true; });
    await wait(1500);
    assert.equal(legacyClosed, false, 'silent non-heartbeating page was left alone');
    assert.equal(legacy.readyState, WebSocket.OPEN, 'legacy page still seated');
    host.close(); legacy.close();
  } finally {
    await relay.close();
  }
});

test('resume reclaim: a rejoin takes its own seat back, no duplicate player', async () => {
  const relay = createRelayServer({ roomSilenceMs: 60_000 });
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  const port = relay.address().port;
  try {
    const host = await connect(port);
    host.send(hello({ t: 'create', listed: false, rules: 'duel', resume: 'host-resume-2' }));
    assert(await until(() => has(host, m => m.t === 'room')), 'host seated');
    const room = host.msgs.find(m => m.t === 'room').room;

    const guest = await connect(port);
    guest.send(hello({ t: 'join', room, resume: 'guest-resume-2' }));
    assert(await until(() => has(guest, m => m.t === 'room')), 'guest seated');

    host.send(JSON.stringify({ t: 'start', v: V, authorityEpoch: 1, round: 0 }));
    assert(await until(() => has(host, m => m.t === 'start')), 'duel started');
    host.send(snapshot(1, 1, 1));
    assert(await until(() => has(guest, m => m.t === 'snapshot')), 'snapshot relayed');

    /* The guest's socket dies behind the proxy: still OPEN server-side. The
       page comes back on a new socket with the same resume id. */
    const rejoin = await connect(port);
    const oldClosed = new Promise(r => guest.on('close', (code) => r(code)));
    rejoin.send(hello({ t: 'join', room, resume: 'guest-resume-2' }));
    assert(await until(() => has(rejoin, m => m.t === 'room' && m.started === true)),
      'rejoin walked back into the running round');
    assert.equal(await oldClosed, 1000, 'ghost socket was closed by the reclaim');

    /* Exactly one guest seat: the roster names two players, not three. */
    const roster = rejoin.msgs.filter(m => m.t === 'room').pop().members;
    assert.equal(roster.length, 2, 'no duplicate player after reclaim');

    /* And the running duel still refuses a genuinely new third player. */
    const stranger = await connect(port);
    stranger.send(hello({ t: 'join', room, resume: 'stranger-resume-9' }));
    assert(await until(() => has(stranger, m => m.t === 'error' && m.code === 'room-full')),
      'started duel still refuses new arrivals');
    stranger.close();

    /* A clean drop (close seen, seat already freed) rejoins the running
       duel through the same door: the empty chair is fillable. */
    rejoin.close();
    assert(await until(() => has(host, m => m.t === 'members' &&
      m.members.length === 1)), 'the drop freed the chair');
    const clean = await connect(port);
    clean.send(hello({ t: 'join', room, resume: 'clean-resume-7' }));
    assert(await until(() => has(clean, m => m.t === 'room' && m.started === true)),
      'dropped player can re-enter the running duel on a free seat');

    host.close(); clean.close();
  } finally {
    await relay.close();
  }
});

test('resume reclaim: host seat reclaim mid-round hands the rejoin a migrating room, then entry', async () => {
  const relay = createRelayServer({ roomSilenceMs: 60_000 });
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  const port = relay.address().port;
  try {
    const host = await connect(port);
    host.send(hello({ t: 'create', listed: false, rules: 'duel', resume: 'host-resume-3' }));
    assert(await until(() => has(host, m => m.t === 'room')), 'host seated');
    const room = host.msgs.find(m => m.t === 'room').room;

    const guest = await connect(port);
    guest.send(hello({ t: 'join', room, resume: 'guest-resume-3' }));
    assert(await until(() => has(guest, m => m.t === 'room')), 'guest seated');
    host.send(JSON.stringify({ t: 'start', v: V, authorityEpoch: 1, round: 0 }));
    assert(await until(() => has(guest, m => m.t === 'start')), 'duel started');

    /* Host rejoins with its resume: authority must move before it can enter. */
    const rejoin = await connect(port);
    rejoin.send(hello({ t: 'join', room, resume: 'host-resume-3' }));
    assert(await until(() =>
      has(rejoin, m => (m.t === 'error' && m.code === 'room-migrating') || m.t === 'room')),
      'reclaim of the host seat answered');
    assert(await until(() => has(guest, m => m.t === 'host-changed')),
      'surviving guest was handed authority');
    rejoin.close(); guest.close();
  } finally {
    await relay.close();
  }
});

test('resume reclaim: reclaiming the only seat dissolves the room honestly', async () => {
  const relay = createRelayServer({ roomSilenceMs: 60_000 });
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  const port = relay.address().port;
  try {
    const host = await connect(port);
    host.send(hello({ t: 'create', listed: false, resume: 'host-resume-4' }));
    assert(await until(() => has(host, m => m.t === 'room')), 'host seated');
    const room = host.msgs.find(m => m.t === 'room').room;

    const rejoin = await connect(port);
    rejoin.send(hello({ t: 'join', room, resume: 'host-resume-4' }));
    assert(await until(() => has(rejoin, m => m.t === 'error' && m.code === 'room-not-found')),
      'a room with nobody left in it is gone, not a zombie');
    rejoin.close();
  } finally {
    await relay.close();
  }
});
