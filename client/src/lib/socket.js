import { io } from 'socket.io-client';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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
