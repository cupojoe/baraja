import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { GiveCommand } from "../commands.js";
import type { RoomState } from "../types.js";
import { moveCards, naturalFaceForZone } from "./move.js";
import { validate } from "./validate.js";

export type GiveResult = AuthorityAppliedResult | AuthorityRejectedResult;

export function give(state: RoomState, command: GiveCommand, now: number): GiveResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  if (command.cardIds.length === 0) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  const firstCard = state.cards[command.cardIds[0]];
  if (!firstCard) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }
  const fromZoneId = firstCard.zoneId;
  for (const id of command.cardIds) {
    const card = state.cards[id];
    if (!card || card.zoneId !== fromZoneId) {
      return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
    }
  }

  const toZone = state.zones[command.toZoneId];
  if (!toZone) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }
  const toFace = naturalFaceForZone(toZone.type);

  const result = moveCards(state, command.cardIds, fromZoneId, command.toZoneId, toFace);
  if (result.kind === "rejected") return result;

  return {
    kind: "applied",
    state: result.state,
    version: result.version,
    event: {
      type: "CardsMoved",
      roomId: command.roomId,
      version: result.version,
      timestamp: now,
      actorId: command.actorId,
      movedCardIds: result.movedCardIds,
      fromZoneId,
      toZoneId: command.toZoneId,
      toFace: result.toFace,
      fromResultingCardIds: result.fromResultingCardIds,
      toResultingCardIds: result.toResultingCardIds,
    },
  };
}
