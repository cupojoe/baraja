import { describe, expect, it } from "vitest";

import { applyEvent, applyProjectedEvent } from "../applyEvent.js";
import { createAuthority } from "../authority.js";
import { give } from "../reducers/give.js";
import { show } from "../reducers/show.js";
import { createRoom } from "../state.js";
import type { ProjectedRoomState, RoomState } from "../types.js";

function makeRoom(): RoomState {
  const base = createRoom({ roomId: "room-1", dealerPlayerId: "dealer", dealerDisplayName: "Dealer" });
  const auth = createAuthority({ seed: 1 });
  let state = base;
  for (const [playerId, name] of [
    ["alice", "Alice"],
    ["bob", "Bob"],
  ] as const) {
    const r = auth.apply(state, { type: "JoinPlayer", roomId: "room-1", playerId, displayName: name }, 1);
    if (r.kind !== "applied") throw new Error("expected applied");
    state = r.state;
  }
  return state;
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

describe("show reducer", () => {
  it("show with PlayerId[] adds each player to visibleTo without collapsing to everyone", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    const result = show(
      room,
      {
        type: "Show",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version,
        cardIds: [cardId],
        audience: ["alice", "bob"],
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.state.cards[cardId].visibleTo).toEqual(expect.arrayContaining(["alice", "bob"]));
    expect(result.state.cards[cardId].visibleTo).not.toBe("everyone");
    expect(result.event.type).toBe("CardsShown");
    if (result.event.type !== "CardsShown") throw new Error("type guard");
    // Engine never normalizes a player array audience to "everyone".
    expect(result.event.audience).toEqual(["alice", "bob"]);
  });

  it("show with audience='everyone' replaces visibleTo with everyone", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    const result = show(
      room,
      {
        type: "Show",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version,
        cardIds: [cardId],
        audience: "everyone",
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.state.cards[cardId].visibleTo).toBe("everyone");
    if (result.event.type !== "CardsShown") throw new Error("type guard");
    expect(result.event.audience).toBe("everyone");
  });

  it("rejects stale version", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    expect(
      show(
        room,
        {
          type: "Show",
          roomId: "room-1",
          actorId: "dealer",
          expectedVersion: 999,
          cardIds: [cardId],
          audience: "everyone",
        },
        0,
      ),
    ).toEqual({ kind: "rejected", reason: "stale_version", expectedVersion: room.version });
  });

  it("rejects invalid card", () => {
    const room = makeRoom();
    expect(
      show(
        room,
        {
          type: "Show",
          roomId: "room-1",
          actorId: "dealer",
          expectedVersion: room.version,
          cardIds: ["nope"],
          audience: "everyone",
        },
        0,
      ),
    ).toEqual({ kind: "rejected", reason: "invalid_card", expectedVersion: room.version });
  });

  it("applyEvent equals reducer post-state for both audience forms", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    for (const audience of ["everyone" as const, ["alice", "bob"] as const]) {
      const result = show(
        room,
        {
          type: "Show",
          roomId: "room-1",
          actorId: "dealer",
          expectedVersion: room.version,
          cardIds: [cardId],
          audience: audience as "everyone" | string[],
        },
        0,
      );
      if (result.kind !== "applied") throw new Error("expected applied");
      expect(applyEvent(room, result.event)).toEqual(result.state);
    }
  });

  it("applyProjectedEvent updates knownBy without inventing value", () => {
    const room = makeRoom();
    const projected = projectFull(room);
    const cardId = room.zones.deck.cardIds[0];
    projected.cards[cardId] = { ...projected.cards[cardId], value: null, knownBy: [] };
    const result = show(
      room,
      {
        type: "Show",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version,
        cardIds: [cardId],
        audience: ["alice"],
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    const next = applyProjectedEvent(projected, result.event, "bob");
    expect(next.cards[cardId].knownBy).toEqual(["alice"]);
    expect(next.cards[cardId].value).toBeNull();
  });

  it("applyProjectedEvent for audience='everyone' sets knownBy to all players", () => {
    const room = makeRoom();
    const projected = projectFull(room);
    const cardId = room.zones.deck.cardIds[0];
    projected.cards[cardId] = { ...projected.cards[cardId], value: null, knownBy: [] };
    const result = show(
      room,
      {
        type: "Show",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version,
        cardIds: [cardId],
        audience: "everyone",
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    const next = applyProjectedEvent(projected, result.event, "bob");
    expect(new Set(next.cards[cardId].knownBy)).toEqual(new Set(Object.keys(room.players)));
    expect(next.cards[cardId].value).toBeNull();
  });

  it("subsequent move resets show-granted visibility", () => {
    // Show a deck card to alice and bob (without "everyone"), then move to dealer's hand → visibleTo collapses to owner.
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    // Place it on the table face-down with no viewers, so visibility is purely show-granted.
    const tableRoom: RoomState = {
      ...room,
      zones: {
        ...room.zones,
        deck: { ...room.zones.deck, cardIds: room.zones.deck.cardIds.slice(1) },
        table: { id: "table", type: "table", cardIds: [cardId], metadata: {} },
      },
      cards: {
        ...room.cards,
        [cardId]: { ...room.cards[cardId], zoneId: "table", face: "down", visibleTo: [] },
      },
    };
    const shown = show(
      tableRoom,
      {
        type: "Show",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: tableRoom.version,
        cardIds: [cardId],
        audience: ["alice", "bob"],
      },
      0,
    );
    if (shown.kind !== "applied") throw new Error("expected applied");
    expect(shown.state.cards[cardId].visibleTo).toEqual(expect.arrayContaining(["alice", "bob"]));
    const moved = give(
      shown.state,
      {
        type: "Give",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: shown.state.version,
        cardIds: [cardId],
        toZoneId: "hand-dealer",
      },
      0,
    );
    if (moved.kind !== "applied") throw new Error("expected applied");
    expect(moved.state.cards[cardId].visibleTo).toEqual(["dealer"]);
  });
});
