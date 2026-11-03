'use strict';

/**
 * Adda — Chill Together
 * Realtime hangout rooms: chat, watch/listen together (synced playback),
 * WebRTC voice (signaling only), shared notes + to-dos, emoji reactions.
 * All state is in-memory; empty rooms are cleaned up automatically.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode() {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

let nextId = 1;
const uid = () => `${Date.now().toString(36)}-${nextId++}`;

/** Parse a user pasted URL into a playable media descriptor. */
function parseMedia(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  const ytMatch =
    u.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/) ||
    u.match(/^([\w-]{11})$/);
  if (ytMatch) {
    return { type: 'youtube', videoId: ytMatch[1], url: `https://www.youtube.com/watch?v=${ytMatch[1]}` };
  }
  if (/\.mp4($|\?|#)/i.test(u) || /^https?:\/\//i.test(u)) {
    // Direct file (mp4/webm) or any other http(s) link treated as a file stream.
    return { type: 'mp4', videoId: '', url: u };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Room store                                                          */
/* ------------------------------------------------------------------ */

const rooms = new Map();

function createRoom(name, hostSocket) {
  const room = {
    code: makeCode(),
    name: name || 'Adda Room',
    host: hostSocket.id,
    members: new Map(), // socketId -> { name }
    messages: [], // last 100
    playback: {
      type: 'none', url: '', videoId: '', title: '',
      playing: false, positionSec: 0, updatedAt: Date.now(), itemId: 0,
    },
    queue: [], // [{ id, type, url, videoId, title, addedBy }]
    notes: '',
    todos: [], // [{ id, text, done, by }]
    voice: new Set(), // socketIds currently in voice
    lastAdvanceAt: 0,
  };
  rooms.set(room.code, room);
  return room;
}

/** Current effective playback position, accounting for elapsed time. */
function effectivePosition(room) {
  const p = room.playback;
  if (!p.playing) return Math.max(0, p.positionSec);
  return Math.max(0, p.positionSec + (Date.now() - p.updatedAt) / 1000);
}

/** Freeze the effective position into the stored state (call before edits). */
function normalizePlayback(room) {
  room.playback.positionSec = effectivePosition(room);
  room.playback.updatedAt = Date.now();
}

function playbackPayload(room) {
  return { ...room.playback, positionSec: effectivePosition(room), serverNow: Date.now() };
}

function snapshot(room, youId) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.host,
    youId,
    members: [...room.members.entries()].map(([id, m]) => ({ id, name: m.name })),
    messages: room.messages,
    playback: playbackPayload(room),
    queue: room.queue,
    notes: room.notes,
    todos: room.todos,
    voicePeers: [...room.voice],
  };
}

function broadcastMembers(room) {
  io.to(room.code).emit('members_update', {
    hostId: room.host,
    members: [...room.members.entries()].map(([id, m]) => ({ id, name: m.name })),
  });
}

function setCurrent(room, item) {
  room.playback = {
    type: item.type,
    url: item.url,
    videoId: item.videoId,
    title: item.title || '',
    playing: true,
    positionSec: 0,
    updatedAt: Date.now(),
    itemId: room.playback.itemId + 1,
  };
  io.to(room.code).emit('playback_state', playbackPayload(room));
  io.to(room.code).emit('queue_update', room.queue);
}

function advanceQueue(room) {
  const now = Date.now();
  if (now - room.lastAdvanceAt < 1200) return; // guard against double "ended"
  room.lastAdvanceAt = now;
  const next = room.queue.shift();
  if (next) {
    setCurrent(room, next);
  } else {
    room.playback = {
      ...room.playback, type: 'none', url: '', videoId: '', title: '',
      playing: false, positionSec: 0, updatedAt: Date.now(), itemId: room.playback.itemId + 1,
    };
    io.to(room.code).emit('playback_state', playbackPayload(room));
    io.to(room.code).emit('queue_update', room.queue);
  }
}

/* ------------------------------------------------------------------ */
/* Socket handlers                                                     */
/* ------------------------------------------------------------------ */

io.on('connection', (socket) => {
  let room = null; // room this socket is in

  const requireRoom = () => room && rooms.has(room.code);

  socket.on('create_room', ({ name, roomName } = {}, cb) => {
    room = createRoom(roomName, socket);
    room.members.set(socket.id, { name: (name || 'Guest').slice(0, 40) });
    socket.join(room.code);
    if (typeof cb === 'function') cb({ ok: true, state: snapshot(room, socket.id) });
  });

  socket.on('join_room', ({ code, name } = {}, cb) => {
    const target = rooms.get((code || '').toUpperCase().trim());
    if (!target) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Room not found. Code check karo.' });
      return;
    }
    room = target;
    room.members.set(socket.id, { name: (name || 'Guest').slice(0, 40) });
    socket.join(room.code);
    if (typeof cb === 'function') cb({ ok: true, state: snapshot(room, socket.id) });
    broadcastMembers(room);
  });

  /* ------------------------------ chat ------------------------------ */
  socket.on('chat_message', ({ text } = {}) => {
    if (!requireRoom() || !text || !String(text).trim()) return;
    const msg = {
      id: uid(),
      name: room.members.get(socket.id)?.name || 'Guest',
      text: String(text).slice(0, 1000),
      ts: Date.now(),
    };
    room.messages.push(msg);
    if (room.messages.length > 100) room.messages.splice(0, room.messages.length - 100);
    io.to(room.code).emit('chat_message', msg);
  });

  /* --------------------------- playback ----------------------------- */
  socket.on('playback_set', ({ url, title } = {}) => {
    if (!requireRoom()) return;
    const media = parseMedia(url);
    if (!media) return;
    setCurrent(room, { ...media, title: title || '' });
  });

  socket.on('playback_action', ({ action, positionSec } = {}) => {
    if (!requireRoom() || room.playback.type === 'none') return;
    normalizePlayback(room);
    if (action === 'play') room.playback.playing = true;
    else if (action === 'pause') room.playback.playing = false;
    else if (action === 'seek') room.playback.positionSec = Math.max(0, Number(positionSec) || 0);
    if ((action === 'play' || action === 'pause') && Number.isFinite(Number(positionSec))) {
      room.playback.positionSec = Math.max(0, Number(positionSec));
    }
    room.playback.updatedAt = Date.now();
    socket.to(room.code).emit('playback_state', playbackPayload(room));
  });

  socket.on('queue_add', ({ url, title } = {}) => {
    if (!requireRoom()) return;
    const media = parseMedia(url);
    if (!media) {
      socket.emit('queue_error', { error: 'Ye link samajh nahi aaya — YouTube ya .mp4 link paste karo.' });
      return;
    }
    const item = {
      id: uid(), ...media,
      title: (title || '').slice(0, 120),
      addedBy: room.members.get(socket.id)?.name || 'Guest',
    };
    if (room.playback.type === 'none') {
      setCurrent(room, item); // nothing playing — start right away
    } else {
      room.queue.push(item);
      io.to(room.code).emit('queue_update', room.queue);
    }
  });

  socket.on('queue_next', () => {
    if (!requireRoom()) return;
    if (socket.id !== room.host) return; // host controls "next"
    room.lastAdvanceAt = 0;
    advanceQueue(room);
  });

  socket.on('media_ended', () => {
    if (!requireRoom()) return;
    advanceQueue(room);
  });

  /* ------------------------------ work ------------------------------ */
  socket.on('notes_update', ({ text } = {}) => {
    if (!requireRoom()) return;
    room.notes = String(text || '').slice(0, 20000);
    socket.to(room.code).emit('notes_update', { text: room.notes });
  });

  socket.on('todo_add', ({ text } = {}) => {
    if (!requireRoom() || !text || !String(text).trim()) return;
    room.todos.push({
      id: uid(),
      text: String(text).slice(0, 200),
      done: false,
      by: room.members.get(socket.id)?.name || 'Guest',
    });
    io.to(room.code).emit('todos_update', room.todos);
  });

  socket.on('todo_toggle', ({ id } = {}) => {
    if (!requireRoom()) return;
    const t = room.todos.find((x) => x.id === id);
    if (t) t.done = !t.done;
    io.to(room.code).emit('todos_update', room.todos);
  });

  socket.on('todo_delete', ({ id } = {}) => {
    if (!requireRoom()) return;
    room.todos = room.todos.filter((x) => x.id !== id);
    io.to(room.code).emit('todos_update', room.todos);
  });

  /* ---------------------------- reactions ---------------------------- */
  socket.on('reaction', ({ emoji } = {}) => {
    if (!requireRoom() || !emoji) return;
    io.to(room.code).emit('reaction', {
      emoji: String(emoji).slice(0, 8),
      name: room.members.get(socket.id)?.name || 'Guest',
    });
  });

  /* ------------------------------ voice ------------------------------ */
  socket.on('voice_join', (_data, cb) => {
    if (!requireRoom()) return;
    const peers = [...room.voice].filter((id) => id !== socket.id);
    room.voice.add(socket.id);
    socket.to(room.code).emit('voice_peer_joined', { id: socket.id });
    if (typeof cb === 'function') cb({ peers });
  });

  socket.on('voice_leave', () => {
    if (!requireRoom()) return;
    room.voice.delete(socket.id);
    socket.to(room.code).emit('voice_peer_left', { id: socket.id });
  });

  // WebRTC signaling relay (offer / answer / ICE go peer-to-peer)
  socket.on('webrtc_offer', ({ to, sdp }) => io.to(to).emit('webrtc_offer', { from: socket.id, sdp }));
  socket.on('webrtc_answer', ({ to, sdp }) => io.to(to).emit('webrtc_answer', { from: socket.id, sdp }));
  socket.on('webrtc_ice', ({ to, candidate }) => io.to(to).emit('webrtc_ice', { from: socket.id, candidate }));

  /* ---------------------------- disconnect --------------------------- */
  socket.on('disconnect', () => {
    if (!room || !rooms.has(room.code)) return;
    const r = room;
    r.members.delete(socket.id);
    if (r.voice.delete(socket.id)) {
      socket.to(r.code).emit('voice_peer_left', { id: socket.id });
    }
    if (r.members.size === 0) {
      rooms.delete(r.code); // clean up empty room
      return;
    }
    if (r.host === socket.id) {
      r.host = r.members.keys().next().value; // hand host to next member
    }
    broadcastMembers(r);
  });
});

server.listen(PORT, () => {
  console.log(`Adda server listening on http://localhost:${PORT}`);
});
