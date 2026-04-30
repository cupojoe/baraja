import type { GameEvent, PlayerJoinedEvent } from "./events.js";
import { createHandZone } from "./reducers/joinPlayer.js";
import type { PlayerId, ProjectedRoomState, RoomState } from "./types.js";

export function applyEvent(state: RoomState, event: GameEvent): RoomState {
  switch (event.type) {
    case "PlayerJoined":
      return applyPlayerJoined(state, event);
    case "CardsDealt":
    case "ZoneShuffled":
    case "CardsMoved":
    case "CardsFlipped":
    case "CardPeeked":
    case "CardsShown":
    case "PlayerLeft":
    case "CommandRejected":
      throw new Error("not implemented");
  }
}

export function applyProjectedEvent(
  state: ProjectedRoomState,
  event: GameEvent,
  _viewerId: PlayerId,
): ProjectedRoomState {
  switch (event.type) {
    case "PlayerJoined":
      return applyProjectedPlayerJoined(state, event);
    case "CardsDealt":
    case "ZoneShuffled":
    case "CardsMoved":
    case "CardsFlipped":
    case "CardPeeked":
    case "CardsShown":
    case "PlayerLeft":
    case "CommandRejected":
      throw new Error("not implemented");
  }
}

function applyPlayerJoined(state: RoomState, event: PlayerJoinedEvent): RoomState {
  return {
    ...state,
    version: event.version,
    players: {
      ...state.players,
      [event.playerId]: {
        id: event.playerId,
        displayName: event.displayName,
        connected: true,
      },
    },
    zones: {
      ...state.zones,
      [event.handZoneId]: createHandZone(event.playerId, event.handZoneId),
    },
  };
}

function applyProjectedPlayerJoined(state: ProjectedRoomState, event: PlayerJoinedEvent): ProjectedRoomState {
  return {
    ...state,
    version: event.version,
    players: {
      ...state.players,
      [event.playerId]: {
        id: event.playerId,
        displayName: event.displayName,
        connected: true,
      },
    },
    zones: {
      ...state.zones,
      [event.handZoneId]: createHandZone(event.playerId, event.handZoneId),
    },
  };
}
