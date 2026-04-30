export type PlayerId = string;
export type CardId = string;
export type ZoneId = string;
export type RoomId = string;

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type CardValue = { rank: Rank; suit: Suit };

export type ViewerSet = "everyone" | PlayerId[];

export type CardFace = "up" | "down";

export type CardState = {
  id: CardId;
  value: CardValue;
  zoneId: ZoneId;
  face: CardFace;
  visibleTo: ViewerSet;
  metadata: Record<string, unknown>;
};

export type ZoneType = "deck" | "hand" | "table" | "pile";

export type ZoneState = {
  id: ZoneId;
  type: ZoneType;
  ownerPlayerId?: PlayerId;
  cardIds: CardId[];
  metadata: Record<string, unknown>;
};

export type PlayerState = {
  id: PlayerId;
  displayName: string;
  connected: boolean;
};

export type RoomState = {
  id: RoomId;
  dealerPlayerId: PlayerId;
  version: number;
  players: Record<PlayerId, PlayerState>;
  zones: Record<ZoneId, ZoneState>;
  cards: Record<CardId, CardState>;
};

export type ProjectedCardState = Omit<CardState, "value" | "visibleTo"> & {
  value: CardValue | null;
  knownBy: PlayerId[];
};

export type ProjectedRoomState = Omit<RoomState, "cards"> & {
  cards: Record<CardId, ProjectedCardState>;
};
