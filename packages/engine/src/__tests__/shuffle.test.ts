import { describe, expect, it } from "vitest";

import { applyEvent, applyProjectedEvent } from "../applyEvent.js";
import { createRoom } from "../state.js";
import { shuffle } from "../reducers/shuffle.js";
import { createRng } from "../rng.js";
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

describe("shuffle reducer", () => {
  it("is reproducible with a fixed seed", () => {
    const room = makeRoom();
    const cmd = {
      type: "Shuffle" as const,
      roomId: "room-1",
      actorId: "dealer",
      expectedVersion: 0,
      zoneId: "deck",
    };

    const r1 = shuffle(room, cmd, 0, createRng(42));
    const r2 = shuffle(room, cmd, 0, createRng(42));

    expect(r1.kind).toBe("applied");
    expect(r2.kind).toBe("applied");
    if (r1.kind !== "applied" || r2.kind !== "applied") return;
    expect(r1.event).toEqual(r2.event);
    expect(r1.state.zones.deck.cardIds).toEqual(r2.state.zones.deck.cardIds);
  });

  it("emits resultingCardIds matching the post-state zone order", () => {
    const room = makeRoom();
    const result = shuffle(
      room,
      { type: "Shuffle", roomId: "room-1", actorId: "dealer", expectedVersion: 0, zoneId: "deck" },
      1,
      createRng(7),
    );

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    if (result.event.type !== "ZoneShuffled") throw new Error("expected ZoneShuffled");
    expect(result.event.resultingCardIds).toEqual(result.state.zones.deck.cardIds);
  });

  it("rejects with stale_version when expectedVersion mismatches", () => {
    const room = makeRoom();
    const result = shuffle(
      room,
      { type: "Shuffle", roomId: "room-1", actorId: "dealer", expectedVersion: 99, zoneId: "deck" },
      0,
      createRng(1),
    );
    expect(result).toEqual({ kind: "rejected", reason: "stale_version", expectedVersion: 0 });
  });

  it("applyEvent reproduces the reducer post-state (full)", () => {
    const room = makeRoom();
    const result = shuffle(
      room,
      { type: "Shuffle", roomId: "room-1", actorId: "dealer", expectedVersion: 0, zoneId: "deck" },
      99,
      createRng(11),
    );
    if (result.kind !== "applied") throw new Error("expected applied");
    expect(applyEvent(room, result.event)).toEqual(result.state);
  });

  it("applyProjectedEvent reorders zone and clears value for excluded viewer", () => {
    const room = makeRoom();
    const projected = projectFull(room);
    const result = shuffle(
      room,
      { type: "Shuffle", roomId: "room-1", actorId: "dealer", expectedVersion: 0, zoneId: "deck" },
      1,
      createRng(3),
    );
    if (result.kind !== "applied") throw new Error("expected applied");

    const next = applyProjectedEvent(projected, result.event, "dealer");
    expect(next.zones.deck.cardIds).toEqual(result.state.zones.deck.cardIds);
    for (const id of next.zones.deck.cardIds) {
      expect(next.cards[id].value).toBeNull();
      expect(next.cards[id].knownBy).toEqual([]);
    }
  });
});
