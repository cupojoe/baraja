import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  closedAt: integer("closed_at", { mode: "timestamp" }),
});

export const gameEvents = sqliteTable("game_events", {
  id: text("id").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  version: integer("version").notNull(),
  type: text("type").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  version: integer("version").notNull(),
  state: text("state", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
