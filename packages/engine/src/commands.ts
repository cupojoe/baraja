import type { CardId, CardFace, PlayerId, RoomId, ZoneId } from "./types.js";

type BaseGameCommand = {
  roomId: RoomId;
  actorId: PlayerId;
  expectedVersion: number;
};

export type DealCommand = BaseGameCommand & {
  type: "Deal";
  sourceZoneId: ZoneId;
  destinationZoneId: ZoneId;
  cardIds: CardId[];
  face: CardFace;
};

export type ShuffleCommand = BaseGameCommand & {
  type: "Shuffle";
  zoneId: ZoneId;
};

export type GiveCommand = BaseGameCommand & {
  type: "Give";
  cardIds: CardId[];
  toZoneId: ZoneId;
};

export type TakeCommand = BaseGameCommand & {
  type: "Take";
  cardIds: CardId[];
  fromZoneId: ZoneId;
};

export type PeekCommand = BaseGameCommand & {
  type: "Peek";
  cardIds: CardId[];
};

export type ShowCommand = BaseGameCommand & {
  type: "Show";
  cardIds: CardId[];
  audience: PlayerId[] | "everyone";
};

export type FlipCommand = BaseGameCommand & {
  type: "Flip";
  cardIds: CardId[];
  face: CardFace;
};

export type CutCommand = BaseGameCommand & {
  type: "Cut";
  zoneId: ZoneId;
  atIndex?: number;
};

export type GameCommand =
  | DealCommand
  | ShuffleCommand
  | GiveCommand
  | TakeCommand
  | PeekCommand
  | ShowCommand
  | FlipCommand
  | CutCommand;

export type JoinPlayerCommand = {
  type: "JoinPlayer";
  roomId: RoomId;
  playerId: PlayerId;
  displayName: string;
};

export type InternalCommand = JoinPlayerCommand;

export type AuthorityCommand = GameCommand | InternalCommand;
