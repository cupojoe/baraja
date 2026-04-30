import type { Server, Socket } from "socket.io";
import type { GameCommand } from "@baraja/engine";

export function registerRoomHandlers(io: Server, socket: Socket) {
  socket.on("room:join", (payload: { roomId: string; displayName: string }) => {
    socket.join(payload.roomId);
    socket.to(payload.roomId).emit("player:joined", {
      socketId: socket.id,
      displayName: payload.displayName,
    });
  });

  socket.on("room:leave", (payload: { roomId: string }) => {
    socket.leave(payload.roomId);
    socket.to(payload.roomId).emit("player:left", { socketId: socket.id });
  });

  socket.on("game:command", (_command: GameCommand) => {
    // TODO: validate command, apply to engine, persist event, broadcast projection
  });
}
