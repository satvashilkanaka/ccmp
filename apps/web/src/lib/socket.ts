import { io, Socket } from 'socket.io-client';

let socket: Socket;

if (typeof window !== 'undefined') {
  socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000', {
    auth: { token: '' }, // populated by session in components
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
    autoConnect: true,
  });
}

export { socket };
