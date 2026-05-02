import { describe, expect, it } from "vitest";

import { applyEvent, applyProjectedEvent } from "../applyEvent.js";
import { joinPlayer } from "../reducers/joinPlayer.js";
import type { GameEvent, ProjectedRoomState, RoomState } from "../index.js";

function createEmptyRoom(): RoomState {
  return {
    id: "room-1",
    dealerPlayerId: "dealer",
    version: 0,
    players: {},
    zones: {},
    cards: {},
  };
}

function createProjectedRoom(): ProjectedRoomState {
  return {
    id: "room-1",
    dealerPlayerId: "dealer",
    version: 0,
    players: {},
    zones: {},
    cards: {
      "c-A-S": {
        id: "c-A-S",
        value: null,
        zoneId: "deck",
        face: "down",
        knownBy: [],
        metadata: {},
      },
    },
  };
}

describe("applyEvent", () => {
  it("replays PlayerJoined to the same state produced by the reducer", () => {
    const previous = createEmptyRoom();
    const result = joinPlayer(
      previous,
      {
        type: "JoinPlayer",
        roomId: "room-1",
        playerId: "alice",
        displayName: "Alice",
      },
      123,
    );

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;

    expect(applyEvent(previous, result.event)).toEqual(result.state);
  });

  it("adds PlayerJoined to projected state without inventing card values", () => {
    const state = createProjectedRoom();
    const event: GameEvent = {
      type: "PlayerJoined",
      roomId: "room-1",
      version: 1,
      timestamp: 123,
      playerId: "alice",
      displayName: "Alice",
      handZoneId: "hand-alice",
    };

    expect(applyProjectedEvent(state, event, "bob")).toEqual({
      ...state,
      version: 1,
      players: {
        alice: {
          id: "alice",
          displayName: "Alice",
          connected: true,
        },
      },
      zones: {
        "hand-alice": {
          id: "hand-alice",
          type: "hand",
          ownerPlayerId: "alice",
          cardIds: [],
          metadata: {},
        },
      },
    });
  });

  it("keeps non-PlayerJoined event branches explicit until their reducer PRs land", () => {
    const event: GameEvent = {
      type: "PlayerLeft",
      roomId: "room-1",
      version: 1,
      timestamp: 123,
      playerId: "alice",
    };

    expect(() => applyEvent(createEmptyRoom(), event)).toThrow("not implemented");
    expect(() => applyProjectedEvent(createProjectedRoom(), event, "alice")).toThrow("not implemented");
  });
});
