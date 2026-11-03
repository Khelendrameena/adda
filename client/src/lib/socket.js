import { io } from 'socket.io-client';

/**
 * Server (API + Socket.IO) ka base URL — ek hi jagah decide hota hai:
 *  1. VITE_API_URL set ho (Render/Vercel jaisi split deploy) → wahi use karo.
 *  2. Page Vite dev server (:5173) se khula ho → API alag server par hai,
 *     http://localhost:4000 use karo.
 *  3. Warna page Express server se hi serve ho raha hai (npm run start:prod /
 *     Cloudflare Tunnel) → site, API aur sockets sab same-origin hain,
 *     isliye page ka apna origin hi base hai.
 */
function resolveApiUrl() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.port === '5173') return 'http://localhost:4000';
    return window.location.origin;
  }
  return 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, { autoConnect: false, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function emitAck(event, data) {
  return new Promise((resolve, reject) => {
    getSocket().timeout(6000).emit(event, data, (err, res) => (err ? reject(err) : resolve(res)));
  });
}
