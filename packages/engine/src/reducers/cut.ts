import type { AuthorityAppliedResult, AuthorityRejectedResult } from "../authority.js";
import type { CutCommand } from "../commands.js";
import type { RoomState } from "../types.js";
import { validate } from "./validate.js";

export type CutResult = AuthorityAppliedResult | AuthorityRejectedResult;

export function cut(state: RoomState, command: CutCommand, now: number): CutResult {
  const rejection = validate(state, command);
  if (rejection) return rejection;

  const zone = state.zones[command.zoneId];
  if (!zone) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  const length = zone.cardIds.length;
  const atIndex = command.atIndex ?? Math.floor(length / 2);
  if (atIndex < 0 || atIndex > length) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  const resultingCardIds = [...zone.cardIds.slice(atIndex), ...zone.cardIds.slice(0, atIndex)];
  const version = state.version + 1;

  const nextState: RoomState = {
    ...state,
    version,
    zones: {
      ...state.zones,
      [zone.id]: { ...zone, cardIds: resultingCardIds },
    },
  };

  return {
    kind: "applied",
    state: nextState,
    version,
    event: {
      type: "ZoneReordered",
      roomId: command.roomId,
      version,
      timestamp: now,
      actorId: command.actorId,
      zoneId: zone.id,
      resultingCardIds,
    },
  };
}
