import { describe, expect, it } from "vitest";

import { applyEvent, applyProjectedEvent } from "../applyEvent.js";
import { createAuthority } from "../authority.js";
import { give } from "../reducers/give.js";
import { peek } from "../reducers/peek.js";
import { createRoom } from "../state.js";
import type { ProjectedRoomState, RoomState } from "../types.js";

function makeRoom(): RoomState {
  const base = createRoom({ roomId: "room-1", dealerPlayerId: "dealer", dealerDisplayName: "Dealer" });
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

describe("peek reducer", () => {
  it("adds the actor to visibleTo on each peeked card", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    const result = peek(
      room,
      { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: room.version, cardIds: [cardId] },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    const visibleTo = result.state.cards[cardId].visibleTo;
    expect(visibleTo).not.toBe("everyone");
    expect(visibleTo).toContain("alice");
  });

  it("emits a public CardPeeked event with peekerId and cardIds", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    const result = peek(
      room,
      { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: room.version, cardIds: [cardId] },
      42,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(result.event.type).toBe("CardPeeked");
    if (result.event.type !== "CardPeeked") throw new Error("type guard");
    expect(result.event.peekerId).toBe("alice");
    expect(result.event.cardIds).toEqual([cardId]);
    expect(result.event.zoneId).toBe("deck");
    expect(result.event.timestamp).toBe(42);
  });

  it("addViewer is idempotent (peeking twice does not duplicate entries)", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    const first = peek(
      room,
      { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: 1, cardIds: [cardId] },
      0,
    );
    if (first.kind !== "applied") throw new Error("expected applied");
    const second = peek(
      first.state,
      { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: 2, cardIds: [cardId] },
      0,
    );
    if (second.kind !== "applied") throw new Error("expected applied");
    const visibleTo = second.state.cards[cardId].visibleTo as string[];
    expect(visibleTo.filter((id) => id === "alice")).toHaveLength(1);
  });

  it("rejects stale version", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    expect(
      peek(room, { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: 999, cardIds: [cardId] }, 0),
    ).toEqual({ kind: "rejected", reason: "stale_version", expectedVersion: room.version });
  });

  it("rejects when a card is unknown", () => {
    const room = makeRoom();
    expect(
      peek(room, { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: room.version, cardIds: ["nope"] }, 0),
    ).toEqual({ kind: "rejected", reason: "invalid_card", expectedVersion: room.version });
  });

  it("rejects when peeked cards span multiple zones", () => {
    const room = makeRoom();
    const deckCard = room.zones.deck.cardIds[0];
    const handCard = room.zones["hand-dealer"].cardIds[0] ?? null;
    const handZone = "hand-dealer";
    const withHand: RoomState = handCard
      ? room
      : {
          ...room,
          zones: {
            ...room.zones,
            deck: { ...room.zones.deck, cardIds: room.zones.deck.cardIds.slice(1) },
            [handZone]: { ...room.zones[handZone], cardIds: [deckCard] },
          },
          cards: {
            ...room.cards,
            [deckCard]: { ...room.cards[deckCard], zoneId: handZone, visibleTo: ["dealer"] },
          },
        };
    const otherDeckCard = withHand.zones.deck.cardIds[0];
    const handCardId = withHand.zones[handZone].cardIds[0];
    expect(
      peek(
        withHand,
        {
          type: "Peek",
          roomId: "room-1",
          actorId: "alice",
          expectedVersion: withHand.version,
          cardIds: [otherDeckCard, handCardId],
        },
        0,
      ),
    ).toMatchObject({ kind: "rejected", reason: "invalid_card" });
  });

  it("applyEvent equals reducer post-state", () => {
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    const result = peek(
      room,
      { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: room.version, cardIds: [cardId] },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(applyEvent(room, result.event)).toEqual(result.state);
  });

  it("applyProjectedEvent updates knownBy without inventing value", () => {
    const room = makeRoom();
    const projected = projectFull(room);
    const cardId = room.zones.deck.cardIds[0];
    // Strip seeded value to prove projection does not invent it.
    projected.cards[cardId] = { ...projected.cards[cardId], value: null, knownBy: [] };
    const result = peek(
      room,
      { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: room.version, cardIds: [cardId] },
      0,
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    const next = applyProjectedEvent(projected, result.event, "dealer");
    expect(next.cards[cardId].knownBy).toEqual(["alice"]);
    expect(next.cards[cardId].value).toBeNull();
  });

  it("subsequent move clears the peeker from visibleTo", () => {
    // Peek a deck card from alice, then move it to alice's hand.
    // The destination's resetViewers replaces visibleTo with hand defaults (owner-only).
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
    // Move card to a table zone first (so dealer gives it).
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
    const peekResult = peek(
      tableRoom,
      { type: "Peek", roomId: "room-1", actorId: "alice", expectedVersion: tableRoom.version, cardIds: [cardId] },
      0,
    );
    if (peekResult.kind !== "applied") throw new Error("expected applied");
    expect(peekResult.state.cards[cardId].visibleTo).toContain("alice");

    // Now move the card to alice's hand via Give from table → hand-alice.
    const giveResult = give(
      peekResult.state,
      {
        type: "Give",
        roomId: "room-1",
        actorId: "alice",
        expectedVersion: peekResult.state.version,
        cardIds: [cardId],
        toZoneId: "hand-alice",
      },
      0,
    );
    if (giveResult.kind !== "applied") throw new Error("expected applied");
    // After move into a hand zone face-down, visibleTo should be exactly the owner.
    expect(giveResult.state.cards[cardId].visibleTo).toEqual(["alice"]);
    // Critically: alice was added by peek, but the post-move reset replaces the set,
    // so only the owner remains (which happens to also be alice here). Verify dealer is not in visibleTo.
    const visible = giveResult.state.cards[cardId].visibleTo as string[];
    expect(visible).not.toContain("dealer");
  });

  it("subsequent move clears a non-owner peeker from visibleTo", () => {
    // Dealer peeks a deck card, then card is moved to alice's hand → dealer no longer in visibleTo.
    const room = makeRoom();
    const cardId = room.zones.deck.cardIds[0];
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
    const peekResult = peek(
      tableRoom,
      { type: "Peek", roomId: "room-1", actorId: "dealer", expectedVersion: tableRoom.version, cardIds: [cardId] },
      0,
    );
    if (peekResult.kind !== "applied") throw new Error("expected applied");
    expect(peekResult.state.cards[cardId].visibleTo).toContain("dealer");
    const giveResult = give(
      peekResult.state,
      {
        type: "Give",
        roomId: "room-1",
        actorId: "alice",
        expectedVersion: peekResult.state.version,
        cardIds: [cardId],
        toZoneId: "hand-alice",
      },
      0,
    );
    if (giveResult.kind !== "applied") throw new Error("expected applied");
    expect(giveResult.state.cards[cardId].visibleTo).toEqual(["alice"]);
  });
});
