import { describe, expect, it } from "vitest";

import { applyEvent, applyProjectedEvent } from "../applyEvent.js";
import { cut } from "../reducers/cut.js";
import { createRoom } from "../state.js";
import type { ProjectedRoomState, RoomState } from "../types.js";

function makeRoom(): RoomState {
  return createRoom({ roomId: "room-1", dealerPlayerId: "dealer", dealerDisplayName: "Dealer" });
}

function projectFull(state: RoomState): ProjectedRoomState {
  return {
    ...state,
    cards: Object.fromEntries(
      Object.entries(state.cards).map(([id, card]) => [
        id,
        {
          id: card.id,
          zoneId: card.zoneId,
          face: card.face,
          metadata: card.metadata,
          value: card.value,
          knownBy: card.visibleTo === "everyone" ? Object.keys(state.players) : [...card.visibleTo],
        },
      ]),
    ),
  };
}

describe("cut reducer", () => {
  it("emits ZoneReordered (not CardsMoved) and reorders the zone", () => {
    const room = makeRoom();
    const before = [...room.zones.deck.cardIds];
    const result = cut(
      room,
      { type: "Cut", roomId: "room-1", actorId: "dealer", expectedVersion: 0, zoneId: "deck", atIndex: 10 },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.event.type).toBe("ZoneReordered");
    if (result.event.type !== "ZoneReordered") return;
    expect(result.event.resultingCardIds).toEqual([...before.slice(10), ...before.slice(0, 10)]);
    expect(result.state.zones.deck.cardIds).toEqual(result.event.resultingCardIds);
  });

  it("defaults atIndex to floor(length/2)", () => {
    const room = makeRoom();
    const result = cut(
      room,
      { type: "Cut", roomId: "room-1", actorId: "dealer", expectedVersion: 0, zoneId: "deck" },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    if (result.event.type !== "ZoneReordered") throw new Error("expected ZoneReordered");
    const before = room.zones.deck.cardIds;
    expect(result.event.resultingCardIds).toEqual([
      ...before.slice(Math.floor(before.length / 2)),
      ...before.slice(0, Math.floor(before.length / 2)),
    ]);
  });

  it("rejects stale version", () => {
    const room = makeRoom();
    expect(
      cut(
        room,
        { type: "Cut", roomId: "room-1", actorId: "dealer", expectedVersion: 5, zoneId: "deck", atIndex: 1 },
        0,
      ),
    ).toEqual({ kind: "rejected", reason: "stale_version", expectedVersion: 0 });
  });

  it("applyEvent and applyProjectedEvent reproduce the new order", () => {
    const room = makeRoom();
    const projected = projectFull(room);
    const result = cut(
      room,
      { type: "Cut", roomId: "room-1", actorId: "dealer", expectedVersion: 0, zoneId: "deck", atIndex: 7 },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(applyEvent(room, result.event)).toEqual(result.state);
    const nextProjected = applyProjectedEvent(projected, result.event, "dealer");
    expect(nextProjected.zones.deck.cardIds).toEqual(result.state.zones.deck.cardIds);
    expect(nextProjected.version).toBe(result.state.version);
  });
});
