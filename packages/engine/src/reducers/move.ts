import type { AuthorityRejectedResult } from "../authority.js";
import type { CardFace, CardId, CardState, RoomState, ZoneId, ZoneType } from "../types.js";
import { resetViewers } from "../viewers.js";

export type MoveAppliedResult = {
  kind: "applied";
  state: RoomState;
  version: number;
  movedCardIds: CardId[];
  fromResultingCardIds: CardId[];
  toResultingCardIds: CardId[];
  toFace: CardFace;
};

export type MoveResult = MoveAppliedResult | AuthorityRejectedResult;

export function naturalFaceForZone(zoneType: ZoneType): CardFace {
  return zoneType === "table" ? "up" : "down";
}

export function moveCards(
  state: RoomState,
  movedCardIds: CardId[],
  fromZoneId: ZoneId,
  toZoneId: ZoneId,
  toFace: CardFace,
): MoveResult {
  const fromZone = state.zones[fromZoneId];
  const toZone = state.zones[toZoneId];

  if (!fromZone || !toZone || fromZoneId === toZoneId || movedCardIds.length === 0) {
    return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
  }

  const fromSet = new Set(fromZone.cardIds);
  const movedSet = new Set<CardId>();
  for (const id of movedCardIds) {
    if (!fromSet.has(id) || movedSet.has(id) || !state.cards[id]) {
      return { kind: "rejected", reason: "invalid_card", expectedVersion: state.version };
    }
    movedSet.add(id);
  }

  const fromResultingCardIds = fromZone.cardIds.filter((id) => !movedSet.has(id));
  const toResultingCardIds = [...toZone.cardIds, ...movedCardIds];

  const updatedCards: Record<string, CardState> = { ...state.cards };
  for (const id of movedCardIds) {
    const card = state.cards[id];
    updatedCards[id] = {
      ...card,
      zoneId: toZoneId,
      face: toFace,
      visibleTo: resetViewers({
        zoneType: toZone.type,
        face: toFace,
        ownerPlayerId: toZone.ownerPlayerId,
      }),
    };
  }

  const version = state.version + 1;
  const nextState: RoomState = {
    ...state,
    version,
    zones: {
      ...state.zones,
      [fromZoneId]: { ...fromZone, cardIds: fromResultingCardIds },
      [toZoneId]: { ...toZone, cardIds: toResultingCardIds },
    },
    cards: updatedCards,
  };

  return {
    kind: "applied",
    state: nextState,
    version,
    movedCardIds: [...movedCardIds],
    fromResultingCardIds,
    toResultingCardIds,
    toFace,
  };
}
