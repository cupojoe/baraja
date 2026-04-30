import type { AuthorityRejectedResult } from "../authority.js";
import type { GameCommand } from "../commands.js";
import type { RoomState } from "../types.js";

export function validate(state: RoomState, command: GameCommand): AuthorityRejectedResult | null {
  if (command.expectedVersion !== state.version) {
    return {
      kind: "rejected",
      reason: "stale_version",
      expectedVersion: state.version,
    };
  }
  return null;
}
