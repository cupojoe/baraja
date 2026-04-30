import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { ShuffleCommand } from "../commands.js";
import { type Rng, shuffleInPlace } from "../rng.js";
import type { CardState, RoomState } from "../types.js";
import { resetViewers } from "../viewers.js";
import { validate } from "./validate.js";

export type ShuffleResult = AuthorityAppliedResult | AuthorityRejectedResult;

export function shuffle(state: RoomState, command: ShuffleCommand, now: number, rng: Rng): ShuffleResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  const zone = state.zones[command.zoneId];
  if (!zone) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  const resultingCardIds = shuffleInPlace([...zone.cardIds], rng);
  const version = state.version + 1;

  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const cardId of resultingCardIds) {
    const card = state.cards[cardId];
    if (!card) continue;
    updatedCards[cardId] = {
      ...card,
      visibleTo: resetViewers({
        zoneType: zone.type,
        face: card.face,
        ownerPlayerId: zone.ownerPlayerId,
      }),
    };
  }

  const nextState: RoomState = {
    ...state,
    version,
    zones: {
      ...state.zones,
      [zone.id]: { ...zone, cardIds: resultingCardIds },
    },
    cards: updatedCards,
  };

  return {
    kind: "applied",
    state: nextState,
    version,
    event: {
      type: "ZoneShuffled",
      roomId: command.roomId,
      version,
      timestamp: now,
      actorId: command.actorId,
      zoneId: zone.id,
      resultingCardIds,
    },
  };
}
