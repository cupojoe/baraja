import type {
  CardsDealtEvent,
  CardsFlippedEvent,
  CardsMovedEvent,
  GameEvent,
  PlayerJoinedEvent,
  ZoneReorderedEvent,
  ZoneShuffledEvent,
} from "./events.js";
import { createHandZone } from "./reducers/joinPlayer.js";
import type {
  CardState,
  PlayerId,
  PlayerState,
  ProjectedCardState,
  ProjectedRoomState,
  RoomState,
  ViewerSet,
} from "./types.js";
import { hasViewer, resetViewers } from "./viewers.js";

export function applyEvent(state: RoomState, event: GameEvent): RoomState {
  switch (event.type) {
    case "PlayerJoined":
      return applyPlayerJoined(state, event);
    case "ZoneShuffled":
      return applyZoneShuffled(state, event);
    case "ZoneReordered":
      return applyZoneReordered(state, event);
    case "CardsFlipped":
      return applyCardsFlipped(state, event);
    case "CardsDealt":
    case "CardsMoved":
      return applyCardsMovedLike(state, event);
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
  viewerId: PlayerId,
): ProjectedRoomState {
  switch (event.type) {
    case "PlayerJoined":
      return applyProjectedPlayerJoined(state, event);
    case "ZoneShuffled":
      return applyProjectedZoneShuffled(state, event, viewerId);
    case "ZoneReordered":
      return applyProjectedZoneReordered(state, event);
    case "CardsFlipped":
      return applyProjectedCardsFlipped(state, event, viewerId);
    case "CardsDealt":
    case "CardsMoved":
      return applyProjectedCardsMovedLike(state, event, viewerId);
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

function applyZoneShuffled(state: RoomState, event: ZoneShuffledEvent): RoomState {
  const zone = state.zones[event.zoneId];
  if (!zone) throw new Error(`zone ${event.zoneId} missing while replaying ZoneShuffled`);

  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const cardId of event.resultingCardIds) {
    const card = state.cards[cardId];
    if (!card) continue;
    updatedCards[cardId] = {
      ...card,
      visibleTo: resetViewers({
        zoneType: zone.type,
        face: card.face,
        ownerPlayerId: zone.ownerPlayerId,
      }),
    };
  }

  return {
    ...state,
    version: event.version,
    zones: {
      ...state.zones,
      [zone.id]: { ...zone, cardIds: [...event.resultingCardIds] },
    },
    cards: updatedCards,
  };
}

function applyZoneReordered(state: RoomState, event: ZoneReorderedEvent): RoomState {
  const zone = state.zones[event.zoneId];
  if (!zone) throw new Error(`zone ${event.zoneId} missing while replaying ZoneReordered`);

  return {
    ...state,
    version: event.version,
    zones: {
      ...state.zones,
      [zone.id]: { ...zone, cardIds: [...event.resultingCardIds] },
    },
  };
}

function applyCardsFlipped(state: RoomState, event: CardsFlippedEvent): RoomState {
  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const cardId of event.cardIds) {
    const card = state.cards[cardId];
    if (!card) continue;
    const zone = state.zones[card.zoneId];
    updatedCards[cardId] = {
      ...card,
      face: event.face,
      visibleTo: resetViewers({
        zoneType: zone?.type ?? "table",
        face: event.face,
        ownerPlayerId: zone?.ownerPlayerId,
      }),
    };
  }

  return {
    ...state,
    version: event.version,
    cards: updatedCards,
  };
}

function knownByFromVisibility(viewers: ViewerSet, players: Record<PlayerId, PlayerState>): PlayerId[] {
  if (viewers === "everyone") return Object.keys(players);
  return [...viewers];
}

function applyProjectedZoneShuffled(
  state: ProjectedRoomState,
  event: ZoneShuffledEvent,
  viewerId: PlayerId,
): ProjectedRoomState {
  const zone = state.zones[event.zoneId];
  if (!zone) throw new Error(`zone ${event.zoneId} missing while replaying ZoneShuffled (projected)`);

  const updatedCards: Record<string, ProjectedCardState> = { ...state.cards };
  for (const cardId of event.resultingCardIds) {
    const card = state.cards[cardId];
    if (!card) continue;
    const newViewers = resetViewers({
      zoneType: zone.type,
      face: card.face,
      ownerPlayerId: zone.ownerPlayerId,
    });
    const viewerKnows = hasViewer(newViewers, viewerId);
    updatedCards[cardId] = {
      ...card,
      knownBy: knownByFromVisibility(newViewers, state.players),
      value: viewerKnows ? card.value : null,
    };
  }

  return {
    ...state,
    version: event.version,
    zones: {
      ...state.zones,
      [zone.id]: { ...zone, cardIds: [...event.resultingCardIds] },
    },
    cards: updatedCards,
  };
}

function applyProjectedZoneReordered(
  state: ProjectedRoomState,
  event: ZoneReorderedEvent,
): ProjectedRoomState {
  const zone = state.zones[event.zoneId];
  if (!zone) throw new Error(`zone ${event.zoneId} missing while replaying ZoneReordered (projected)`);

  return {
    ...state,
    version: event.version,
    zones: {
      ...state.zones,
      [zone.id]: { ...zone, cardIds: [...event.resultingCardIds] },
    },
  };
}

function applyCardsMovedLike(state: RoomState, event: CardsDealtEvent | CardsMovedEvent): RoomState {
  const fromZone = state.zones[event.fromZoneId];
  const toZone = state.zones[event.toZoneId];
  if (!fromZone || !toZone) {
    throw new Error(`zone missing while replaying ${event.type}`);
  }

  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const id of event.movedCardIds) {
    const card = state.cards[id];
    if (!card) continue;
    updatedCards[id] = {
      ...card,
      zoneId: event.toZoneId,
      face: event.toFace,
      visibleTo: resetViewers({
        zoneType: toZone.type,
        face: event.toFace,
        ownerPlayerId: toZone.ownerPlayerId,
      }),
    };
  }

  return {
    ...state,
    version: event.version,
    zones: {
      ...state.zones,
      [event.fromZoneId]: { ...fromZone, cardIds: [...event.fromResultingCardIds] },
      [event.toZoneId]: { ...toZone, cardIds: [...event.toResultingCardIds] },
    },
    cards: updatedCards,
  };
}

function applyProjectedCardsMovedLike(
  state: ProjectedRoomState,
  event: CardsDealtEvent | CardsMovedEvent,
  viewerId: PlayerId,
): ProjectedRoomState {
  const fromZone = state.zones[event.fromZoneId];
  const toZone = state.zones[event.toZoneId];
  if (!fromZone || !toZone) {
    throw new Error(`zone missing while replaying ${event.type} (projected)`);
  }

  const updatedCards: Record<string, ProjectedCardState> = { ...state.cards };
  for (const id of event.movedCardIds) {
    const card = state.cards[id];
    if (!card) continue;
    const newViewers = resetViewers({
      zoneType: toZone.type,
      face: event.toFace,
      ownerPlayerId: toZone.ownerPlayerId,
    });
    const viewerKnows = hasViewer(newViewers, viewerId);
    updatedCards[id] = {
      ...card,
      zoneId: event.toZoneId,
      face: event.toFace,
      knownBy: knownByFromVisibility(newViewers, state.players),
      value: viewerKnows ? card.value : null,
    };
  }

  return {
    ...state,
    version: event.version,
    zones: {
      ...state.zones,
      [event.fromZoneId]: { ...fromZone, cardIds: [...event.fromResultingCardIds] },
      [event.toZoneId]: { ...toZone, cardIds: [...event.toResultingCardIds] },
    },
    cards: updatedCards,
  };
}

function applyProjectedCardsFlipped(
  state: ProjectedRoomState,
  event: CardsFlippedEvent,
  viewerId: PlayerId,
): ProjectedRoomState {
  const updatedCards: Record<string, ProjectedCardState> = { ...state.cards };
  for (const cardId of event.cardIds) {
    const card = state.cards[cardId];
    if (!card) continue;
    const zone = state.zones[card.zoneId];
    const newViewers = resetViewers({
      zoneType: zone?.type ?? "table",
      face: event.face,
      ownerPlayerId: zone?.ownerPlayerId,
    });
    const viewerKnows = hasViewer(newViewers, viewerId);
    updatedCards[cardId] = {
      ...card,
      face: event.face,
      knownBy: knownByFromVisibility(newViewers, state.players),
      value: viewerKnows ? card.value : null,
    };
  }

  return {
    ...state,
    version: event.version,
    cards: updatedCards,
  };
}
