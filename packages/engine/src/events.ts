import type { CardId, CardFace, PlayerId, RoomId, ZoneId } from "./types.js";

type BaseEvent = {
  roomId: RoomId;
  version: number;
  timestamp: number;
};

export type CardsDealtEvent = BaseEvent & {
  type: "CardsDealt";
  actorId: PlayerId;
  cardIds: CardId[];
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
  face: CardFace;
};

export type ZoneShuffledEvent = BaseEvent & {
  type: "ZoneShuffled";
  actorId: PlayerId;
  zoneId: ZoneId;
};

export type CardsMovedEvent = BaseEvent & {
  type: "CardsMoved";
  actorId: PlayerId;
  cardIds: CardId[];
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
};

export type CardsFlippedEvent = BaseEvent & {
  type: "CardsFlipped";
  actorId: PlayerId;
  cardIds: CardId[];
  face: CardFace;
};

export type CardPeekedEvent = BaseEvent & {
  type: "CardPeeked";
  peekerId: PlayerId;
  cardIds: CardId[];
  zoneId: ZoneId;
};

export type CardsShownEvent = BaseEvent & {
  type: "CardsShown";
  actorId: PlayerId;
  cardIds: CardId[];
  audience: PlayerId[] | "everyone";
};

export type PlayerJoinedEvent = BaseEvent & {
  type: "PlayerJoined";
  playerId: PlayerId;
  displayName: string;
  handZoneId: ZoneId;
};

export type PlayerLeftEvent = BaseEvent & {
  type: "PlayerLeft";
  playerId: PlayerId;
};

export type CommandRejectionReason = "stale_version" | "invalid_card" | "unauthorized";

export type CommandRejectedEvent = BaseEvent & {
  type: "CommandRejected";
  reason: CommandRejectionReason;
  actorId: PlayerId;
};

export type GameEvent =
  | CardsDealtEvent
  | ZoneShuffledEvent
  | CardsMovedEvent
  | CardsFlippedEvent
  | CardPeekedEvent
  | CardsShownEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | CommandRejectedEvent;
