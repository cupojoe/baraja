import { io, type Socket } from "socket.io-client";
import type { GameCommand, GameEvent } from "@baraja/engine";

let socket: Socket | null = null;

export function connect(serverUrl: string): Socket {
  if (socket?.connected) return socket;
  socket = io(serverUrl, { transports: ["websocket"] });
  return socket;
}

export function disconnect() {
  socket?.disconnect();
  socket = null;
}

export function sendCommand(command: GameCommand) {
  socket?.emit("game:command", command);
}

export function onEvent(handler: (event: GameEvent) => void) {
  socket?.on("game:event", handler);
  return () => socket?.off("game:event", handler);
}
