import { describe, expect, it } from "vitest";

import { addViewer, hasViewer, removeViewer, resetViewers } from "../viewers.js";
import type { CardFace, ViewerSet, ZoneType } from "../types.js";

describe("viewer helpers", () => {
  it("checks viewer membership", () => {
    expect(hasViewer("everyone", "alice")).toBe(true);
    expect(hasViewer(["alice"], "alice")).toBe(true);
    expect(hasViewer(["alice"], "bob")).toBe(false);
  });

  it("adds viewers idempotently", () => {
    expect(addViewer([], "alice")).toEqual(["alice"]);
    expect(addViewer(["alice"], "alice")).toEqual(["alice"]);
    expect(addViewer(["alice", "alice"], "alice")).toEqual(["alice"]);
    expect(addViewer(["alice"], "bob")).toEqual(["alice", "bob"]);
    expect(addViewer("everyone", "alice")).toBe("everyone");
  });

  it("removes viewers without mutating everyone", () => {
    expect(removeViewer(["alice", "bob"], "alice")).toEqual(["bob"]);
    expect(removeViewer(["alice"], "bob")).toEqual(["alice"]);
    expect(removeViewer("everyone", "alice")).toBe("everyone");
  });

  it("resets viewers for all zone and face defaults", () => {
    const cases: Array<{
      zoneType: ZoneType;
      face: CardFace;
      ownerPlayerId?: string;
      expected: ViewerSet;
    }> = [
      { zoneType: "deck", face: "up", expected: "everyone" },
      { zoneType: "deck", face: "down", expected: [] },
      { zoneType: "hand", face: "up", ownerPlayerId: "alice", expected: "everyone" },
      { zoneType: "hand", face: "down", ownerPlayerId: "alice", expected: ["alice"] },
      { zoneType: "table", face: "up", expected: "everyone" },
      { zoneType: "table", face: "down", expected: [] },
      { zoneType: "pile", face: "up", expected: "everyone" },
      { zoneType: "pile", face: "down", expected: [] },
    ];

    for (const input of cases) {
      expect(resetViewers(input)).toEqual(input.expected);
    }
  });
});
