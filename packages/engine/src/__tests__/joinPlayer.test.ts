import { describe, expect, it } from "vitest";

import type { Authority, GameCommand, InternalCommand, RoomState } from "../index.js";
import { joinPlayer } from "../reducers/joinPlayer.js";

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

describe("joinPlayer", () => {
  it("creates a new player, hand zone, and PlayerJoined event", () => {
    const room = createEmptyRoom();
    const result = joinPlayer(
      room,
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

    expect(result.version).toBe(1);
    expect(result.event).toEqual({
      type: "PlayerJoined",
      roomId: "room-1",
      version: 1,
      timestamp: 123,
      playerId: "alice",
      displayName: "Alice",
      handZoneId: "hand-alice",
    });
    expect(result.state.players.alice).toEqual({
      id: "alice",
      displayName: "Alice",
      connected: true,
    });
    expect(result.state.zones["hand-alice"]).toEqual({
      id: "hand-alice",
      type: "hand",
      ownerPlayerId: "alice",
      cardIds: [],
      metadata: {},
    });
    expect(result.state.version).toBe(1);
  });

  it("treats an existing player join as a reconnect-only noop", () => {
    const room: RoomState = {
      ...createEmptyRoom(),
      version: 7,
      players: {
        alice: {
          id: "alice",
          displayName: "Alice",
          connected: false,
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
    };

    const result = joinPlayer(
      room,
      {
        type: "JoinPlayer",
        roomId: "room-1",
        playerId: "alice",
        displayName: "Alice Updated",
      },
      456,
    );

    expect(result.kind).toBe("noop");
    expect(result.state.version).toBe(7);
    expect(result.state.players.alice).toEqual({
      id: "alice",
      displayName: "Alice",
      connected: true,
    });
    expect(result.state.zones).toEqual(room.zones);
  });

  it("keeps JoinPlayer in the internal command union", () => {
    const command = {
      type: "JoinPlayer",
      roomId: "room-1",
      playerId: "alice",
      displayName: "Alice",
    } satisfies InternalCommand;

    expect("expectedVersion" in command).toBe(false);
  });

  it("allows Authority implementations to reject public commands by expected version", () => {
    const authority: Authority = {
      apply: (state, command, now) => {
        if (command.type === "JoinPlayer") {
          return joinPlayer(state, command, now);
        }

        return {
          kind: "rejected",
          reason: "stale_version",
          expectedVersion: command.expectedVersion,
        };
      },
    };
    const publicCommand: GameCommand = {
      type: "Shuffle",
      roomId: "room-1",
      actorId: "alice",
      expectedVersion: 3,
      zoneId: "deck",
    };

    expect(authority.apply(createEmptyRoom(), publicCommand, 789)).toEqual({
      kind: "rejected",
      reason: "stale_version",
      expectedVersion: 3,
    });
  });
});
