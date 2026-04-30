import type { CardId, CardFace, PlayerId, RoomId, ZoneId } from "./types.js";

type BaseEvent = {
  roomId: RoomId;
  version: number;
  timestamp: number;
};

export type CardsDealtEvent = BaseEvent & {
  type: "CardsDealt";
  actorId: PlayerId;
  movedCardIds: CardId[];
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
  toFace: CardFace;
  fromResultingCardIds: CardId[];
  toResultingCardIds: CardId[];
};

export type ZoneShuffledEvent = BaseEvent & {
  type: "ZoneShuffled";
  actorId: PlayerId;
  zoneId: ZoneId;
  resultingCardIds: CardId[];
};

export type ZoneReorderedEvent = BaseEvent & {
  type: "ZoneReordered";
  actorId: PlayerId;
  zoneId: ZoneId;
  resultingCardIds: CardId[];
};

export type CardsMovedEvent = BaseEvent & {
  type: "CardsMoved";
  actorId: PlayerId;
  movedCardIds: CardId[];
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
  toFace: CardFace;
  fromResultingCardIds: CardId[];
  toResultingCardIds: CardId[];
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
  | ZoneReorderedEvent
  | CardsMovedEvent
  | CardsFlippedEvent
  | CardPeekedEvent
  | CardsShownEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | CommandRejectedEvent;
