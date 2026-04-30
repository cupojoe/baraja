import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { TakeCommand } from "../commands.js";
import type { RoomState, ZoneState } from "../types.js";
import { handZoneIdForPlayer } from "./joinPlayer.js";
import { moveCards, naturalFaceForZone } from "./move.js";
import { validate } from "./validate.js";

export type TakeResult = AuthorityAppliedResult | AuthorityRejectedResult;

function findActorHand(state: RoomState, actorId: string): ZoneState | undefined {
  const byConvention = state.zones[handZoneIdForPlayer(actorId)];
  if (byConvention && byConvention.type === "hand" && byConvention.ownerPlayerId === actorId) {
    return byConvention;
  }
  return Object.values(state.zones).find(
    (zone) => zone.type === "hand" && zone.ownerPlayerId === actorId,
  );
}

export function take(state: RoomState, command: TakeCommand, now: number): TakeResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  const actorHand = findActorHand(state, command.actorId);
  if (!actorHand) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  const toFace = naturalFaceForZone(actorHand.type);
  const result = moveCards(state, command.cardIds, command.fromZoneId, actorHand.id, toFace);
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
      fromZoneId: command.fromZoneId,
      toZoneId: actorHand.id,
      toFace: result.toFace,
      fromResultingCardIds: result.fromResultingCardIds,
      toResultingCardIds: result.toResultingCardIds,
    },
  };
}
