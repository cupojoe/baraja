import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { ShowCommand } from "../commands.js";
import type { CardState, RoomState, ViewerSet } from "../types.js";
import { addViewer } from "../viewers.js";
import { validate } from "./validate.js";

export type ShowResult = AuthorityAppliedResult | AuthorityRejectedResult;

export function show(state: RoomState, command: ShowCommand, now: number): ShowResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  if (command.cardIds.length === 0) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  for (const cardId of command.cardIds) {
    if (!state.cards[cardId]) {
      return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
    }
  }

  const version = state.version + 1;
  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const cardId of command.cardIds) {
    const card = state.cards[cardId];
    updatedCards[cardId] = {
      ...card,
      visibleTo: widenVisibility(card.visibleTo, command.audience),
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
      type: "CardsShown",
      roomId: command.roomId,
      version,
      timestamp: now,
      actorId: command.actorId,
      cardIds: [...command.cardIds],
      audience: command.audience === "everyone" ? "everyone" : [...command.audience],
    },
  };
}

function widenVisibility(viewers: ViewerSet, audience: ViewerSet): ViewerSet {
  if (audience === "everyone") return "everyone";
  let next = viewers;
  for (const playerId of audience) {
    next = addViewer(next, playerId);
  }
  return next;
}
