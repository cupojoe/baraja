import type { AuthorityCommand } from "./commands.js";
import type { CommandRejectionReason, GameEvent } from "./events.js";
import type { RoomState } from "./types.js";

export type AuthorityAppliedResult = {
  kind: "applied";
  state: RoomState;
  event: GameEvent;
  version: number;
};

export type AuthorityNoopResult = {
  kind: "noop";
  state: RoomState;
};

export type AuthorityRejectedResult = {
  kind: "rejected";
  reason: CommandRejectionReason;
  expectedVersion: number;
};

export type AuthorityResult = AuthorityAppliedResult | AuthorityNoopResult | AuthorityRejectedResult;

export interface Authority {
  apply(state: RoomState, command: AuthorityCommand, now: number): AuthorityResult;
}
