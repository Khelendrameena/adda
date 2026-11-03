'use strict';

/**
 * Headless two-client smoke test for the Adda server.
 * Spawns the server on a test port, connects two Socket.IO clients and
 * verifies: room create/join, chat delivery, playback sync events,
 * notes sync and queue add. Prints PASS/FAIL per check.
 *
 * Run: npm test   (from the server/ folder)
 */

const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 4100;
const URL = `http://localhost:${PORT}`;

let failures = 0;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label, extra = '') => { failures++; console.log(`FAIL  ${label} ${extra}`); };

function waitFor(socket, event, predicate = () => true, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${event}`)); }, timeout);
    const handler = (data) => { if (predicate(data)) { cleanup(); resolve(data); } };
    const cleanup = () => { clearTimeout(timer); socket.off(event, handler); };
    socket.on(event, handler);
  });
}

function emitAck(socket, event, data) {
  return new Promise((resolve, reject) => {
    socket.timeout(4000).emit(event, data, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

async function waitHealth(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${URL}/health`);
      const j = await r.json();
      if (j.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  const serverProc = spawn('node', [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  try {
    if (!(await waitHealth())) { fail('server health endpoint'); throw new Error('server did not start'); }
    pass('server health endpoint');

    const A = io(URL, { transports: ['websocket'] });
    const B = io(URL, { transports: ['websocket'] });
    await Promise.all([
      new Promise((r) => A.on('connect', r)),
      new Promise((r) => B.on('connect', r)),
    ]);
    pass('both clients connected');

    // --- room create / join ---
    const created = await emitAck(A, 'create_room', { name: 'Tester A', roomName: 'Smoke Room' });
    if (!created?.ok || !created.state?.code) { fail('create_room'); throw new Error(JSON.stringify(created)); }
    pass(`room created (code ${created.state.code})`);
    const code = created.state.code;

    const joined = await emitAck(B, 'join_room', { code, name: 'Tester B' });
    if (!joined?.ok || joined.state.members.length !== 2) fail('join_room / member list');
    else pass('client B joined, member list has 2 members');

    // --- chat: A -> B ---
    const chatP = waitFor(B, 'chat_message', (m) => m.text === 'hello adda');
    A.emit('chat_message', { text: 'hello adda' });
    await chatP.then(() => pass('chat message delivered A -> B')).catch((e) => fail('chat message', e.message));

    // --- playback: A sets a video, B must receive playing state ---
    const setP = waitFor(B, 'playback_state', (s) => s.type === 'youtube' && s.playing === true);
    A.emit('playback_set', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Test Song' });
    await setP.then((s) => pass(`playback_set synced to B (videoId ${s.videoId})`)).catch((e) => fail('playback_set', e.message));

    // --- playback action: A pauses at 12s, B must receive pause + position ---
    const pauseP = waitFor(B, 'playback_state', (s) => s.playing === false && Math.abs(s.positionSec - 12) < 1.5);
    A.emit('playback_action', { action: 'pause', positionSec: 12 });
    await pauseP.then(() => pass('playback pause action synced to B with position')).catch((e) => fail('playback_action', e.message));

    // --- notes sync: A -> B ---
    const notesP = waitFor(B, 'notes_update', (n) => n.text === 'shared plan: chai at 5');
    A.emit('notes_update', { text: 'shared plan: chai at 5' });
    await notesP.then(() => pass('notes sync A -> B')).catch((e) => fail('notes sync', e.message));

    // --- todo sync: A adds, B receives ---
    const todoP = waitFor(B, 'todos_update', (t) => Array.isArray(t) && t.some((x) => x.text === 'Book snacks'));
    A.emit('todo_add', { text: 'Book snacks' });
    await todoP.then(() => pass('todo add synced to B')).catch((e) => fail('todo sync', e.message));

    // --- queue: B queues a song, A sees it ---
    const queueP = waitFor(A, 'queue_update', (q) => q.some((x) => x.videoId === 'kJQP7kiw5Fk'));
    B.emit('queue_add', { url: 'https://youtu.be/kJQP7kiw5Fk' });
    await queueP.then(() => pass('queue_add synced to A')).catch((e) => fail('queue_add', e.message));

    A.close(); B.close();
  } catch (e) {
    if (!failures) fail('smoke test aborted', e.message);
  } finally {
    serverProc.kill('SIGTERM');
  }

  console.log(failures === 0 ? '\nSMOKE TEST: ALL PASS ✅' : `\nSMOKE TEST: ${failures} FAILURE(S) ❌`);
  process.exit(failures === 0 ? 0 : 1);
})();
