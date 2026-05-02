import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { PeekCommand } from "../commands.js";
import type { CardState, RoomState } from "../types.js";
import { addViewer } from "../viewers.js";
import { validate } from "./validate.js";

export type PeekResult = AuthorityAppliedResult | AuthorityRejectedResult;

export function peek(state: RoomState, command: PeekCommand, now: number): PeekResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  if (command.cardIds.length === 0) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  let zoneId: string | null = null;
  for (const cardId of command.cardIds) {
    const card = state.cards[cardId];
    if (!card) {
      return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
    }
    if (zoneId === null) {
      zoneId = card.zoneId;
    } else if (card.zoneId !== zoneId) {
      return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
    }
  }

  const version = state.version + 1;
  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const cardId of command.cardIds) {
    const card = state.cards[cardId];
    updatedCards[cardId] = {
      ...card,
      visibleTo: addViewer(card.visibleTo, command.actorId),
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
      type: "CardPeeked",
      roomId: command.roomId,
      version,
      timestamp: now,
      peekerId: command.actorId,
      cardIds: [...command.cardIds],
      zoneId: zoneId as string,
    },
  };
}
