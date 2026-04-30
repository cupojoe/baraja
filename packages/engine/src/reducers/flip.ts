import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { FlipCommand } from "../commands.js";
import type { CardState, RoomState } from "../types.js";
import { resetViewers } from "../viewers.js";
import { validate } from "./validate.js";

export type FlipResult = AuthorityAppliedResult | AuthorityRejectedResult;

export function flip(state: RoomState, command: FlipCommand, now: number): FlipResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  for (const cardId of command.cardIds) {
    if (!state.cards[cardId]) {
      return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
    }
  }

  const version = state.version + 1;
  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const cardId of command.cardIds) {
    const card = state.cards[cardId];
    const zone = state.zones[card.zoneId];
    updatedCards[cardId] = {
      ...card,
      face: command.face,
      visibleTo: resetViewers({
        zoneType: zone?.type ?? "table",
        face: command.face,
        ownerPlayerId: zone?.ownerPlayerId,
      }),
    };
  }

  const nextState: RoomState = {
    ...state,
    version,
    cards: updatedCards,
  };

  return {
    kind: "applied",
    state: nextState,
    version,
    event: {
      type: "CardsFlipped",
      roomId: command.roomId,
      version,
      timestamp: now,
      actorId: command.actorId,
      cardIds: [...command.cardIds],
      face: command.face,
    },
  };
}
