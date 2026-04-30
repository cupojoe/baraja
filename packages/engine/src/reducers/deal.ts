import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { DealCommand } from "../commands.js";
import type { RoomState } from "../types.js";
import { moveCards } from "./move.js";
import { validate } from "./validate.js";

export type DealResult = AuthorityAppliedResult | AuthorityRejectedResult;

export function deal(state: RoomState, command: DealCommand, now: number): DealResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  const result = moveCards(
    state,
    command.cardIds,
    command.sourceZoneId,
    command.destinationZoneId,
    command.face,
  );
  if (result.kind === "rejected") return result;

  return {
    kind: "applied",
    state: result.state,
    version: result.version,
    event: {
      type: "CardsDealt",
      roomId: command.roomId,
      version: result.version,
      timestamp: now,
      actorId: command.actorId,
      movedCardIds: result.movedCardIds,
      fromZoneId: command.sourceZoneId,
      toZoneId: command.destinationZoneId,
      toFace: result.toFace,
      fromResultingCardIds: result.fromResultingCardIds,
      toResultingCardIds: result.toResultingCardIds,
    },
  };
}
