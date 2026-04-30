import { describe, expect, it } from "vitest";

import { applyEvent, applyProjectedEvent } from "../applyEvent.js";
import { flip } from "../reducers/flip.js";
import { createRoom } from "../state.js";
import type { ProjectedRoomState, RoomState } from "../types.js";

function makeRoom(): RoomState {
  const base = createRoom({ roomId: "room-1", dealerPlayerId: "dealer", dealerDisplayName: "Dealer" });
  // Move one card onto the table for flip-on-table coverage.
  const cardId = "c-A-S";
  return {
    ...base,
    zones: {
      ...base.zones,
      deck: { ...base.zones.deck, cardIds: base.zones.deck.cardIds.filter((id) => id !== cardId) },
      table: { id: "table", type: "table", cardIds: [cardId], metadata: {} },
    },
    cards: {
      ...base.cards,
      [cardId]: { ...base.cards[cardId], zoneId: "table", face: "down", visibleTo: [] },
    },
  };
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

describe("flip reducer", () => {
  it("flipping table card up makes it visible to everyone", () => {
    const room = makeRoom();
    const result = flip(
      room,
      { type: "Flip", roomId: "room-1", actorId: "dealer", expectedVersion: 0, cardIds: ["c-A-S"], face: "up" },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.state.cards["c-A-S"].face).toBe("up");
    expect(result.state.cards["c-A-S"].visibleTo).toBe("everyone");
    expect(result.event.type).toBe("CardsFlipped");
  });

  it("flipping a hand card face=down resets viewers to zone defaults (owner-only)", () => {
    // Put card into a player's hand.
    const room = makeRoom();
    const handZoneId = "hand-dealer";
    const withInHand: RoomState = {
      ...room,
      zones: {
        ...room.zones,
        [handZoneId]: { ...room.zones[handZoneId], cardIds: ["c-A-S"] },
        table: { ...room.zones.table, cardIds: [] },
      },
      cards: {
        ...room.cards,
        "c-A-S": { ...room.cards["c-A-S"], zoneId: handZoneId, face: "up", visibleTo: "everyone" },
      },
    };

    const result = flip(
      withInHand,
      { type: "Flip", roomId: "room-1", actorId: "dealer", expectedVersion: 0, cardIds: ["c-A-S"], face: "down" },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.state.cards["c-A-S"].visibleTo).toEqual(["dealer"]);
  });

  it("rejects stale version", () => {
    const room = makeRoom();
    expect(
      flip(
        room,
        { type: "Flip", roomId: "room-1", actorId: "dealer", expectedVersion: 9, cardIds: ["c-A-S"], face: "up" },
        0,
      ),
    ).toEqual({ kind: "rejected", reason: "stale_version", expectedVersion: 0 });
  });

  it("rejects invalid card", () => {
    const room = makeRoom();
    expect(
      flip(
        room,
        { type: "Flip", roomId: "room-1", actorId: "dealer", expectedVersion: 0, cardIds: ["nope"], face: "up" },
        0,
      ),
    ).toEqual({ kind: "rejected", reason: "invalid_card", expectedVersion: 0 });
  });

  it("applyEvent equals reducer post-state", () => {
    const room = makeRoom();
    const result = flip(
      room,
      { type: "Flip", roomId: "room-1", actorId: "dealer", expectedVersion: 0, cardIds: ["c-A-S"], face: "up" },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(applyEvent(room, result.event)).toEqual(result.state);
  });

  it("applyProjectedEvent does not invent a value the viewer never had", () => {
    const room = makeRoom();
    const projected = projectFull(room);
    // Strip the seeded value so we can prove the reducer does not invent one.
    projected.cards["c-A-S"] = { ...projected.cards["c-A-S"], value: null };
    const result = flip(
      room,
      { type: "Flip", roomId: "room-1", actorId: "dealer", expectedVersion: 0, cardIds: ["c-A-S"], face: "up" },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    const next = applyProjectedEvent(projected, result.event, "dealer");
    expect(next.cards["c-A-S"].face).toBe("up");
    expect(next.cards["c-A-S"].knownBy).toEqual(Object.keys(room.players));
    expect(next.cards["c-A-S"].value).toBeNull();
  });

  it("applyProjectedEvent clears value when face goes down and viewer can no longer see", () => {
    const room = makeRoom();
    const projected = projectFull(room);
    // Seed: card on the table, currently face-up and visible to everyone (value present).
    projected.cards["c-A-S"] = { ...projected.cards["c-A-S"], face: "up", value: { rank: "A", suit: "S" }, knownBy: ["dealer"] };
    const upRoom: RoomState = {
      ...room,
      cards: { ...room.cards, "c-A-S": { ...room.cards["c-A-S"], face: "up", visibleTo: "everyone" } },
    };
    const result = flip(
      upRoom,
      { type: "Flip", roomId: "room-1", actorId: "dealer", expectedVersion: 0, cardIds: ["c-A-S"], face: "down" },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    const next = applyProjectedEvent(projected, result.event, "dealer");
    expect(next.cards["c-A-S"].face).toBe("down");
    // Table zone, face-down → defaults to no viewers.
    expect(next.cards["c-A-S"].knownBy).toEqual([]);
    expect(next.cards["c-A-S"].value).toBeNull();
  });
});
