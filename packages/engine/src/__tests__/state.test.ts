import { describe, expect, it } from "vitest";

import { createRoom } from "../state.js";
import { DEFAULT_DECK_ZONE_ID, STANDARD_RANKS, STANDARD_SUITS } from "../deck.js";

describe("createRoom", () => {
  it("creates a deterministic room with the dealer and sorted deck", () => {
    const room = createRoom({
      roomId: "room-1",
      dealerPlayerId: "dealer",
      dealerDisplayName: "Dealer",
    });
    const expectedDeckIds = STANDARD_SUITS.flatMap((suit) => STANDARD_RANKS.map((rank) => `c-${rank}-${suit}`));

    expect(room.id).toBe("room-1");
    expect(room.dealerPlayerId).toBe("dealer");
    expect(room.version).toBe(0);
    expect(room.players.dealer).toEqual({
      id: "dealer",
      displayName: "Dealer",
      connected: true,
    });
    expect(room.zones["hand-dealer"]).toEqual({
      id: "hand-dealer",
      type: "hand",
      ownerPlayerId: "dealer",
      cardIds: [],
      metadata: {},
    });
    expect(room.zones[DEFAULT_DECK_ZONE_ID]).toEqual({
      id: DEFAULT_DECK_ZONE_ID,
      type: "deck",
      cardIds: expectedDeckIds,
      metadata: {},
    });
    expect(Object.keys(room.cards)).toEqual(expectedDeckIds);
  });

  it("round-trips through JSON losslessly", () => {
    const room = createRoom({
      roomId: "room-1",
      dealerPlayerId: "dealer",
      dealerDisplayName: "Dealer",
    });

    expect(JSON.parse(JSON.stringify(room))).toEqual(room);
  });
});
