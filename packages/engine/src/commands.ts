import type { CardId, CardFace, PlayerId, RoomId, ZoneId } from "./types.js";

type BaseCommand = {
  roomId: RoomId;
  actorId: PlayerId;
  expectedVersion: number;
};

export type DealCommand = BaseCommand & {
  type: "Deal";
  sourceZoneId: ZoneId;
  destinationZoneId: ZoneId;
  cardIds: CardId[];
  face: CardFace;
};

export type ShuffleCommand = BaseCommand & {
  type: "Shuffle";
  zoneId: ZoneId;
};

export type GiveCommand = BaseCommand & {
  type: "Give";
  cardIds: CardId[];
  toZoneId: ZoneId;
};

export type TakeCommand = BaseCommand & {
  type: "Take";
  cardIds: CardId[];
  fromZoneId: ZoneId;
};

export type PeekCommand = BaseCommand & {
  type: "Peek";
  cardIds: CardId[];
};

export type ShowCommand = BaseCommand & {
  type: "Show";
  cardIds: CardId[];
  audience: PlayerId[] | "everyone";
};

export type FlipCommand = BaseCommand & {
  type: "Flip";
  cardIds: CardId[];
  face: CardFace;
};

export type CutCommand = BaseCommand & {
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
