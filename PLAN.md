# PLAYVERSE — Implementation Plan

> **PLAYVERSE — Play Together. Anywhere.** Premium browser-based multiplayer party game for 2–8 players.
> Phase 1 deliverable for Task B, updated as phases complete. **Current state: Phases 1–5 complete** — Color Clash and Memory Mix are both playable end to end by 2–8 players in a five-round alternating match.

---

## 1. Existing repository findings (Task A)

| Item | Finding |
| --- | --- |
| Project path | `C:\Users\ddsai\Downloads\PLAYVERSE` |
| Repository state | **Not a git repository** (`git status` → `fatal: not a git repository`). No branches, no history, no remote. |
| Contents | Empty except Freebuff marker files: `.freebuff/project-id`, `.freebuff/.gitignore` (2 files total). |
| Package manifest | None. No `package.json`, no lockfile, no `node_modules`. |
| Existing code / tests | None. Nothing to preserve or migrate. |
| Assets | None in the workspace. The reference image was supplied as a chat attachment stored outside the project (`...\Temp\freebuff-desktop-pastes\paste-1793008097577-12668.png`); it is the design authority and is not committed to the repo. |
| Tooling available | Node **v22.22.3**, npm **10.9.8**, pnpm 11.1.2, git 2.56.0. No yarn, no bun. |
| Constraints | Greenfield build. 3D must run in-browser (WebGL) with a graceful fallback. No database, no auth, no login. |

**Conclusion:** this is an empty workspace. Phase 1 establishes a clean, testable foundation: monorepo scaffold, shared contracts, design system, 3D world foundation, and one real screen (Home) — nothing fake, nothing finished-looking that is not finished.

---

## 2. Proposed architecture

Monorepo with npm workspaces (npm is the available package manager; no extra tooling needed):

```
playverse/
├── shared/     @playverse/shared — types, constants, Socket.IO event contracts (single source of truth)
├── client/     @playverse/client — React 19 + Vite + TypeScript + Tailwind v4 + Three.js/R3F + Framer Motion
├── server/     @playverse/server — Node + Express + Socket.IO (server-authoritative game state)
├── e2e/        Playwright browser tests (root-level playwright.config.ts)
├── PLAN.md     this document
└── package.json  workspace root scripts: dev / build / test / typecheck / test:e2e / verify
```

**Frontend:** React 19, Vite 8, TypeScript 7, Tailwind CSS 4 (CSS-first `@theme` tokens), Three.js 0.186, React Three Fiber 9, Drei 10 (only `RoundedBox`, `Sparkles`, `Float` — no asset-loading components), Framer Motion 14, socket.io-client (wired in Phase 3).

**Backend:** Node 22, Express 5, Socket.IO 4.8. HTTP health endpoint + Socket.IO gateway. Game logic lives here and only here.

**Key decisions**

- **No router library.** A ~40-line hash router (`#/home`, `#/lobby`, …) driven by a screen registry. 12 routes, zero dependencies, deep-linkable invite URLs later reuse the same mechanism.
- **Background scene mounted once** at app root, screens render overlay content above it. Avoids WebGL re-initialisation on every navigation and guarantees one visual identity across all screens.
- **Procedural 3D only** (no downloaded models/textures). Everything is generated at runtime from geometry + canvas textures → tiny bundle, no licensing risk, instant load, deterministic tests.
- **No post-processing/bloom package.** Glow is faked with emissive materials + additive sprites (cheaper on mobile, fewer deps). Re-evaluate in Phase 6 optimisation.
- **No ESLint** (not in the requested stack); `tsc --noEmit` strict mode + tests gate quality.

---

## 3. Shared types and Socket.IO event contracts

`shared/src/` is the single source of truth, imported by client and server so the two sides cannot drift.

- `constants.ts` — `MIN_PLAYERS=2`, `MAX_PLAYERS=8`, `ROOM_CODE_LENGTH=6`, `TOTAL_ROUNDS=5`, room-code alphabet (excludes `I/O/0/1`), game ids, game modes.
- `types.ts` — `PlayerId`, `RoomCode`, `Player`, `Room`, `RoomStatus`, `GameId` (`color-clash` | `memory-mix`), `GameMode`, preset avatar catalogue, round/match result shapes, error codes.
- `events.ts` — typed Socket.IO maps:
  - `ClientToServerEvents`: `session:ping`, `room:create`, `room:join`, `room:rejoin`, `room:leave`, `room:update` (host), `player:ready`, `game:start`, `game:answer`, `round:continue` (host), `match:rematch` (host), `match:lobby` (host).
  - `ServerToClientEvents`: `session:welcome`, `session:pong`, `room:state` (single source-of-truth full-state broadcast), `game:intro`, `round:start`, `round:reveal`, `match:results`, `connection:resume`, `error`.
  - Every request uses an acknowledgement with `Result<T> = {ok:true,data} | {ok:false,error}` so failures are typed.
- **Security rule encoded in the contract:** `round:start` payloads contain the question only. The correct answer travels exclusively in `round:reveal`, emitted by the server after the round timer expires. Clients never receive answers, timers, or scores they could forge.

Phase 1 implements only `session:welcome` / `session:ping` / `session:pong` (verified by integration test). Room/game events are declared now, implemented in Phases 3–5 — declarations are types, not fake behaviour.

---

## 4. 3D floating-island environment approach

All geometry is procedural, generated with a seeded PRNG so scenes are deterministic.

| Element | Technique |
| --- | --- |
| Sky | Inverted sphere with a custom gradient + sun-halo shader (zenith `#2E8FE8` → horizon `#A9E0FF` → cloud-sea `#DFF4FF`). |
| Clouds | Canvas-generated puff texture on ~26 billboards at three depth bands + a large translucent "sea of clouds" plane below the islands. Slow group drift. |
| Islands | `createRockGeometry()`: hand-built tapered ring mesh with per-vertex noise, non-indexed + flat shading + vertex-coloured strata (brown → dark umber). Grass cap = overhanging cylinder (`#4FBF6A`), soil rim below. |
| Vegetation | Instanced mesh grass tufts (cones) and flowers (small spheres, reference palette colours), 1–3 trees per island (trunk cylinder + 2–4 flat-shaded icosahedron canopies). |
| Bridges | Quadratic Bézier with sag; instanced plank boxes + two `TubeGeometry` ropes. |
| Portals | Torus with emissive `#7658F5` + custom swirl shader disc + additive glow sprites + `Sparkles` + point light. |
| Characters | Drei `RoundedBox` bodies in the preset-avatar colours, dot eyes, smile, stubby arms/feet, idle bob. |
| Waterfalls | Canvas streak texture, `map.offset` scrolling, vertical alpha ramp, mist sprite at the base. |
| Lighting | One shadow-casting directional "sun" (warm), hemisphere fill (sky blue / grass green), ambient. `fog` matched to horizon colour for depth. |

**Performance & fallback strategy**

- Device tier hook (hardware concurrency, coarse pointer, DPR) → `high`/`low`: low tier disables shadows, lowers `dpr`, halves cloud/island counts, drops `Sparkles`.
- `dpr` clamped to `[1, 1.5]` (fill-rate is the dominant GPU cost — measured 32→~45 fps on Intel UHD at retina DPR), shadow map 1024², tight shadow camera, no per-frame allocations, geometry built once in `useMemo`.
- **WebGL guard:** feature-detect before mounting `<Canvas>`; on failure *or* on `webglcontextlost`, render `WorldFallback` — a layered CSS sky with blurred cloud blobs, island silhouettes and a radial portal glow. The UI stays fully usable without WebGL.
- **Reduced motion:** `prefers-reduced-motion` disables cloud drift, island float, character bob, portal swirl animation and screen transitions (`MotionConfig reducedMotion="user"`), and sets `frameloop="demand"`.

---

## 5. Matching the reference image

The attached reference is a 12-screen board of the finished product. Its visual language, not any generic gaming template, is the target:

1. **Composition of Home** — big dimensional `PLAYVERSE` wordmark top-left, CTA stack mid-left (yellow *Create a Room*, blue *Join a Room*, ghost *How to Play* / *Settings*), feature pills top-right, main island + glowing portal right-of-centre, islands receding into cloud haze. A left-side dark scrim guarantees text contrast over the scene (WCAG-safe).
2. **Dimensional logo** — pure CSS layered wordmark: extrusion layer + thick navy stroke layer + yellow→amber gradient fill + white gloss + drop shadow, `clamp()`-scaled. No image asset, always crisp.
3. **Panels** — dark-blue translucent glass (`rgba(16,42,86,.8)`), backdrop blur, 1px white/14 border, inset top highlight, deep drop shadow, `1.5rem` radius. A light `soft-white` tone exists for the reference's white content cards (guide/intro/settings).
4. **Buttons** — 3D press style: solid fill + 5px darker bottom edge that collapses on `active`. Yellow primary, azure secondary, green success, red danger, translucent ghost.
5. **Typography** — Fredoka (chunky rounded, display/logo/headings/buttons) + Nunito (body/UI), self-loaded from Google Fonts with rounded system fallbacks so layout survives offline.
6. **Detail motifs** — pill badges ("Round 1 of 5"), crown for host, numbered podium, rounded avatar chips, soft inner glows. Applied in Phase 2+ screens.

---

## 6. Asset sourcing and optimised fallbacks

- **No third-party model/texture downloads.** Geometry, canvas textures and shaders are generated in code → zero licensing exposure, ~0 KB of binary assets, no loading screen.
- **Icons:** hand-written inline SVG (players, device, gamepad, rounds, gear, wifi). No icon package.
- **Fonts:** Google Fonts CDN with `display=swap` + local rounded fallback stack (graceful offline).
- **Characters:** procedural cube avatars from the preset catalogue — the "best feasible alternative" to premium character art, and it matches the reference's cube style directly.
- If a premium asset is ever supplied (e.g. GLTF island), it drops into the same scene graph behind the same quality-tier flags.

---

## 7. Twelve-screen navigation structure

Hash routes registry (`client/src/screens/registry.ts`) — the registry is the navigation contract; each entry knows its phase and readiness:

| # | Route | Screen | Phase |
| --- | --- | --- | --- |
| 1 | `#/home` | Home | **Phase 1 (built)** |
| 2 | `#/setup` | Player Setup | **Phase 2 (built)** |
| 3 | `#/create-room` | Create Room | **Phase 3 (built)** |
| 4 | `#/join-room` | Join Room | **Phase 3 (built)** |
| 5 | `#/lobby` | Waiting Lobby | **Phase 3 (built)** |
| 6 | `#/intro` | Game Introduction | **Phase 4 (built)** |
| 7 | `#/gameplay` | Live Gameplay | **Phase 4 (built — Color Clash)** |
| 8 | `#/round-results` | Round Results | **Phase 4 (built)** |
| 9 | `#/match-results` | Match Results | **Phase 4 (built)** |
| 10 | `#/guide` | Player Guide | Phase 6 |
| 11 | `#/settings` | Settings | Phase 6 |
| 12 | `#/connection` | Connection & Recovery | Phase 6 |

Screens not yet built render an **explicitly labelled "not implemented yet — Phase N"** panel with the full screen index. Nothing pretends to be finished.

---

## 8. Server-authoritative multiplayer architecture

```
client (React)  ── socket.io ──►  server (Express + Socket.IO)
   renders UI                      ├─ room service: codes, joins, host transfer
   sends intents only              ├─ match service: 5-round state machine
                                   ├─ timers: server-owned (endsAt timestamps)
                                   ├─ scoring: computed server-side from answer + elapsed
                                   └─ broadcasts: room:state / round:* / match:*
```

- Clients send **intents** (`game:answer`, `player:ready`); the server owns room state, timers, answer validation, scores and progression, and broadcasts results. Client timestamps are never trusted for scoring.
- **Host transfer is deterministic:** host = lowest join index among connected players; on disconnect the server promotes the next eligible player and broadcasts `room:state`. Host-only intents are rejected for non-hosts.
- **Reconnection:** room codes are stable; `room:rejoin` with a reconnect token restores the player slot and re-syncs full state (`connection:resume`). In-progress rounds re-send `round:start` with remaining time computed from `endsAt`.
- **Room codes:** 6 chars from an unambiguous alphabet, server-generated with collision retry.
- Phase 1 implements only the connection/handshake layer and verifies it with a real Socket.IO integration test; no simulated multiplayer ships.

---

## 9. Automated testing and multi-browser verification

| Layer | Tool | Phase 1 coverage |
| --- | --- | --- |
| Unit/component | Vitest + React Testing Library (jsdom) | Button variants/a11y, Panel tones, screen registry (exactly 12 routes, unique paths), Home screen content + navigation, WebGL fallback path, design-token palette assertions |
| Server integration | Vitest + real HTTP server + socket.io-client | `GET /api/health`, socket connect → `session:welcome`, `ping`→`pong` echo with server time, connection count on disconnect |
| Browser (e2e) | Playwright (Chromium desktop + mobile viewport) | Page loads with no console/page errors, logo + CTAs visible, real WebGL `<Canvas>` present (SwiftShader), navigation to a second screen works |
| Multi-browser | Playwright Firefox/WebKit | Phase 7 (Chromium only in Phase 1 — browsers are a large download; widen later) |

`npm run verify` = typecheck → unit/integration tests → production build. Playwright runs via `npm run test:e2e`.

---

## 10. Deployment considerations

- **Client** is a static SPA (`vite build` → `dist/`): deployable to any static host/CDN. Hash routing means no server rewrite rules are required.
- **Server** builds to a single ESM bundle (`dist/server.js`, express/socket.io externalised) and runs on any Node 22 host with `node dist/server.js`. Health endpoint `/api/health` for probes; graceful `SIGTERM` shutdown.
- Socket.IO needs sticky sessions/load balancing if scaled horizontally — single-instance first; document before scaling.
- No database by design (in-memory rooms). Restarts drop rooms — acceptable for a no-login party game; noted as a known limit.
- Env config: `PORT`, `CLIENT_ORIGIN` (CORS for direct-origin dev), otherwise defaults for local dev behind the Vite proxy.

---

## Phase breakdown

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Repository audit, plan, monorepo foundation, shared contracts, design tokens + UI primitives, procedural 3D world + fallback, Home screen, 12-screen registry, server handshake, unit/integration/e2e tests | **Complete** |
| **2** | Full 3D world polish, design system completion, Player Setup, Create/Join Room, Waiting Lobby screens | **Complete** |
| **3** | Rooms, lobby, invite links, ready states, host controls, synchronized multiplayer | **Complete** |
| **4** | Color Clash complete (server-authoritative rounds, timers, scoring), intro → gameplay → round results → match results → rematch | **Complete** |
| 5 | Memory Mix complete + mixed five-round match flow | Pending (not started) |
| 6 | Remaining screens (guide/settings/connection), reconnection & recovery, accessibility, performance optimisation | Pending |
| 7 | Full test matrix, multi-browser verification, deployment, documentation | Pending |

---

## Decisions needing approval

1. **No git repository exists.** I have not initialised one (not requested). Say the word and I'll `git init` with a sensible `.gitignore`.
2. **TypeScript 7** (current stable, native `tsc`) is used; if your tooling requires TS 5.x I will pin `typescript@^5.9` instead.
3. **Fonts load from Google Fonts CDN** (Fredoka + Nunito). If the app must be fully offline/self-hosted, I will switch to bundled `@fontsource` packages.
4. **Chromium-only e2e in Phase 1** (Firefox/WebKit deferred to Phase 7) to keep browser downloads small.

---

## 11. Phase 4 — Color Clash (complete)

Color Clash is the first playable game and the reference implementation for the
match loop every later game plugs into.

### Rules

- A match is **5 rounds** (`TOTAL_ROUNDS`), 2–8 players.
- Each round the server picks the target from a fixed six-colour palette and
  deals a shuffled tile grid: **4 tiles** in rounds 1–2, **6 tiles** in rounds
  3–5. Exactly one tile matches.
- A player answers by tapping a tile. **First accepted answer only** — later taps
  are ignored locally and rejected server-side (`duplicate-answer`).
- The round ends when the deadline passes **or every connected player has
  answered**. Disconnected players never stall a round.
- Every round shows a reveal (correct tile, each player's pick, score deltas),
  then the next round starts on the server's clock. After round 5 the final
  reveal turns into the final standings automatically — **no host click is
  required to finish a match**.
- The host may *skip* the pause early ("Skip ahead" / "Skip to final results"),
  which is an accelerator, never a requirement.
- After the results, the host can start a rematch (scores and ready flags reset)
  or return everyone to the lobby.

### Accessibility: colour is never the only clue

Each palette entry pairs a swatch with a **name and a glyph**: azure ●, crimson
▲, leaf ■, amber ★, violet ◆, teal ✚. The target card, every tile and the reveal
all render swatch + name + symbol, and the glyph is drawn in a dark ink for
contrast on every colour. Tiles are buttons with `Answer <Colour> <glyph>`
accessible names, so the whole game is playable by name, by shape or by colour.

### Deterministic scoring

| Outcome | Points |
| --- | --- |
| Correct | `+10` |
| Speed bonus | `+floor(remainingMs / roundMs * 5)` → 0–5 (floor, deterministic) |
| Wrong (classic) | `−5` |
| Wrong (family-friendly) | `0` |
| No answer / disconnected | `0` (no invented penalty) |

Elapsed time for the bonus is measured **only** from the server's `Date.now()` on
receipt against the round deadline the server issued. Scores clamp at 0 and the
leaderboard orders by score, then by join order (ties visible, ranks 1..n).

### Protocol (all server → client)

| Event | Payload | When |
| --- | --- | --- |
| `game:intro` | `GameIntro` (round, copy, scoring, readyCount, startsAt) | start of every round |
| `round:start` | `RoundQuestion` (target, tiles, `startedAt`, `endsAt`) | round opens / rejoin |
| `round:answers` | `RoundAnswerState` (`answeredPlayerIds`, `endsAt`) | someone answered |
| `round:reveal` | `RoundReveal` (correct pick, per-player results, `nextAt`) | round closes |
| `match:results` | `MatchResults` (leaderboard, podium) | after round 5 (or host skip) |

Client intents: `round:ready`, `game:answer {roundIndex, choiceId}`,
`round:continue` (host only), `match:rematch` (host), `match:lobby` (host).
The answer key never leaves the server before `round:reveal`; `round:answers`
shares only *who* has answered, never *what*.

### Timers

Server-owned and configurable: `PLAYVERSE_ROUND_MS` (default 12 000),
`PLAYVERSE_REVEAL_MS` (5 000), `PLAYVERSE_INTRO_MS` (15 000, the fallback if not
everyone readies). Every timer is cancelled when a match finishes, when the room
empties or when the process shuts down; verification asserts
`vi.getTimerCount() === 0` after finish and after room removal, and that a host
skip racing the timer advances exactly once.

### Client behaviour

- `GameProvider` mirrors the server: it never computes a target, a score or a
  round transition. Round-index guards drop late events; `duplicate-answer` is
  treated as "already locked in"; `round-closed` surfaces as an error.
- Screens follow `room.status` (`MatchPhaseSync`): intro → gameplay →
  round-results → match-results, identically on every client.
- The countdown is derived from server deadlines via a server-clock offset taken
  from `room:state.serverTime`; it ticks at 10 Hz only while a deadline is on
  screen and never drives authoritative state.
- Leaving the room or returning to the lobby clears all match state.

### Verification for this phase

| Check | Result |
| --- | --- |
| Server integration + lifecycle (`vitest`) | **51 / 51** (17 real-socket Color Clash, 12 fake-clock lifecycle, 22 older) |
| Client (`vitest`, jsdom) | **110 / 110** (30 added for this phase) |
| `npm run typecheck` | clean (shared, client, server, root/e2e) |
| `npm run build` | client + server production bundles built |
| `npm run verify` | exit 0 |
| `npx playwright test` | see report — Phase 4 adds 2 two-context multiplayer tests |

Phase 4 E2E drives **two independent browser contexts** through a real room:
create/join, ready, start, identical target, answers, synchronized reveal, five
auto-advancing rounds, identical final leaderboard, host replay resetting scores,
plus a mid-round reload that rejoins and still finishes the match.

### Phase 5 — Memory Mix + alternating five-round match (complete)

Memory Mix is the second mini-game and it shares the same authoritative match
engine as Color Clash.

#### Rules

- Each round the server generates a hidden sequence from the pool and keeps it
  secret until the reveal.
- While the memorise window is open, both clients show the same sequence.
- After memorise, the sequence is hidden on both clients and the pool becomes
  interactive; each player submits their tapped order.
- The server validates the submitted order, awards points (full sequence
  correct + speed bonus; partial credit by position; no penalty in family-friendly
  mode), and reveals the correct sequence to everybody.
- Memory Mix answers follow the same duplicate/late gating as Color Clash:
  the first accepted answer is authoritative, and a rejected ack surfaces the
  server reason before the UI treats the seat as locked in.

#### Alternating schedule

| Round | Game |
| --- | --- |
| 1 | Color Clash |
| 2 | Memory Mix |
| 3 | Color Clash |
| 4 | Memory Mix |
| 5 | Color Clash |

One cumulative leaderboard. Round indexing and alternation come from the shared
constants (`GAME_IDS`, `gameForRound`); neither client nor server re-declares them.

#### Verification added in this phase

- Client: MemoryMixScreen tests (sequence shown while memorising, hidden after,
  order submitted and validated).
- Server: Memory Mix integration tests (correct/partial/wrong, hidden sequence,
  server-side scoring, reveal only).
- E2E: Phase 4 two-context match now exercises rounds 1–5 including Memory Mix
  rounds and a host replay from the final results.

### Known limitations

- State is in memory: a server restart drops live rooms and matches.
- No spectators, no reconnect grace beyond 60 s, and no persistence of results.
- Rematch uses the same room and mode; there is no per-match settings screen yet.
- Firefox/WebKit and real mobile devices are Phase 7; E2E covers Chromium desktop
  plus a mobile *viewport* for the single-context suites.
- Remaining Phase 6/7 work: guide, settings and connection screens, broader
  accessibility pass, performance tuning, and final documentation polish.
