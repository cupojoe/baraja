import { createStandardDeck, DEFAULT_DECK_ZONE_ID } from "./deck.js";
import { joinPlayer } from "./reducers/joinPlayer.js";
import type { PlayerId, RoomId, RoomState } from "./types.js";

export type CreateRoomInput = {
  roomId: RoomId;
  dealerPlayerId: PlayerId;
  dealerDisplayName: string;
};

export function createRoom({ roomId, dealerPlayerId, dealerDisplayName }: CreateRoomInput): RoomState {
  const emptyRoom: RoomState = {
    id: roomId,
    dealerPlayerId,
    version: 0,
    players: {},
    zones: {},
    cards: {},
  };

  const dealerJoin = joinPlayer(
    emptyRoom,
    {
      type: "JoinPlayer",
      roomId,
      playerId: dealerPlayerId,
      displayName: dealerDisplayName,
    },
    0,
  );

  if (dealerJoin.kind !== "applied") {
    throw new Error("dealer bootstrap join did not apply");
  }

  const deck = createStandardDeck(DEFAULT_DECK_ZONE_ID);

  return {
    ...dealerJoin.state,
    version: 0,
    zones: {
      ...dealerJoin.state.zones,
      [DEFAULT_DECK_ZONE_ID]: {
        id: DEFAULT_DECK_ZONE_ID,
        type: "deck",
        cardIds: deck.map((card) => card.id),
        metadata: {},
      },
    },
    cards: Object.fromEntries(deck.map((card) => [card.id, card])),
  };
}
