import { io, type Socket } from "socket.io-client";

/** The subset of a Socket.IO socket the React bindings need (easy to fake in tests). */
export type RealtimeSocket = Pick<Socket, "on" | "off">;

/** No url = same origin (/socket.io via the Vite proxy in dev, Caddy in production). */
export function createRealtime(url?: string): Socket {
  return url ? io(url) : io();
}
