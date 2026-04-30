import type { CardState, Rank, Suit, ZoneId } from "./types.js";

export const STANDARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const satisfies readonly Rank[];
export const STANDARD_SUITS = ["S", "H", "D", "C"] as const satisfies readonly Suit[];

export const DEFAULT_DECK_ZONE_ID = "deck" satisfies ZoneId;

export function createStandardDeck(zoneId: ZoneId = DEFAULT_DECK_ZONE_ID): CardState[] {
  return STANDARD_SUITS.flatMap((suit) =>
    STANDARD_RANKS.map((rank) => ({
      id: `c-${rank}-${suit}`,
      value: { rank, suit },
      zoneId,
      face: "down",
      visibleTo: [],
      metadata: {},
    })),
  );
}
