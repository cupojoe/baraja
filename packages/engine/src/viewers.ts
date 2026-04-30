import type { CardFace, PlayerId, ViewerSet, ZoneType } from "./types.js";

type ResetViewersInput = {
  zoneType: ZoneType;
  face: CardFace;
  ownerPlayerId?: PlayerId;
};

export function hasViewer(viewers: ViewerSet, playerId: PlayerId): boolean {
  return viewers === "everyone" || viewers.includes(playerId);
}

export function addViewer(viewers: ViewerSet, playerId: PlayerId): ViewerSet {
  if (viewers === "everyone") {
    return "everyone";
  }

  return [...new Set([...viewers, playerId])];
}

export function removeViewer(viewers: ViewerSet, playerId: PlayerId): ViewerSet {
  if (viewers === "everyone") {
    return "everyone";
  }

  return viewers.filter((viewerId) => viewerId !== playerId);
}

export function resetViewers({ zoneType, face, ownerPlayerId }: ResetViewersInput): ViewerSet {
  if (face === "up") {
    return "everyone";
  }

  if (zoneType === "hand" && ownerPlayerId) {
    return [ownerPlayerId];
  }

  return [];
}
