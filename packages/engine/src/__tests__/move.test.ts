import { describe, expect, it } from "vitest";

import { applyEvent, applyProjectedEvent } from "../applyEvent.js";
import { createAuthority } from "../authority.js";
import { deal } from "../reducers/deal.js";
import { give } from "../reducers/give.js";
import { take } from "../reducers/take.js";
import { createRoom } from "../state.js";
import type { ProjectedRoomState, RoomState } from "../types.js";

function makeRoom(): RoomState {
  const base = createRoom({ roomId: "room-1", dealerPlayerId: "dealer", dealerDisplayName: "Dealer" });
  // Join a second player so we have two hands.
  const auth = createAuthority({ seed: 1 });
  const joined = auth.apply(
    base,
    { type: "JoinPlayer", roomId: "room-1", playerId: "alice", displayName: "Alice" },
    1,
  );
  if (joined.kind !== "applied") throw new Error("expected applied");
  return joined.state;
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

describe("deal reducer", () => {
  it("moves face-down cards from deck to a hand and resets visibility to owner-only", () => {
    const room = makeRoom();
    const cardIds = room.zones.deck.cardIds.slice(0, 3);
    const result = deal(
      room,
      {
        type: "Deal",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version,
        sourceZoneId: "deck",
        destinationZoneId: "hand-alice",
        cardIds,
        face: "down",
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");

    expect(result.state.zones["hand-alice"].cardIds).toEqual(cardIds);
    expect(result.state.zones.deck.cardIds).not.toContain(cardIds[0]);
    for (const id of cardIds) {
      expect(result.state.cards[id].zoneId).toBe("hand-alice");
      expect(result.state.cards[id].face).toBe("down");
      expect(result.state.cards[id].visibleTo).toEqual(["alice"]);
    }
    expect(result.event.type).toBe("CardsDealt");
    if (result.event.type !== "CardsDealt") return;
    expect(result.event.movedCardIds).toEqual(cardIds);
    expect(result.event.toFace).toBe("down");
    expect(result.event.fromResultingCardIds).toEqual(
      room.zones.deck.cardIds.filter((id) => !cardIds.includes(id)),
    );
    expect(result.event.toResultingCardIds).toEqual(cardIds);
  });

  it("applyEvent and applyProjectedEvent reproduce the reducer post-state", () => {
    const room = makeRoom();
    const cardIds = room.zones.deck.cardIds.slice(0, 2);
    const result = deal(
      room,
      {
        type: "Deal",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version,
        sourceZoneId: "deck",
        destinationZoneId: "hand-alice",
        cardIds,
        face: "down",
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");

    expect(applyEvent(room, result.event)).toEqual(result.state);

    const projected = projectFull(room);
    const projectedNext = applyProjectedEvent(projected, result.event, "dealer");
    // Dealer is not the owner, so the value should be cleared on cards now visible only to alice.
    for (const id of cardIds) {
      expect(projectedNext.cards[id].zoneId).toBe("hand-alice");
      expect(projectedNext.cards[id].face).toBe("down");
      expect(projectedNext.cards[id].knownBy).toEqual(["alice"]);
      expect(projectedNext.cards[id].value).toBeNull();
    }
  });

  it("rejects invalid_card when a moved id is not in the source zone", () => {
    const room = makeRoom();
    const result = deal(
      room,
      {
        type: "Deal",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version,
        sourceZoneId: "deck",
        destinationZoneId: "hand-alice",
        cardIds: ["not-a-real-card"],
        face: "down",
      },
      0,
    );
    expect(result).toEqual({ kind: "rejected", reason: "invalid_card", expectedVersion: room.version });
  });

  it("rejects stale_version", () => {
    const room = makeRoom();
    const result = deal(
      room,
      {
        type: "Deal",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: room.version + 99,
        sourceZoneId: "deck",
        destinationZoneId: "hand-alice",
        cardIds: room.zones.deck.cardIds.slice(0, 1),
        face: "down",
      },
      0,
    );
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.reason).toBe("stale_version");
  });
});

describe("give reducer", () => {
  it("moves a card from the actor's hand onto the table face-up", () => {
    const base = makeRoom();
    // Deal one card to dealer's hand so we have something to give.
    const cardId = base.zones.deck.cardIds[0];
    const dealResult = deal(
      base,
      {
        type: "Deal",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: base.version,
        sourceZoneId: "deck",
        destinationZoneId: "hand-dealer",
        cardIds: [cardId],
        face: "down",
      },
      0,
    );
    if (dealResult.kind !== "applied") throw new Error("expected applied");
    const seeded: RoomState = {
      ...dealResult.state,
      zones: {
        ...dealResult.state.zones,
        table: { id: "table", type: "table", cardIds: [], metadata: {} },
      },
    };

    const result = give(
      seeded,
      {
        type: "Give",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: seeded.version,
        cardIds: [cardId],
        toZoneId: "table",
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.state.cards[cardId].zoneId).toBe("table");
    expect(result.state.cards[cardId].face).toBe("up");
    expect(result.state.cards[cardId].visibleTo).toBe("everyone");
    expect(result.event.type).toBe("CardsMoved");
  });
});

describe("take reducer", () => {
  it("moves a card from another zone into the actor's hand face-down", () => {
    const base = makeRoom();
    const cardId = base.zones.deck.cardIds[0];
    // Put the card on the table first.
    const seeded: RoomState = {
      ...base,
      zones: {
        ...base.zones,
        deck: { ...base.zones.deck, cardIds: base.zones.deck.cardIds.filter((id) => id !== cardId) },
        table: { id: "table", type: "table", cardIds: [cardId], metadata: {} },
      },
      cards: {
        ...base.cards,
        [cardId]: { ...base.cards[cardId], zoneId: "table", face: "up", visibleTo: "everyone" },
      },
    };

    const result = take(
      seeded,
      {
        type: "Take",
        roomId: "room-1",
        actorId: "alice",
        expectedVersion: seeded.version,
        cardIds: [cardId],
        fromZoneId: "table",
      },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.state.cards[cardId].zoneId).toBe("hand-alice");
    expect(result.state.cards[cardId].face).toBe("down");
    expect(result.state.cards[cardId].visibleTo).toEqual(["alice"]);
  });

  it("race: Alice take vs Bob give on same card — losing command rejected on stale version", () => {
    const base = makeRoom();
    // Deal one card to dealer's hand so dealer can Give it.
    const cardId = base.zones.deck.cardIds[0];
    const dealResult = deal(
      base,
      {
        type: "Deal",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: base.version,
        sourceZoneId: "deck",
        destinationZoneId: "hand-dealer",
        cardIds: [cardId],
        face: "down",
      },
      0,
    );
    if (dealResult.kind !== "applied") throw new Error("expected applied");
    const seeded: RoomState = {
      ...dealResult.state,
      zones: {
        ...dealResult.state.zones,
        table: { id: "table", type: "table", cardIds: [], metadata: {} },
      },
    };

    // Bob (dealer) gives first → bumps version.
    const giveResult = give(
      seeded,
      {
        type: "Give",
        roomId: "room-1",
        actorId: "dealer",
        expectedVersion: seeded.version,
        cardIds: [cardId],
        toZoneId: "table",
      },
      0,
    );
    if (giveResult.kind !== "applied") throw new Error("expected applied");

    // Alice's take, racing on the previous version — must be rejected.
    const takeResult = take(
      giveResult.state,
      {
        type: "Take",
        roomId: "room-1",
        actorId: "alice",
        expectedVersion: seeded.version,
        cardIds: [cardId],
        fromZoneId: "hand-dealer",
      },
      0,
    );
    expect(takeResult.kind).toBe("rejected");
    if (takeResult.kind !== "rejected") return;
    expect(takeResult.reason).toBe("stale_version");
  });
});
