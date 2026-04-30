import { describe, expect, it } from "vitest";

import { createStandardDeck, STANDARD_RANKS, STANDARD_SUITS } from "../deck.js";
import type { RoomState } from "../types.js";

describe("createStandardDeck", () => {
  it("creates 52 unique cards in canonical sorted order", () => {
    const deck = createStandardDeck();
    const expectedIds = STANDARD_SUITS.flatMap((suit) => STANDARD_RANKS.map((rank) => `c-${rank}-${suit}`));

    expect(deck).toHaveLength(52);
    expect(deck.map((card) => card.id)).toEqual(expectedIds);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
  });

  it("initializes cards for the default face-down deck state", () => {
    const deck = createStandardDeck();

    for (const card of deck) {
      expect(card.zoneId).toBe("deck");
      expect(card.face).toBe("down");
      expect(card.visibleTo).toEqual([]);
      expect(card.metadata).toEqual({});
    }
  });

  it("supports a custom deck zone id", () => {
    const deck = createStandardDeck("draw-pile");

    expect(deck.every((card) => card.zoneId === "draw-pile")).toBe(true);
  });

  it("can be embedded in RoomState and JSON round-tripped losslessly", () => {
    const deck = createStandardDeck();
    const roomState: RoomState = {
      id: "room-1",
      version: 0,
      players: {},
      zones: {
        deck: {
          id: "deck",
          type: "deck",
          cardIds: deck.map((card) => card.id),
          metadata: {},
        },
      },
      cards: Object.fromEntries(deck.map((card) => [card.id, card])),
    };

    expect(JSON.parse(JSON.stringify(roomState))).toEqual(roomState);
  });
});
