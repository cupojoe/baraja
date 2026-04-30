# Baraja Execution Plan

A phased, PR-sized breakdown for taking the existing skeleton to a working v1. Tasks are sized for ~200–600 lines of diff each. Prefer landing them in the order below; explicit parallel tracks are called out per phase.

---

## Architectural decisions to lock down before coding

Resolve these **in PR-1 or PR-2**, because everything downstream depends on them:

1. **Card identity strategy.** `CardId` is opaque (good). But: are card ids stable for the life of a deck (52 fixed ids per fresh deck), or per-room random? Locking value-knowledge to a stable id is cleaner for reconnect. Recommendation: stable `c-{rank}-{suit}` per deck instance, generated at `RoomCreated`.
2. **Visibility on the wire AND in `RoomState`.** `ViewerSet = "everyone" | Set<PlayerId>` does not JSON-serialize, which breaks both event payloads *and* snapshot persistence (snapshots store raw `RoomState` JSON in `apps/server/src/db/schema.ts`). **Decision: change `ViewerSet` to `"everyone" | PlayerId[]` everywhere — events, `RoomState`, and snapshots.** Add a small helper module (`hasViewer`, `addViewer`, `removeViewer`) that hides the difference and avoids duplicate-entry bugs. This must land in PR-1 before any reducer or persistence work.
3. **Authority interface.** Both cloud authority and dealer-hosted authority implement the same `Authority` shape: `apply(state, command, now)` returns a discriminated union — `{ kind: "applied", state, event, version }` (real game event, must be persisted), `{ kind: "noop", state }` (state-only mutation, no log entry — e.g. reconnect flipping `connected`), or `{ kind: "rejected", reason, expectedVersion }`. Successful results (`applied` and `noop`) include the post-state so the manager can compute deltas; `rejected` does not. Lock the interface in PR-2 so the dealer-host work later is a transport swap.
4. **Snapshot cadence.** Decide a simple rule (e.g. snapshot every 50 events or on `room:close`) up front so PR-7 doesn't need to rewrite the event-loading path.
5. **Player identity.** Socket id is not stable across reconnect. We need a `playerId` chosen client-side and persisted in device storage, sent on `room:join`. Lock the join contract in PR-9.
6. **Privacy boundary on event broadcast.** Semantic events (`CardsDealt`, `CardsMoved`, `CardPeeked`, etc.) carry only `cardId`s and metadata — **never** card values. Newly visible card values reach a viewer through one of two channels: (a) the projected snapshot returned on `room:join` / `room:resync` / `room:rejoin`, or (b) a per-socket `game:delta` emission that projects the post-event state for that viewer. PR-9 chooses (b) as the default: after applying a command, the server emits `game:event` (value-free) to the room **and** sends each connected socket a `game:delta` containing only the projected card values that changed for that viewer. This keeps the broadcast cheap and the privacy boundary explicit. Clients reconcile by applying the structural event to local state, then merging the delta's value reveals.
7. **Room creation is exactly one path.** `POST /rooms` is the *only* way to create a room and the moment `dealerPlayerId` is recorded. The server-side handler ships in **PR-9** (alongside Socket.IO wiring, to break a circular dep); **PR-12** is the mobile lobby UI that consumes it. `room:join` (PR-9) **never** creates rooms — an unknown roomId returns `{ ok: false, reason: "unknown_room" }`. This avoids typo-induced ghost rooms and ambiguous dealership.

8a. **Event versioning: single source of truth.** `version` lives **on the event itself** (matches the existing `BaseEvent` in `packages/engine/src/events.ts`). The Socket.IO wire envelope is just `{ event }`, not `{ event, version }`. PR-9's "version" pairing for `game:delta` reads `event.version` — no duplicate field. Reject any plan or code that adds an outer `version` next to an event's own.

8. **Events are replay-complete, with paired full and projected reducers.** Every event payload must carry enough information for a pure reducer to reconstruct the post-event *structure* (zone membership, face, version, players) without consulting the command, RNG, or external context. The engine ships **two** reducers sharing the same event type:
   - `applyEvent(state: RoomState, event): RoomState` — full-state replay. Used by server hydration. Carries `value` and `visibleTo: ViewerSet`.
   - `applyProjectedEvent(state: ProjectedRoomState, event, viewerId: PlayerId): ProjectedRoomState` — projected replay. Used by mobile clients. Updates structural fields only; preserves any existing `value` it already knows about and resets unknown card `value` to `null` when a card moves into a zone whose visibility excludes the viewer. Reveals (e.g. peek-by-self, show-to-everyone) arrive via `game:delta`, not via this reducer.
   Both reducers consume the **same** event payload, which is structural-only. Specific payload requirements:
   - `ZoneShuffled` carries the resulting `cardIds` order (not just `zoneId`).
   - `CardsFlipped` carries `cardIds` and the new `face` (visibility consequences are computed by each reducer locally — `applyEvent` from zone defaults, `applyProjectedEvent` by clearing/keeping local `value` based on whether the card is now self-visible).
   - `CardsDealt` / `CardsMoved` carry `movedCardIds`, `fromZoneId`, `toZoneId`, `toFace`, `fromResultingCardIds`, `toResultingCardIds`. No `resultingVisibleTo` per card on the wire (it's value-derived and would require an "everyone" leak in the projected reducer); both reducers recompute visibility from zone defaults + face. `Cut` is its own event type `ZoneReordered { zoneId, resultingCardIds }` — no overloading of `CardsMoved`.
   - `CardPeeked { cardId, peekerId }` and `CardsShown { cardIds, audience }` are structural for accountability, but value reveals always come through the delta channel.
   Lock this contract in PR-2; each reducer PR adds matching branches in **both** `applyEvent` and `applyProjectedEvent`, with apply/replay equivalence tests for each. Server hydration uses `applyEvent`; PR-13 mobile uses `applyProjectedEvent`.

Risks to defer (acknowledged, but NOT blocking v1): cryptographic privacy, mDNS discovery for dealer mode (use manual IP / QR with embedded URL), Postgres swap (schema is *not* portable as-is — see PR-25 for the schema-builder split required, but the work is small and isolated).

---

## Phase 1 — Engine core (pure TypeScript, no I/O)

This phase produces a fully tested deterministic engine. Server/mobile work in Phases 2–3 can start as soon as PR-2 lands.

### PR-1: Add engine test harness, change `ViewerSet` to array, deck factory, viewer helpers
- **Scope (in):**
  - Add Vitest to `packages/engine`.
  - **Change `ViewerSet` in `types.ts` from `"everyone" | Set<PlayerId>` to `"everyone" | PlayerId[]`.** This is a breaking change to existing types but unblocks JSON serialization for events *and* snapshots.
  - Add `src/deck.ts` exporting `createStandardDeck()` returning 52 `CardState` with stable ids (e.g. `c-{rank}-{suit}`), in canonical sorted order (no shuffle yet — that lands in PR-3 with the seedable RNG).
  - Add `src/viewers.ts` with `hasViewer(set, playerId)`, `addViewer(set, playerId)` (idempotent — no duplicate entries), `removeViewer(set, playerId)`, and `resetViewers({ zoneType, face, ownerPlayerId }): ViewerSet`. The visibility table is a function of zone type *and* face (face-up hand/table cards are visible to everyone; face-down deck/pile/own-hand differ). Encode the full table from `docs/index.html` here.
- **Out:** Reducers, commands, projection, RNG.
- **Files:** `packages/engine/src/types.ts` (modify ViewerSet), `packages/engine/src/deck.ts`, `packages/engine/src/viewers.ts`, `packages/engine/src/index.ts`, `packages/engine/vitest.config.ts`, `packages/engine/package.json` (add `vitest`, `test` script), `packages/engine/src/__tests__/deck.test.ts`, `packages/engine/src/__tests__/viewers.test.ts`.
- **Deps:** none.
- **Acceptance:** `npm test -w packages/engine` passes; deck contains 52 unique ids in sorted order; `resetViewers` returns correct sets for all 8 (zoneType × face) combinations; `JSON.stringify(roomState)` round-trips losslessly.

### PR-2: Define Authority interface + RoomState constructor + Player join reducer
- **Scope (in):**
  - `src/state.ts` with `createRoom({ roomId, dealerPlayerId, dealerDisplayName })` building initial `RoomState`. Implementation: start from a truly empty `RoomState` (just `id`, `dealerPlayerId`, `version: 0`, empty `players` / `zones` / `cards`), then **apply the `JoinPlayer` reducer for the dealer** so the dealer's `PlayerState` and hand zone are created via the same code path as any other join. Then add the deck zone with the sorted deck from PR-1 (shuffle is a separate command in PR-3). Result: dealer always has a hand zone, no special-case path. Bumping version to 0 (or 1, post-join) is a small detail — keep `version: 0` post-construction since `JoinPlayer` here is internal bootstrapping, not a logged event.
  - Define `Authority` interface in `src/authority.ts`. Result is a discriminated union: `{ kind: "applied", state, event, version }` (a real game event was produced, must be persisted), `{ kind: "noop", state }` (state-only update — e.g. flipping `connected: true` on reconnect — no event log entry), or `{ kind: "rejected", reason, expectedVersion }`. Reducer-specific implementations land in PR-3+.
  - Define **two** pure replay reducers in `src/applyEvent.ts`:
    - `applyEvent(state: RoomState, event): RoomState` — full-state path, used by server hydration. **Invariant tested as branches land:** for every command that returns `{ kind: "applied", state: next, event }`, `applyEvent(prev, event)` deep-equals `next`.
    - `applyProjectedEvent(state: ProjectedRoomState, event, viewerId: PlayerId): ProjectedRoomState` — projected-state path, used by mobile clients in PR-13. Updates structure (zone memberships, face, version, players) and adjusts `value`/`knownBy` per card based on the post-event zone defaults *and* this viewer's identity. Never invents a `value` it didn't already have; values arrive separately via `game:delta`.
   Both reducers start as skeletons that `throw new Error("not implemented")` per case; each subsequent reducer PR fills both branches.
  - Add `applyEvent` and `applyProjectedEvent` branches for `PlayerJoined` in this PR (creates the player and their hand zone, mirroring the reducer; in projected form, `players[id]` is added with `connected: true` and the hand zone with empty `cardIds`).
  - Implement the **PlayerJoin reducer** in this PR. `JoinPlayer` is an **internal authority command** — it lives in a separate `InternalCommand` union, *not* in `GameCommand` (the public, client-issuable union). The Socket.IO `game:command` handler in PR-9 only accepts `GameCommand`, so `JoinPlayer` is unreachable from the wire. **Version contract:** `GameCommand` carries `expectedVersion` (clients send it; authority validates). `InternalCommand` omits `expectedVersion` entirely — RoomManager synthesizes the version under its per-room lock by reading `currentState.version` at apply-time. This avoids stale `expectedVersion` rejections on reconnect (where the client cannot know the current version) and keeps internal commands a separate concern from optimistic concurrency. First join for a `playerId`: creates a hand zone owned by the new player, adds the `PlayerState` with `connected: true`, returns `{ kind: "applied", event: PlayerJoined }`. The `PlayerJoined` event payload **does not carry `connected`** — both reducers add the player with `connected: true` only at apply-time; replay/hydration overrides this (see PR-8 hydration normalization). Subsequent join for an existing `playerId` (reconnect): flips `connected: true`, returns `{ kind: "noop" }` — the manager skips event-log persistence for this case, since connection state is *ephemeral* and not part of the durable event history. (Disconnect is handled symmetrically as a server-only state mutation; it never writes to the event log.)
  - Lock all command/event wire shapes. **`CardsShown.audience` is `PlayerId[] | "everyone"`.** Engine helpers normalize: an audience including every connected player at the time of the event is *not* auto-collapsed to `"everyone"`. Both forms remain distinct on the wire.
- **Out:** Movement, peek, show, shuffle, projection.
- **Files:** `packages/engine/src/state.ts`, `packages/engine/src/authority.ts`, `packages/engine/src/applyEvent.ts`, `packages/engine/src/reducers/joinPlayer.ts`, `packages/engine/src/commands.ts` (add `JoinPlayer`), `packages/engine/src/events.ts` (confirm `CardsShown.audience: PlayerId[] | "everyone"` — current shape is correct, no change needed), `packages/engine/src/__tests__/state.test.ts`, `packages/engine/src/__tests__/joinPlayer.test.ts`, `packages/engine/src/__tests__/applyEvent.test.ts` (apply/replay equivalence for PlayerJoined).
- **Deps:** PR-1.
- **Acceptance:** `createRoom` returns a deterministic, JSON-serializable RoomState in which the dealer has a hand zone; joining a *new* player creates their hand zone and emits `PlayerJoined` (`{ kind: "applied" }`); rejoining the same `playerId` returns `{ kind: "noop" }` with `connected: true` flipped; `Authority` interface compiles and is re-exported.

### PR-3: Implement Shuffle, Cut, Flip reducers (zone-local commands)
- **Scope (in):** Implement these three because they touch only one zone and are easy to reason about. Use a seedable RNG (`src/rng.ts`) so reducer tests are deterministic. **Event payloads are structural-only and replay-complete:**
  - `ZoneShuffled { zoneId, resultingCardIds: CardId[] }` — carries the post-shuffle order so clients and replay never re-roll the RNG. **Both reducers explicitly reset `visibleTo` (full) / `knownBy` (projected) on every card in the shuffled zone back to that zone's defaults**, dropping any peek/show knowledge that survived. This is structural-only — no `value` movement on the wire — but the projected reducer must clear `value` for cards whose new `knownBy` excludes the viewer, and the server emits a paired `game:delta` with the redactions for each viewer.
  - `CardsFlipped { cardIds, face: CardFace }` — both reducers recompute visibility locally from zone defaults + face + viewer.
  - `ZoneReordered { zoneId, resultingCardIds }` — emitted by `Cut`. **No overloading of `CardsMoved`.** Clients can animate as a reorder, not a move.
  - Fill in `applyEvent` and `applyProjectedEvent` branches for `ZoneShuffled`, `CardsFlipped`, `ZoneReordered`.
  - `expectedVersion` validation lives in a single `validate()` helper.
- **Out:** Deal, Give, Take, Peek, Show.
- **Files:** `packages/engine/src/rng.ts`, `packages/engine/src/reducers/shuffle.ts`, `reducers/cut.ts`, `reducers/flip.ts`, `authority.ts` (wire them up), `applyEvent.ts` (fill in both reducer branches), `events.ts` (add `ZoneReordered`, drop `resultingVisibleTo` from `CardsFlipped`), tests for each + apply/replay equivalence tests for both full and projected paths.
- **Deps:** PR-2.
- **Acceptance:** Stale-version commands rejected with `stale_version`; shuffle output is reproducible with a fixed seed; the emitted `ZoneShuffled.resultingCardIds` is what the post-state contains; flip face=down resets viewers per zone defaults; for both reducers, `applyEvent(prev, event)` produces a state structurally identical to `apply(prev, command).state`'s structural projection for every command in this PR.

### PR-4: Implement Deal, Give, Take reducers (cross-zone movement)
- **Scope (in):** Movement commands. All three share a `moveCards(state, movedCardIds, fromZoneId, toZoneId, toFace)` core that resets `visibleTo` from destination defaults + face. Distinguish events:
  - `CardsDealt { movedCardIds, fromZoneId, toZoneId, toFace, fromResultingCardIds, toResultingCardIds }`
  - `CardsMoved { movedCardIds, fromZoneId, toZoneId, toFace, fromResultingCardIds, toResultingCardIds }`
  Explicit fields — no overloaded `cardIds`. Animations consume `movedCardIds`; replay consumes the resulting orders. Both reducers (`applyEvent`, `applyProjectedEvent`) recompute visibility locally from `toZoneId`'s zone type + `toFace` + viewer; nothing on the wire encodes `visibleTo`. Reject `invalid_card` if any moved id is not in `fromResultingCardIds`'s pre-image. Fill in both reducer branches for `CardsDealt` and `CardsMoved`.
- **Out:** Peek, Show.
- **Files:** `packages/engine/src/reducers/move.ts`, `reducers/deal.ts`, `reducers/give.ts`, `reducers/take.ts`, `applyEvent.ts`, `events.ts` (rename payload fields), tests including apply/replay equivalence on both full and projected paths and the "Alice take vs Bob give" race from the design doc — assert losing command is rejected.
- **Deps:** PR-3.
- **Acceptance:** Race test from `index.html` risks section passes; visibility is recomputed on every move; both reducers reconstruct zone orders from `fromResultingCardIds` / `toResultingCardIds` without re-consulting the command.

### PR-5: Implement Peek, Show reducers (visibility-only commands)
- **Scope (in):** These do not move cards; they widen `visibleTo`. Peek adds the actor; Show takes either an explicit `PlayerId[]` audience (added to each card's `visibleTo` array) or `"everyone"` (replaces `visibleTo` with `"everyone"`). The two forms remain distinct in the emitted event (`CardsShown.audience: PlayerId[] | "everyone"`) — engine never normalizes one into the other. Both emit public events (`CardPeeked { cardId, peekerId }`, `CardsShown { cardIds, audience }`) — design doc is explicit that peek is not private. Both reset on any subsequent move (handled by move helper from PR-4 — verify). Event payloads remain structural; **value reveals always travel through `game:delta`, never through these events.** Fill in both reducer branches:
  - `applyEvent` (full state): widens `visibleTo` per the audience.
  - `applyProjectedEvent`: updates `knownBy` to reflect the new audience; does *not* invent `value` — the paired `game:delta` does that.
- **Out:** Projection.
- **Files:** `packages/engine/src/reducers/peek.ts`, `reducers/show.ts`, tests.
- **Deps:** PR-4.
- **Acceptance:** Peek event always emitted publicly; subsequent move clears the peeker from `visibleTo`.

### PR-6: Implement projection (per-viewer state filter)
- **Scope (in):** `src/projection.ts` exporting `project(state, viewerId): ProjectedRoomState`. Strips `value` from any card whose `visibleTo` is not `"everyone"` and does not include `viewerId`. Populates `knownBy` array from `visibleTo`. Add property-based tests: for any reachable state and any viewer, projection never leaks face-down values that viewer should not see.
- **Out:** Server integration.
- **Files:** `packages/engine/src/projection.ts`, tests including a fuzz/property test.
- **Deps:** PR-5.
- **Acceptance:** No code path leaks `value` when viewer is absent from `visibleTo`; tests cover all four visibility cells from the rule table.

**Phase 1 parallel tracks:** PR-1 → PR-2 → PR-3 → PR-4 → PR-5 → PR-6 is a single sequential chain (PR-5's visibility-reset-on-move depends on PR-4's `moveCards` helper; PR-6 projection needs the full reducer set). The only opportunities for true parallelism are within a PR (e.g. shuffle/cut/flip in PR-3 share a small infrastructure but can be authored independently).

---

## Phase 2 — Server authority & persistence

### PR-7: Wire Drizzle event log + snapshot read/write with version uniqueness
- **Scope (in):**
  - Add Vitest to `apps/server/package.json` (test script + dev dep) — first server-side tests live here.
  - Update `apps/server/src/db/schema.ts`: add a **unique index on `(room_id, version)`** for `game_events`; add `dealer_player_id` and `dealer_display_name` columns to `rooms` (so room creation is durable enough to reconstruct the initial dealer `PlayerState` even before any snapshot exists).
  - `src/db/repository.ts` with:
    - `createRoom({ roomId, dealerPlayerId, dealerDisplayName })` — inserts the row.
    - `loadRoomMetadata(roomId)` — returns `{ dealerPlayerId, dealerDisplayName } | null`, used by `RoomManager.hydrate` to call `engine.createRoom(...)` when there is no snapshot.
    - `appendEvent(roomId, event)` runs in a transaction. **The event is the single source of truth for version (decision #8a)** — there is no separate `expectedVersion` argument. The transaction reads `MAX(version)`, asserts it equals `event.version - 1`, then inserts the row using `event.version` as the row's version column (the DB row version is *derived from* the event, never independently supplied). On unique-index violation surfaces a typed `VersionConflict` error.
    - `loadEvents(roomId, sinceVersion)`, `loadLatestSnapshot(roomId)`.
    - `writeSnapshot(roomId, version, state)` — **must scrub ephemeral fields before persisting:** every `players[*].connected` is forced to `false` on the way to disk. On `loadLatestSnapshot`, the manager treats all loaded players as disconnected until a `room:join`/`room:rejoin` flips them. (Alternative not chosen: omit `connected` from `RoomState` entirely. Rejected because the engine and projection both consume it; scrubbing at the persistence boundary is less invasive.)
  - Generate initial Drizzle migration. Add `src/db/migrate.ts` running migrations on boot.
- **Out:** Hooking it into Socket.IO.
- **Files:** `apps/server/package.json` (add `vitest`, `test` script), `apps/server/vitest.config.ts`, `apps/server/src/db/schema.ts` (unique index, dealer columns), `apps/server/src/db/repository.ts`, `apps/server/src/db/migrate.ts`, `apps/server/drizzle/0000_init.sql` (generated), `apps/server/src/__tests__/repository.test.ts`.
- **Deps:** PR-2 (engine state shape).
- **Acceptance:** `npm test -w apps/server` runs; `npm run db:generate && npm run db:migrate` produces a working `baraja.db`; repository round-trips events and snapshots; `loadRoomMetadata` returns the dealer info written at creation time; a concurrent test that fires two `appendEvent` calls carrying events with the same `event.version` has exactly one success and one `VersionConflict`.

### PR-8: In-memory RoomManager with per-room serialization
- **Scope (in):** `src/roomManager.ts` keeping a `Map<RoomId, RoomState>` plus a **per-room async mutex/queue** so all `applyCommand` calls for a given room are serialized in-process (defense-in-depth alongside the DB unique index from PR-7).
  - `hydrate(roomId)`: if the room is already in-memory, return it. Otherwise: try `loadLatestSnapshot`; if a snapshot exists, replay events after it. If no snapshot exists, call `loadRoomMetadata(roomId)` and reconstruct via `engine.createRoom({ roomId, dealerPlayerId, dealerDisplayName })`, then replay all events. If neither metadata nor snapshot exists → `unknown_room`. **Final step (always, regardless of path): walk `state.players` and force every `connected` to `false`.** This catches stale `true` values that come from snapshots (already scrubbed at write-time, but defense in depth) *and* from `applyEvent(PlayerJoined)` during replay (which mirrors the live reducer and sets `connected: true`). After hydration, presence is only flipped to `true` by a real socket `room:join` / `room:rejoin`.
  - `applyCommand(roomId, command)` acquires the room's lock, calls `Authority.apply`, branches on the result variant:
    - `{ kind: "applied", state: nextState, event, version }` → persist via `appendEvent(roomId, event)` in a transaction (row version derived from `event.version`); on success, swap in `nextState` and return `{ ok: true, event, previousState, nextState, version }`.
    - `{ kind: "noop", state: nextState }` → swap in `nextState` (e.g. `connected: true`); no DB write; return `{ ok: true, event: null, previousState, nextState, version: previousState.version }`.
    - `{ kind: "rejected", reason, expectedVersion }` → return `{ ok: false, reason, currentVersion: previousState.version }`.
  - The result contract gives PR-9 both `previousState` and `nextState`, which `projectionDelta` needs to compute per-viewer reveals.
  - If `appendEvent` throws `VersionConflict` (multi-instance future), roll back in-memory state and reject with `stale_version`.
- **Out:** Socket wiring.
- **Files:** `apps/server/src/roomManager.ts`, `apps/server/src/lib/asyncMutex.ts`, `apps/server/src/__tests__/roomManager.test.ts`.
- **Deps:** PR-6, PR-7.
- **Acceptance:** Hydration from metadata-only (no snapshot, no events) reconstructs the dealer's hand zone; hydration from snapshot+tail equals the never-evicted in-memory path; a concurrency test that fires 100 commands at one room produces 100 sequential events with versions 1..100 and no gaps.

### PR-9: Wire Socket.IO to RoomManager with ack-based command flow + per-viewer deltas
- **Scope (in):** Replace stub in `apps/server/src/room.ts`.
  - `room:join { roomId, playerId, displayName }`: if room does not exist, ack `{ ok: false, reason: "unknown_room" }` (rooms are created only via `POST /rooms` in PR-12). Otherwise hydrate, issue an internal `JoinPlayer` command through RoomManager (idempotent for reconnect), track `socket → playerId` mapping, join the Socket.IO room, and ack with the projected snapshot for `playerId`.
  - `game:command`: accept `GameCommand` only (the public command union from PR-2; `JoinPlayer` and other `InternalCommand` types are *not* in `GameCommand` and are therefore unreachable from this handler). Call RoomManager, reply via ack with `{ ok: true, version }` or `{ ok: false, reason, currentVersion }`.
  - **Privacy boundary on broadcast.** RoomManager returns `{ event, previousState, nextState, version }` on success. The server emits two things:
    1. `io.to(roomId).emit("game:event", { event })` — value-free structural event (cardIds and metadata only), used by clients to update structure (zone membership, face, players) and trigger animations. The version lives on the event itself (see decision #8a) — the envelope carries no separate `version` field.
    2. For each connected socket in the room, a per-socket `game:delta` `{ version, cards: { [cardId]: { value: CardValue | null, knownBy: PlayerId[] } } }` computed by `projectionDelta(previousState, nextState, viewerId)` — emits a card entry only when that viewer's projected `value` or `knownBy` changed. The delta's `version` matches `event.version` for pairing on the client. Clients merge these into local state.
    Card values **never** appear in the room-wide broadcast.
  - **Join lifecycle.** Internal `JoinPlayer` is treated like any other command:
    - **Applied (first join):** emits `game:event(PlayerJoined)` to the room with the new `playerId`, `displayName`, and `handZoneId` (clients use this to add the player and their hand zone to local state). Per-socket `game:delta` is also sent (for the new face-down hand zone, all viewers' projection is unchanged, so deltas will typically be empty — that's fine).
    - **Noop (reconnect):** **no `game:event` and no `game:delta`.** The server emits an unpaired `game:player-presence { playerId, connected: true }` to the room. PR-13's mobile store treats presence messages as standalone (not paired with version) and just updates the connected flag.
  - **Disconnect lifecycle.** On Socket.IO `disconnect`, the server looks up the `socket → playerId` mapping, mutates the in-memory `players[playerId].connected = false` (no event log entry — purely ephemeral), and emits `game:player-presence { playerId, connected: false }` to the room. No `game:event`. Connection state is never persisted to snapshots; on hydration after a server restart, all players start `connected: false` until they `room:rejoin`.
  - Add `room:resync`: ack with the current projected snapshot for the calling player (full re-projection, used after a stale-version rejection).
- **Out:** Runtime payload validation (Zod) — deferred to PR-23.
- **Files:** `apps/server/src/room.ts` (rewrite), `apps/server/src/index.ts` (boot RoomManager), `apps/server/src/rest/rooms.ts` (`POST /rooms` REST handler — included here to break the circular dep with PR-12), `apps/server/src/projectionDelta.ts` (compute per-viewer delta given previous and next state), `apps/server/src/types/socket-events.ts` (typed event map shared with client).
- **Deps:** PR-8.
- **Acceptance:** Two `socket.io-client` test sockets join the same room (created via REST first); one issues `Deal`; the other receives a value-free `game:event` *and* a `game:delta` containing only the values it is allowed to see; a third socket joining mid-game gets the same view via `room:join` snapshot.

### PR-10: Reconnect path — snapshot + missed-social-event notifications
- **Scope (in):** On reconnect (same `playerId`), client sends `room:rejoin { roomId, playerId, knownVersion }`. Server:
  1. Fires the internal `JoinPlayer` command — RoomManager returns `{ kind: "noop" }` for an already-present player; the manager flips `connected: true` in-memory.
  2. Acks with the projected snapshot at current version (events are folded into the snapshot per design doc).
  3. Sends a separate `game:social-replay { events: SocialEvent[] }` payload listing public `CardPeeked` / `CardsShown` events with `version > knownVersion`, marked as **notification-only**. These are *not* the same channel as `game:event` — they are explicitly history, never fed through `applyProjectedEvent`. Mobile renders them in the event rail (PR-17) but does not let them mutate state, since the snapshot already reflects current visibility.
  4. Emits `game:player-presence { playerId, connected: true }` to the room.
- **Out:** Mobile-side reconnect UX.
- **Files:** `apps/server/src/room.ts` (extend), `apps/server/src/__tests__/reconnect.test.ts`.
- **Deps:** PR-9.
- **Acceptance:** Test simulates a disconnect (presence flipped to `false` and broadcast) across 5 events including a peek; rejoin flips presence to `true`, returns a snapshot at the new version, and delivers the missed peek via `game:social-replay` (not `game:event`).

**Phase 2 parallel tracks:** PR-7 and PR-8 can be developed in parallel once PR-2 lands (PR-8 stubs the repository). PR-10 depends on PR-9.

---

## Phase 3 — Mobile shell & networking

These can start in parallel with Phase 2 once PR-2 has landed.

### PR-11: Add device player identity + persisted settings
- **Scope (in):** `apps/mobile/src/identity/playerId.ts` using `expo-secure-store` to read/generate a stable UUID-based `playerId` plus display name. Add a one-time onboarding tweak to the home screen prompting for display name.
- **Out:** Lobby creation/join UI.
- **Files:** `apps/mobile/src/identity/playerId.ts`, `apps/mobile/app/index.tsx` (add name capture), `apps/mobile/package.json` (add `expo-secure-store`).
- **Deps:** none.
- **Acceptance:** App launches, captures name once, persists `playerId` across reloads.

### PR-12: Lobby screen — create/join cloud room (mobile UI)
- **Scope (in):** `apps/mobile/app/lobby.tsx` consuming the `POST /rooms` endpoint added in PR-9. Two flows: "Create room" (POST with the device's `playerId` + `displayName`, navigate to `/room/[id]` on `{ roomId }`) and "Join by code" (text input → navigate; if the code is unknown, the eventual `room:join` ack returns `unknown_room` and the room screen kicks back to the lobby with an error). Server-side creation logic is *not* in this PR — the REST handler ships in PR-9 to break the circular dep. Use a 6-char human-readable code generated server-side. **`POST /rooms` remains the only place rooms are created.**
- **Out:** QR code (Phase 4).
- **Files:** `apps/mobile/app/lobby.tsx`, `apps/mobile/src/api/rooms.ts`.
- **Deps:** PR-11, PR-9.
- **Acceptance:** From two devices/simulators, both can land on `/room/{sameId}` after creation.

### PR-13: Game state store (Zustand) + transport reconciliation (event + delta)
- **Scope (in):** Add Zustand. `apps/mobile/src/state/gameStore.ts` holds `ProjectedRoomState | null` plus pending-command queue and last-known `version`. `apps/mobile/src/transport/socket.ts` rewritten to:
  - Connect, join, await snapshot ack (initial `ProjectedRoomState`).
  - Subscribe to **both** `game:event` and `game:delta`. The two are paired by `version`: `game:event` carries the structural change (zone membership, face, version bump); `game:delta` carries this viewer's value reveals/redactions for the same version. The store applies them as a single atomic update keyed by `version` — buffer one briefly if it arrives before the other (network reordering is rare on a single Socket.IO connection but cheap to handle). Apply structural changes via the engine's `applyProjectedEvent(state, event, viewerId)` (the projected sibling of the server's `applyEvent`) so client and server share reducer semantics without sharing the privileged full-state reducer.
  - Subscribe to `game:player-presence { playerId, connected }` as an **unpaired** message — never has a `version`, never waits for a delta. Just updates the connected flag on the matching player in local state.
  - Subscribe to `game:social-replay { events }` (PR-10). These are notification-only history — push into the event rail buffer (used by PR-17), **never** feed through `applyProjectedEvent`.
  - Expose `sendCommand(command, expectedVersion)` returning a Promise resolved by the ack. On rejection, fetch a fresh snapshot via `room:resync` and replace local state.
  - Reconnect handler issues `room:rejoin` with stored `knownVersion`.
- **Out:** Rendering.
- **Files:** `apps/mobile/src/state/gameStore.ts`, `apps/mobile/src/transport/socket.ts` (rewrite), `apps/mobile/package.json` (add `zustand`).
- **Deps:** PR-10, PR-12.
- **Acceptance:** Connecting to a real server populates the store; a paired event+delta from the server atomically updates structure *and* card values; peeking a face-down card reveals its value via the delta channel only (event payload contains no value); a stale-version command triggers an automatic resync.

### PR-14: Static table layout — render zones from projected state
- **Scope (in):** `apps/mobile/app/room/[id].tsx` rewritten. Reads game store, renders deck (top-of-pile only), each player's hand (own = face-up unless face-down, others = face-down rectangles unless `value` present), table piles. Pure layout, no animation. Card component in `src/ui/Card.tsx` knows how to render face-up vs face-down vs unknown.
- **Out:** Animations, gestures.
- **Files:** `apps/mobile/app/room/[id].tsx`, `apps/mobile/src/ui/Card.tsx`, `apps/mobile/src/ui/Zone.tsx`, `apps/mobile/src/ui/Table.tsx`.
- **Deps:** PR-13.
- **Acceptance:** A 4-player room visibly shows hands, deck, and a table area; values are masked for non-viewer players.

**Phase 3 parallel tracks:** PR-11 and PR-12 can run in parallel. PR-13 needs both. PR-14 needs PR-13.

---

## Phase 4 — Game features (commands surfaced as UX)

### PR-15: Dealer controls — Shuffle, Deal, Cut
- **Scope (in):** Floating action sheet on the table screen for the dealer (the player who created the room — track `dealerPlayerId` in `RoomState`). "Shuffle deck", "Deal N cards face-down to each player", "Cut deck". Each translates to a `GameCommand` issued via the store. UI for dealing prompts for count.
- **Out:** Reanimated fly-from-zone animations (deferred to PR-19).
- **Files:** `apps/mobile/src/ui/DealerControls.tsx`, `apps/mobile/app/room/[id].tsx` (mount), engine: extend `RoomState` with `dealerPlayerId` (tiny addition).
- **Deps:** PR-14.
- **Acceptance:** Dealer can shuffle, deal 5 face-down cards to each player; non-dealers see masked cards in others' hands and face-up own cards if `face=up`.

### PR-16: Player gestures — drag a hand card to table; flip on tap
- **Scope (in):** Use `react-native-gesture-handler` + Reanimated worklets for drag. Drop on table → `Give` command targeting the table zone. Tap on own card → `Flip`. No animations of in-flight cards yet — just gesture-driven commands.
- **Out:** Take from another player.
- **Files:** `apps/mobile/src/ui/DraggableCard.tsx`, `apps/mobile/src/ui/Zone.tsx` (drop targets), `apps/mobile/package.json` (add `react-native-gesture-handler`), `apps/mobile/babel.config.js` (verify worklets plugin order).
- **Deps:** PR-15.
- **Acceptance:** Dragging a card from your hand to the table moves it for everyone; tap flips it.

### PR-17: Peek and Show UI
- **Scope (in):** Long-press on a face-down card in your own hand → Peek (issues `Peek`). Long-press on a face-down table card → Peek. Action menu offers "Show to everyone" / "Show to specific player". Add a system message rail at the bottom rendering recent `CardPeeked` and `CardsShown` events from the event stream.
- **Out:** Reconnect-time replay UI.
- **Files:** `apps/mobile/src/ui/PeekShowMenu.tsx`, `apps/mobile/src/ui/EventRail.tsx`, `apps/mobile/src/state/gameStore.ts` (add a small recent-events ring buffer).
- **Deps:** PR-16.
- **Acceptance:** Peeking a face-down card reveals its value to the peeker only; everyone else sees a public peek notification.

### PR-18: Take from another player — with notification treatment
- **Scope (in):** Long-press on a card in another player's hand → confirmation dialog (the "stronger notification treatment" called out in the design doc's Remote Take UX risk) → `Take` command. The receiving player sees a prominent banner: "Sam took a card from you".
- **Out:** Animation polish.
- **Files:** `apps/mobile/src/ui/TakeConfirm.tsx`, `apps/mobile/src/ui/TakeNotification.tsx`, `gameStore.ts` (track recent-takes-against-me).
- **Deps:** PR-17.
- **Acceptance:** Take works end-to-end; the victim gets a banner-level notification, not a toast.

### PR-19: Reanimated card-motion choreography
- **Scope (in):** Wire each event type to a layout animation (cards fly from source zone center to destination zone center, staggered, on the UI thread). Use `react-native-reanimated` shared values keyed by cardId. Skip animations for events whose source/destination are no longer relevant after a reconnect (per design doc).
- **Out:** Sound / haptics.
- **Files:** `apps/mobile/src/anim/cardMotion.ts`, `apps/mobile/src/ui/Card.tsx` (animated wrapper), `apps/mobile/src/ui/Table.tsx` (zone position registry).
- **Deps:** PR-18.
- **Acceptance:** Visible smooth flight on Deal/Give/Take/CardsMoved; concurrent events do not cause flicker; reconnect snapshot lands without playing stale animations.

**Phase 4 parallel tracks:** PR-15 → PR-16 → PR-17 are sequential. PR-18 can branch off PR-16 (parallel with PR-17). PR-19 requires PR-18.

---

## Phase 5 — Dealer-hosted (offline) mode

### PR-20: Embed authority in mobile bundle
- **Scope (in):** Move the `RoomManager`-equivalent logic out of `apps/server` into a thin engine wrapper that the mobile app can also instantiate. Add `apps/mobile/src/host/localAuthority.ts` running the same engine in-process. Persistence is in-memory only for offline mode (per design doc — peers may keep a recent tail; dealer keeps full log in memory; v1 accepts loss if dealer dies).
- **Out:** Local socket server.
- **Files:** Refactor `apps/server/src/roomManager.ts` to import a shared core from `packages/engine` (move the authority loop there as `runAuthority`), then `apps/mobile/src/host/localAuthority.ts` reuses it.
- **Deps:** PR-19, PR-8.
- **Acceptance:** Unit test in `apps/mobile` instantiates the local authority and applies commands without any network.

### PR-21: Local Socket.IO server on dealer device
- **Scope (in):** Use `socket.io` running inside the dealer app. Expo managed workflow: confirm pure-JS Node-compatible socket.io can run; if not, use `react-native-tcp-socket` + a minimal WS server (decision risk — call out in PR description; if it fails, fall back to a config plugin). Dealer screen shows local IP and port; clients connect by URL.
- **Out:** mDNS discovery.
- **Files:** `apps/mobile/src/host/localServer.ts`, `apps/mobile/app/host.tsx` (dealer host control screen).
- **Deps:** PR-20.
- **Acceptance:** Two simulators on the same LAN can join a dealer-hosted room and see each other's commands.

### PR-22: QR-code join + room URL parsing
- **Scope (in):** Dealer host screen shows a QR encoding `baraja://room/{id}?host={ip}:{port}`. Add `expo-camera` QR scanner on the lobby. Expo Router's typed deep links pick up the URL on mobile. The transport layer chooses cloud vs local based on presence of `host` query param.
- **Out:** Captive-portal handling.
- **Files:** `apps/mobile/src/ui/QrCode.tsx`, `apps/mobile/src/ui/QrScanner.tsx`, `apps/mobile/app/lobby.tsx` (add scan button), `apps/mobile/app/host.tsx` (display QR), `apps/mobile/src/transport/socket.ts` (route by host param).
- **Deps:** PR-21.
- **Acceptance:** Scanning the dealer's QR on a second device joins the local room without any cloud server running.

**Phase 5 parallel tracks:** sequential by nature, but PR-22's QR display work can begin in parallel with PR-21's local-server work since the URL format is decided in PR-21's PR description.

---

## Phase 6 — Polish & hardening

These can mostly be parallelized.

### PR-23: Runtime payload validation at socket boundaries (Zod)
- **Scope (in):** Add `zod` to engine; export Zod schemas matching every command and event. Server `room.ts` validates `game:command` payloads at the socket boundary. Reject malformed payloads with a structured error, never throw.
- **Files:** `packages/engine/src/schemas.ts`, `apps/server/src/room.ts`.
- **Deps:** PR-9.
- **Acceptance:** Hand-crafted bad payloads from a curl-style script fail cleanly without crashing the server.

### PR-24: Periodic snapshot writer
- **Scope (in):** RoomManager writes a snapshot every N events (configurable; default 50) and on `room:close`. Trims event log replay range on hydration to events-after-snapshot.
- **Files:** `apps/server/src/roomManager.ts`.
- **Deps:** PR-8.
- **Acceptance:** A long game (200+ events) hydrates from snapshot + tail in under 100 ms locally.

### PR-25: Postgres swap path
- **Scope (in):** Not literally driver-only — the current schema imports SQLite-specific builders (`drizzle-orm/sqlite-core`). This PR introduces a parallel Postgres schema at `apps/server/src/db/schema.pg.ts` using `drizzle-orm/pg-core` and re-exports the right one from `schema.ts` based on `DATABASE_URL`. The repository layer is already dialect-agnostic if it sticks to Drizzle's query builder. Add `apps/server/src/db/client.pg.ts`. Update `drizzle.config.ts` to pick dialect from env. Generate a parallel migration directory `drizzle/pg/`. CI: matrix run with both backends.
- **Files:** `apps/server/src/db/schema.pg.ts` (new), `apps/server/src/db/schema.ts` (becomes a thin selector), `apps/server/src/db/client.ts` (factory), `apps/server/src/db/client.pg.ts`, `apps/server/drizzle.config.ts`, `apps/server/drizzle/pg/0000_init.sql` (generated), `apps/server/package.json` (add `postgres`).
- **Deps:** PR-7.
- **Acceptance:** Same test suite passes against SQLite and Postgres; both produce equivalent unique `(room_id, version)` constraints.

### PR-26: Telemetry and observability hooks (no PII)
- **Scope (in):** Add minimal structured logging (`pino`) on the server: command accepted/rejected with version + reason (no card values ever). Mobile error boundary. Explicit guard: peek history is not surfaced to logs or analytics outside the room (per design doc privacy note).
- **Files:** `apps/server/src/logger.ts`, `apps/mobile/src/ui/ErrorBoundary.tsx`.
- **Deps:** PR-9.
- **Acceptance:** A grep over logs for any card rank/suit returns nothing during a test session.

### PR-27: E2E happy-path test (cloud room, four players)
- **Scope (in):** Detox or Maestro flow: 4 simulators, create room, join, deal 5, peek, show, take, flip — assert each event lands in all clients. Optional but high-value.
- **Files:** `e2e/happyPath.test.ts`, CI integration.
- **Deps:** PR-19.
- **Acceptance:** Single command runs the flow and exits 0.

**Phase 6 parallel tracks:** PR-23, PR-24, PR-25, PR-26 are independent. PR-27 needs PR-19.

---

## Critical files for implementation

- `packages/engine/src/authority.ts` (new — central command-application loop)
- `packages/engine/src/projection.ts` (new — the privacy boundary)
- `apps/server/src/roomManager.ts` (new — engine + persistence integration)
- `apps/server/src/room.ts` (existing stub — Socket.IO command/ack flow)
- `apps/mobile/src/transport/socket.ts` (existing stub — client reconciliation logic)
