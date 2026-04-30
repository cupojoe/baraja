import type { AuthorityCommand } from "./commands.js";
import type { CommandRejectionReason, GameEvent } from "./events.js";
import { cut } from "./reducers/cut.js";
import { flip } from "./reducers/flip.js";
import { joinPlayer } from "./reducers/joinPlayer.js";
import { shuffle } from "./reducers/shuffle.js";
import { createRng, type Rng } from "./rng.js";
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

export type CreateAuthorityInput = {
  rng?: Rng;
  seed?: number;
};

export function createAuthority(input: CreateAuthorityInput = {}): Authority {
  const rng: Rng = input.rng ?? createRng(input.seed ?? Date.now());

  return {
    apply(state, command, now) {
      switch (command.type) {
        case "JoinPlayer":
          return joinPlayer(state, command, now);
        case "Shuffle":
          return shuffle(state, command, now, rng);
        case "Cut":
          return cut(state, command, now);
        case "Flip":
          return flip(state, command, now);
        case "Deal":
        case "Give":
        case "Take":
        case "Peek":
        case "Show":
          throw new Error(`reducer for ${command.type} not implemented`);
      }
    },
  };
}
