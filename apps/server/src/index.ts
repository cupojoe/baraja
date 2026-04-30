import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerRoomHandlers } from "./room.js";

const PORT = process.env.PORT ?? 3001;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);
  registerRoomHandlers(io, socket);
  socket.on("disconnect", () => {
    console.log("socket disconnected", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`baraja server listening on :${PORT}`);
});
