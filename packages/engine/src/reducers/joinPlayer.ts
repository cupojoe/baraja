import type { JoinPlayerCommand } from "../commands.js";
import type { AuthorityAppliedResult, AuthorityNoopResult } from "../authority.js";
import type { PlayerId, RoomState, ZoneId, ZoneState } from "../types.js";

export type JoinPlayerResult = AuthorityAppliedResult | AuthorityNoopResult;

export function handZoneIdForPlayer(playerId: PlayerId): ZoneId {
  return `hand-${playerId}`;
}

export function createHandZone(playerId: PlayerId, zoneId: ZoneId = handZoneIdForPlayer(playerId)): ZoneState {
  return {
    id: zoneId,
    type: "hand",
    ownerPlayerId: playerId,
    cardIds: [],
    metadata: {},
  };
}

export function joinPlayer(state: RoomState, command: JoinPlayerCommand, now: number): JoinPlayerResult {
  const existingPlayer = state.players[command.playerId];

  if (existingPlayer) {
    if (existingPlayer.connected) {
      return { kind: "noop", state };
    }

    return {
      kind: "noop",
      state: {
        ...state,
        players: {
          ...state.players,
          [command.playerId]: {
            ...existingPlayer,
            connected: true,
          },
        },
      },
    };
  }

  const handZoneId = handZoneIdForPlayer(command.playerId);
  const version = state.version + 1;
  const nextState: RoomState = {
    ...state,
    version,
    players: {
      ...state.players,
      [command.playerId]: {
        id: command.playerId,
        displayName: command.displayName,
        connected: true,
      },
    },
    zones: {
      ...state.zones,
      [handZoneId]: createHandZone(command.playerId, handZoneId),
    },
  };

  return {
    kind: "applied",
    state: nextState,
    event: {
      type: "PlayerJoined",
      roomId: command.roomId,
      version,
      timestamp: now,
      playerId: command.playerId,
      displayName: command.displayName,
      handZoneId,
    },
    version,
  };
}
